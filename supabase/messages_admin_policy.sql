-- Allow admin users to read and write all messages.
-- Uses auth.jwt() to avoid querying auth.users (which causes permission denied).
-- Run once in the Supabase SQL editor.

drop policy if exists "admin full access" on public.messages;

create policy "admin full access" on public.messages
  for all to authenticated
  using (
    (auth.jwt() ->> 'email') in ('brightsiteapp@gmail.com', 'tommeofficial1@gmail.com')
  )
  with check (
    (auth.jwt() ->> 'email') in ('brightsiteapp@gmail.com', 'tommeofficial1@gmail.com')
  );
