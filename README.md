# brightsite-studio

Aesthetic Intelligence — brand websites that fill your diary

Live: https://brightsite.app

Static site — plain HTML/CSS, no build step.

## Google business details

The instant builder can enrich previews with a matching Google Business Profile.
Enable **Places API (New)** in the Google Cloud project, then add this Vercel
environment variable to Preview and Production:

```text
GOOGLE_MAPS_API_KEY=your_server_side_key
```

Keep the key server-side and restrict it to Places API (New). Without the
variable, the builder automatically falls back to its existing demo content.

Facebook enrichment is optional. Add a Meta access token with permission to
read public Page content, plus an optional Graph API version override:

```text
FACEBOOK_ACCESS_TOKEN=your_server_side_token
FACEBOOK_GRAPH_VERSION=v23.0
```

Google remains the source for ratings and reviews. Facebook is used as a
secondary source for business information and recent, high-resolution photos.
Each lookup has its own short browser timeout, so either integration can be
missing or fail without delaying the preview.

Facebook is queried first. Google is only used when Facebook has no confident
match or lacks the core contact/business information needed for a useful site.
Google photos are not requested.

The Google fallback also fails closed behind an atomic Supabase counter: 25
lookups per day and 850 per calendar month. Run
`supabase/google_lookup_quota.sql`, then add `SUPABASE_URL` and
`SUPABASE_ANON_KEY` to Vercel. If the counter or cache is unavailable,
BrightSite skips Google rather than risking an uncounted request. Successful
matches are cached for 29 days.

## Deploying

Pushes to `main` auto-deploy to Vercel:
https://brightsite.app

Manual deploy: `vercel deploy --prod --yes`

## Testing

```bash
npm install
npx playwright install chromium
npm test
```

The smoke test checks the full form flow, document scrolling, carousel timing,
centre-card motion and colour-dot matching on desktop and an iPhone 13 viewport.
