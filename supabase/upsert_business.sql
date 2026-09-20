-- upsert_business: lets an authenticated customer claim or update their business row.
--
-- The businesses table has two RLS layers:
--   - anon key (desktop app): full access via the "anon *" policies
--   - authenticated users (dashboard): own-row-only via the "owner *" policies
--
-- The problem: when a customer first signs up, their business row was created by
-- the desktop app (anon key) and has user_id = null. The RLS "owner update" policy
-- requires user_id = auth.uid(), so an authenticated user can't update an unclaimed
-- row even though it belongs to them. This function runs with SECURITY DEFINER
-- (elevated privileges, bypassing RLS) so it can safely "claim" unclaimed rows
-- AND update rows the user already owns, while blocking writes to rows owned by
-- someone else.
--
-- Run this once in the Supabase SQL editor. Safe to re-run (uses OR REPLACE).

create or replace function upsert_business(
  p_id         text,
  p_name       text,
  p_user_id    uuid,
  p_data       jsonb,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_user_id uuid;
  result_row       businesses;
begin
  -- Check who currently owns this slug (null = unclaimed).
  select user_id into existing_user_id from businesses where id = p_id;

  -- Block if a different user already owns the row.
  if found and existing_user_id is not null and existing_user_id != p_user_id then
    raise exception 'Permission denied: this business belongs to another account'
      using errcode = 'P0001';
  end if;

  -- Upsert: insert or update. When claiming an unclaimed row keep the
  -- existing user_id if it's already set (COALESCE), so two near-simultaneous
  -- claims don't overwrite each other after the check above.
  insert into businesses (id, name, user_id, data, updated_at)
    values (p_id, p_name, p_user_id, p_data, p_updated_at)
  on conflict (id) do update
    set name       = excluded.name,
        user_id    = coalesce(businesses.user_id, excluded.user_id),
        data       = excluded.data,
        updated_at = excluded.updated_at
  returning * into result_row;

  return to_jsonb(result_row);
end;
$$;

-- Grant call rights to both roles the dashboard uses.
grant execute on function upsert_business(text, text, uuid, jsonb, timestamptz)
  to authenticated, anon;
