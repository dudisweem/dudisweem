-- Waitlist: a family waits for a full day/slot; when capacity frees up every matching entry is
-- notified (in-app + email) and the first to book gets it.
-- NOTE for merge with guardians (fork 1): access checks use students.parent_id = auth.uid();
-- extend them to the shared guardian helper when it exists.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  instructor_id uuid references public.profiles(id) on delete cascade,
  day date not null,
  from_time time,
  to_time time,
  status text not null default 'waiting' check (status in ('waiting','notified','booked','cancelled','expired')),
  notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_time is null or to_time is null or to_time > from_time)
);
create index on public.waitlist (service_id, day) where status in ('waiting','notified');
create unique index waitlist_one_active on public.waitlist (student_id, service_id, day, coalesce(instructor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('waiting','notified');
alter table public.waitlist enable row level security;
create policy waitlist_read on public.waitlist for select to authenticated using (
  app.is_admin() or exists (select 1 from public.students s where s.id = student_id and s.parent_id = auth.uid())
);
-- parents write only through join_waitlist / leave_waitlist; direct writes are admin-only
create policy waitlist_admin on public.waitlist for all to authenticated using (app.is_admin()) with check (app.is_admin());

create or replace function public.join_waitlist(p_student uuid, p_service uuid, p_instructor uuid, p_day date,
                                                p_from time default null, p_to time default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.settings; v_id uuid; v_admin boolean := app.is_admin();
begin
  if not exists (select 1 from public.students st where st.id = p_student and st.active
                 and (st.parent_id = auth.uid() or v_admin)) then
    return jsonb_build_object('error','not_found');
  end if;
  if not exists (select 1 from public.services where id = p_service and active) then
    return jsonb_build_object('error','not_found');
  end if;
  select * into s from public.settings where id = 1;
  if p_day < (now() at time zone 'Asia/Jerusalem')::date
     or (not v_admin and p_day > (now() at time zone 'Asia/Jerusalem')::date + s.booking_horizon_days) then
    return jsonb_build_object('error','bad_day');
  end if;
  if p_from is not null and p_to is not null and p_to <= p_from then
    return jsonb_build_object('error','time_order');
  end if;
  select id into v_id from public.waitlist
  where student_id = p_student and service_id = p_service and day = p_day
    and coalesce(instructor_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_instructor, '00000000-0000-0000-0000-000000000000'::uuid)
    and status in ('waiting','notified');
  if v_id is not null then
    update public.waitlist set from_time = p_from, to_time = p_to, status = 'waiting' where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'existing', true);
  end if;
  insert into public.waitlist (student_id, service_id, instructor_id, day, from_time, to_time, created_by)
  values (p_student, p_service, p_instructor, p_day, p_from, p_to, auth.uid())
  returning id into v_id;
  perform app.audit('waitlist.join', 'waitlist', v_id::text, jsonb_build_object('day', p_day, 'service', p_service));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.leave_waitlist(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.waitlist w set status = 'cancelled'
  where w.id = p_id and w.status in ('waiting','notified')
    and (app.is_admin() or exists (select 1 from public.students s where s.id = w.student_id and s.parent_id = auth.uid()));
  if not found then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- called by the booking trigger when a seat frees up
create or replace function app.waitlist_offer(p_service uuid, p_instructor uuid, p_start timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_day date := (p_start at time zone 'Asia/Jerusalem')::date;
  v_time time := (p_start at time zone 'Asia/Jerusalem')::time;
  v_service text;
  v_email boolean;
begin
  select name into v_service from public.services where id = p_service;
  select email_waitlist into v_email from public.settings where id = 1;
  for r in
    select w.id, w.student_id, st.parent_id, st.first_name
    from public.waitlist w join public.students st on st.id = w.student_id
    where w.service_id = p_service and w.day = v_day and w.status in ('waiting','notified')
      and (w.instructor_id is null or w.instructor_id = p_instructor)
      and (w.from_time is null or v_time >= w.from_time)
      and (w.to_time is null or v_time <= w.to_time)
    order by w.created_at
  loop
    update public.waitlist set status = 'notified', notified_at = now() where id = r.id;
    perform app.notify(r.parent_id, 'waitlist_open', 'התפנה מקום ל' || r.first_name,
      v_service || E'\n' || app.local_label(p_start) || E'\nמי שמזמין ראשון — מקבל את המקום.',
      '/book?kid=' || r.student_id || '&service=' || p_service || '&day=' || v_day,
      null, v_email, 'wl:' || r.id || ':' || extract(epoch from p_start)::bigint);
  end loop;
end $$;

-- the trigger itself (function defined in 0020)
create trigger bookings_notify after insert or update of status on public.bookings
for each row execute function app.on_booking_change();

revoke execute on function public.join_waitlist(uuid, uuid, uuid, date, time, time), public.leave_waitlist(uuid) from public, anon;
grant execute on function public.join_waitlist(uuid, uuid, uuid, date, time, time), public.leave_waitlist(uuid) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on function app.my_role(), app.is_admin(), app.is_staff(), app.health_valid(uuid, timestamptz) to authenticated;
