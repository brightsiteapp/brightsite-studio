-- The app and /api/send-welcome now send the welcome message, so this older
-- trigger (from brightsite-app/supabase/messaging_notifications.sql) doubles it up.
drop trigger if exists on_business_created on public.businesses;
drop function if exists public.send_welcome_message();

-- Optional: remove the duplicate welcomes it already inserted.
delete from public.messages
where sender = 'admin'
  and body like 'Welcome to BrightSite! 👋 Your designer is Tom.%';
