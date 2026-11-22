-- Admin can permanently delete a user. Removes the auth account; profile, kids,
-- their lessons and punch cards cascade. Staff with lessons must be suspended instead.
alter table public.bookings drop constraint bookings_created_by_fkey,
  add constraint bookings_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.credits drop constraint credits_created_by_fkey,
  add constraint credits_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

create or replace function public.admin_delete_user(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target public.profiles;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  if p_user = auth.uid() then return jsonb_build_object('error','cannot_delete_self'); end if;
  select * into v_target from public.profiles where id = p_user for update;
  if v_target.id is null then return jsonb_build_object('error','not_found'); end if;
  if v_target.is_owner then return jsonb_build_object('error','owner_locked'); end if;
  if exists (select 1 from public.bookings where instructor_id = p_user) then
    return jsonb_build_object('error','has_lessons');
  end if;
  perform app.audit('user.delete', 'profile', p_user::text,
    jsonb_build_object('email', v_target.email, 'name', v_target.full_name, 'role', v_target.role,
      'kids', (select count(*) from public.students where parent_id = p_user)));
  delete from auth.users where id = p_user;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
