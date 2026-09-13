-- Links a Supabase Auth user (the new customer account system in
-- account/login.html + account/dashboard.html) to their row in the
-- existing `businesses` table (see desktop-app/supabase/businesses_schema.sql
-- and desktop-app/lib/supabase-sync.js), and locks logged-in access down to
-- "your own row only" — WITHOUT breaking BrightSite Studio (the desktop
-- app), which has no login and keeps using the bundled anon key with full
-- table access exactly as before.
--
-- Run this once in the Supabase SQL editor, AFTER businesses_schema.sql has
-- already been run. Safe to re-run (uses IF NOT EXISTS / OR REPLACE
-- throughout).
--
-- How this stays backwards-compatible:
-- The original schema's "anon read/write" policies had no `to` clause, so
-- they silently applied to every role, authenticated included. This
-- migration drops those and recreates them scoped `to anon` only, then adds
-- new, separate policies scoped `to authenticated` that check
-- `user_id = auth.uid()`. Postgres OR's together all matching permissive
-- policies for a request, so:
--   - the desktop app's anon-key requests only ever match the `to anon`
--     policies (unrestricted, unchanged behaviour)
--   - a logged-in dashboard user's requests carry role `authenticated` and
--     only ever match the new `to authenticated` policies (own row only)

alter table businesses
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists businesses_user_id_idx on businesses (user_id);

-- ---------------- replace the old unscoped policies ----------------
drop policy if exists "anon read" on businesses;
drop policy if exists "anon write" on businesses;
drop policy if exists "anon update" on businesses;
drop policy if exists "anon delete" on businesses;

-- Same permissions as before, just explicitly scoped to the anon role so
-- they can no longer also match authenticated (logged-in) requests.
create policy "anon read" on businesses for select to anon using (true);
create policy "anon write" on businesses for insert to anon with check (true);
create policy "anon update" on businesses for update to anon using (true);
create policy "anon delete" on businesses for delete to anon using (true);

-- ---------------- new: logged-in users, own row only ----------------
-- A logged-in user can always see their own row...
create policy "owner read" on businesses for select to authenticated
  using (user_id = auth.uid());

-- ...can create a new row for themselves (claiming a slug), as long as
-- they set user_id to their own id...
create policy "owner insert" on businesses for insert to authenticated
  with check (user_id = auth.uid());

-- ...can update only a row they already own, and can't reassign it to
-- someone else while doing so...
create policy "owner update" on businesses for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ...and can delete only their own row.
create policy "owner delete" on businesses for delete to authenticated
  using (user_id = auth.uid());

-- ---------------- after running this ----------------
-- 1. In the Supabase dashboard, Authentication → Providers, make sure
--    "Email" sign-up is enabled (it is by default). Nothing else to
--    configure — account/login.html talks to the standard Auth REST
--    endpoints (/auth/v1/signup, /auth/v1/token?grant_type=password)
--    using the same bundled anon key as the desktop app.
-- 2. Optional: Authentication → Providers → Email → turn OFF "Confirm
--    email" if you want new accounts to be able to log in immediately
--    without clicking a confirmation link first (recommended for a small
--    self-serve client base; leave it on if you'd rather verify emails).
-- 3. No changes needed to desktop-app code or to businesses_schema.sql —
--    this migration only adds a nullable column and swaps policy scoping.
