-- Notifications: in-app inbox + email outbox, filled by triggers on booking status changes.
-- A failed or unconfigured email never affects the business action: triggers only enqueue rows.

insert into app.config values ('site_url', 'https://sweemer.vercel.app') on conflict (key) do nothing;
-- app.config 'cron_secret' must be inserted by the owner with the same value as Vercel env CRON_SECRET.

alter table public.settings
  add column if not exists email_admin_new_request boolean not null default true,
  add column if not exists email_parent_status boolean not null default true,
  add column if not exists email_reminders boolean not null default true,
  add column if not exists email_waitlist boolean not null default true;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  booking_id uuid references public.bookings(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notif_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_user uuid references public.profiles(id) on delete set null,
  to_email text not null,
  kind text not null,
  subject text not null,
  html text not null,
  dedupe_key text unique,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.email_outbox (status, next_attempt_at);
alter table public.email_outbox enable row level security;
create policy outbox_admin_read on public.email_outbox for select to authenticated using (app.is_admin());
revoke insert, update, delete on public.email_outbox from authenticated, anon;

-- ------------------------------------------------------------ helpers
create or replace function app.local_label(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_at at time zone 'Asia/Jerusalem', 'DD.MM.YYYY') || ' בשעה ' || to_char(p_at at time zone 'Asia/Jerusalem', 'HH24:MI')
$$;

create or replace function app.email_html(p_title text, p_body text, p_link text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_site text; v_name text; v_url text;
begin
  select value into v_site from app.config where key = 'site_url';
  select business_name into v_name from public.settings where id = 1;
  v_url := coalesce(v_site, '') || coalesce(p_link, '/');
  return '<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#EAF3F8;font-family:Arial,Helvetica,sans-serif;color:#0A2033">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF3F8;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden" dir="rtl">'
    || '<tr><td style="background:#0E2F4B;color:#EAF3F8;padding:18px 22px;font-weight:800;letter-spacing:.2em;font-size:13px">' || coalesce(v_name, 'SWEEMER') || '</td></tr>'
    || '<tr><td style="padding:22px;text-align:right"><h1 style="margin:0 0 10px;font-size:20px">' || replace(replace(p_title, '<', '&lt;'), '>', '&gt;') || '</h1>'
    || '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#2C4A60">' || replace(replace(replace(p_body, '<', '&lt;'), '>', '&gt;'), E'\n', '<br>') || '</p>'
    || '<a href="' || v_url || '" style="display:inline-block;background:#FF6A47;color:#2A0B02;text-decoration:none;font-weight:800;padding:12px 20px;border-radius:14px">לפרטים</a>'
    || '</td></tr><tr><td style="padding:14px 22px;font-size:12px;color:#4C667C;border-top:1px solid #D3E4EE">הודעה אוטומטית. לשינוי העדפות פנו לבית הספר.</td></tr>'
    || '</table></td></tr></table></body></html>';
end $$;

-- insert one in-app notification and (optionally) queue its email
create or replace function app.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text,
                                      p_booking uuid, p_email boolean, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if p_user is null then return; end if;
  if p_dedupe is not null and exists (select 1 from public.email_outbox where dedupe_key = p_dedupe) then
    return; -- already notified for this event
  end if;
  insert into public.notifications (user_id, kind, title, body, link, booking_id)
  values (p_user, p_kind, p_title, p_body, p_link, p_booking);
  if p_email then
    select email into v_email from public.profiles where id = p_user and active;
    if coalesce(v_email, '') <> '' then
      insert into public.email_outbox (to_user, to_email, kind, subject, html, dedupe_key)
      values (p_user, v_email, p_kind, p_title, app.email_html(p_title, p_body, p_link), p_dedupe)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
end $$;

create or replace function app.notify_admins(p_kind text, p_title text, p_body text, p_link text,
                                             p_booking uuid, p_email boolean, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and active loop
    perform app.notify(r.id, p_kind, p_title, p_body, p_link, p_booking, p_email,
                       case when p_dedupe is null then null else p_dedupe || ':' || r.id end);
  end loop;
end $$;

-- ------------------------------------------------------------ booking trigger
create or replace function app.on_booking_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v_parent uuid;
  v_kid text;
  v_service text;
  v_when text;
  v_by_admin boolean := app.is_admin();
  v_suppress boolean := coalesce(current_setting('app.suppress_notify', true), '') = 'on';
begin
  select * into s from public.settings where id = 1;
  select st.parent_id, st.first_name into v_parent, v_kid from public.students st where st.id = new.student_id;
  select name into v_service from public.services where id = new.service_id;
  v_when := app.local_label(new.starts_at);

  if tg_op = 'INSERT' then
    -- waitlist: this student just booked that service/day, so their waiting entry is fulfilled
    update public.waitlist w set status = 'booked'
    where w.student_id = new.student_id and w.service_id = new.service_id
      and w.day = (new.starts_at at time zone 'Asia/Jerusalem')::date and w.status in ('waiting','notified');

    if not v_suppress then
      if new.status = 'pending' then
        perform app.notify_admins('request_new', 'בקשה חדשה לשיעור',
          v_kid || ' · ' || v_service || E'\n' || v_when, '/admin/requests', new.id, s.email_admin_new_request,
          'req:' || new.id);
      elsif new.status = 'approved' and v_parent is not null and v_parent <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
        -- booked directly by staff for the family
        perform app.notify(v_parent, 'booking_approved', 'נקבע שיעור ל' || v_kid,
          v_service || E'\n' || v_when, '/lessons', new.id, s.email_parent_status, 'appr:' || new.id);
      end if;
    end if;
    return new;
  end if;

  -- UPDATE of status
  if new.status is not distinct from old.status then return new; end if;

  if not v_suppress then
    if new.status = 'approved' and old.status = 'pending' then
      perform app.notify(v_parent, 'booking_approved', 'השיעור של ' || v_kid || ' אושר',
        v_service || E'\n' || v_when, '/lessons', new.id, s.email_parent_status, 'appr:' || new.id);
    elsif new.status = 'declined' then
      perform app.notify(v_parent, 'booking_declined', 'הבקשה לשיעור של ' || v_kid || ' לא אושרה',
        v_service || E'\n' || v_when || case when new.staff_note <> '' then E'\nהערה: ' || new.staff_note else '' end,
        '/book', new.id, s.email_parent_status, 'decl:' || new.id);
    elsif new.status = 'cancelled' then
      if v_by_admin and v_parent is distinct from auth.uid() then
        perform app.notify(v_parent, 'booking_cancelled', 'השיעור של ' || v_kid || ' בוטל',
          v_service || E'\n' || v_when, '/lessons', new.id, s.email_parent_status, 'canc:' || new.id);
      else
        perform app.notify_admins('booking_cancelled_parent', 'ביטול שיעור על ידי הורה',
          v_kid || ' · ' || v_service || E'\n' || v_when, '/admin/calendar', new.id, s.email_admin_new_request,
          'canc:' || new.id);
      end if;
    end if;
  end if;

  -- capacity freed: tell waiting families (first to book wins)
  if new.status in ('cancelled','declined') and old.status in ('pending','approved') and new.starts_at > now() then
    perform app.waitlist_offer(new.service_id, new.instructor_id, new.starts_at);
  end if;
  return new;
end $$;
