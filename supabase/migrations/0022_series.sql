-- Recurring weekly lessons. Each week is booked through the normal request_booking rules
-- (health, capacity, overlap, credits, approval); weeks that fail are skipped with a reason.
-- Idempotent: week attempt ids and the series id are derived from the client's attempt id.

alter table public.bookings add column if not exists series_id uuid, add column if not exists series_index int;
create index if not exists bookings_series_idx on public.bookings (series_id) where series_id is not null;

create or replace function app.derive_uuid(p_seed text) returns uuid
language sql immutable set search_path = '' as $$ select md5(p_seed)::uuid $$;

create or replace function public.request_series(
  p_attempt uuid, p_student uuid, p_service uuid, p_instructor uuid,
  p_first_start timestamptz, p_weeks int, p_payment text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v_admin boolean := app.is_admin();
  v_series uuid := app.derive_uuid(p_attempt::text || ':series');
  v_local timestamp := p_first_start at time zone 'Asia/Jerusalem';
  v_start timestamptz;
  v_res jsonb;
  v_out jsonb := '[]'::jsonb;
  v_booked int := 0;
  v_pending int := 0;
  v_kid text;
  v_parent uuid;
  v_service text;
  i int;
begin
  if auth.uid() is null then return jsonb_build_object('error','not_authenticated'); end if;
  if p_weeks < 2 or p_weeks > 12 then return jsonb_build_object('error','bad_weeks'); end if;
  -- NOTE (guardians merge): request_booking enforces family access per week.
  select st.first_name, st.parent_id into v_kid, v_parent from public.students st
  where st.id = p_student and (st.parent_id = auth.uid() or v_admin);
  if v_kid is null then return jsonb_build_object('error','not_found'); end if;
  select * into s from public.settings where id = 1;
  select name into v_service from public.services where id = p_service;

  perform set_config('app.suppress_notify', 'on', true);
  for i in 0 .. p_weeks - 1 loop
    -- same local wall-clock time every week (DST-safe)
    v_start := (v_local + make_interval(days => 7 * i)) at time zone 'Asia/Jerusalem';
    if not v_admin and v_start > now() + make_interval(days => s.booking_horizon_days) then
      v_res := jsonb_build_object('error', 'beyond_horizon');
    else
      v_res := public.request_booking(app.derive_uuid(p_attempt::text || ':' || i), p_student, p_service,
                                      p_instructor, v_start, p_payment, p_note);
    end if;
    if (v_res->>'ok')::boolean is true then
      update public.bookings set series_id = v_series, series_index = i where id = (v_res->>'booking_id')::uuid;
      v_booked := v_booked + 1;
      if v_res->>'status' = 'pending' then v_pending := v_pending + 1; end if;
    end if;
    v_out := v_out || jsonb_build_object('index', i, 'start', v_start, 'result', v_res);
  end loop;
  perform set_config('app.suppress_notify', '', true);

  if v_booked > 0 then
    if v_pending > 0 then
      perform app.notify_admins('request_new', 'בקשה לסדרה של ' || v_pending || ' שיעורים',
        v_kid || ' · ' || coalesce(v_service, '') || E'\nמ־' || app.local_label(p_first_start) || ', כל שבוע',
        '/admin/requests', null, s.email_admin_new_request, 'series:' || v_series);
    elsif v_parent is distinct from auth.uid() then
      perform app.notify(v_parent, 'booking_approved', 'נקבעה סדרה של ' || v_booked || ' שיעורים ל' || v_kid,
        coalesce(v_service, '') || E'\nמ־' || app.local_label(p_first_start) || ', כל שבוע', '/lessons', null,
        s.email_parent_status, 'series-appr:' || v_series);
    end if;
  end if;
  return jsonb_build_object('ok', v_booked > 0, 'series_id', v_series, 'booked', v_booked, 'weeks', v_out);
end $$;

-- cancel the rest of a series from a given lesson onward; each lesson keeps its own cancellation rule
create or replace function public.cancel_series(p_series uuid, p_from timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_res jsonb; v_done int := 0; v_blocked int := 0;
begin
  for r in
    select b.id from public.bookings b
    where b.series_id = p_series and b.starts_at >= p_from and b.status in ('pending','approved')
    order by b.starts_at
  loop
    v_res := public.cancel_booking(r.id, 'ביטול סדרה'); -- access + 24h rule enforced inside
    if (v_res->>'ok')::boolean is true then v_done := v_done + 1; else v_blocked := v_blocked + 1; end if;
  end loop;
  if v_done = 0 and v_blocked = 0 then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok', v_done > 0, 'cancelled', v_done, 'blocked', v_blocked);
end $$;

-- admin: approve every pending lesson of a series in one go (one summary notification)
create or replace function public.approve_series(p_series uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_res jsonb; v_done int := 0; v_failed int := 0; v_parent uuid; v_kid text; v_service text; v_first timestamptz; v_email boolean;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  perform set_config('app.suppress_notify', 'on', true);
  for r in select b.id from public.bookings b where b.series_id = p_series and b.status = 'pending' and b.starts_at > now() order by b.starts_at loop
    v_res := public.set_booking_status(r.id, 'approved');
    if (v_res->>'ok')::boolean is true then v_done := v_done + 1; else v_failed := v_failed + 1; end if;
  end loop;
  perform set_config('app.suppress_notify', '', true);
  if v_done = 0 and v_failed = 0 then return jsonb_build_object('error','not_pending'); end if;
  select st.parent_id, st.first_name, sv.name, min(b.starts_at)
    into v_parent, v_kid, v_service, v_first
  from public.bookings b join public.students st on st.id = b.student_id join public.services sv on sv.id = b.service_id
  where b.series_id = p_series and b.status = 'approved'
  group by st.parent_id, st.first_name, sv.name;
  select email_parent_status into v_email from public.settings where id = 1;
  if v_done > 0 then
    perform app.notify(v_parent, 'booking_approved', 'אושרה סדרה של ' || v_done || ' שיעורים ל' || v_kid,
      coalesce(v_service, '') || E'\nמ־' || app.local_label(v_first) || ', כל שבוע', '/lessons', null, v_email,
      'series-appr:' || p_series || ':' || v_done);
  end if;
  return jsonb_build_object('ok', v_done > 0, 'approved', v_done, 'failed', v_failed);
end $$;

revoke execute on function public.request_series(uuid, uuid, uuid, uuid, timestamptz, int, text, text),
  public.cancel_series(uuid, timestamptz), public.approve_series(uuid) from public, anon;
grant execute on function public.request_series(uuid, uuid, uuid, uuid, timestamptz, int, text, text),
  public.cancel_series(uuid, timestamptz), public.approve_series(uuid) to authenticated;
