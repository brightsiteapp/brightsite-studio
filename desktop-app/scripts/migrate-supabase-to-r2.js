// One-off migration: copy every object from the Supabase 'business-media'
// bucket into Cloudflare R2 'brightsite-media'. Safe to re-run — R2
// PutObject is idempotent (overwrites with identical bytes).
//
// Usage: node scripts/migrate-supabase-to-r2.js
//
// Needs the Supabase anon key (bundled in shared-config) to read storage,
// and the R2 keys (also bundled) to write. No extra env vars required.
'use strict';
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const cfg = require('../lib/shared-config');

const SUPABASE_URL  = process.env.SUPABASE_URL       || cfg.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY  || cfg.SUPABASE_ANON_KEY;
const SB_BUCKET     = 'business-media';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID         || cfg.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID       || cfg.R2_ACCESS_KEY_ID;
const R2_SECRET     = process.env.R2_SECRET_ACCESS_KEY   || cfg.R2_SECRET_ACCESS_KEY;
const R2_BUCKET     = process.env.R2_BUCKET              || cfg.R2_BUCKET;

const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET }
});

function contentTypeFor(key) {
  const ext = key.split('.').pop().toLowerCase();
  return { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext] || 'application/octet-stream';
}

async function listAll(prefix = '') {
  // Supabase Storage list endpoint (paginated, limit 1000 per call)
  const objects = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${SB_BUCKET}`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const item of page) {
      if (item.id) {
        // It's a file
        objects.push(prefix ? `${prefix}/${item.name}` : item.name);
      } else {
        // It's a folder — recurse
        const sub = prefix ? `${prefix}/${item.name}` : item.name;
        objects.push(...await listAll(sub));
      }
    }
    if (page.length < 1000) break;
    offset += 1000;
  }
  return objects;
}

async function migrate() {
  console.log('Listing Supabase Storage objects…');
  const keys = await listAll();
  console.log(`Found ${keys.length} objects`);

  let ok = 0, fail = 0;
  for (const key of keys) {
    try {
      // Download from Supabase
      const dlRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${SB_BUCKET}/${key}`, { headers: sbHeaders });
      if (!dlRes.ok) { console.error(`  SKIP ${key} — download ${dlRes.status}`); fail++; continue; }
      const buffer = Buffer.from(await dlRes.arrayBuffer());

      // Upload to R2
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentTypeFor(key)
      }));

      console.log(`  OK  ${key} (${buffer.length} bytes)`);
      ok++;
    } catch (err) {
      console.error(`  ERR ${key} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} copied, ${fail} failed`);
}

migrate().catch(err => { console.error(err); process.exit(1); });
