-- Messages table: customer ↔ developer chat per business
-- Run once in the Supabase SQL editor.

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  sender      text not null check (sender in ('customer', 'admin')),
  body        text,
  image_url   text,
  created_at  timestamptz not null default now()
);

create index if not exists messages_business_id_created_at
  on public.messages (business_id, created_at);

alter table public.messages enable row level security;

-- Customers (authenticated users) can read and write messages for their own business
create policy "customer messages" on public.messages
  for all to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = messages.business_id
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = messages.business_id
        and b.user_id = auth.uid()
    )
  );

-- Admin/service role has full access (for Studio app and server-side reads)
-- No anon access to messages
