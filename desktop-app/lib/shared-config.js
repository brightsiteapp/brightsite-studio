// One-time setup YOU do before distributing the app — recipients need to
// do nothing. Fill these in after running supabase/businesses_schema.sql
// in your own Supabase project's SQL editor (see desktop-app/README.md,
// "Shared sync setup"). Once filled in and the app is rebuilt/packaged,
// every copy of the app talks to this same project automatically — no
// sign-in, no env vars, no setup screen for the person you send it to.
//
// The anon key here is Supabase's "publishable" key, meant to be shipped
// in client code (same as it already is in the public tracker page this
// app's sync schema was modelled on) — it is not a secret by itself, its
// safety comes entirely from the RLS policies in businesses_schema.sql.
// Deliberately no auth/session logic anywhere in this app: every install
// reads and writes the same shared rows. See the schema file for why
// that's intentional here rather than an oversight.
//
// Env vars (SUPABASE_URL / SUPABASE_ANON_KEY) still override these if
// set, for local development without touching this file.
module.exports = {
  SUPABASE_URL: 'https://vlisyfshmxdsjuybirxe.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB'
};
