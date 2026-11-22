-- End-to-end business scenario against a real database, fully rolled back.
-- Run it in the Supabase SQL editor (or via the MCP execute_sql tool). It ALWAYS ends with an
-- exception whose message is the step-by-step result; the exception rolls back every change.
-- Every line should read as expected (see the "expect" hints). Requires only an owner admin and an
-- active private (capacity 1) service: it creates its own synthetic parent, child, accepted guardian,
-- stranger and working hours inside the transaction, so nothing is left behind.
--
-- Note: identity sequences are not transactional, so the booking number counter advances.
-- When the bookings table is empty you can reset it afterwards:
--   alter table public.bookings alter column number restart with 1;

do $$
declare
  v_admin uuid;
  v_parent uuid;
  v_other uuid := gen_random_uuid();   -- a stranger parent: no relation to the child
  v_guard uuid := gen_random_uuid();   -- a second parent with an ACCEPTED guardianship
  kid uuid; svc uuid; slot record; r jsonb; bid uuid; d date; n int; v_status text; v_start timestamptz;
  out text := '';
begin
  select id into v_admin from public.profiles where is_owner limit 1;
  select id into svc from public.services where active and capacity = 1 order by sort limit 1;
  if v_admin is null or svc is null then
    raise exception 'E2E needs an owner admin and an active private (capacity 1) service';
  end if;
  -- synthetic family + availability, existing only inside this transaction
  v_parent := gen_random_uuid();
  insert into auth.users (id, email, aud, role) values
    (v_parent, 'e2e-parent@example.invalid', 'authenticated', 'authenticated'),
    (v_other, 'e2e-other@example.invalid', 'authenticated', 'authenticated'),
    (v_guard, 'e2e-guard@example.invalid', 'authenticated', 'authenticated');
  insert into public.students (parent_id, first_name, last_name) values (v_parent, 'בדיקה', 'אוטומטית') returning id into kid;
  insert into public.working_hours (instructor_id, weekday, start_time, end_time)
    select v_admin, w, '06:00', '22:00' from generate_series(0, 6) w;
  insert into public.guardianships (student_id, invited_email, user_id, invited_by, accepted_at)
  values (kid, 'e2e-guard@example.invalid', v_guard, v_parent, now());

  -- ---------------------------------------------------------------- parent
  perform set_config('request.jwt.claims', json_build_object('sub', v_parent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || E'\n01 parent signs health (expect ok): ' || public.sign_health(kid, '{}'::jsonb, 'E2E')::text;
  for d in select g::date from generate_series(current_date + 1, current_date + 30, interval '1 day') g loop
    select * into slot from public.get_available_slots(svc, d, null) limit 1;
    exit when slot.starts_at is not null;
  end loop;
  out := out || E'\n02 first free slot (expect a time): ' || coalesce(slot.starts_at::text, 'NONE — add working hours');
  r := public.request_booking(gen_random_uuid(), kid, svc, slot.instructor_id, slot.starts_at, 'cash', 'e2e');
  out := out || E'\n03 parent books (expect ok, pending): ' || r::text;
  bid := (r->>'booking_id')::uuid;
  out := out || E'\n04 same attempt replays, no duplicate: ' ||
    (select count(*) from public.bookings where student_id = kid and starts_at = slot.starts_at)::text;
  out := out || E'\n05 parent approves own request (expect not_found): ' || public.set_booking_status(bid, 'approved')::text;
  execute 'reset role';

  -- ---------------------------------------------------------------- a stranger family
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.students where id = kid;
  out := out || E'\n06 stranger reads the child (expect 0): ' || n;
  select count(*) into n from public.bookings where id = bid;
  out := out || E'\n07 stranger reads the booking (expect 0): ' || n;
  out := out || E'\n08 stranger books for the child (expect not_found): ' ||
    public.request_booking(gen_random_uuid(), kid, svc, slot.instructor_id, slot.starts_at, 'cash')::text;
  out := out || E'\n09 stranger cancels it (expect not_found): ' || public.cancel_booking(bid)::text;
  out := out || E'\n10 stranger reads progress (expect 0): ' || (select count(*) from public.student_progress where student_id = kid)::text;
  execute 'reset role';

  -- ---------------------------------------------------------------- accepted guardian (second parent)
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.students where id = kid;
  out := out || E'\n10a guardian reads the child (expect 1): ' || n;
  select count(*) into n from public.bookings where id = bid;
  out := out || E'\n10b guardian reads the booking (expect 1): ' || n;
  execute 'reset role';

  -- ---------------------------------------------------------------- admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || E'\n11 admin approves (expect ok): ' || public.set_booking_status(bid, 'approved')::text;
  out := out || E'\n12 admin approves twice (expect not_pending): ' || public.set_booking_status(bid, 'approved')::text;
  select status, starts_at into v_status, v_start from public.bookings where id = bid;
  out := out || E'\n13 calendar row (expect approved): ' || v_status;
  select count(*) into n from public.get_available_slots(svc, (v_start at time zone 'Asia/Jerusalem')::date, slot.instructor_id) a where a.starts_at = v_start;
  out := out || E'\n14 slot still offered (expect 0): ' || n;
  if slot.instructor_id = v_admin then
    select count(*) into n from public.instructor_day((v_start at time zone 'Asia/Jerusalem')::date) where booking_id = bid;
    out := out || E'\n15 on instructor day screen (expect 1): ' || n;
  end if;
  select count(*) into n from public.pool_board((v_start at time zone 'Asia/Jerusalem')::date);
  out := out || E'\n16 on pool board (expect >=1): ' || n;
  out := out || E'\n17 admin records progress (expect ok): ' ||
    public.record_progress(kid, (select id from public.skills where active order by sort limit 1), 'practicing')::text;
  out := out || E'\n18 report counts the lesson (expect lessons>=1): ' ||
    (public.admin_report((v_start at time zone 'Asia/Jerusalem')::date, (v_start at time zone 'Asia/Jerusalem')::date)->'totals')::text;
  out := out || E'\n19 demote owner (expect owner_locked): ' || public.admin_set_role(v_admin, 'parent')::text;
  out := out || E'\n20 delete self (expect cannot_delete_self): ' || public.admin_delete_user(v_admin)::text;
  execute 'reset role';

  -- ---------------------------------------------------------------- parent again
  perform set_config('request.jwt.claims', json_build_object('sub', v_parent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || E'\n21 parent sees progress (expect 1): ' || (select count(*) from public.student_progress where student_id = kid)::text;
  out := out || E'\n22 parent runs admin report (expect not_found): ' || public.admin_report(current_date, current_date)::text;
  execute 'reset role';

  -- guardian sees progress too; stranger still nothing
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || E'\n23 guardian sees progress (expect 1): ' || (select count(*) from public.student_progress where student_id = kid)::text;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || E'\n24 stranger sees progress (expect 0): ' || (select count(*) from public.student_progress where student_id = kid)::text;
  execute 'reset role';

  raise exception 'E2E RESULT (rolled back):%', out;
end $$;
