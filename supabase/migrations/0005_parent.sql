-- Parents may show instructor names (not full profiles) next to their lessons.
create or replace function public.instructor_names()
returns table (id uuid, full_name text, color text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.color from public.profiles p
  where auth.uid() is not null and p.active and p.role in ('admin','instructor')
  order by p.full_name
$$;
revoke execute on function public.instructor_names() from public, anon;
grant execute on function public.instructor_names() to authenticated;
