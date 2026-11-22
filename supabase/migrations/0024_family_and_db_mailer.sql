-- (1) Merge with guardians (0011–0013): access = app.can_manage(student) (owner OR accepted guardian),
--     and family notifications go to the owner AND every accepted guardian.
-- (2) Email sending moves into the database: pg_cron runs a worker every minute that posts to Resend
--     through pg_net. The API key lives in Vault. Nothing email-related is exposed through the API,
--     so the anon-executable worker RPCs from 0023 are dropped.
--     Owner setup (once):  select vault.create_secret('<RESEND_API_KEY>', 'resend_api_key');
--                          insert into app.config values ('email_from', 'SWEEMER <noreply@your-domain>');

-- ------------------------------------------------------------ family recipients
create or replace function app.family_users(p_student uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select parent_id from public.students where id = p_student
  union
  select g.user_id from public.guardianships g
  where g.student_id = p_student and g.accepted_at is not null and g.user_id is not null
$$;

create or replace function app.notify_family(p_student uuid, p_kind text, p_title text, p_body text, p_link text,
                                             p_booking uuid, p_email boolean, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select * from app.family_users(p_student) loop
    perform app.notify(u, p_kind, p_title, p_body, p_link, p_booking, p_email,
                       case when p_dedupe is null then null else p_dedupe || ':' || u end);
  end loop;
end $$;

-- ------------------------------------------------------------ booking trigger (family-aware)
create or replace function app.on_booking_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v_kid text;
  v_service text;
  v_when text;
  v_actor_is_family boolean := app.can_manage(new.student_id);
  v_suppress boolean := coalesce(current_setting('app.suppress_notify', true), '') = 'on';
begin
  select * into s from public.settings where id = 1;
  select st.first_name into v_kid from public.students st where st.id = new.student_id;
  select name into v_service from public.services where id = new.service_id;
  v_when := app.local_label(new.starts_at);

  if tg_op = 'INSERT' then
    update public.waitlist w set status = 'booked'
    where w.student_id = new.student_id and w.service_id = new.service_id
      and w.day = (new.starts_at at time zone 'Asia/Jerusalem')::date and w.status in ('waiting','notified');
    if not v_suppress then
      if new.status = 'pending' then
        perform app.notify_admins('request_new', 'בקשה חדשה לשיעור',
          v_kid || ' · ' || v_service || E'\n' || v_when, '/admin/requests', new.id, s.email_admin_new_request, 'req:' || new.id);
      elsif new.status = 'approved' and not v_actor_is_family then
        -- booked directly by staff for the family
        perform app.notify_family(new.student_id, 'booking_approved', 'נקבע שיעור ל' || v_kid,
          v_service || E'\n' || v_when, '/lessons', new.id, s.email_parent_status, 'appr:' || new.id);
      end if;
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if not v_suppress then
    if new.status = 'approved' and old.status = 'pending' then
      perform app.notify_family(new.student_id, 'booking_approved', 'השיעור של ' || v_kid || ' אושר',
        v_service || E'\n' || v_when, '/lessons', new.id, s.email_parent_status, 'appr:' || new.id);
    elsif new.status = 'declined' then
      perform app.notify_family(new.student_id, 'booking_declined', 'הבקשה לשיעור של ' || v_kid || ' לא אושרה',
        v_service || E'\n' || v_when || case when new.staff_note <> '' then E'\nהערה: ' || new.staff_note else '' end,
        '/book', new.id, s.email_parent_status, 'decl:' || new.id);
    elsif new.status = 'cancelled' then
      if not v_actor_is_family then
        perform app.notify_family(new.student_id, 'booking_cancelled', 'השיעור של ' || v_kid || ' בוטל',
          v_service || E'\n' || v_when, '/lessons', new.id, s.email_parent_status, 'canc:' || new.id);
      else
        perform app.notify_admins('booking_cancelled_parent', 'ביטול שיעור על ידי הורה',
          v_kid || ' · ' || v_service || E'\n' || v_when, '/admin/calendar', new.id, s.email_admin_new_request, 'canc:' || new.id);
      end if;
    end if;
  end if;

  if new.status in ('cancelled','declined') and old.status in ('pending','approved') and new.starts_at > now() then
    perform app.waitlist_offer(new.service_id, new.instructor_id, new.starts_at);
  end if;
  return new;
end $$;

-- ------------------------------------------------------------ waitlist (family-aware)
drop policy if exists waitlist_read on public.waitlist;
create policy waitlist_read on public.waitlist for select to authenticated
  using (app.is_admin() or app.can_manage(student_id));

create or replace function public.join_waitlist(p_student uuid, p_service uuid, p_instructor uuid, p_day date,
                                                p_from time default null, p_to time default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.settings; v_id uuid; v_admin boolean := app.is_admin();
begin
  if not exists (select 1 from public.students st where st.id = p_student and st.active)
     or not (v_admin or app.can_manage(p_student)) then
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
  where w.id = p_id and w.status in ('waiting','notified') and (app.is_admin() or app.can_manage(w.student_id));
  if not found then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

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
    select w.id, w.student_id, st.first_name
    from public.waitlist w join public.students st on st.id = w.student_id
    where w.service_id = p_service and w.day = v_day and w.status in ('waiting','notified')
      and (w.instructor_id is null or w.instructor_id = p_instructor)
      and (w.from_time is null or v_time >= w.from_time)
      and (w.to_time is null or v_time <= w.to_time)
    order by w.created_at
  loop
    update public.waitlist set status = 'notified', notified_at = now() where id = r.id;
    perform app.notify_family(r.student_id, 'waitlist_open', 'התפנה מקום ל' || r.first_name,
      v_service || E'\n' || app.local_label(p_start) || E'\nמי שמזמין ראשון — מקבל את המקום.',
      '/book?kid=' || r.student_id || '&service=' || p_service || '&day=' || v_day,
      null, v_email, 'wl:' || r.id || ':' || extract(epoch from p_start)::bigint);
  end loop;
end $$;

-- ------------------------------------------------------------ series (family-aware)
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
  v_service text;
  i int;
begin
  if auth.uid() is null then return jsonb_build_object('error','not_authenticated'); end if;
  if p_weeks < 2 or p_weeks > 12 then return jsonb_build_object('error','bad_weeks'); end if;
  if not (v_admin or app.can_manage(p_student)) then return jsonb_build_object('error','not_found'); end if;
  select st.first_name into v_kid from public.students st where st.id = p_student;
  if v_kid is null then return jsonb_build_object('error','not_found'); end if;
  select * into s from public.settings where id = 1;
  select name into v_service from public.services where id = p_service;

  perform set_config('app.suppress_notify', 'on', true);
  for i in 0 .. p_weeks - 1 loop
    v_start := (v_local + make_interval(days => 7 * i)) at time zone 'Asia/Jerusalem';
    if not v_admin and v_start > now() + make_interval(days => s.booking_horizon_days) then
      v_res := jsonb_build_object('error', 'beyond_horizon');
    else
      -- request_booking (live, guardian-aware) enforces every per-lesson rule
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
    elsif not app.can_manage(p_student) then
      perform app.notify_family(p_student, 'booking_approved', 'נקבעה סדרה של ' || v_booked || ' שיעורים ל' || v_kid,
        coalesce(v_service, '') || E'\nמ־' || app.local_label(p_first_start) || ', כל שבוע', '/lessons', null,
        s.email_parent_status, 'series-appr:' || v_series);
    end if;
  end if;
  return jsonb_build_object('ok', v_booked > 0, 'series_id', v_series, 'booked', v_booked, 'weeks', v_out);
end $$;

create or replace function public.approve_series(p_series uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_res jsonb; v_done int := 0; v_failed int := 0; v_student uuid; v_kid text; v_service text; v_first timestamptz; v_email boolean;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  perform set_config('app.suppress_notify', 'on', true);
  for r in select b.id from public.bookings b where b.series_id = p_series and b.status = 'pending' and b.starts_at > now() order by b.starts_at loop
    v_res := public.set_booking_status(r.id, 'approved');
    if (v_res->>'ok')::boolean is true then v_done := v_done + 1; else v_failed := v_failed + 1; end if;
  end loop;
  perform set_config('app.suppress_notify', '', true);
  if v_done = 0 and v_failed = 0 then return jsonb_build_object('error','not_pending'); end if;
  select b.student_id, st.first_name, sv.name, min(b.starts_at)
    into v_student, v_kid, v_service, v_first
  from public.bookings b join public.students st on st.id = b.student_id join public.services sv on sv.id = b.service_id
  where b.series_id = p_series and b.status = 'approved'
  group by b.student_id, st.first_name, sv.name;
  select email_parent_status into v_email from public.settings where id = 1;
  if v_done > 0 then
    perform app.notify_family(v_student, 'booking_approved', 'אושרה סדרה של ' || v_done || ' שיעורים ל' || v_kid,
      coalesce(v_service, '') || E'\nמ־' || app.local_label(v_first) || ', כל שבוע', '/lessons', null, v_email,
      'series-appr:' || p_series || ':' || v_done);
  end if;
  return jsonb_build_object('ok', v_done > 0, 'approved', v_done, 'failed', v_failed);
end $$;

-- ------------------------------------------------------------ drop API-exposed worker functions
drop function if exists public.outbox_claim(text, int);
drop function if exists public.outbox_result(text, bigint, boolean, text);
drop function if exists public.enqueue_reminders(text);
drop function if exists app.cron_ok(text);

-- ------------------------------------------------------------ in-database mailer
create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.email_outbox add column if not exists net_request_id bigint;

create or replace function app.mail_config(out api_key text, out mail_from text)
language plpgsql stable security definer set search_path = '' as $$
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  select value into mail_from from app.config where key = 'email_from';
end $$;

-- send due emails: one async HTTP request per row (pg_net); results reconciled next run
create or replace function app.outbox_dispatch(p_limit int default 20) returns int
language plpgsql security definer set search_path = '' as $$
declare c record; r record; n int := 0;
begin
  select * into c from app.mail_config();
  if coalesce(c.api_key, '') = '' or coalesce(c.mail_from, '') = '' then return 0; end if; -- not configured: stay queued
  for r in
    select o.id, o.to_email, o.subject, o.html from public.email_outbox o
    where o.status = 'queued' and o.next_attempt_at <= now()
    order by o.created_at limit p_limit
    for update skip locked
  loop
    update public.email_outbox set status = 'sending', attempts = attempts + 1, next_attempt_at = now(),
      net_request_id = net.http_post(
        url := 'https://api.resend.com/emails',
        body := jsonb_build_object('from', c.mail_from, 'to', jsonb_build_array(r.to_email), 'subject', r.subject, 'html', r.html),
        headers := jsonb_build_object('Authorization', 'Bearer ' || c.api_key, 'Content-Type', 'application/json'),
        timeout_milliseconds := 10000)
    where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- read pg_net responses: 2xx → sent; error → retry with exponential backoff, failed after 5 attempts
create or replace function app.outbox_reconcile() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_ok boolean; v_err text;
begin
  for r in
    select o.id, o.attempts, o.next_attempt_at, h.status_code, h.content, h.error_msg, h.timed_out, (h.id is not null) as answered
    from public.email_outbox o left join net._http_response h on h.id = o.net_request_id
    where o.status = 'sending'
    for update of o skip locked
  loop
    if not r.answered and r.next_attempt_at > now() - interval '10 minutes' then
      continue; -- still in flight
    end if;
    v_ok := r.answered and coalesce(r.status_code, 0) between 200 and 299;
    v_err := case when v_ok then null
                  when not r.answered then 'no response'
                  else left(coalesce(r.status_code::text, '') || ' ' || coalesce(r.error_msg, '') || ' ' || coalesce(r.content::text, ''), 500) end;
    update public.email_outbox set
      status = case when v_ok then 'sent' when r.attempts >= 5 then 'failed' else 'queued' end,
      sent_at = case when v_ok then now() else null end,
      last_error = v_err,
      next_attempt_at = case when v_ok then next_attempt_at else now() + make_interval(mins => (power(2, r.attempts))::int * 5) end
    where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- daily: tomorrow's reminders (idempotent per booking, to the whole family) + expire past waitlist rows
create or replace function app.enqueue_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_on boolean; v_tomorrow date := (now() at time zone 'Asia/Jerusalem')::date + 1;
begin
  update public.waitlist set status = 'expired'
  where status in ('waiting','notified') and day < (now() at time zone 'Asia/Jerusalem')::date;
  select email_reminders into v_on from public.settings where id = 1;
  for r in
    select b.id, b.student_id, b.starts_at, st.first_name, sv.name service, p.full_name instructor
    from public.bookings b
    join public.students st on st.id = b.student_id
    join public.services sv on sv.id = b.service_id
    join public.profiles p on p.id = b.instructor_id
    where b.status = 'approved' and (b.starts_at at time zone 'Asia/Jerusalem')::date = v_tomorrow
      and not exists (select 1 from public.notifications nn where nn.booking_id = b.id and nn.kind = 'reminder')
  loop
    perform app.notify_family(r.student_id, 'reminder', 'תזכורת: מחר שיעור ל' || r.first_name,
      r.service || ' עם ' || coalesce(nullif(r.instructor, ''), 'המדריך') || E'\n' || app.local_label(r.starts_at),
      '/lessons', r.id, v_on, 'rem:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- admin-only delivery status (the page can't read Vault)
create or replace function public.email_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  select * into c from app.mail_config();
  return jsonb_build_object(
    'configured', coalesce(c.api_key, '') <> '' and coalesce(c.mail_from, '') <> '',
    'queued', (select count(*) from public.email_outbox where status in ('queued','sending')),
    'sent', (select count(*) from public.email_outbox where status = 'sent'),
    'failed', (select count(*) from public.email_outbox where status = 'failed'),
    'last_error', (select last_error from public.email_outbox where last_error is not null order by id desc limit 1));
end $$;

-- schedules (idempotent)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('sweemer-outbox', 'sweemer-reminders');
  perform cron.schedule('sweemer-outbox', '* * * * *', 'select app.outbox_reconcile(); select app.outbox_dispatch();');
  -- 16:00 UTC = 18:00/19:00 Israel
  perform cron.schedule('sweemer-reminders', '0 16 * * *', 'select app.enqueue_reminders();');
end $$;

revoke execute on all functions in schema app from public, anon;
grant execute on function app.my_role(), app.is_admin(), app.is_staff(), app.health_valid(uuid, timestamptz) to authenticated;
revoke execute on function public.email_status() from public, anon;
grant execute on function public.email_status() to authenticated;
