-- Instructor self-reported availability: weekly hours + time off for their own calendar only.
-- With settings.instructor_availability_approval (default on) a change becomes a pending request
-- that an admin approves; otherwise (or when an admin acts) it applies immediately.

alter table public.settings add column if not exists instructor_availability_approval boolean not null default true;

create table public.availability_requests (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('add_hours','remove_hours','add_time_off','remove_time_off')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);
create index on public.availability_requests (status, created_at);
alter table public.availability_requests enable row level security;
create policy avreq_read on public.availability_requests for select to authenticated
  using (instructor_id = auth.uid() or app.is_admin());
-- writes only through the RPCs below

-- Validates and applies one change for p_instructor. Returns {ok} or {error}.
create or replace function app.apply_availability(p_instructor uuid, p_kind text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start time; v_end time; v_days int[]; v_wh public.working_hours; v_to public.time_off;
  v_from timestamptz; v_until timestamptz; v_reason text; d int;
begin
  if p_kind = 'add_hours' then
    v_start := (p_payload->>'start')::time;
    v_end := (p_payload->>'end')::time;
    select array_agg(x::int) into v_days from jsonb_array_elements_text(p_payload->'weekdays') x;
    if v_start is null or v_end is null or v_end <= v_start then return jsonb_build_object('error','time_order'); end if;
    if v_days is null or exists (select 1 from unnest(v_days) w where w < 0 or w > 6) then return jsonb_build_object('error','invalid'); end if;
    foreach d in array v_days loop
      insert into public.working_hours (instructor_id, weekday, start_time, end_time) values (p_instructor, d, v_start, v_end);
    end loop;
    return jsonb_build_object('ok', true);

  elsif p_kind = 'remove_hours' then
    select * into v_wh from public.working_hours where id = (p_payload->>'id')::uuid and instructor_id = p_instructor;
    if v_wh.id is null then return jsonb_build_object('error','not_found'); end if;
    -- block if a future active lesson sits inside these weekly hours
    if exists (
      select 1 from public.bookings b
      where b.instructor_id = p_instructor and b.status in ('pending','approved') and b.starts_at > now()
        and extract(dow from b.starts_at at time zone 'Asia/Jerusalem')::int = v_wh.weekday
        and (b.starts_at at time zone 'Asia/Jerusalem')::time < v_wh.end_time
        and (b.ends_at at time zone 'Asia/Jerusalem')::time > v_wh.start_time) then
      return jsonb_build_object('error','has_lessons');
    end if;
    delete from public.working_hours where id = v_wh.id;
    return jsonb_build_object('ok', true);

  elsif p_kind = 'add_time_off' then
    v_from := (p_payload->>'starts_at')::timestamptz;
    v_until := (p_payload->>'ends_at')::timestamptz;
    v_reason := left(coalesce(p_payload->>'reason',''), 120);
    if v_from is null or v_until is null or v_until <= v_from then return jsonb_build_object('error','time_order'); end if;
    if exists (
      select 1 from public.bookings b
      where b.instructor_id = p_instructor and b.status in ('pending','approved')
        and b.during && tstzrange(v_from, v_until)) then
      return jsonb_build_object('error','has_lessons');
    end if;
    insert into public.time_off (instructor_id, starts_at, ends_at, reason) values (p_instructor, v_from, v_until, v_reason);
    return jsonb_build_object('ok', true);

  elsif p_kind = 'remove_time_off' then
    -- only the instructor's own block; school-wide closures (instructor_id null) are admin-only
    select * into v_to from public.time_off where id = (p_payload->>'id')::uuid and instructor_id = p_instructor;
    if v_to.id is null then return jsonb_build_object('error','not_found'); end if;
    delete from public.time_off where id = v_to.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('error','invalid');
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('error','invalid');
end $$;
revoke execute on function app.apply_availability(uuid, text, jsonb) from public, anon, authenticated;

-- Instructor (or admin acting on own calendar) requests/applies a change to THEIR OWN availability.
create or replace function public.request_availability_change(p_kind text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_needs_approval boolean;
  v_res jsonb;
  v_req uuid;
begin
  if v_uid is null or not app.is_staff() then return jsonb_build_object('error','not_found'); end if;
  if p_kind not in ('add_hours','remove_hours','add_time_off','remove_time_off') then return jsonb_build_object('error','invalid'); end if;
  select instructor_availability_approval into v_needs_approval from public.settings where id = 1;

  if app.is_admin() or not v_needs_approval then
    v_res := app.apply_availability(v_uid, p_kind, p_payload);
    if v_res ? 'ok' then
      perform app.audit('availability.' || p_kind, 'profile', v_uid::text, p_payload);
      return jsonb_build_object('ok', true, 'applied', true);
    end if;
    return v_res;
  end if;

  -- dry-run validation inside a subtransaction so bad requests fail fast, then queue it
  begin
    v_res := app.apply_availability(v_uid, p_kind, p_payload);
    raise exception using errcode = 'P0001', message = 'dry_run';
  exception when raise_exception then
    if sqlerrm <> 'dry_run' then raise; end if;
  end;
  if v_res ? 'error' then return v_res; end if;

  insert into public.availability_requests (instructor_id, kind, payload)
  values (v_uid, p_kind, p_payload) returning id into v_req;
  perform app.audit('availability.request', 'availability_request', v_req::text, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'applied', false, 'request_id', v_req);
end $$;

create or replace function public.cancel_availability_request(p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.availability_requests set status = 'rejected', note = 'בוטל על ידי המדריך', decided_at = now(), decided_by = auth.uid()
  where id = p_request and instructor_id = auth.uid() and status = 'pending';
  if not found then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_decide_availability(p_request uuid, p_approve boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.availability_requests; v_res jsonb;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  select * into r from public.availability_requests where id = p_request for update;
  if r.id is null then return jsonb_build_object('error','not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('error','not_pending'); end if;
  if p_approve then
    v_res := app.apply_availability(r.instructor_id, r.kind, r.payload);
    if v_res ? 'error' then return v_res; end if;
  end if;
  update public.availability_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      note = left(coalesce(p_note,''), 300), decided_at = now(), decided_by = auth.uid()
  where id = r.id;
  perform app.audit('availability.' || case when p_approve then 'approved' else 'rejected' end, 'availability_request', r.id::text, r.payload);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.request_availability_change(text, jsonb), public.cancel_availability_request(uuid),
  public.admin_decide_availability(uuid, boolean, text) from public, anon;
grant execute on function public.request_availability_change(text, jsonb), public.cancel_availability_request(uuid),
  public.admin_decide_availability(uuid, boolean, text) to authenticated;
