-- Storage policies for the business-media bucket.
-- Run this in the Supabase SQL editor if media uploads fail with
-- 403 / "new row violates row-level security policy" / "Forbidden".
--
-- The original desktop-app schema created open policies for the anon key.
-- Customer dashboard uploads use an authenticated JWT; without matching
-- policies those uploads are denied. This script (re)creates policies for
-- both anon (Studio desktop app) and authenticated (customer dashboard).

-- Ensure the public bucket exists
insert into storage.buckets (id, name, public)
values ('business-media', 'business-media', true)
on conflict (id) do update set public = true;

-- Drop any previous variants so this is safe to re-run
drop policy if exists "anon read media" on storage.objects;
drop policy if exists "anon upload media" on storage.objects;
drop policy if exists "anon update media" on storage.objects;
drop policy if exists "anon delete media" on storage.objects;
drop policy if exists "authenticated read media" on storage.objects;
drop policy if exists "authenticated upload media" on storage.objects;
drop policy if exists "authenticated update media" on storage.objects;
drop policy if exists "authenticated delete media" on storage.objects;
drop policy if exists "public read media" on storage.objects;
drop policy if exists "public upload media" on storage.objects;
drop policy if exists "public update media" on storage.objects;
drop policy if exists "public delete media" on storage.objects;

-- Public read (demo sites + <img> tags use the public object URL)
create policy "public read media" on storage.objects
  for select
  using (bucket_id = 'business-media');

-- Desktop app (anon key) — full read/write on this bucket
create policy "anon upload media" on storage.objects
  for insert to anon
  with check (bucket_id = 'business-media');
create policy "anon update media" on storage.objects
  for update to anon
  using (bucket_id = 'business-media')
  with check (bucket_id = 'business-media');
create policy "anon delete media" on storage.objects
  for delete to anon
  using (bucket_id = 'business-media');

-- Customer dashboard (authenticated JWT) — same bucket access
create policy "authenticated upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-media');
create policy "authenticated update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'business-media')
  with check (bucket_id = 'business-media');
create policy "authenticated delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-media');
