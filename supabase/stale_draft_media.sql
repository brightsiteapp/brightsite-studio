-- Daily clean-up of photos from signups never sent to the designer.
-- Called by the brightsite-upload worker's cron with a shared key; returns the slugs whose
-- photo links it cleared so the worker can delete the files from R2.
-- Replace CLEANUP_KEY_HERE with the value stored in the worker's CLEANUP_KEY secret.

create table if not exists public.private_settings (key text primary key, value text not null);
alter table public.private_settings enable row level security;
revoke all on public.private_settings from anon, authenticated;
insert into public.private_settings (key, value) values ('cleanup_key', 'CLEANUP_KEY_HERE')
  on conflict (key) do update set value = excluded.value;

create or replace function public.stale_draft_media(p_key text)
returns setof text language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key is distinct from (select value from private_settings where key = 'cleanup_key') then
    raise exception 'forbidden';
  end if;
  return query
  update businesses b
     set data = jsonb_set(b.data, '{raw}', ((b.data->'raw') - 'logoImage' - 'heroImage') || jsonb_build_object('gallery', '[]'::jsonb))
   where b.data->'raw'->>'draft' = 'true'
     and b.updated_at < now() - interval '30 days'
     and (b.data->'raw' ? 'logoImage' or b.data->'raw' ? 'heroImage' or jsonb_array_length(coalesce(b.data->'raw'->'gallery', '[]'::jsonb)) > 0)
  returning b.id;
end $$;

revoke all on function public.stale_draft_media(text) from public;
grant execute on function public.stale_draft_media(text) to anon;
