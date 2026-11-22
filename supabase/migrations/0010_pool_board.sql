-- Pool display (staff screen): today's lessons with instructor + kid first names only.
-- No health, money, phone or full surnames leave this function.
create or replace function public.pool_board(p_day date)
returns table (starts_at timestamptz, ends_at timestamptz, status text, service_name text,
               instructor_id uuid, instructor_name text, instructor_color text,
               kid_label text, kid_color text)
language sql stable security definer set search_path = '' as $$
  select b.starts_at, b.ends_at, b.status, sv.name,
         p.id, p.full_name, p.color,
         st.first_name || case when st.last_name <> '' then ' ' || left(st.last_name, 1) || '׳' else '' end,
         st.color
  from public.bookings b
  join public.students st on st.id = b.student_id
  join public.services sv on sv.id = b.service_id
  join public.profiles p on p.id = b.instructor_id
  where app.is_staff()
    and b.status in ('approved','completed','no_show')
    and (b.starts_at at time zone 'Asia/Jerusalem')::date = p_day
  order by b.starts_at, p.full_name, st.first_name
$$;
revoke execute on function public.pool_board(date) from public, anon;
grant execute on function public.pool_board(date) to authenticated;
