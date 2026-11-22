-- Second parent / guardians: an owner parent invites another adult by email to co-manage a kid.
-- Accepted guardians are owner-equivalent (view, book, cancel, health) except inviting/removing guardians.

create table public.guardianships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  invited_email text not null check (invited_email = lower(trim(invited_email)) and invited_email like '%_@_%'),
  user_id uuid references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, invited_email)
);
create index on public.guardianships (user_id) where accepted_at is not null;
create index on public.guardianships (invited_email) where accepted_at is null;

-- caller's auth email (definer: authenticated can't read auth.users)
create or replace function app.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

-- owner parent of the kid
create or replace function app.is_owner_parent(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students where id = p_student and parent_id = auth.uid())
$$;

-- owner parent OR accepted guardian (NOT admin; callers add app.is_admin() where admins are allowed)
create or replace function app.can_manage(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students where id = p_student and parent_id = auth.uid())
      or exists (select 1 from public.guardianships g
                 where g.student_id = p_student and g.user_id = auth.uid() and g.accepted_at is not null)
$$;

revoke execute on function app.my_email(), app.is_owner_parent(uuid), app.can_manage(uuid) from public, anon;
grant execute on function app.my_email(), app.is_owner_parent(uuid), app.can_manage(uuid) to authenticated;

alter table public.guardianships enable row level security;
create policy guardianships_read on public.guardianships for select to authenticated using (
  user_id = auth.uid() or invited_email = app.my_email() or app.can_manage(student_id) or app.is_admin()
);
-- writes only through the RPCs below
revoke insert, update, delete on public.guardianships from authenticated, anon;

-- ---------------------------------------------------------------- RLS: guardians see/update like the owner
drop policy students_parent_read on public.students;
create policy students_parent_read on public.students for select to authenticated
  using (parent_id = auth.uid() or app.can_manage(id) or app.is_admin());
drop policy students_parent_update on public.students;
create policy students_parent_update on public.students for update to authenticated
  using (parent_id = auth.uid() or app.can_manage(id) or app.is_admin())
  with check (app.can_manage(id) or app.is_admin());

drop policy bookings_read on public.bookings;
create policy bookings_read on public.bookings for select to authenticated using (
  app.is_admin() or instructor_id = auth.uid() or app.can_manage(student_id)
);

drop policy credits_read on public.credits;
create policy credits_read on public.credits for select to authenticated using (
  app.is_admin() or app.can_manage(student_id)
);

-- ---------------------------------------------------------------- invitation RPCs
create or replace function public.invite_guardian(p_student uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not (app.is_owner_parent(p_student) or app.is_admin()) then return jsonb_build_object('error','not_found'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('error','bad_email'); end if;
  if v_email = app.my_email() then return jsonb_build_object('error','self_invite'); end if;
  if exists (select 1 from public.students s join public.profiles p on p.id = s.parent_id
             where s.id = p_student and lower(p.email) = v_email) then
    return jsonb_build_object('error','already_guardian');
  end if;
  if (select count(*) from public.guardianships where student_id = p_student) >= 4 then
    return jsonb_build_object('error','too_many_guardians');
  end if;
  insert into public.guardianships (student_id, invited_email, invited_by)
  values (p_student, v_email, auth.uid())
  on conflict (student_id, invited_email) do nothing;
  perform app.audit('guardian.invite', 'student', p_student::text, jsonb_build_object('email', v_email));
  return jsonb_build_object('ok', true);
end $$;

-- owner parent / admin removes anyone; a guardian may remove only themselves (leave)
create or replace function public.remove_guardian(p_guardianship uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.guardianships;
begin
  select * into g from public.guardianships where id = p_guardianship;
  if g.id is null then return jsonb_build_object('error','not_found'); end if;
  if not (app.is_owner_parent(g.student_id) or app.is_admin() or g.user_id = auth.uid()) then
    return jsonb_build_object('error','not_found');
  end if;
  delete from public.guardianships where id = g.id;
  perform app.audit('guardian.remove', 'student', g.student_id::text, jsonb_build_object('email', g.invited_email));
  return jsonb_build_object('ok', true);
end $$;

-- pending invitations addressed to the caller's email (kid first name + inviter name only)
create or replace function public.my_invitations()
returns table (id uuid, student_first_name text, inviter_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, s.first_name, coalesce(nullif(p.full_name, ''), 'הורה'), g.created_at
  from public.guardianships g
  join public.students s on s.id = g.student_id and s.active
  left join public.profiles p on p.id = g.invited_by
  where g.accepted_at is null and g.invited_email = app.my_email()
  order by g.created_at
$$;

create or replace function public.respond_invitation(p_invitation uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.guardianships;
begin
  select * into g from public.guardianships
  where id = p_invitation and accepted_at is null and invited_email = app.my_email()
  for update;
  if g.id is null then return jsonb_build_object('error','not_found'); end if;
  if p_accept then
    update public.guardianships set user_id = auth.uid(), accepted_at = now() where id = g.id;
  else
    delete from public.guardianships where id = g.id;
  end if;
  perform app.audit(case when p_accept then 'guardian.accept' else 'guardian.decline' end, 'student', g.student_id::text, null);
  return jsonb_build_object('ok', true);
end $$;

-- guardians of one kid (for the kid page)
create or replace function public.kid_guardians(p_student uuid)
returns table (id uuid, invited_email text, full_name text, accepted boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.invited_email, coalesce(p.full_name, ''), g.accepted_at is not null, g.user_id = auth.uid()
  from public.guardianships g
  left join public.profiles p on p.id = g.user_id
  where g.student_id = p_student and (app.can_manage(p_student) or app.is_admin())
  order by g.created_at
$$;

-- ---------------------------------------------------------------- business RPCs: owner OR guardian
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

  select * into v_existing from public.bookings where attempt_id = p_attempt;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'booking_id', v_existing.id, 'number', v_existing.number, 'status', v_existing.status, 'replayed', true);
  end if;

  if not exists (select 1 from public.students st where st.id = p_student and st.active
                 and (app.can_manage(st.id) or v_admin)) then
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

create or replace function public.cancel_booking(p_booking uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_admin boolean := app.is_admin();
  v_hours int;
begin
  select bk.* into b from public.bookings bk
  where bk.id = p_booking and (app.can_manage(bk.student_id) or v_admin)
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

revoke execute on function public.invite_guardian(uuid, text), public.remove_guardian(uuid), public.my_invitations(),
  public.respond_invitation(uuid, boolean), public.kid_guardians(uuid) from public, anon;
grant execute on function public.invite_guardian(uuid, text), public.remove_guardian(uuid), public.my_invitations(),
  public.respond_invitation(uuid, boolean), public.kid_guardians(uuid),
  public.request_booking(uuid, uuid, uuid, uuid, timestamptz, text, text), public.cancel_booking(uuid, text) to authenticated;
