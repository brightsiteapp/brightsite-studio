# BrightSite Studio V2

A second version of BrightSite Studio with a much simpler screen: a four-column
pipeline, a small Tasks list, and one business profile with the website builder
inside it. It sits **next to** V1 (`../desktop-app`), which stays exactly as it
is, so you can use both and compare.

## Run it

```bash
cd desktop-app-v2
npm install      # or: ln -s ../desktop-app/node_modules node_modules
npm start        # opens the V2 window
# or
npm run server   # just the server, then open http://localhost:4174
```

V1 runs on port 4173 and V2 on 4174, so both can be open at once. They read and
write the same businesses in `~/BrightSiteProjects/` and the same Supabase
shared sync, so a change in one shows up in the other.

## How it reuses V1

V2 contains no copy of V1's working parts. It runs them directly:

- **Server**: `server.js` calls V1's `createApp()` with V2's `public/` served
  in front of V1's. Every API (projects, sync, imports, AI search, media, AI
  edits, export, deploys, domains, Stripe, sign-ins, Places, connections) is
  V1's own. V2 adds only `/api/v2/tasks`.
- **Page**: `public/v2.js` reads V1's `index.html` for the settings dialog,
  notifications, plan/payment/domain dialogs and the builder + preview, moves
  them into V2's screens, then runs V1's `app.js` unchanged. V1's `app.js`
  exposes what V2 drives as `window.StudioCore` and fires `studio:projects` /
  `studio:current` events. V1's own page ignores both.
- **Electron shell**: `main.js` uses V1's updater (`lib/app-updater.js`) and
  preload, so the loading screen, update gate and "Restart to update" work
  the same.
- **Generator**: the same `../demo-generator.js` and friends, loaded the
  same way as in V1.

A fix to V1's builder, sync or billing is therefore a fix in V2 too.

## The pipeline

| Column | Who's in it | Next action |
| --- | --- | --- |
| Lead | New businesses, no website yet | Build website |
| Website ready | Built, not sent | Send website / Mark as contacted |
| Follow up (top half) | Contacted 2+ days ago, no reply. Longest waiting first | Follow up |
| Waiting for reply (bottom half) | Contacted, clock still running | — |
| Clients: Active paying (top half) | Paid / pending | Payment OK / Awaiting payment |
| Clients: Payment issue / cancelled (bottom half) | Stripe shows failed or cancelled | Open Stripe |

Each column is worked out from the business's one record (`public/pipeline.js`).
Moving a business only patches that record; nothing is duplicated. V2 writes V1's
own fields too (`pipelineStage`, `paymentStatus`, `followedUpAt`), so a business
moved in V2 shows in the matching place in V1.

Optional fields V2 adds. Older records simply don't have them, and every rule
falls back safely:

- `websiteBuiltAt`: when the website was built (`''` means explicitly not built).
  Without it, a site counts as built if it's live, imported, read from a
  business link (not just found by AI search), or worked on in the builder.
- `lastContactedAt`, `lastContactKind` (`sent` / `follow_up`): the two-day
  clock. Records contacted in V1 fall back to `followedUpAt`, then `updatedAt`.
- `followUpAt`: when a follow-up is due, set by a manual move.
- `tasks`: one-off tasks linked to this business. They sync with the record.

These live inside the record's JSON, which Supabase stores as one `data` blob,
so **no database change is needed**.

Moves happen automatically:

- A lead's link import succeeds → **Website ready**.
- Send (WhatsApp, email or copy link) or "Mark as contacted" → **Waiting for
  reply**, and the clock starts.
- 2 days with no reply → **Follow up**.
- Follow up → back to **Waiting for reply**, and the clock restarts.
- Stripe active → **Active paying**. Failed → **PAYMENT ISSUE**. Cancelled →
  **CANCELLED**. Healthy again → back to Active paying. This uses V1's
  billing refresh.

To move a business by hand, drag its card to another column, or use **Move ▾**
on its profile. Every move has an Undo.

## Tasks

Tasks are for one-off jobs only; the pipeline already covers building, sending
and following up. A task can be linked to a business (it's stored on that
record and shows in the profile) or not (stored on this computer in
`~/BrightSiteProjects/studio-v2-tasks.json`).

## Editing a website

The profile shows the preview large, with only the most useful actions: device
toggle, full screen, **Edit website**, Make live, and a ⋯ menu (copy link,
export, domain, take offline). **Edit website** opens V1's full builder in the
whole window: a compact editor (about 390px) on the left, the preview
(desktop or mobile) using the rest.

The compact editor is V1's own editor, rearranged by `compactEditor()` in
`public/v2.js` every time V1 redraws it: the same fields (same ids and
handlers) in a two-column grid, and Logo / Hero / Gallery as three small
thumbnail cards. Clicking a card opens V1's own media controls for it
underneath (upload, replace, remove, use found, place logo on photo, the
logo suggestion, gallery add/remove). Drag the divider to resize the editor
(remembered on this computer, arrow keys work too); its small ‹ button hides
the editor so the site gets the whole window.

## Prices & services

Each business has a price list: sections (e.g. Hair, Nails) of services,
each with a price and a time. It's stored on the business record as
`priceList` (`{ sections: [{ title, items: [{ service, price, time }] }] }`),
so it syncs like tasks, with no database change. The profile's **Prices**
panel shows the start of it; **Edit** there, or **Prices & services** in the
editor, opens the full table: add sections and services, move them with the
arrows (or drag a section by its ⋮⋮ grip), and every change saves by itself.

- **Paste a list** (or paste several lines into any box): text from a
  website, Facebook, a PDF or a spreadsheet is sorted into sections,
  services, prices and times without AI (`public/price-list.js`, tested in
  `tests/price-list.test.js`). Bulk changes can be undone.
- **Read a photo**: a photo of their price board or menu is read by the
  local Claude Code CLI, like V1's AI edits (`lib/price-photo.js`), added to
  the list and saved. The photo is kept in the business's folder.

The list isn't on the generated website yet; that needs a change to the
shared generator (V1 uses it too).

**Settings** is a page in the sidebar. It's V1's own settings panel, shown in
the window instead of as a pop-up.

## Releasing

Bump `version` in `package.json`, then:

```bash
GH_TOKEN=$(gh auth token) npm run release
```

This builds the Mac app for both Intel and Apple Silicon (DMG + zip, one
`latest-mac.yml` listing both) and the Windows installer, and publishes them
as a release on `brightsiteapp/brightsite-studio-v2`. Installed copies
pick it up by themselves. Download page for the newest version:
https://github.com/brightsiteapp/brightsite-studio-v2/releases/latest

## Things that are separate from V1

- **Google/Facebook sign-in**: the sign-in browser lives in each app's own
  data folder, so sign in once in V2's Settings.
- **Updates**: V2 checks GitHub releases on `brightsiteapp/brightsite-studio-v2`
  (`package.json` → `build.publish`). It doesn't use V1's repo: V1 updates from the
  latest release there, and a V2 release in that repo would be offered to every
  V1 install. Until that repo has a release, V2 simply reports "up to date".
- **Notifications**: the bell's history is per app.

## Tests

```bash
npm test
```

`tests/pipeline.test.js` covers the column rules, the two-day clock, manual
moves, Stripe states and card wording. `tests/server.test.js` checks that V2
serves its page on top of V1, that the tasks API works, and that V1 on its own
is unchanged.
