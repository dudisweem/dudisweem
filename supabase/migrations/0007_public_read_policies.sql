-- anon can't execute app.is_admin(); public read policies must not call it.
drop policy services_read on public.services;
create policy services_read on public.services for select to anon, authenticated using (active);
drop policy packages_read on public.packages;
create policy packages_read on public.packages for select to anon, authenticated using (active);
-- admins still see inactive rows through services_admin / packages_admin (FOR ALL)
