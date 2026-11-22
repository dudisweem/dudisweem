-- Align progress visibility with the guardian model (0011–0013): a parent-side reader must be the
-- owner OR an ACCEPTED guardian (app.can_manage). Pending invitations get nothing.
create or replace function app.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin()
      or app.can_manage(p_student)
      or exists (select 1 from public.bookings b where b.student_id = p_student and b.instructor_id = auth.uid()
                 and b.status in ('approved','completed','no_show'))
$$;
revoke execute on function app.can_view_student(uuid) from public, anon;
grant execute on function app.can_view_student(uuid) to authenticated;
