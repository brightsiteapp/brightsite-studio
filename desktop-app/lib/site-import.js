// Imports an existing website exactly as it is — no Studio templates.
// Every page on the same site that the home page links to (and the pages
// those link to, up to a limit) is downloaded along with the CSS, scripts,
// images and fonts they use, into the project's site/ folder. Links between
// those files become relative paths, so the copy works both in the preview
// (served from /projects/<slug>/site/) and once published at the root of
// its own domain. Anything on another host (CDNs, Google Fonts, Framer's or
// WordPress.com's asset servers) is left pointing where it was and keeps
// loading from there; anything on the same site that couldn't be copied
// (a failed download, past the page limit, a form's endpoint) is pointed
// back at the original so it still works.
//
// HTML and CSS are handled as latin1 text so every byte round-trips
// unchanged whatever encoding the site uses — only the ASCII structure
// (tags, attributes, url()) is ever touched.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const LIMITS = {
  pages: 60,
  files: 800,
  fileBytes: 25 * 1024 * 1024,
  totalBytes: 200 * 1024 * 1024,
  timeoutMs: 20000,
  concurrency: 6
};

const PAGE_EXT = /\.(html?|php|aspx?|jsp)$/i;
const HAS_EXT = /\.[a-z0-9]{1,5}$/i;
const SKIP_REF = /^(#|data:|mailto:|tel:|sms:|javascript:|blob:|about:|\{\{|\$\{)/i;
const BASE_HREF = /<base\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
// A comment, a whole <script>/<style> block (attributes rewritten, script
// body left alone), or any other opening tag.
const TAG_RE = /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTR_RE = /([^\s=\/>"']+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const CSS_REF = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;
// A quoted path inside a script that looks like a file ("img/work/a.webp").
const SCRIPT_FILE = /["'`]((?:\.{0,2}\/)?[\w\-.\/@%]+\.(?:png|jpe?g|webp|gif|svg|avif|ico|mp4|webm|mp3|woff2?|ttf|otf|css)(?:\?[^"'`\s<>]*)?)["'`]/gi;
const INLINE_SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
// <link rel=…> values that name another page or host, not a file to copy.
const NOT_A_FILE_LINK = /\b(canonical|alternate|preconnect|dns-prefetch|shortlink|pingback|me|author|next|prev)\b/;

const decode = s => s
  .replace(/&amp;|&#0*38;|&#x0*26;/gi, '&')
  .replace(/&quot;|&#0*34;/gi, '"')
  .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'");
const encode = (s, quote) => s
  .replace(/&/g, '&amp;')
  .replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&#39;' : '&quot;');
const bareHost = host => host.toLowerCase().replace(/^www\./, '');

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
}

async function fetchResource(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-GB,en;q=0.9' },
    signal: AbortSignal.timeout(LIMITS.timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') || 0) > LIMITS.fileBytes) {
    res.body?.cancel().catch(() => {});
    throw new Error('file too large');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > LIMITS.fileBytes) throw new Error('file too large');
  return { buf, url: res.url || url, type: (res.headers.get('content-type') || '').toLowerCase() };
}

function cleanSegments(pathname) {
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* keep it encoded */ }
  return p.split('/')
    .filter(s => s && s !== '.' && s !== '..')
    .map(s => s.replace(/[<>:"\\|?*\x00-\x1f]/g, '_'));
}

// "/" → index.html, "/pricing" or "/pricing/" → pricing/index.html (so the
// link can stay a clean "pricing/"), "/blog/post.html" → blog/post.html.
function pagePathFor(url) {
  const segs = cleanSegments(new URL(url).pathname);
  if (!segs.length) return 'index.html';
  const last = segs[segs.length - 1];
  if (PAGE_EXT.test(last)) {
    segs[segs.length - 1] = last.replace(PAGE_EXT, '.html');
    return segs.join('/');
  }
  return [...segs, 'index.html'].join('/');
}

// Files keep their path; "?v=3" cache-busters are dropped, but an
// extensionless file whose query IS the content (an image resizer's
// "?url=…&w=640") gets a short hash so each version is kept.
function assetPathFor(url) {
  const u = new URL(url);
  const segs = cleanSegments(u.pathname);
  if (!segs.length || u.pathname.endsWith('/')) segs.push('index');
  const last = segs[segs.length - 1];
  if (u.search && !HAS_EXT.test(last)) {
    segs[segs.length - 1] = `${last}-${crypto.createHash('md5').update(u.search).digest('hex').slice(0, 8)}`;
  }
  return segs.join('/');
}

function relativeRef(fromFile, toFile, isPage) {
  let rel = path.posix.relative(path.posix.dirname(fromFile), toFile);
  if (isPage) rel = rel.replace(/(^|\/)index\.html$/, '$1');
  return rel || './';
}

function looksLikePage(href) {
  const last = new URL(href).pathname.split('/').pop();
  return !last || !HAS_EXT.test(last) || PAGE_EXT.test(last);
}

function pageKey(href) {
  const u = new URL(href);
  const p = u.pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '');
  return bareHost(u.hostname) + (p || '/');
}

function assetKey(href) {
  const u = new URL(href);
  const last = u.pathname.split('/').pop();
  return bareHost(u.hostname) + u.pathname + (HAS_EXT.test(last) ? '' : u.search);
}

// srcset tokenised the way browsers do it, so commas inside a URL
// (image CDNs love them) aren't mistaken for separators.
function mapSrcset(value, map) {
  const out = [];
  let changed = false;
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++;
    if (i >= value.length) break;
    let j = i;
    while (j < value.length && !/\s/.test(value[j])) j++;
    let url = value.slice(i, j);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      let k = j;
      while (k < value.length && value[k] !== ',') k++;
      descriptor = value.slice(j, k).trim();
      j = k + 1;
    }
    i = j;
    const next = map(url);
    if (next != null && next !== url) changed = true;
    out.push((next ?? url) + (descriptor ? ` ${descriptor}` : ''));
  }
  return changed ? out.join(', ') : value;
}

function mapCss(css, map) {
  return css.replace(CSS_REF, (whole, dq, sq, bare, importDq, importSq) => {
    const isImport = importDq !== undefined || importSq !== undefined;
    const value = (dq ?? sq ?? bare ?? importDq ?? importSq ?? '').trim();
    const next = map(value);
    if (next == null || next === value) return whole;
    if (isImport) return `@import "${next}"`;
    return /^[^\s'"()]+$/.test(next) ? `url(${next})` : `url(${JSON.stringify(next)})`;
  });
}

// map(value, kind) returns a replacement, or null to leave it alone.
// kind: 'nav' (a link to another page), 'frame' (an iframe's page),
// 'endpoint' (a form's target) or 'asset' (a file the page uses).
function mapAttrs(tag, attrs, map) {
  const t = tag.toLowerCase();
  const rel = (/(?:^|\s)rel\s*=\s*["']?([^"'>]*)/i.exec(attrs)?.[1] || '').toLowerCase();
  return attrs.replace(ATTR_RE, (whole, name, assignment, dq, sq, bare) => {
    if (assignment === undefined) return whole;
    const value = decode(dq ?? sq ?? bare ?? '');
    const n = name.toLowerCase();
    let next = null;
    if (n === 'style') next = mapCss(value, v => map(v, 'asset'));
    else if (n === 'srcset' || n === 'imagesrcset' || n === 'data-srcset') next = mapSrcset(value, v => map(v, 'asset'));
    else if (n === 'href' && (t === 'a' || t === 'area')) next = map(value, 'nav');
    else if (n === 'href' && t === 'link') next = NOT_A_FILE_LINK.test(rel) ? null : map(value, 'asset');
    else if ((n === 'href' || n === 'xlink:href') && (t === 'use' || t === 'image')) next = map(value, 'asset');
    else if (n === 'action' && t === 'form') next = map(value, 'endpoint');
    else if (n === 'src') next = map(value, t === 'iframe' || t === 'frame' ? 'frame' : 'asset');
    else if (['poster', 'data-src', 'data-lazy-src', 'data-bg', 'data-background'].includes(n)) next = map(value, 'asset');
    if (next == null || next === value) return whole;
    const quote = sq !== undefined ? "'" : '"';
    return `${name}=${quote}${encode(next, quote)}${quote}`;
  });
}

function mapHtml(html, map, { dropBase = false } = {}) {
  return html.replace(TAG_RE, (whole, blockTag, blockAttrs, body, tag, attrs) => {
    if (blockTag) {
      const inner = blockTag.toLowerCase() === 'style' ? mapCss(body, v => map(v, 'asset')) : body;
      return `<${blockTag}${mapAttrs(blockTag, blockAttrs || '', map)}>${inner}</${blockTag}>`;
    }
    if (!tag) return whole; // comment
    if (dropBase && tag.toLowerCase() === 'base') return '';
    return `<${tag}${mapAttrs(tag, attrs || '', map)}>`;
  });
}

function htmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full));
    else if (/\.html?$/i.test(entry.name)) found.push(full);
  }
  return found;
}

// The site's own name for itself if it declares one, else its domain
// ("brightsite.app" → "Brightsite"). Never fails — a site that blocks
// the request still gets a name.
async function siteName(url) {
  const fromHost = () => {
    const label = bareHost(new URL(url).hostname).split('.')[0] || 'Website';
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  try {
    const html = (await fetchResource(url)).buf.toString('utf8');
    const m = /<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)/i.exec(html)
      || /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name/i.exec(html);
    return m ? decode(m[1]).trim() : fromHost();
  } catch {
    return fromHost();
  }
}

async function importSite(startUrl, destDir) {
  const start = normalizeUrl(startUrl);
  if (!start) throw new Error('that doesn’t look like a website link');
  const first = await fetchResource(start);
  if (!/html/.test(first.type)) throw new Error('that link isn’t a web page');
  const home = new URL(first.url);
  const host = bareHost(home.hostname);
  const sameSite = u => (u.protocol === 'http:' || u.protocol === 'https:') && bareHost(u.hostname) === host;
  const resolve = (value, base) => {
    const v = String(value || '').trim();
    if (!v || SKIP_REF.test(v)) return null;
    try { return new URL(v, base); } catch { return null; }
  };
  const baseOf = (html, url) => {
    const m = BASE_HREF.exec(html);
    return (m && resolve(decode(m[1] ?? m[2] ?? m[3]), url)?.href) || url;
  };

  const pages = [];               // { url, html, file }
  const pageFiles = new Map();    // pageKey → file (redirects share one)
  const seenPages = new Set();
  const pageQueue = [];
  const assets = new Map();       // assetKey → { url, buf, type, css, file, failed, done }
  const usedFiles = new Set();
  let skipped = 0;

  // macOS and Windows folders ignore case, so two files differing only in
  // case would overwrite each other — number the second one instead.
  const claim = file => {
    let candidate = file;
    for (let n = 2; usedFiles.has(candidate.toLowerCase()); n++) {
      candidate = /(^|\/)index\.html$/.test(file)
        ? file.replace(/index\.html$/, `index-${n}.html`)
        : file.replace(/(\.[^./]+)?$/, `-${n}$1`);
    }
    usedFiles.add(candidate.toLowerCase());
    return candidate;
  };
  const queuePage = u => {
    const key = pageKey(u.href);
    if (seenPages.has(key) || seenPages.size >= LIMITS.pages) return;
    seenPages.add(key);
    pageQueue.push(u.href);
  };
  const queueAsset = u => {
    const key = assetKey(u.href);
    if (!assets.has(key) && assets.size < LIMITS.files) assets.set(key, { url: u.href });
  };
  // Pages that build parts of themselves in JavaScript (a gallery from a
  // list of image paths) only name those files inside their scripts, so
  // quoted paths that look like files are fetched too. They resolve
  // against the page, as the browser would; guesses that don't exist
  // are dropped quietly.
  const scanScript = code => {
    for (const m of code.matchAll(SCRIPT_FILE)) {
      const u = resolve(m[1], home.href);
      if (!u || !sameSite(u)) continue;
      u.hash = '';
      const key = assetKey(u.href);
      if (!assets.has(key) && assets.size < LIMITS.files) assets.set(key, { url: u.href, guessed: true });
    }
  };
  const collect = (html, url) => {
    const base = baseOf(html, url);
    mapHtml(html, (value, kind) => {
      if (kind === 'frame' || kind === 'endpoint') return null;
      const u = resolve(value, base);
      if (!u || !sameSite(u)) return null;
      u.hash = '';
      if (kind === 'nav' && looksLikePage(u.href)) queuePage(u);
      else queueAsset(u);
      return null;
    });
    for (const m of html.matchAll(INLINE_SCRIPT)) scanScript(m[1]);
  };
  const addPage = (requested, got) => {
    const finalKey = pageKey(got.url);
    const existing = pageFiles.get(finalKey);
    if (existing) {
      pageFiles.set(pageKey(requested), existing);
      return;
    }
    // The page you pasted is always the copy's home page, even if it
    // isn't the root of the site.
    const file = claim(pages.length ? pagePathFor(got.url) : 'index.html');
    const html = got.buf.toString('latin1');
    pages.push({ url: got.url, html, file });
    pageFiles.set(finalKey, file);
    pageFiles.set(pageKey(requested), file);
    collect(html, got.url);
  };

  seenPages.add(pageKey(start));
  seenPages.add(pageKey(home.href));
  addPage(start, first);
  while (pageQueue.length) {
    await Promise.all(pageQueue.splice(0, LIMITS.concurrency).map(async href => {
      try {
        const got = await fetchResource(href);
        if (!sameSite(new URL(got.url))) return;
        if (!/html/.test(got.type)) {
          // A link to a PDF or similar — keep it as a file.
          assets.set(assetKey(href), { url: href, buf: got.buf, type: got.type });
          return;
        }
        addPage(href, got);
      } catch {
        skipped++;
      }
    }));
  }

  let totalBytes = 0;
  for (;;) {
    const pending = [...assets.values()].filter(a => !a.done);
    if (!pending.length) break;
    for (let i = 0; i < pending.length; i += LIMITS.concurrency) {
      await Promise.all(pending.slice(i, i + LIMITS.concurrency).map(async a => {
        a.done = true;
        try {
          if (!a.buf) {
            const got = await fetchResource(a.url);
            a.buf = got.buf;
            a.type = got.type;
          }
        } catch {
          a.failed = true;
          if (!a.guessed) skipped++;
          return;
        }
        if (totalBytes + a.buf.length > LIMITS.totalBytes) {
          a.failed = true;
          a.buf = null;
          skipped++;
          return;
        }
        totalBytes += a.buf.length;
        a.file = claim(assetPathFor(a.url));
        if (/text\/css/.test(a.type || '') || /\.css$/i.test(new URL(a.url).pathname)) {
          a.css = a.buf.toString('latin1');
          mapCss(a.css, v => {
            const u = resolve(v, a.url);
            if (u && sameSite(u)) {
              u.hash = '';
              queueAsset(u);
            }
            return null;
          });
        }
        if (/javascript/.test(a.type || '') || /\.m?js$/i.test(new URL(a.url).pathname)) scanScript(a.buf.toString('latin1'));
      }));
    }
  }

  const refFor = (fromFile, base) => (value, kind) => {
    const u = resolve(value, base);
    if (!u || !sameSite(u)) return null;
    const hash = u.hash;
    u.hash = '';
    if (kind === 'endpoint') return u.href + hash;
    if (kind === 'nav' || kind === 'frame') {
      const file = pageFiles.get(pageKey(u.href));
      if (file) return relativeRef(fromFile, file, true) + hash;
    }
    const asset = assets.get(assetKey(u.href));
    if (asset?.file && !asset.failed) return relativeRef(fromFile, asset.file, false) + hash;
    return u.href + hash;
  };

  // Written to a temporary folder first, so a failed re-import never
  // leaves the existing copy half-replaced.
  const tmp = `${destDir}.importing-${process.pid}-${Date.now()}`;
  const write = (rel, data) => {
    const full = path.resolve(tmp, rel);
    if (!full.startsWith(tmp + path.sep)) return false;
    try {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, data);
      return true;
    } catch {
      return false;
    }
  };
  let files = 0;
  try {
    for (const page of pages) {
      const out = mapHtml(page.html, refFor(page.file, baseOf(page.html, page.url)), { dropBase: true });
      if (!write(page.file, Buffer.from(out, 'latin1'))) skipped++;
    }
    for (const a of assets.values()) {
      if (!a.file || a.failed) continue;
      const data = a.css !== undefined
        ? Buffer.from(mapCss(a.css, v => refFor(a.file, a.url)(v, 'asset')), 'latin1')
        : a.buf;
      if (write(a.file, data)) files++;
      else skipped++;
    }
    if (!fs.existsSync(path.join(tmp, 'index.html'))) throw new Error('the home page couldn’t be saved');
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.renameSync(tmp, destDir);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
  return { url: home.href, pages: pages.length, files, skipped };
}

module.exports = {
  importSite, siteName, normalizeUrl, htmlFiles,
  pagePathFor, assetPathFor, relativeRef, mapHtml, mapCss, mapSrcset
};
