// Cloudflare R2 media storage — replaces Supabase Storage for logos,
// hero images, and gallery photos. Mirrors the same interface as the
// uploadMedia / downloadMedia / deleteMedia / syncMediaForProject
// functions in supabase-sync.js so callers can swap them in.
//
// Config comes from lib/shared-config.js (R2_* keys), overrideable by
// env vars R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET /
// R2_ACCOUNT_ID for local dev.
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const bundled = require('./shared-config');
const storage = require('./site-storage');

function config() {
  return {
    accountId:  process.env.R2_ACCOUNT_ID       || bundled.R2_ACCOUNT_ID       || '',
    accessKeyId:     process.env.R2_ACCESS_KEY_ID    || bundled.R2_ACCESS_KEY_ID    || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || bundled.R2_SECRET_ACCESS_KEY || '',
    bucket:     process.env.R2_BUCKET            || bundled.R2_BUCKET            || '',
    publicUrl:  process.env.R2_PUBLIC_URL        || bundled.R2_PUBLIC_URL        || ''
  };
}

function enabled() {
  const c = config();
  return !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
}

let _client = null;
function client() {
  if (_client) return _client;
  const c = config();
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey }
  });
  return _client;
}

function contentTypeFor(ext) {
  return { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[ext.toLowerCase()] || 'application/octet-stream';
}

// Returns the public URL for a stored object (slug/relPath).
function publicUrl(slug, relPath) {
  const { publicUrl: base } = config();
  return base ? `${base}/${slug}/${relPath}` : null;
}

async function uploadMedia(slug, relPath, buffer) {
  if (!enabled()) return;
  try {
    const { bucket } = config();
    await client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${slug}/${relPath}`,
      Body: buffer,
      ContentType: contentTypeFor(path.extname(relPath))
    }));
  } catch (err) {
    console.error('[r2-media] upload failed, local copy is still saved:', err.message);
  }
}

async function downloadMedia(slug, relPath) {
  if (!enabled()) return null;
  try {
    const { bucket } = config();
    const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: `${slug}/${relPath}` }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err) {
    if (err.name !== 'NoSuchKey') console.error('[r2-media] download failed:', err.message);
    return null;
  }
}

async function deleteMedia(slug, relPath) {
  if (!enabled()) return;
  try {
    const { bucket } = config();
    await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: `${slug}/${relPath}` }));
  } catch (err) {
    if (err.name !== 'NoSuchKey') console.error('[r2-media] delete failed:', err.message);
  }
}

// Download any media files referenced in a project record that aren't
// already on disk — same contract as supabase-sync.syncMediaForProject.
async function syncMediaForProject(projectDir, data) {
  if (!enabled()) return;
  const raw = data.raw || {};
  const paths = [raw.logoImage, raw.heroImage, ...(raw.gallery || [])].filter(Boolean);
  for (const relPath of paths) {
    const localFile = path.join(projectDir, relPath);
    if (fs.existsSync(localFile)) continue;
    const buffer = await downloadMedia(data.slug, relPath);
    if (!buffer) continue;
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, buffer);
  }
}

module.exports = { enabled, uploadMedia, downloadMedia, deleteMedia, syncMediaForProject, publicUrl };
