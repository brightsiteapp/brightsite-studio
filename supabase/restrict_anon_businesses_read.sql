-- Closes the gap where the anon key could SELECT all businesses rows,
-- including customer-owned ones (user_id IS NOT NULL).
--
-- Desktop-app sync (supabase-sync.js) never sets user_id when pushing —
-- those rows have user_id = NULL and remain visible to the anon key.
-- Customer web-account businesses (user_id = auth.uid()) are now hidden
-- from the anon role; they are only accessible to the authenticated role
-- via the existing "owner read" policy (user_id = auth.uid()).
--
-- Admin reads of customer businesses must go through the service-role
-- API endpoint (/api/admin-businesses.js) instead of direct client-side
-- REST with the anon key.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

drop policy if exists "anon read" on businesses;
create policy "anon read" on businesses
  for select to anon
  using (user_id is null);
