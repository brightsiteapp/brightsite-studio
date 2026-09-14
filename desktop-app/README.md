# BrightSite Studio (desktop)

A personal macOS app: paste a business's Facebook Page and/or Google Maps
link and it builds a full demo website, ready to send. Uses the same
deterministic, no-AI generator that powers brightsite.app
(`../demo-generator.js`, `../template-designs.js`, `../fresh-templates.js`,
`../hero-brand-compositor.js`) — this app is a thin shell around it, plus
project storage, media upload, a real link-reading import, and optional
natural-language editing via your local Claude Code sign-in.

## Run it

```bash
cd desktop-app
npm install
npm start        # opens the Electron window
# or
npm run server   # just the local server, open http://localhost:4173 in any browser
```

Every business is saved to `~/BrightSiteProjects/<slug>/data.json`.

## The one page

- **Paste a link, get a website**: paste a Facebook Page link and/or a
  Google Maps link, hit **Build website**, and it creates a new site
  pre-filled with whatever it found.
- The import reads the page the same way pasting a link into a Claude
  conversation would — through your local **Claude Code CLI** (your own
  subscription, no API key), which fetches the page and extracts
  name/category/location/phone/address/about/hours/photos itself, far
  better than a raw regex scraper. If Claude Code isn't installed or
  signed in, it falls back to a plain no-API HTTP fetch + Open Graph/
  JSON-LD parse instead (see `lib/scrape.js`) — works either way, the
  Claude path is just much more capable.
- Nothing found is ever silently invented: missing fields are flagged
  (the ✨ "AI" badge) so you know what to check before sending.
- Edit fields, upload logo/hero/gallery images (or "Use found" on a photo
  the import turned up), pick a template — the live preview re-renders
  instantly, fully deterministic, no AI calls for any of this.
- **Composite logo onto hero photo** — once a logo is uploaded, one button
  runs `HeroBrandCompositor` to place it into the hero scene.
- **Edit with AI** — a plain-English instruction box for copy tweaks
  ("make the about section warmer"), also via local Claude Code, scoped to
  just that site, told never to invent facts. Undo restores the exact
  prior values.
- **Export folder** writes a sendable static site to
  `~/BrightSiteProjects/<slug>/export/`.
- **Copy browser link** at the top copies `http://localhost:4173` so a
  colleague on the same network can open the same app in their own
  browser — same server, same data.

## Shared sync setup (do this once, before distributing the app)

Everything works purely on local files until you set this up — it's what
lets you send the packaged app to a colleague/college and have everyone
see the same businesses and each other's edits automatically, with **no
sign-in, no setup screen, and no environment variables for them to set**.

**You do this once, before building the app you hand out:**

1. Open your Supabase project's SQL editor and run
   `desktop-app/supabase/businesses_schema.sql`. It creates the
   `businesses` table and a `business-media` storage bucket for logos/
   hero photos/gallery images, with policies that deliberately allow the
   app's bundled key to read and write everything — no per-user login.
   Read the comment block at the top of that file: this means anyone with
   a copy of the app (or the key) can see and change everyone's projects.
   That's the intended tradeoff for a zero-setup shared team tool — don't
   reuse this setup for anything that needs real access control.
2. In your Supabase dashboard, go to **Project Settings → API** and copy
   the **Project URL** and the **anon / publishable key**.
3. Paste them into `desktop-app/lib/shared-config.js`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
4. `npm run build` and distribute the packaged app as usual (see below).

That's it — every copy of the app you hand out after this talks to the
same shared project automatically. Recipients open the app and it just
works: existing shared projects appear immediately, and anything they
create or edit syncs back for everyone else.

**How it behaves day to day:**
- A small indicator near the gear icon shows **Synced** / **Syncing…** /
  **Offline — changes will sync later**. It only appears once sync is
  configured — with an empty `shared-config.js` (and no `SUPABASE_URL`/
  `SUPABASE_ANON_KEY` env vars) the app is local-only and the indicator
  stays hidden, exactly as before this feature existed.
- Local files in `~/BrightSiteProjects/` are always the source of truth
  and always work offline. Every edit saves locally first regardless of
  whether the sync push succeeds.
- If a push fails (no internet, project unreachable), the app remembers
  and retries automatically the next time it successfully reaches
  Supabase — on the next launch, or as soon as the connection comes back
  (checked whenever the project list loads).
- Each project carries an `updated_at` timestamp. Pulling a shared record
  only overwrites the local copy if the shared one is newer, and pushing
  a local edit first checks the shared copy isn't already newer (e.g. a
  laptop that's been closed for a week) — the older side never clobbers
  the newer one; the older one just gets the newer version pulled down
  instead.
