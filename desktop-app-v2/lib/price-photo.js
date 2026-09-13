// Reads a photo of a price list (a board, a menu, a leaflet) into Studio
// V2's price list, through the user's own local Claude Code CLI — the same
// way V1's AI edits work (lib/ai-edit.js): their subscription, no API key,
// one focused call. Claude may only use its Read tool, run inside the
// business's own folder where the photo was saved.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const PriceList = require('../public/price-list');

const PROMPT = file => 'Read the image file ./' + file + ' in this folder. It is a photo of a business\'s price list, menu or treatment list. '
  + 'Copy every service into JSON, grouped under the headings shown in the photo. Copy wording and prices exactly as written, '
  + 'including the currency symbol and words like "from". Never invent or estimate anything: use "" for a price or time that '
  + 'isn\'t shown. Times are durations such as "30 mins". If there are no headings, use one section with title "". '
  + 'Reply with ONLY this JSON, no prose and no markdown fences: '
  + '{"sections":[{"title":"","items":[{"service":"","price":"","time":""}]}]}';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' };

// Saves the photo in the business's folder (kept, so it can be checked
// against later) and returns its file name.
function savePhoto(dir, buffer, type) {
  const ext = EXT[type];
  if (!ext) throw new Error('That file isn’t a photo Studio can read (use JPG, PNG or WebP).');
  if (!buffer?.length) throw new Error('The photo was empty.');
  fs.mkdirSync(dir, { recursive: true });
  const file = `price-photo-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return file;
}

function readPhoto(dir, file, { spawnEnv, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', PROMPT(file), '--output-format', 'text', '--allowedTools', 'Read'], {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: spawnEnv ? spawnEnv() : process.env
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Reading the photo took too long. Try a clearer or closer photo.')); }, timeoutMs);
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', () => { clearTimeout(timer); reject(new Error('Claude Code ("claude") isn’t installed on this computer, so photos can’t be read. You can still paste the prices in.')); });
    child.on('close', code => {
      clearTimeout(timer);
      const said = (err.trim() || out.trim()).slice(0, 300);
      if (code !== 0 && /not logged in|\/login|api key/i.test(said)) return reject(new Error('Claude isn’t signed in on this computer — connect it in Settings to read photos. You can still paste the prices in.'));
      if (code !== 0) return reject(new Error(said || `Claude Code stopped (code ${code}).`));
      try {
        resolve(parseReply(out));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function parseReply(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Couldn’t find any prices in that photo.');
  let data;
  try { data = JSON.parse(match[0]); } catch { throw new Error('Couldn’t read the prices from that photo. Try again or paste them in.'); }
  const list = PriceList.clean(data);
  if (!PriceList.counts(list).services) throw new Error('Couldn’t find any prices in that photo.');
  return list;
}

module.exports = { savePhoto, readPhoto, parseReply };
