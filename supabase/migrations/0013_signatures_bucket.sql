-- Private bucket for drawn health-declaration signatures: {student_id}/{timestamp}.png
-- Read: owner parent, accepted guardian, admin. Insert: owner/guardian into their kid's folder. No update/delete (append-only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 262144, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 262144, allowed_mime_types = array['image/png'];

create or replace function app.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.try_uuid(text) to authenticated;

create policy signatures_read on storage.objects for select to authenticated using (
  bucket_id = 'signatures'
  and (app.can_manage(app.try_uuid((storage.foldername(name))[1])) or app.is_admin())
);
create policy signatures_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'signatures'
  and app.can_manage(app.try_uuid((storage.foldername(name))[1]))
  and name ~ '^[0-9a-f-]{36}/[0-9]+\.png$'
);
