-- SEA.D.CHANGE core schema: profiles/roles, settings, services, schedule, students, bookings, packages, announcements.
-- Security model: RLS on every table; all multi-row business mutations go through SECURITY DEFINER RPCs.

create extension if not exists btree_gist;

create schema if not exists app;
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'parent' check (role in ('admin','instructor','parent')),
  is_owner boolean not null default false,
  active boolean not null default true,
  color text not null default '#1D6E9E',
  created_at timestamptz not null default now()
);

-- Owner bootstrap: this email becomes the owner admin on first sign-up.
create table app.config (key text primary key, value text not null);
insert into app.config values ('owner_email', 'dudisweem@gmail.com');

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner text;
begin
  select value into v_owner from app.config where key = 'owner_email';
  insert into public.profiles (id, email, full_name, role, is_owner)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    case when lower(new.email) = lower(v_owner) then 'admin' else 'parent' end,
    lower(new.email) = lower(v_owner)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function app.handle_new_user();

-- role helpers (stable, definer so they can read profiles under RLS)
create or replace function app.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and active), false)
$$;
create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin','instructor') from public.profiles where id = auth.uid() and active), false)
$$;
grant execute on function app.my_role(), app.is_admin(), app.is_staff() to authenticated;

alter table public.profiles enable row level security;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_staff());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- users may only edit their own name/phone; role changes go through admin_set_role()
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ---------------------------------------------------------------- settings (singleton)
create table public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'SEA.D.CHANGE',
  tagline text not null default 'בית ספר לשחייה, מיומנויות מים וחשיפה לקור',
  welcome_text text not null default 'ברוכים הבאים לבית הספר של דודי ויעל. כאן לומדים לשחות כחלק מהכניסה לבית ולמשפחה שלנו.',
  contact_phone text not null default '',
  contact_email text not null default '',
  address text not null default '',
  cancellation_hours int not null default 24 check (cancellation_hours between 0 and 168),
  min_notice_hours int not null default 12 check (min_notice_hours between 0 and 168),
  booking_horizon_days int not null default 30 check (booking_horizon_days between 1 and 365),
  slot_step_min int not null default 15 check (slot_step_min in (5,10,15,20,30,45,60)),
  buffer_min int not null default 0 check (buffer_min between 0 and 60),
  require_approval boolean not null default true,
  max_lessons_per_week_per_student int not null default 0 check (max_lessons_per_week_per_student >= 0), -- 0 = no limit
  health_required boolean not null default true,
  health_validity_months int not null default 12 check (health_validity_months between 1 and 60),
  payment_cash boolean not null default true,
  payment_bit boolean not null default true,
  payment_paybox boolean not null default true,
  payment_card boolean not null default true, -- punch card (כרטיסייה)
  bit_phone text not null default '',
  paybox_link text not null default '',
  booking_open boolean not null default true,
  closed_message text not null default 'ההרשמה לשיעורים סגורה כרגע. נחזור בקרוב.',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);
alter table public.settings enable row level security;
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_admin on public.settings for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------- services (lesson types)
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  duration_min int not null check (duration_min between 10 and 240),
  price_agorot int not null check (price_agorot >= 0),
  capacity int not null default 1 check (capacity between 1 and 30),
  min_age int,
  max_age int,
  active boolean not null default true,
  bookable_by_parents boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.services (name, description, duration_min, price_agorot, capacity, sort) values
  ('שיעור פרטני', 'מדריך אחד, חניך אחד. קצב אישי ומלא תשומת לב.', 45, 20000, 1, 1),
  ('שיעור קבוצתי', 'קבוצה קטנה עד 4 חניכים בגיל ורמה דומים.', 45, 18000, 4, 2),
  ('חשיפה לקור', 'מפגש מודרך של נשימה וכניסה למים קרים.', 30, 15000, 6, 3);
