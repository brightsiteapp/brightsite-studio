// Studio V2's pipeline rules: which column a business sits in and what it
// needs next, worked out from fields on its one business record (the same
// data.json V1 uses, synced the same way). Moving a business only ever
// patches that record — nothing is copied or duplicated.
//
// New, optional fields (older records simply don't have them):
//   websiteBuiltAt   when the website was built ('' = explicitly not built)
//   lastContactedAt  last time we sent the website or followed up
//   lastContactKind  'sent' | 'follow_up'
//   followUpAt       manual override for when a follow-up is due
//   tasks            one-off tasks linked to this business
// Everything else is V1's own fields (pipelineStage, paymentStatus,
// billing, followedUpAt), written the way V1 understands them, so a
// business moved in V2 shows in the matching place in V1 too.
//
// Shared by the page (window.Pipeline) and the tests (require).
(function (root) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const FOLLOW_UP_AFTER_MS = 2 * DAY_MS;
  // V1's sales stages (desktop-app/lib/site-storage.js) that mean "we've been in touch".
  const CONTACTED_STAGES = ['called', 'follow_up', 'interested', 'demo_sent'];
  const STAGE_LABELS = {
    lead: 'Lead', ready: 'Website ready', waiting: 'Waiting for reply', followup: 'Follow up',
    client: 'Client', archived: 'Not interested'
  };
  const TASK_TYPES = ['Content', 'Images', 'Domain', 'Feature', 'Other'];

  const time = iso => {
    const t = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  };
  const iso = ms => new Date(ms).toISOString();
  const nameOf = p => p.raw?.name || p.name || p.slug || '';
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const isClient = p => p.paymentStatus === 'paid' || p.paymentStatus === 'pending';

  // Built = someone set it (V2), or, for records from before V2, signs of a
  // real site: live, imported, read from a business link (not just found by
  // AI search, which also records a link), or worked on in the builder.
  function websiteBuilt(p) {
    if (typeof p.websiteBuiltAt === 'string') return Boolean(p.websiteBuiltAt);
    const raw = p.raw || {};
    return Boolean(p.liveUrl || p.everLive || p.importedSite || (p.lastImportUrl && !p.foundVia)
      || raw.logoImage || raw.heroImage || raw.gallery?.length || raw.layout
      || p.editLog?.length || raw.textOverrides?.length);
  }

  // Older contacted records have no lastContactedAt: V1's "followed up"
  // click is the next best thing, then the last time the record changed.
  const lastContactAt = p => time(p.lastContactedAt) ?? time(p.followedUpAt) ?? time(p.updatedAt) ?? time(p.createdAt);

  function followUpDueAt(p) {
    const set = time(p.followUpAt);
    if (set !== null) return set;
    const last = lastContactAt(p);
    return last === null ? null : last + FOLLOW_UP_AFTER_MS;
  }

  // Stripe (V1's billing field) outranks a hand-set status: a failing
  // subscription is an issue even if the business is marked paid.
  function paymentState(p) {
    const b = p.billing?.status;
    if (b === 'failed') return 'issue';
    if (b === 'cancelling' || b === 'cancelled') return 'cancelled';
    if (b === 'active' || b === 'paid' || p.paymentStatus === 'paid') return 'ok';
    return 'awaiting';
  }

  function stageOf(p, now = Date.now()) {
    if (isClient(p)) return 'client';
    if (p.pipelineStage === 'not_interested') return 'archived';
    if (CONTACTED_STAGES.includes(p.pipelineStage)) {
      const due = followUpDueAt(p);
      return due !== null && now >= due ? 'followup' : 'waiting';
    }
    return websiteBuilt(p) ? 'ready' : 'lead';
  }

  // Every column's list, sorted: newest leads first, the longest-waiting
  // follow-up first, the next one due first while waiting, and problems
  // (awaiting payment, then payment issues) at the top of each client half.
  function board(projects, now = Date.now(), query = '') {
    const q = String(query || '').trim().toLowerCase();
    const cols = { lead: [], ready: [], followup: [], waiting: [], active: [], issue: [], archived: [] };
    for (const p of projects) {
      if (q && !nameOf(p).toLowerCase().includes(q)) continue;
      const stage = stageOf(p, now);
      if (stage === 'client') cols[['issue', 'cancelled'].includes(paymentState(p)) ? 'issue' : 'active'].push(p);
      else cols[stage].push(p);
    }
    const created = p => time(p.createdAt) || 0;
    const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
    const newest = (a, b) => created(b) - created(a);
    cols.lead.sort(newest);
    cols.ready.sort(newest);
    cols.followup.sort((a, b) => (lastContactAt(a) ?? 0) - (lastContactAt(b) ?? 0));
    cols.waiting.sort((a, b) => (followUpDueAt(a) ?? Infinity) - (followUpDueAt(b) ?? Infinity));
    const first = (state, p) => (paymentState(p) === state ? 0 : 1);
    cols.active.sort((a, b) => first('awaiting', a) - first('awaiting', b) || byName(a, b));
    cols.issue.sort((a, b) => first('issue', a) - first('issue', b) || byName(a, b));
    cols.archived.sort(byName);
    return cols;
  }

  // ---------- wording ----------
  const startOfDay = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const calendarDays = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
  const shortDate = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  function relativeDay(ms, now = Date.now()) {
    if (ms === null || ms === undefined) return '';
    const days = calendarDays(ms, now);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return `on ${shortDate(ms)}`;
  }

  const daysSince = (ms, now) => (ms === null ? 0 : Math.max(0, Math.floor((now - ms) / DAY_MS)));

  // The first bit of an address is usually the street; the town reads better on a card.
  function shortPlace(place) {
    const parts = String(place || '').split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    const town = parts.find((s, i) => i > 0 && !/\d/.test(s));
    return town || parts[parts.length - 1];
  }
  const placeAndCategory = p => [shortPlace(p.raw?.location || p.raw?.businessProfile?.address), p.raw?.tagline].filter(Boolean).join(' · ');

  const siteUrl = p => (p.customDomain ? `https://${p.customDomain}` : '') || p.liveUrl || '';

  function siteLabel(p) {
    if (p.liveUrl || p.importedSite?.mode === 'link') return 'Website live';
    if (p.everLive) return 'Website offline';
    if (p.contact?.existingWebsite) return 'Their own website';
    return 'Website not live yet';
  }

  const PAYMENT_LABELS = { ok: 'Payment OK', awaiting: 'Awaiting payment', issue: 'PAYMENT ISSUE', cancelled: 'CANCELLED' };

  // What a card says: a sub-line, the next task, and (overdue follow-ups
  // only) a small flag. `tone` picks the colour.
  function card(p, now = Date.now()) {
    const stage = stageOf(p, now);
    if (stage === 'lead') return { stage, tone: 'lead', sub: placeAndCategory(p), task: 'Build website' };
    if (stage === 'ready') return { stage, tone: 'ready', sub: 'Demo complete', task: 'Ready to send' };
    if (stage === 'archived') return { stage, tone: 'archived', sub: placeAndCategory(p), task: 'Not interested' };
    if (stage === 'client') {
      const pay = paymentState(p);
      return { stage, tone: pay, sub: siteLabel(p), task: PAYMENT_LABELS[pay], payment: pay };
    }
    const last = lastContactAt(p);
    const days = daysSince(last, now);
    if (stage === 'followup') {
      return {
        stage, tone: 'due', task: 'Follow up today',
        sub: days >= 1 ? `No reply for ${plural(days, 'day')}` : 'Marked to follow up',
        flag: days >= 7 ? '1+ WEEK' : days >= 2 ? '2+ DAYS' : 'DUE'
      };
    }
    const verb = p.lastContactKind === 'follow_up' ? 'Followed up' : 'Messaged';
    return { stage, tone: 'wait', sub: `${verb} ${relativeDay(last, now)}`, task: 'Waiting for reply' };
  }

  // One line of status for the business profile's header.
  function statusLine(p, now = Date.now()) {
    const stage = stageOf(p, now);
    const created = time(p.createdAt);
    if (stage === 'lead') return created ? `Added ${relativeDay(created, now)}` : '';
    if (stage === 'ready') {
      const built = time(p.websiteBuiltAt) ?? time(p.updatedAt);
      return built ? `Website built ${relativeDay(built, now)}` : 'Website built';
    }
    if (stage === 'client') return siteLabel(p);
    if (stage === 'archived') return '';
    const c = card(p, now);
    if (stage === 'followup') return c.sub;
    const due = followUpDueAt(p);
    const left = due === null ? 0 : Math.max(1, Math.ceil((due - now) / DAY_MS));
    return `${c.sub} · follow up in ${plural(left, 'day')} if no reply`;
  }

  // Messages for WhatsApp/email. The link is the business's own (never
  // V1's ?bs_owner=1, which marks our opens), so their opens still count.
  function message(p, kind) {
    const name = nameOf(p);
    const url = siteUrl(p);
    const first = String(p.contact?.name || '').trim().split(/\s+/)[0];
    const hi = first ? `Hi ${first}` : 'Hi';
    if (kind === 'followup') {
      return url
        ? `${hi}, just following up on the website we put together for ${name}: ${url}\n\nHave you had a chance to take a look? Happy to change anything you’d like.`
        : `${hi}, just following up about a new website for ${name} — any questions at all, just let me know.`;
    }
    if (kind === 'send') {
      return url
        ? `${hi}, we’ve put together a website for ${name} — you can take a look here: ${url}\n\nAny questions at all, just let me know.`
        : `${hi}, we’d love to help ${name} with a brand new website — any questions at all, just let me know.`;
    }
    return `${hi},\n\n`;
  }
  function subject(p, kind) {
    const name = nameOf(p);
    return kind === 'followup' ? `Following up — a website for ${name}` : kind === 'send' ? `A website for ${name}` : name;
  }
  function contactCard(p) {
    const phone = p.raw?.businessProfile?.phone || p.contact?.phone || '';
    const address = p.raw?.businessProfile?.address || p.raw?.location || '';
    return [nameOf(p), p.contact?.name, phone, p.contact?.email, address, siteUrl(p) || p.contact?.existingWebsite]
      .map(s => String(s || '').trim()).filter(Boolean).join('\n');
  }
  const stripeUrl = p => `https://dashboard.stripe.com/search?query=${encodeURIComponent(String(p.contact?.email || '').trim() || nameOf(p))}`;

  // ---------- moves (each returns a patch for the same record) ----------
  const contactedStage = p => (CONTACTED_STAGES.includes(p.pipelineStage) ? p.pipelineStage : 'demo_sent');
  const leaveClients = p => (isClient(p) ? { paymentStatus: 'no' } : {});

  const markBuilt = (p, now = Date.now()) => ({ websiteBuiltAt: iso(now) });

  const markContacted = (p, now = Date.now()) => ({
    ...leaveClients(p), pipelineStage: 'demo_sent', lastContactedAt: iso(now), lastContactKind: 'sent', followUpAt: ''
  });

  // Also sets V1's followedUpAt, which clears V1's own "opened the demo but
  // no reply" reminder in the same way V1's "Followed up" button does.
  function markFollowedUp(p, now = Date.now()) {
    const at = iso(now);
    return { ...leaveClients(p), pipelineStage: contactedStage(p), lastContactedAt: at, lastContactKind: 'follow_up', followUpAt: '', followedUpAt: at };
  }

  // Manual override from the profile's Move menu or a drag on the board.
  function moveTo(p, target, now = Date.now()) {
    const at = iso(now);
    switch (target) {
      case 'lead': return { ...leaveClients(p), pipelineStage: 'uncontacted', websiteBuiltAt: '', followUpAt: '' };
      case 'ready': return { ...leaveClients(p), pipelineStage: 'uncontacted', websiteBuiltAt: p.websiteBuiltAt || at, followUpAt: '' };
      case 'waiting': return { ...leaveClients(p), pipelineStage: contactedStage(p), lastContactedAt: p.lastContactedAt || at, followUpAt: iso(now + FOLLOW_UP_AFTER_MS) };
      case 'followup': return { ...leaveClients(p), pipelineStage: contactedStage(p), lastContactedAt: p.lastContactedAt || at, followUpAt: at };
      case 'client': return p.paymentStatus === 'paid' ? {} : { paymentStatus: 'pending' };
      case 'archived': return { ...leaveClients(p), pipelineStage: 'not_interested', followUpAt: '' };
      default: throw new Error(`Unknown stage: ${target}`);
    }
  }

  function summary(cols) {
    const parts = [
      cols.lead.length && `${cols.lead.length} to build`,
      cols.ready.length && `${cols.ready.length} to send`,
      cols.followup.length && `${cols.followup.length} to follow up`,
      cols.issue.length && plural(cols.issue.length, 'payment problem')
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'All caught up';
  }

  // ---------- tasks ----------
  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
  const keyToMs = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  function todayKey(now = Date.now()) {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function cleanTask(t) {
    return {
      id: String(t.id || '').slice(0, 60),
      text: String(t.text || '').trim().slice(0, 500),
      due: DATE_KEY.test(t.due || '') ? t.due : '',
      type: TASK_TYPES.includes(t.type) ? t.type : '',
      done: Boolean(t.done),
      createdAt: String(t.createdAt || ''),
      doneAt: t.done ? String(t.doneAt || '') : ''
    };
  }
  function newTask(fields, now = Date.now()) {
    return cleanTask({ ...fields, id: `t${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, done: false, createdAt: iso(now) });
  }

  // To do first — by due date, undated last — then done, most recent first.
  function sortTasks(list) {
    const open = list.filter(t => !t.done).sort((a, b) =>
      (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.createdAt || '').localeCompare(b.createdAt || ''));
    const done = list.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    return [...open, ...done];
  }
  const isOverdue = (t, today) => Boolean(!t.done && t.due && t.due < today);
  function dueLabel(t, today) {
    if (!t.due) return '';
    const days = Math.round((keyToMs(t.due) - keyToMs(today)) / DAY_MS);
    const date = shortDate(keyToMs(t.due));
    if (days < 0) return t.done ? date : `Overdue · ${date}`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return new Date(keyToMs(t.due)).toLocaleDateString('en-GB', { weekday: 'short' });
    return date;
  }

  const api = {
    DAY_MS, FOLLOW_UP_AFTER_MS, CONTACTED_STAGES, STAGE_LABELS, TASK_TYPES, PAYMENT_LABELS,
    isClient, websiteBuilt, lastContactAt, followUpDueAt, paymentState, stageOf, board,
    relativeDay, shortPlace, placeAndCategory, siteUrl, siteLabel, card, statusLine,
    message, subject, contactCard, stripeUrl,
    markBuilt, markContacted, markFollowedUp, moveTo, summary,
    todayKey, cleanTask, newTask, sortTasks, isOverdue, dueLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pipeline = api;
})(this);
