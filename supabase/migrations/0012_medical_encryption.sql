-- Medical data encrypted at rest (pgcrypto, AES via pgp_sym_encrypt) with a key generated inside
-- the DB and stored in Supabase Vault. Ciphertext lives in public.student_medical, a table no API
-- role can touch; access only through SECURITY DEFINER functions that check owner/guardian/admin.
-- The legacy plaintext columns on students are kept (old clients still write them) but a trigger
-- moves anything written there into the encrypted table and blanks them; a CHECK proves they stay empty.

-- 1. key: generated in-DB, never returned
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'medical_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'medical_key', 'AES key for students medical fields');
  end if;
end $$;

create or replace function app.medical_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'medical_key'
$$;

create or replace function app.med_enc(p text) returns bytea
language sql stable security definer set search_path = '' as $$
  select case when p is null or p = '' then null
         else extensions.pgp_sym_encrypt(p, app.medical_key(), 'cipher-algo=aes256') end
$$;

create or replace function app.med_dec(p bytea) returns text
language sql stable security definer set search_path = '' as $$
  select case when p is null then null else extensions.pgp_sym_decrypt(p, app.medical_key()) end
$$;

-- nobody but definer functions (owned by postgres) may call these
revoke execute on function app.medical_key(), app.med_enc(text), app.med_dec(bytea) from public, anon, authenticated;

-- 2. encrypted store
create table public.student_medical (
  student_id uuid primary key references public.students(id) on delete cascade deferrable initially deferred,
  allergies bytea,
  medical_notes bytea,
  health_answers bytea,
  updated_at timestamptz not null default now()
);
alter table public.student_medical enable row level security;  -- no policies: API roles get nothing
revoke all on public.student_medical from public, anon, authenticated;

-- 3. migrate existing plaintext
insert into public.student_medical (student_id, allergies, medical_notes, health_answers)
select id, app.med_enc(nullif(allergies, '')), app.med_enc(nullif(medical_notes, '')), app.med_enc(health_answers::text)
from public.students
where coalesce(allergies, '') <> '' or coalesce(medical_notes, '') <> '' or health_answers is not null
on conflict (student_id) do nothing;
update public.students set allergies = '', medical_notes = '', health_answers = null
where coalesce(allergies, '') <> '' or coalesce(medical_notes, '') <> '' or health_answers is not null;

-- 4. trap legacy writes to plaintext columns
create or replace function app.students_medical_trap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.allergies, '') <> '' or coalesce(new.medical_notes, '') <> '' or new.health_answers is not null then
    insert into public.student_medical as m (student_id, allergies, medical_notes, health_answers)
    values (new.id, app.med_enc(nullif(new.allergies, '')), app.med_enc(nullif(new.medical_notes, '')), app.med_enc(new.health_answers::text))
    on conflict (student_id) do update set
      allergies = case when coalesce(new.allergies, '') <> '' then excluded.allergies else m.allergies end,
      medical_notes = case when coalesce(new.medical_notes, '') <> '' then excluded.medical_notes else m.medical_notes end,
      health_answers = coalesce(excluded.health_answers, m.health_answers),
      updated_at = now();
    new.allergies := '';
    new.medical_notes := '';
    new.health_answers := null;
  end if;
  return new;
end $$;
revoke execute on function app.students_medical_trap() from public, anon, authenticated;
create trigger students_medical_trap before insert or update on public.students
for each row execute function app.students_medical_trap();

alter table public.students add constraint students_no_plaintext_medical
  check (allergies = '' and medical_notes = '' and health_answers is null);

-- 5. drawn signature image path (private storage, see 0013)
alter table public.students add column if not exists health_signature_path text;

-- 6. API
create or replace function public.get_student_medical(p_student uuid)
returns table (allergies text, medical_notes text, health_answers jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.can_manage(p_student) or app.is_admin()) then return; end if;
  return query
    select coalesce(app.med_dec(m.allergies), ''), coalesce(app.med_dec(m.medical_notes), ''), app.med_dec(m.health_answers)::jsonb
    from (select p_student as sid) x
    left join public.student_medical m on m.student_id = x.sid;
end $$;

create or replace function public.set_student_medical(p_student uuid, p_allergies text, p_medical_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (app.can_manage(p_student) or app.is_admin()) then return jsonb_build_object('error','not_found'); end if;
  insert into public.student_medical as m (student_id, allergies, medical_notes)
  values (p_student, app.med_enc(left(trim(coalesce(p_allergies, '')), 500)), app.med_enc(left(trim(coalesce(p_medical_notes, '')), 1000)))
  on conflict (student_id) do update set allergies = excluded.allergies, medical_notes = excluded.medical_notes, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- sign_health: owner or guardian; answers encrypted; optional drawn-signature path inside the kid's folder
drop function if exists public.sign_health(uuid, jsonb, text);
create or replace function public.sign_health(p_student uuid, p_answers jsonb, p_signed_by text, p_signature_path text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_signed_by),'') = '' then return jsonb_build_object('error','name_required'); end if;
  if not app.can_manage(p_student) then return jsonb_build_object('error','not_found'); end if;
  if p_signature_path is not null and p_signature_path !~ ('^' || p_student::text || '/[0-9]+\.png$') then
    return jsonb_build_object('error','bad_signature');
  end if;
  update public.students set health_signed_at = now(), health_signed_by = left(trim(p_signed_by), 120),
    health_signature_path = p_signature_path
  where id = p_student;
  insert into public.student_medical as m (student_id, health_answers)
  values (p_student, app.med_enc(p_answers::text))
  on conflict (student_id) do update set health_answers = excluded.health_answers, updated_at = now();
  perform app.audit('health.sign', 'student', p_student::text, jsonb_build_object('drawn', p_signature_path is not null));
  return jsonb_build_object('ok', true);
end $$;

-- instructor day: allergies decrypted for safety, nothing else medical
create or replace function public.instructor_day(p_day date)
returns table (booking_id uuid, starts_at timestamptz, ends_at timestamptz, status text, service_name text,
               student_name text, student_level text, allergies text, lesson_report text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.starts_at, b.ends_at, b.status, sv.name, st.first_name || ' ' || st.last_name, st.swim_level,
         coalesce(app.med_dec(m.allergies), ''), b.lesson_report
  from public.bookings b
  join public.students st on st.id = b.student_id
  join public.services sv on sv.id = b.service_id
  left join public.student_medical m on m.student_id = st.id
  where app.is_staff() and b.instructor_id = auth.uid()
    and b.status in ('approved','completed','no_show')
    and (b.starts_at at time zone 'Asia/Jerusalem')::date = p_day
  order by b.starts_at
$$;

revoke execute on function public.get_student_medical(uuid), public.set_student_medical(uuid, text, text),
  public.sign_health(uuid, jsonb, text, text), public.instructor_day(date) from public, anon;
grant execute on function public.get_student_medical(uuid), public.set_student_medical(uuid, text, text),
  public.sign_health(uuid, jsonb, text, text), public.instructor_day(date) to authenticated;
