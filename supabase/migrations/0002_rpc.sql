-- Business RPCs. All SECURITY DEFINER with empty search_path; every check is server-side.

-- parents may not forge health signature columns; those go through sign_health()
revoke insert, update on public.students from authenticated;
grant insert (parent_id, first_name, last_name, birth_date, gender, swim_level, allergies, medical_notes,
              emergency_name, emergency_phone, notes, color)
  on public.students to authenticated;
grant update (first_name, last_name, birth_date, gender, swim_level, allergies, medical_notes,
              emergency_name, emergency_phone, notes, color, active)
  on public.students to authenticated;

create or replace function app.audit(p_action text, p_entity text, p_id text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_id, p_details)
$$;

create or replace function app.health_valid(p_student uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when not s.health_required then true
    else exists (select 1 from public.students st where st.id = p_student
                 and st.health_signed_at is not null
                 and st.health_signed_at + make_interval(months => s.health_validity_months) > p_at)
  end
  from public.settings s where s.id = 1
$$;

-- ------------------------------------------------------------ available slots
create or replace function public.get_available_slots(p_service uuid, p_day date, p_instructor uuid default null)
returns table (starts_at timestamptz, instructor_id uuid, instructor_name text, spots_left int)
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.settings;
  v_svc public.services;
  v_admin boolean := app.is_admin();
begin
  select * into s from public.settings where id = 1;
  select * into v_svc from public.services where id = p_service and active;
  if v_svc.id is null then return; end if;
  if not v_admin and (not s.booking_open or not v_svc.bookable_by_parents) then return; end if;

  return query
  with cand as (
    select distinct wh.instructor_id as iid, p.full_name as iname, gs as st,
           gs + make_interval(mins => v_svc.duration_min) as en
    from public.working_hours wh
    join public.profiles p on p.id = wh.instructor_id and p.active and p.role in ('admin','instructor')
    cross join lateral generate_series(
      (p_day + wh.start_time) at time zone 'Asia/Jerusalem',
      ((p_day + wh.end_time) at time zone 'Asia/Jerusalem') - make_interval(mins => v_svc.duration_min),
      make_interval(mins => s.slot_step_min)) gs
    where wh.weekday = extract(dow from p_day)::int
      and (p_instructor is null or wh.instructor_id = p_instructor)
  ), scored as (
    select c.*, (v_svc.capacity - (
        select count(*) from public.bookings b
        where b.instructor_id = c.iid and b.service_id = v_svc.id and b.starts_at = c.st
          and b.status in ('pending','approved')))::int as spots
    from cand c
  )
  select sc.st, sc.iid, sc.iname, sc.spots
  from scored sc
  where sc.spots > 0
    and (v_admin or sc.st >= now() + make_interval(hours => s.min_notice_hours))
    and (v_admin or sc.st <= now() + make_interval(days => s.booking_horizon_days))
    and sc.st > now()
    and not exists (
      select 1 from public.time_off t
      where (t.instructor_id is null or t.instructor_id = sc.iid)
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(sc.st, sc.en))
    and not exists (
      select 1 from public.bookings b
      where b.instructor_id = sc.iid and b.status in ('pending','approved')
        and b.during && tstzrange(sc.st - make_interval(mins => s.buffer_min), sc.en + make_interval(mins => s.buffer_min))
        and not (b.service_id = v_svc.id and b.starts_at = sc.st))
  order by sc.st, sc.iname;
end $$;
grant execute on function public.get_available_slots(uuid, date, uuid) to authenticated;

-- ------------------------------------------------------------ request booking (idempotent by attempt id)
create or replace function public.request_booking(
  p_attempt uuid, p_student uuid, p_service uuid, p_instructor uuid,
  p_start timestamptz, p_payment text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v_svc public.services;
  v_admin boolean := app.is_admin();
  v_existing public.bookings;
  v_credit uuid;
  v_status text;
  v_row public.bookings;
  v_week_count int;
begin
  if auth.uid() is null then return jsonb_build_object('error','not_authenticated'); end if;

  -- replay: same attempt returns the original result, never a second row
  select * into v_existing from public.bookings where attempt_id = p_attempt;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'booking_id', v_existing.id, 'number', v_existing.number, 'status', v_existing.status, 'replayed', true);
  end if;

  if not exists (select 1 from public.students st where st.id = p_student and st.active
                 and (st.parent_id = auth.uid() or v_admin)) then
    return jsonb_build_object('error','not_found');
  end if;

  select * into s from public.settings where id = 1;
  select * into v_svc from public.services where id = p_service and active;
  if v_svc.id is null then return jsonb_build_object('error','not_found'); end if;
  if not v_admin and not s.booking_open then return jsonb_build_object('error','booking_closed'); end if;
  if not v_admin and not app.health_valid(p_student, p_start) then return jsonb_build_object('error','health_required'); end if;

  if p_payment not in ('cash','bit','paybox','card')
     or (p_payment = 'cash' and not s.payment_cash) or (p_payment = 'bit' and not s.payment_bit)
     or (p_payment = 'paybox' and not s.payment_paybox) or (p_payment = 'card' and not s.payment_card) then
    return jsonb_build_object('error','payment_not_allowed');
  end if;

  -- serialize all bookings for this instructor so capacity and overlap checks are atomic
  perform pg_advisory_xact_lock(hashtext('instr:' || p_instructor::text));

  if not exists (
    select 1 from public.get_available_slots(p_service, (p_start at time zone 'Asia/Jerusalem')::date, p_instructor) a
    where a.starts_at = p_start) then
    return jsonb_build_object('error','slot_taken');
  end if;

  if s.max_lessons_per_week_per_student > 0 and not v_admin then
    select count(*) into v_week_count from public.bookings b
    where b.student_id = p_student and b.status in ('pending','approved')
      and date_trunc('week', (b.starts_at at time zone 'Asia/Jerusalem') + interval '1 day')
        = date_trunc('week', (p_start at time zone 'Asia/Jerusalem') + interval '1 day');
    if v_week_count >= s.max_lessons_per_week_per_student then
      return jsonb_build_object('error','weekly_limit');
    end if;
  end if;

  if p_payment = 'card' then
    select c.id into v_credit from public.credits c
    where c.student_id = p_student and c.lessons_used < c.lessons_total
      and (c.service_id is null or c.service_id = p_service)
      and (c.expires_at is null or c.expires_at > p_start)
    order by c.expires_at nulls last, c.created_at
    limit 1 for update;
    if v_credit is null then return jsonb_build_object('error','no_credit'); end if;
    update public.credits set lessons_used = lessons_used + 1 where id = v_credit;
  end if;

  v_status := case when v_admin or not s.require_approval then 'approved' else 'pending' end;

  begin
    insert into public.bookings (student_id, service_id, instructor_id, starts_at, ends_at, status,
                                 price_agorot, payment_method, credit_id, parent_note, attempt_id, created_by)
    values (p_student, p_service, p_instructor, p_start, p_start + make_interval(mins => v_svc.duration_min), v_status,
            v_svc.price_agorot, p_payment, v_credit, left(coalesce(p_note,''), 500), p_attempt, auth.uid())
    returning * into v_row;
  exception when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'overlap_student';
  end;

  perform app.audit('booking.request', 'booking', v_row.id::text,
                    jsonb_build_object('status', v_status, 'start', p_start, 'service', p_service));
  return jsonb_build_object('ok', true, 'booking_id', v_row.id, 'number', v_row.number, 'status', v_row.status);
exception
  when raise_exception then
    if sqlerrm = 'overlap_student' then return jsonb_build_object('error','overlap_student'); end if;
    raise;
end $$;
grant execute on function public.request_booking(uuid, uuid, uuid, uuid, timestamptz, text, text) to authenticated;

-- ------------------------------------------------------------ cancel (parent within policy, admin anytime)
create or replace function public.cancel_booking(p_booking uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_admin boolean := app.is_admin();
  v_hours int;
begin
  select bk.* into b from public.bookings bk
  join public.students st on st.id = bk.student_id
  where bk.id = p_booking and (st.parent_id = auth.uid() or v_admin)
  for update of bk;
  if b.id is null then return jsonb_build_object('error','not_found'); end if;
  if b.status not in ('pending','approved') then return jsonb_build_object('error','not_active'); end if;

  select cancellation_hours into v_hours from public.settings where id = 1;
  if not v_admin and b.status = 'approved' and b.starts_at - now() < make_interval(hours => v_hours) then
    return jsonb_build_object('error','too_late_to_cancel', 'hours', v_hours);
  end if;
  if not v_admin and b.starts_at <= now() then
    return jsonb_build_object('error','too_late_to_cancel', 'hours', v_hours);
  end if;

  update public.bookings set status = 'cancelled', updated_at = now(),
    staff_note = case when p_reason <> '' then trim(staff_note || ' ' || 'ביטול: ' || p_reason) else staff_note end
  where id = b.id;
  if b.credit_id is not null then
    update public.credits set lessons_used = greatest(lessons_used - 1, 0) where id = b.credit_id;
  end if;
  perform app.audit('booking.cancel', 'booking', b.id::text, jsonb_build_object('reason', p_reason, 'by_admin', v_admin));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ------------------------------------------------------------ staff: set status (approve/decline/completed/no_show)
create or replace function public.set_booking_status(p_booking uuid, p_status text, p_note text default null, p_report text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_admin boolean := app.is_admin();
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or not (v_admin or (app.is_staff() and b.instructor_id = auth.uid())) then
    return jsonb_build_object('error','not_found');
  end if;
  if p_status not in ('approved','declined','completed','no_show') then return jsonb_build_object('error','bad_status'); end if;
  if not v_admin and p_status in ('approved','declined') then return jsonb_build_object('error','not_found'); end if;

  if p_status in ('approved','declined') and b.status <> 'pending' then
    return jsonb_build_object('error','not_pending');
  end if;
  if p_status in ('completed','no_show') then
    if b.status not in ('approved','completed','no_show') then return jsonb_build_object('error','not_approved'); end if;
    if b.starts_at > now() then return jsonb_build_object('error','not_started'); end if;
  end if;

  update public.bookings set status = p_status, updated_at = now(),
    staff_note = coalesce(p_note, staff_note), lesson_report = coalesce(p_report, lesson_report)
  where id = b.id;
  if p_status = 'declined' and b.credit_id is not null then
    update public.credits set lessons_used = greatest(lessons_used - 1, 0) where id = b.credit_id;
  end if;
  perform app.audit('booking.' || p_status, 'booking', b.id::text, jsonb_build_object('from', b.status));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.set_booking_status(uuid, text, text, text) to authenticated;

create or replace function public.set_booking_paid(p_booking uuid, p_paid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  update public.bookings set paid = p_paid, updated_at = now() where id = p_booking;
  perform app.audit('booking.paid', 'booking', p_booking::text, jsonb_build_object('paid', p_paid));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.set_booking_paid(uuid, boolean) to authenticated;

-- ------------------------------------------------------------ health declaration
create or replace function public.sign_health(p_student uuid, p_answers jsonb, p_signed_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_signed_by),'') = '' then return jsonb_build_object('error','name_required'); end if;
  update public.students set health_signed_at = now(), health_signed_by = left(trim(p_signed_by), 120), health_answers = p_answers
  where id = p_student and parent_id = auth.uid();
  if not found then return jsonb_build_object('error','not_found'); end if;
  perform app.audit('health.sign', 'student', p_student::text, null);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.sign_health(uuid, jsonb, text) to authenticated;

-- ------------------------------------------------------------ user management (admin)
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target public.profiles;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  if p_role not in ('admin','instructor','parent') then return jsonb_build_object('error','bad_role'); end if;
  select * into v_target from public.profiles where id = p_user for update;
  if v_target.id is null then return jsonb_build_object('error','not_found'); end if;
  if v_target.is_owner then return jsonb_build_object('error','owner_locked'); end if;
  update public.profiles set role = p_role where id = p_user;
  perform app.audit('user.role', 'profile', p_user::text, jsonb_build_object('from', v_target.role, 'to', p_role));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target public.profiles;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  select * into v_target from public.profiles where id = p_user for update;
  if v_target.id is null then return jsonb_build_object('error','not_found'); end if;
  if v_target.is_owner then return jsonb_build_object('error','owner_locked'); end if;
  update public.profiles set active = p_active where id = p_user;
  perform app.audit('user.active', 'profile', p_user::text, jsonb_build_object('active', p_active));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;

create or replace function public.admin_update_profile(p_user uuid, p_full_name text, p_phone text, p_color text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  update public.profiles set full_name = left(trim(p_full_name),120), phone = left(trim(p_phone),30),
    color = coalesce(nullif(p_color,''), color) where id = p_user;
  return jsonb_build_object('ok', found);
end $$;
grant execute on function public.admin_update_profile(uuid, text, text, text) to authenticated;

-- instructor day: names + service only, no health/money columns
create or replace function public.instructor_day(p_day date)
returns table (booking_id uuid, starts_at timestamptz, ends_at timestamptz, status text, service_name text,
               student_name text, student_level text, allergies text, lesson_report text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.starts_at, b.ends_at, b.status, sv.name, st.first_name || ' ' || st.last_name, st.swim_level,
         st.allergies, b.lesson_report
  from public.bookings b
  join public.students st on st.id = b.student_id
  join public.services sv on sv.id = b.service_id
  where app.is_staff() and b.instructor_id = auth.uid()
    and b.status in ('approved','completed','no_show')
    and (b.starts_at at time zone 'Asia/Jerusalem')::date = p_day
  order by b.starts_at
$$;
grant execute on function public.instructor_day(date) to authenticated;

-- lock down: anon never executes business RPCs
revoke execute on all functions in schema public from anon;
