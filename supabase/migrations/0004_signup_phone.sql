-- Store phone from sign-up metadata on the profile.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner text;
begin
  select value into v_owner from app.config where key = 'owner_email';
  insert into public.profiles (id, email, full_name, phone, role, is_owner)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 120),
    left(coalesce(new.raw_user_meta_data->>'phone', ''), 30),
    case when lower(new.email) = lower(v_owner) then 'admin' else 'parent' end,
    lower(new.email) = lower(v_owner)
  );
  return new;
end $$;
