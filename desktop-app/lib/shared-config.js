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
  SUPABASE_ANON_KEY: 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB',

  // Cloudflare R2 — media storage (logos, hero images, gallery photos)
  R2_ACCOUNT_ID: 'e6f9e4f6b64e79fce6486a6abb93955c',
  R2_ACCESS_KEY_ID: 'aeb6f6a485af4c92c2fe2c2214dceee8',
  R2_SECRET_ACCESS_KEY: 'fec2fdd60e615d92149c7433e7b4ef065f20ce0b8e7c6f8e7bb0abc43258496f',
  R2_BUCKET: 'brightsite-media',
  R2_PUBLIC_URL: 'https://pub-38c2019362f64b6780e0b217ba84be8c.r2.dev'
};
