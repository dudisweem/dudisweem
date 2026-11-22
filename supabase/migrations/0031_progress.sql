-- Child progress tracking: admin-managed skills catalog + append-only progress entries.
-- Current status of a skill = latest entry. Instructors write only for kids they taught.

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  category text not null default 'כללי' check (length(category) between 1 and 40),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.skills enable row level security;
create policy skills_read on public.skills for select to authenticated using (active);
create policy skills_admin on public.skills for all to authenticated using (app.is_admin()) with check (app.is_admin());

insert into public.skills (category, name, sort) values
  ('הסתגלות למים', 'כניסה למים בביטחון', 10),
  ('הסתגלות למים', 'טבילת פנים במים', 20),
  ('הסתגלות למים', 'נשיפה בתוך המים', 30),
  ('ציפה', 'ציפה על הבטן', 40),
  ('ציפה', 'ציפה על הגב', 50),
  ('ציפה', 'עמידה מציפה', 60),
  ('תנועה במים', 'גלישה על הבטן', 70),
  ('תנועה במים', 'גלישה על הגב', 80),
  ('תנועה במים', 'בעיטות חתירה', 90),
  ('סגנונות', 'חתירה (קראול)', 100),
  ('סגנונות', 'שחיית גב', 110),
  ('סגנונות', 'שחיית חזה', 120),
  ('בטיחות', 'קפיצה למים עמוקים ויציאה', 130),
  ('בטיחות', 'דריכת מים 30 שניות', 140),
  ('בטיחות', 'הגעה לדופן לבד', 150);

-- Who may see a student's progress: admin, the owning parent, a guardian (if the guardianships
-- table exists), or an instructor who has taught the student.
create or replace function app.can_view_student(p_student uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v boolean := false;
begin
  if app.is_admin() then return true; end if;
  if exists (select 1 from public.students s where s.id = p_student and s.parent_id = auth.uid()) then return true; end if;
  if exists (select 1 from public.bookings b where b.student_id = p_student and b.instructor_id = auth.uid()
             and b.status in ('approved','completed','no_show')) then return true; end if;
  if to_regclass('public.guardianships') is not null then
    begin
      execute 'select exists (select 1 from public.guardianships g where g.student_id = $1 and g.user_id = $2)'
        into v using p_student, auth.uid();
    exception when others then v := false;
    end;
  end if;
  return coalesce(v, false);
end $$;
revoke execute on function app.can_view_student(uuid) from public, anon;
grant execute on function app.can_view_student(uuid) to authenticated;

create table public.student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  status text not null check (status in ('not_started','practicing','achieved')),
  note text not null default '' check (length(note) <= 500),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null
);
create index on public.student_progress (student_id, skill_id, recorded_at desc);
alter table public.student_progress enable row level security;
create policy progress_read on public.student_progress for select to authenticated using (app.can_view_student(student_id));
-- no direct writes; record_progress() only. Admin may delete a mistaken entry.
create policy progress_admin_delete on public.student_progress for delete to authenticated using (app.is_admin());

create or replace function public.record_progress(p_student uuid, p_skill uuid, p_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_staff() then return jsonb_build_object('error','not_found'); end if;
  if not app.is_admin() and not exists (
    select 1 from public.bookings b where b.student_id = p_student and b.instructor_id = auth.uid()
      and b.status in ('approved','completed','no_show') and b.starts_at <= now()) then
    return jsonb_build_object('error','not_found');
  end if;
  if p_status not in ('not_started','practicing','achieved') then return jsonb_build_object('error','invalid'); end if;
  if not exists (select 1 from public.skills where id = p_skill and active) then return jsonb_build_object('error','not_found'); end if;
  insert into public.student_progress (student_id, skill_id, status, note, recorded_by)
  values (p_student, p_skill, p_status, left(coalesce(p_note,''), 500), auth.uid()) returning id into v_id;
  perform app.audit('progress.record', 'student', p_student::text, jsonb_build_object('skill', p_skill, 'status', p_status));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function public.record_progress(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_progress(uuid, uuid, text, text) to authenticated;

-- Workday helper: which student each of my lessons that day belongs to (ids + first name only).
-- Kept separate from instructor_day so other changes to that function stay independent.
create or replace function public.instructor_day_students(p_day date)
returns table (booking_id uuid, student_id uuid, first_name text)
language sql stable security definer set search_path = '' as $$
  select b.id, st.id, st.first_name
  from public.bookings b
  join public.students st on st.id = b.student_id
  where app.is_staff() and b.instructor_id = auth.uid()
    and b.status in ('approved','completed','no_show')
    and (b.starts_at at time zone 'Asia/Jerusalem')::date = p_day
$$;
revoke execute on function public.instructor_day_students(date) from public, anon;
grant execute on function public.instructor_day_students(date) to authenticated;
