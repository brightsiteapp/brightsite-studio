-- Allow admin users (brightsiteapp@gmail.com / tommeofficial1@gmail.com) to
-- read and write all messages. Run once in the Supabase SQL editor.

create policy "admin full access" on public.messages
  for all to authenticated
  using (
    (select email from auth.users where id = auth.uid())
    in ('brightsiteapp@gmail.com', 'tommeofficial1@gmail.com')
  )
  with check (
    (select email from auth.users where id = auth.uid())
    in ('brightsiteapp@gmail.com', 'tommeofficial1@gmail.com')
  );
