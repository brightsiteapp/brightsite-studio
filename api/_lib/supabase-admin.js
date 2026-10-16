import { createClient } from '@supabase/supabase-js';

// Service-role client for the live accounts project (vlisyfshmxdsjuybirxe).
export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
