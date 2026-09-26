-- Recreate admin_get_all_businesses to include created_at.
-- Run once in the Supabase SQL editor.

create or replace function public.admin_get_all_businesses()
returns table (
  id          text,
  name        text,
  user_id     uuid,
  data        jsonb,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, name, user_id, data, created_at, updated_at
  from public.businesses
  order by updated_at desc nulls last;
$$;
