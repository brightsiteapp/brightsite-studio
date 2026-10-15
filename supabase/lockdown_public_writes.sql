-- DRAFT — review before running in the Supabase SQL editor.
--
-- Closes the holes left open by business_owners.sql and storage_media_policies.sql:
--   1. The public (anon) key, which ships in every page, can update and delete
--      every row in `businesses` and every file in the `business-media` bucket.
--   2. A logged-in customer can flip billing flags on their own row
--      (planActive, domainRegistered, stripeSubscriptionId) and publish
--      without paying.
--   3. A logged-in customer can post chat messages that appear to come from
--      support (sender = 'admin').
--
-- BEFORE RUNNING: BrightSite Studio (desktop app) currently writes with the
-- anon key. Move it to a signed-in admin account or a server endpoint that
-- uses the service-role key first, or Studio will stop saving. api/send-welcome.js
-- inserts its 'admin' message with the customer's token, so it must switch to
-- the service-role key too (as api/_lib/activate.js already does).

-- 1. No anonymous writes to businesses or media.
drop policy if exists "anon write"  on businesses;
drop policy if exists "anon update" on businesses;
drop policy if exists "anon delete" on businesses;

drop policy if exists "anon upload media" on storage.objects;
drop policy if exists "anon update media" on storage.objects;
drop policy if exists "anon delete media" on storage.objects;

-- 2. Customers can't grant themselves a paid plan.
create or replace function public.protect_billing_fields() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    if (new.data->'planActive')           is distinct from (old.data->'planActive')
    or (new.data->'domainRegistered')     is distinct from (old.data->'domainRegistered')
    or (new.data->'stripeSubscriptionId') is distinct from (old.data->'stripeSubscriptionId') then
      raise exception 'Billing fields can only be changed by BrightSite';
    end if;
    if coalesce((new.data->>'published')::boolean, false)
       and not coalesce((old.data->>'published')::boolean, false)
       and not coalesce((new.data->>'planActive')::boolean, false) then
      raise exception 'An active plan is required to publish';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_billing_fields on businesses;
create trigger protect_billing_fields before update on businesses
  for each row execute function public.protect_billing_fields();

-- 3. Customers can only send messages as themselves.
drop policy if exists "customer messages" on public.messages;
create policy "customer messages read" on public.messages for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = messages.business_id and b.user_id = auth.uid()));
create policy "customer messages send" on public.messages for insert to authenticated
  with check (sender = 'customer'
    and exists (select 1 from public.businesses b where b.id = messages.business_id and b.user_id = auth.uid()));
