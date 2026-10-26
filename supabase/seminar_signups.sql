-- Free seminar sign-ups from seminar.html.
--
-- Same pattern as leads: the public site can insert but never read rows back,
-- so sign-ups are only visible via the Supabase dashboard/SQL editor.
create table if not exists seminar_signups (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table seminar_signups enable row level security;

drop policy if exists "anon insert" on seminar_signups;
create policy "anon insert" on seminar_signups for insert to anon with check (true);
-- Deliberately no select/update/delete policy for anon — insert-only.
