import { createClient } from '@supabase/supabase-js';

// Service-role client for the live accounts project. ACCOUNTS_SERVICE_ROLE_KEY belongs to that
// project; the older SUPABASE_SERVICE_ROLE_KEY was saved for a project that no longer exists.
export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.ACCOUNTS_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}
