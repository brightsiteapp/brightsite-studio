// Studio V2's price list: sections of services, each with a price and a
// time, stored on the business record as `priceList` (so it syncs with the
// record, like tasks):
//   { sections: [{ title, items: [{ service, price, time }] }] }
//
// parse() turns text pasted from anywhere (a website, a Facebook post, a
// spreadsheet, a PDF, a Word table) into that shape without AI:
//   - tabs or | between cells (spreadsheets, tables)
//   - "Haircut ........ £25 · 30 mins", "Haircut - £25", "Haircut £25"
//   - the price (or time) on the line after the service
//   - section headings: a line with no price whose next line has one, or
//     one ending in ":", starting with "#", or written in capitals
(function (root) {
  const CUR = '[£$€]';
  const NUM = '\\d[\\d,]*(?:\\.\\d{1,2})?';
  const WORD_PRICE = '\\b(?:POA|P\\.O\\.A\\.?|free|on request|price on request|quote|get a quote|ask)\\b';
  const MONEY = `(?:(?:from|starting at|starts at)\\s+)?${CUR}\\s?${NUM}(?:\\s?(?:-|–|to)\\s?${CUR}?\\s?${NUM})?\\+?(?:\\s?(?:pp|each|per \\w+|\\/\\w+))?`;
  const PRICE_RE = new RegExp(`${MONEY}|${WORD_PRICE}`, 'gi');
  const BARE_PRICE_END = new RegExp(`(?:^|\\s)((?:from\\s+)?${NUM})\\s*$`, 'i');
  // A time never starts inside a price ("£18 - 30 min" is £18 and 30 min).
  const TIME_RE = /(?<![£$€\d.,])\d+(?:\.\d+)?\s?(?:h|hr|hrs|hour|hours)\b(?:\s?\d+\s?(?:m|min|mins|minutes)\b)?|(?<![£$€\d.,])\d+(?:\s?(?:-|–|to)\s?\d+)?\s?(?:m|min|mins|minutes)\b/gi;
  const LEADERS = /^[\s.\-–—:|·•…_*=]+|[\s.\-–—:|·•…_*=,]+$/g;
  const BULLET = /^\s*(?:[-*•·▪►✓✔]|\d{1,2}[.)])\s+/;
  const HEADER_ROW = /^(?:services?|treatments?|items?|name|description)$/i;

  const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const fullMatch = (re, s) => {
    re.lastIndex = 0;
    const m = s.match(re);
    return Boolean(m && m.length === 1 && m[0].trim().length === s.trim().length);
  };

  // One line of text → { service, price, time } (any may be '').
  function readLine(line) {
    const cells = line.includes('\t') ? line.split('\t')
      : (line.match(/\|/g) || []).length >= 1 && !/^\|?[\s:|-]+\|?$/.test(line) ? line.split('|')
        : null;
    if (cells) {
      const parts = cells.map(c => c.trim()).filter(Boolean);
      if (parts.length > 1) {
        let price = '';
        let time = '';
        const rest = [];
        for (const part of parts) {
          if (!price && (fullMatch(PRICE_RE, part) || /^\d[\d,]*(?:\.\d{1,2})?$/.test(part))) price = part;
          else if (!time && fullMatch(TIME_RE, part)) time = part;
          else rest.push(part);
        }
        return { service: clip(rest.join(' – '), 120), price: clip(price, 40), time: clip(time, 40) };
      }
    }
    let text = line.replace(BULLET, '');
    let time = '';
    TIME_RE.lastIndex = 0;
    const times = text.match(TIME_RE);
    if (times) {
      time = times[times.length - 1];
      text = text.replace(time, ' ');
    }
    let price = '';
    PRICE_RE.lastIndex = 0;
    const prices = text.match(PRICE_RE);
    if (prices) {
      price = prices[prices.length - 1];
      const at = text.lastIndexOf(price);
      text = text.slice(0, at) + ' ' + text.slice(at + price.length);
    } else {
      const bare = text.match(BARE_PRICE_END);
      // A bare number at the end counts as a price only after some words
      // ("Gel nails 25"), so a heading like "Top 10" or "2024" doesn't.
      if (bare && /[a-z]{2,}.*\s\S*$/i.test(text.slice(0, bare.index + 1) + 'x')) {
        const before = text.slice(0, bare.index).replace(LEADERS, '');
        if (/[a-z]{2,}/i.test(before)) {
          price = bare[1];
          text = before;
        }
      }
    }
    const service = text.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(LEADERS, '').replace(/\s{2,}/g, ' ');
    return { service: clip(service, 120), price: clip(price, 40), time: clip(time, 40) };
  }

  const looksLikeHeading = s => /:\s*$/.test(s) || /^#+\s/.test(s)
    || (/[A-Z]{2}/.test(s) && s === s.toUpperCase() && /[A-Z]/.test(s) && s.length <= 60);
  const headingText = s => clip(s.replace(/^#+\s*/, '').replace(/[:\s]+$/, '').replace(LEADERS, ''), 80);

  function parse(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
    const rows = lines.map(line => ({ line, ...readLine(line) }));
    const sections = [];
    let section = null;
    const ensure = () => {
      if (!section) { section = { title: '', items: [] }; sections.push(section); }
      return section;
    };
    rows.forEach((row, i) => {
      const cells = row.line.split(/\t|\|/).map(c => c.trim()).filter(Boolean);
      if (cells.length > 1 && cells.some(c => HEADER_ROW.test(c)) && cells.some(c => /^(?:price|cost|£|time|duration)s?$/i.test(c))) return;
      const hasDetail = row.price || row.time;
      if (hasDetail && !row.service) {
        // "£25" on its own line belongs to the service above it.
        const last = section?.items[section.items.length - 1];
        if (last && (!last.price || !last.time)) {
          if (row.price && !last.price) last.price = row.price;
          if (row.time && !last.time) last.time = row.time;
        } else {
          ensure().items.push({ service: '', price: row.price, time: row.time });
        }
        return;
      }
      if (hasDetail) return ensure().items.push({ service: row.service, price: row.price, time: row.time });
      const next = rows[i + 1];
      const nextIsDetailOnly = next && (next.price || next.time) && !next.service;
      const nextHasPrice = next && (next.price || next.time) && next.service;
      if (!nextIsDetailOnly && (looksLikeHeading(row.line) || nextHasPrice)) {
        section = { title: headingText(row.line), items: [] };
        sections.push(section);
      } else {
        ensure().items.push({ service: row.service, price: '', time: '' });
      }
    });
    return clean({ sections: sections.filter(s => s.items.length || s.title) });
  }

  // Any stored or returned list → the one safe shape (also used for what
  // AI reads from a photo, so bad output can't break the record).
  function clean(list) {
    const src = Array.isArray(list) ? list : Array.isArray(list?.sections) ? list.sections : [];
    let total = 0;
    const sections = src.slice(0, 40).map(s => ({
      title: clip(s?.title ?? s?.name ?? '', 80),
      items: (Array.isArray(s?.items) ? s.items : []).map(it => ({
        service: clip(it?.service ?? it?.name ?? '', 120),
        price: clip(it?.price ?? '', 40),
        time: clip(it?.time ?? it?.duration ?? '', 40)
      })).filter(it => it.service || it.price || it.time).filter(() => ++total <= 400)
    })).filter(s => s.title || s.items.length);
    return { sections };
  }

  function counts(list) {
    const sections = clean(list).sections;
    return { sections: sections.length, services: sections.reduce((n, s) => n + s.items.length, 0) };
  }

  function summary(list) {
    const c = counts(list);
    if (!c.services && !c.sections) return 'No prices yet';
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    return c.sections > 1 ? `${plural(c.services, 'service')} in ${plural(c.sections, 'section')}` : plural(c.services, 'service');
  }

  // Tab-separated text, so a list copies straight into a spreadsheet or
  // back into parse() unchanged.
  function toText(list) {
    return clean(list).sections.map(s => [
      s.title ? `${s.title}:` : '',
      ...s.items.map(it => [it.service, it.price, it.time].join('\t').replace(/\t+$/, ''))
    ].filter(Boolean).join('\n')).join('\n\n');
  }

  const api = { parse, clean, counts, summary, toText, readLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PriceList = api;
})(this);
