-- ---------------------------------------------------------------------
-- 0015_alarm_sound.sql
--
-- New feature requested by user during Fase 16/17 UAT (2026-08-22):
-- when a therapist's active session runs out of time, the session page
-- should sound an alarm (not just show a quiet countdown) so it can't be
-- missed mid-treatment — and the manager should be able to upload their
-- own alarm sound instead of being stuck with a generic beep.
--
-- Design:
--   - outlets.alarm_sound_url: nullable text column. NULL means "use the
--     built-in Web Audio beep" (components/SessionAlarm.tsx's default) —
--     no outlet is forced to pick a sound before this feature works.
--     Already covered by the existing outlets_update_manager /
--     outlets_write_admin RLS policies (0002_rls_policies.sql) — a
--     manager can only ever update their OWN outlet's row, same as every
--     other outlet field. No new table policy needed for the column
--     itself.
--   - storage bucket `alarm-sounds`: first use of Supabase Storage in
--     this codebase (every other "uploaded" image in the app is actually
--     a static file under public/img, generated at dev time — there was
--     no real upload path anywhere before this). Public read (a sound
--     clip isn't sensitive, and it needs to be playable straight from
--     the <audio> tag without a signed URL), write/update/delete
--     restricted to manager (own outlet) or admin/owner (tenant-wide),
--     same authorization shape as outlets_update_manager /
--     outlets_write_admin. Upload path convention is
--     `<outlet_id>/<filename>` — the policies check the first path
--     segment against outlets the caller may manage.
--   - file_size_limit + allowed_mime_types on the bucket itself: a
--     second line of defense beyond client-side validation in
--     components/AlarmSoundSetting.tsx, enforced by Storage regardless
--     of what the browser sends.
-- ---------------------------------------------------------------------

alter table outlets add column if not exists alarm_sound_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alarm-sounds', 'alarm-sounds', true, 2097152, array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-wav'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists alarm_sounds_read on storage.objects;
create policy alarm_sounds_read on storage.objects
  for select to public
  using (bucket_id = 'alarm-sounds');

drop policy if exists alarm_sounds_insert on storage.objects;
create policy alarm_sounds_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'alarm-sounds'
    and (storage.foldername(name))[1] in (
      select id::text from outlets where _is_manager_here(id) or _is_admin_or_owner()
    )
  );

drop policy if exists alarm_sounds_update on storage.objects;
create policy alarm_sounds_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'alarm-sounds'
    and (storage.foldername(name))[1] in (
      select id::text from outlets where _is_manager_here(id) or _is_admin_or_owner()
    )
  );

drop policy if exists alarm_sounds_delete on storage.objects;
create policy alarm_sounds_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'alarm-sounds'
    and (storage.foldername(name))[1] in (
      select id::text from outlets where _is_manager_here(id) or _is_admin_or_owner()
    )
  );

-- Verification (run after applying):
--   select alarm_sound_url from outlets limit 1; -- column exists, NULL
--   select id, public, file_size_limit from storage.buckets where id = 'alarm-sounds'; -- 1 row
--   select policyname from pg_policies where tablename = 'objects' and policyname like 'alarm_sounds_%'; -- 4 rows
