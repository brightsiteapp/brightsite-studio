-- Free seminar sign-ups from seminar.html.
--
-- Same pattern as leads: the public site can insert but never read rows back,
-- so sign-ups are only visible via the Supabase dashboard/SQL editor.
-- Places are capped at 25 by a trigger, so the limit holds even if the page is bypassed.
create table if not exists seminar_signups (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  business_name text,
  website_or_social text,
  business_description text,
  created_at timestamptz not null default now()
);

-- For databases that already have the first version of this table.
alter table seminar_signups add column if not exists business_name text;
alter table seminar_signups add column if not exists website_or_social text;
alter table seminar_signups add column if not exists business_description text;

alter table seminar_signups enable row level security;

drop policy if exists "anon insert" on seminar_signups;
create policy "anon insert" on seminar_signups for insert to anon with check (true);
-- Deliberately no select/update/delete policy for anon — insert-only.

-- Security definer so the count sees every row, not just what anon can read.
create or replace function seminar_places_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from seminar_signups) >= 25 then
    raise exception 'seminar_full';
  end if;
  return new;
end;
$$;

drop trigger if exists seminar_places_check on seminar_signups;
create trigger seminar_places_check
  before insert on seminar_signups
  for each row execute function seminar_places_check();
