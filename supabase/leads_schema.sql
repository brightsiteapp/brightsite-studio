-- Lead capture table for the BrightSite marketing site (index.html quick
-- lead form, WhatsApp handoff, and contact.html), in the brightsite-studio-shared
-- project — replaces the old wellnessweb_leads table in the legacy
-- wellnesswebsolutions project, which no longer exists ("wellnessweb" is
-- retired; everything is BrightSite-branded now).
--
-- Write-only from the public site: the anon key can insert but not read
-- back, so leads are only ever visible via the Supabase dashboard/SQL
-- editor (a real login), not to anyone holding the public anon key.
create table if not exists leads (
  id bigint generated always as identity primary key,
  business_name text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table leads enable row level security;

drop policy if exists "anon insert" on leads;
create policy "anon insert" on leads for insert to anon with check (true);
-- Deliberately no select/update/delete policy for anon — insert-only.