alter table public.services enable row level security;
create policy services_read on public.services for select to anon, authenticated using (active or app.is_admin());
create policy services_admin on public.services for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------- schedule
-- weekly recurring working hours per instructor (weekday 0=Sunday .. 6=Saturday), local business time
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index on public.working_hours (instructor_id, weekday);
alter table public.working_hours enable row level security;
create policy wh_read on public.working_hours for select to authenticated using (true);
create policy wh_admin on public.working_hours for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- blocked time: vacation, holiday, pool closed. instructor_id null = whole school
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  check (ends_at > starts_at)
);
alter table public.time_off enable row level security;
create policy to_read on public.time_off for select to authenticated using (true);
create policy to_admin on public.time_off for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------- students (kids)
create table public.students (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  first_name text not null check (length(first_name) between 1 and 60),
  last_name text not null default '',
  birth_date date,
  gender text check (gender in ('m','f','other')),
  swim_level text not null default 'beginner' check (swim_level in ('none','beginner','basic','intermediate','advanced')),
  allergies text not null default '',
  medical_notes text not null default '',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  notes text not null default '',
  color text not null default '#5DB4DA',
  health_signed_at timestamptz,
  health_signed_by text,
  health_answers jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.students (parent_id);
alter table public.students enable row level security;
create policy students_parent_read on public.students for select to authenticated
  using (parent_id = auth.uid() or app.is_admin());
create policy students_parent_insert on public.students for insert to authenticated
  with check (parent_id = auth.uid() or app.is_admin());
create policy students_parent_update on public.students for update to authenticated
  using (parent_id = auth.uid() or app.is_admin()) with check (parent_id = auth.uid() or app.is_admin());
create policy students_admin_delete on public.students for delete to authenticated using (app.is_admin());

-- ---------------------------------------------------------------- packages (punch cards)
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_id uuid references public.services(id) on delete set null, -- null = any service
  lessons int not null check (lessons between 1 and 100),
  price_agorot int not null check (price_agorot >= 0),
  validity_days int not null default 180 check (validity_days between 1 and 1095),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.packages (name, service_id, lessons, price_agorot, validity_days)
  select 'כרטיסייה 10 שיעורים פרטניים', id, 10, 180000, 180 from public.services where name = 'שיעור פרטני';
alter table public.packages enable row level security;
create policy packages_read on public.packages for select to anon, authenticated using (active or app.is_admin());
create policy packages_admin on public.packages for all to authenticated using (app.is_admin()) with check (app.is_admin());

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  package_id uuid references public.packages(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  lessons_total int not null check (lessons_total > 0),
  lessons_used int not null default 0 check (lessons_used >= 0),
  expires_at timestamptz,
  paid boolean not null default false,
  note text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (lessons_used <= lessons_total)
);
alter table public.credits enable row level security;
create policy credits_read on public.credits for select to authenticated using (
  app.is_admin() or exists (select 1 from public.students s where s.id = student_id and s.parent_id = auth.uid())
);
create policy credits_admin on public.credits for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  student_id uuid not null references public.students(id) on delete cascade,
  service_id uuid not null references public.services(id),
  instructor_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','cancelled','completed','no_show')),
  price_agorot int not null,
  payment_method text not null check (payment_method in ('cash','bit','paybox','card')),
  credit_id uuid references public.credits(id),
  paid boolean not null default false,
  parent_note text not null default '',
  staff_note text not null default '',
  lesson_report text not null default '',
  attempt_id uuid unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- a child can't be in two overlapping active lessons
  constraint no_student_overlap exclude using gist (student_id with =, during with &&)
    where (status in ('pending','approved'))
);
create index on public.bookings (instructor_id, starts_at);
create index on public.bookings (starts_at);
alter table public.bookings enable row level security;
create policy bookings_read on public.bookings for select to authenticated using (
  app.is_admin()
  or instructor_id = auth.uid()
  or exists (select 1 from public.students s where s.id = student_id and s.parent_id = auth.uid())
);
-- no direct insert/update/delete for non-admins: RPCs only
create policy bookings_admin on public.bookings for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------- announcements
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create policy ann_read on public.announcements for select to authenticated using (active or app.is_admin());
create policy ann_admin on public.announcements for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------- audit log (append-only)
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy audit_admin_read on public.audit_log for select to authenticated using (app.is_admin());
revoke insert, update, delete on public.audit_log from authenticated, anon;
