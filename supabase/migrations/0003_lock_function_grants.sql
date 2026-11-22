-- Postgres grants EXECUTE to PUBLIC by default; restrict business RPCs to signed-in users.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.get_available_slots(uuid, date, uuid), public.request_booking(uuid, uuid, uuid, uuid, timestamptz, text, text),
  public.cancel_booking(uuid, text), public.set_booking_status(uuid, text, text, text), public.set_booking_paid(uuid, boolean),
  public.sign_health(uuid, jsonb, text), public.admin_set_role(uuid, text), public.admin_set_active(uuid, boolean),
  public.admin_update_profile(uuid, text, text, text), public.instructor_day(date) to authenticated;
grant execute on function app.my_role(), app.is_admin(), app.is_staff(), app.health_valid(uuid, timestamptz) to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
