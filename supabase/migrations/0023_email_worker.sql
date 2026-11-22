-- Email worker RPCs for the server-side sender (cron route + post-action flush).
-- No service role in the app: these accept a shared secret compared with app.config 'cron_secret'
-- (owner sets it to the same value as Vercel env CRON_SECRET). Without it they refuse.

create or replace function app.cron_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_secret) >= 24 and p_secret = (select value from app.config where key = 'cron_secret'), false)
$$;

-- claim up to p_limit due emails (marks them 'sending' so parallel workers don't double-send)
create or replace function public.outbox_claim(p_secret text, p_limit int default 20)
returns table (id bigint, to_email text, subject text, html text, attempts int)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.cron_ok(p_secret) then return; end if;
  -- recover rows stuck in 'sending' (worker died mid-send)
  update public.email_outbox o set status = 'queued'
  where o.status = 'sending' and o.next_attempt_at < now() - interval '10 minutes';
  return query
  update public.email_outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now()
  where o.id in (
    select q.id from public.email_outbox q
    where q.status = 'queued' and q.next_attempt_at <= now()
    order by q.created_at limit greatest(1, least(p_limit, 50))
    for update skip locked)
  returning o.id, o.to_email, o.subject, o.html, o.attempts;
end $$;

-- report the outcome; failures back off exponentially, max 5 attempts
create or replace function public.outbox_result(p_secret text, p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.cron_ok(p_secret) then return; end if;
  update public.email_outbox o set
    status = case when p_ok then 'sent' when o.attempts >= 5 then 'failed' else 'queued' end,
    sent_at = case when p_ok then now() else null end,
    last_error = case when p_ok then null else left(coalesce(p_error, 'error'), 500) end,
    next_attempt_at = case when p_ok then o.next_attempt_at else now() + make_interval(mins => (power(2, o.attempts))::int * 5) end
  where o.id = p_id and o.status = 'sending';
end $$;

-- daily: reminders for tomorrow's approved lessons (idempotent per booking) + expire old waitlist rows
create or replace function public.enqueue_reminders(p_secret text)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_on boolean; v_tomorrow date := (now() at time zone 'Asia/Jerusalem')::date + 1;
begin
  if not app.cron_ok(p_secret) then return -1; end if;
  update public.waitlist set status = 'expired'
  where status in ('waiting','notified') and day < (now() at time zone 'Asia/Jerusalem')::date;
  select email_reminders into v_on from public.settings where id = 1;
  for r in
    select b.id, b.starts_at, st.parent_id, st.first_name, sv.name service, p.full_name instructor
    from public.bookings b
    join public.students st on st.id = b.student_id
    join public.services sv on sv.id = b.service_id
    join public.profiles p on p.id = b.instructor_id
    where b.status = 'approved' and (b.starts_at at time zone 'Asia/Jerusalem')::date = v_tomorrow
      and not exists (select 1 from public.notifications nn where nn.booking_id = b.id and nn.kind = 'reminder')
  loop
    perform app.notify(r.parent_id, 'reminder', 'תזכורת: מחר שיעור ל' || r.first_name,
      r.service || ' עם ' || coalesce(nullif(r.instructor, ''), 'המדריך') || E'\n' || app.local_label(r.starts_at),
      '/lessons', r.id, v_on, 'rem:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.outbox_claim(text, int), public.outbox_result(text, bigint, boolean, text),
  public.enqueue_reminders(text) from public;
-- callable without a user session (server cron) — protected by the secret, not by role
grant execute on function public.outbox_claim(text, int), public.outbox_result(text, bigint, boolean, text),
  public.enqueue_reminders(text) to anon, authenticated;
revoke execute on all functions in schema app from public, anon;