- Uploaded logos/hero photos/gallery images sync the same way: uploading
  on one machine pushes the file to the shared Storage bucket, and
  opening/refreshing the project list on another machine downloads
  anything it's missing.

Env vars `SUPABASE_URL` / `SUPABASE_ANON_KEY` still override
`shared-config.js` if set, useful for testing against a different project
without editing that file.

## Accounts tab (customer logins from account/login.html)

Studio's **Accounts** tab lists everyone who has signed up at
`account/login.html` (Supabase Auth) and the business each has designed via
`account/dashboard.html` (their row in `businesses`, matched by
`user_id` — see `supabase/business_owners.sql`).

Reading the list of signed-up users needs Supabase's **service role**
key — the anon key can't see `auth.users`. Set it as an env var before
starting the app:

```
export SUPABASE_SERVICE_ROLE_KEY=... # Supabase dashboard → Settings → API
```

Deliberately **not** added to `shared-config.js`: unlike the anon key, the
service role key bypasses Row Level Security entirely, so bundling it into
the packaged app would give every install (and anyone who decompiles it)
full admin access to every customer's data. Set it only on the machine(s)
running Studio for admin use — without it, the Accounts tab just shows
"not connected yet" and the rest of the app works exactly as before.

## Publishing app updates

Installed copies check GitHub Releases on
[`brightsiteapp/brightsite-studio`](https://github.com/brightsiteapp/brightsite-studio/releases)
a few seconds after launch (and every few hours), download any newer
version quietly in the background, then show a small **New version ready ·
Restart to update** notice in the top bar. Nothing installs until someone
clicks that button. This is separate from the Supabase business sync, and
it never touches `~/BrightSiteProjects/`, which lives outside the app
install, so projects are kept across updates.

To ship an update:

1. Bump `"version"` in `desktop-app/package.json` (e.g. `0.1.0` → `0.2.0`).
   Installed apps only update to a **higher** version.
2. Build: `npm run build` (Mac) and/or `npm run build:win` (Windows).
3. On GitHub, **Releases → Draft a new release**, tag it `v0.2.0`, and
   attach the files from `desktop-app/dist/`:
   - Mac: `BrightSite-Studio-<version>-arm64.dmg`, `…-arm64.zip`, their
     `.blockmap` files, and **`latest-mac.yml`**
   - Windows: `BrightSite-Studio-Setup-<version>.exe`, its `.blockmap`,
     and **`latest.yml`**

   The `latest*.yml` files are what the apps look for, so don't skip them.
   Publish it as a normal release (not a draft or pre-release).
4. That's it. Installed apps find it on their next launch and offer the
   update automatically.

Optional shortcut: `GH_TOKEN=<token> npx electron-builder --mac --win
--publish always` builds and uploads a draft release for you (then press
Publish on GitHub). Use a token from your own shell. Never commit one.

Notes:
- The repo is public, so installed apps read releases without any
  credentials. If it's ever made private, don't embed a token in the app;
  publish releases to a separate public repo instead (change `owner`/
  `repo` under `build.publish` in `package.json`).
- **macOS:** automatic install on other Macs needs the app **signed with an
  Apple Developer ID certificate and notarised**. Unsigned builds still
  launch, but the update step fails, and Gatekeeper warns on first open.
  With the certificate in your Keychain, set `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` in your shell before
  `npm run build` and electron-builder signs and notarises automatically.
  Until then, Mac users update by downloading the new `.dmg` from the
  release. The build is Apple-silicon (`arm64`) only.
- **Windows:** updates work unsigned, but SmartScreen may warn on the first
  install. A code-signing certificate removes that.
- Copies installed before auto-update existed (anything built before this
  section was added) need one manual reinstall from a release. After that
  they update themselves.
- Offline, no release yet, or GitHub down: the app just carries on, and
  nothing is shown to the user. Details are logged to
  `~/Library/Logs/brightsite-studio/updates.log` (Mac) or
  `%APPDATA%\brightsite-studio\logs\updates.log` (Windows). `npm start`
  never checks for updates.

## Known gaps

- Facebook/Google scraping fallback (when Claude Code isn't available) is
  genuinely unreliable — Facebook actively blocks a lot of plain
  server-side requests. The Claude Code path is the real fix for this.
- This was built and tested in a sandboxed dev environment without a full
  interactive display; do a quick real end-to-end pass yourself the first
  time — a real link, real media, a real export — before sending anything
  to a client.
