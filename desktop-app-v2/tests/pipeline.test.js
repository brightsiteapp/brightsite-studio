// The pipeline rules (public/pipeline.js): which column a business is in,
// the two-day follow-up clock, manual moves and Stripe states — all from
// fields on the one business record. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../public/pipeline');

const DAY = P.DAY_MS;
const NOW = new Date(2026, 8, 13, 12, 0, 0).getTime();
const ago = days => new Date(NOW - days * DAY).toISOString();
const apply = (p, patch) => ({ ...p, ...patch });

test('records from before V2 still load into a column', () => {
  assert.strictEqual(P.stageOf({ slug: 'a' }, NOW), 'lead');
  assert.strictEqual(P.stageOf({ slug: 'a', raw: { name: 'A' }, pipelineStage: 'uncontacted' }, NOW), 'lead');
  assert.strictEqual(P.stageOf({ slug: 'a', pipelineStage: 'something-old' }, NOW), 'lead');
  assert.strictEqual(P.stageOf({ slug: 'a', pipelineStage: 'not_interested' }, NOW), 'archived');
  assert.strictEqual(P.stageOf({ slug: 'a', paymentStatus: 'paid' }, NOW), 'client');
  assert.strictEqual(P.stageOf({ slug: 'a', paymentStatus: 'pending' }, NOW), 'client');
});

test('built from a link = Website ready; AI search finds are still leads', () => {
  assert.strictEqual(P.stageOf({ lastImportUrl: 'https://facebook.com/x' }, NOW), 'ready');
  assert.strictEqual(P.stageOf({ lastImportUrl: 'https://facebook.com/x', foundVia: ['google'] }, NOW), 'lead');
  assert.strictEqual(P.stageOf({ liveUrl: 'https://x.vercel.app' }, NOW), 'ready');
  assert.strictEqual(P.stageOf({ raw: { layout: 'studio' } }, NOW), 'ready');
  assert.strictEqual(P.stageOf({ importedSite: { mode: 'copy' } }, NOW), 'ready');
});

test('websiteBuiltAt wins over the guesswork both ways', () => {
  assert.strictEqual(P.stageOf({ liveUrl: 'https://x.vercel.app', websiteBuiltAt: '' }, NOW), 'lead');
  assert.strictEqual(P.stageOf({ websiteBuiltAt: ago(1) }, NOW), 'ready');
  // A null (e.g. an undone move) falls back to the guesswork.
  assert.strictEqual(P.stageOf({ liveUrl: 'https://x.vercel.app', websiteBuiltAt: null }, NOW), 'ready');
});

test('send → waiting; 2 days of silence → follow up; following up resets the clock', () => {
  let p = { slug: 'joes-gym', raw: { name: "Joe's Gym" }, lastImportUrl: 'https://facebook.com/joes' };
  assert.strictEqual(P.stageOf(p, NOW), 'ready');

  p = apply(p, P.markContacted(p, NOW));
  assert.strictEqual(p.slug, 'joes-gym');
  assert.strictEqual(p.pipelineStage, 'demo_sent');
  assert.strictEqual(P.stageOf(p, NOW), 'waiting');
  assert.strictEqual(P.stageOf(p, NOW + 2 * DAY - 1), 'waiting');
  assert.strictEqual(P.stageOf(p, NOW + 2 * DAY), 'followup');

  p = apply(p, P.markFollowedUp(p, NOW + 3 * DAY));
  assert.strictEqual(P.stageOf(p, NOW + 3 * DAY), 'waiting');
  assert.strictEqual(p.followedUpAt, p.lastContactedAt, 'also clears V1’s own reminder');
  assert.strictEqual(P.stageOf(p, NOW + 5 * DAY - 1), 'waiting');
  assert.strictEqual(P.stageOf(p, NOW + 5 * DAY), 'followup');
});

test('contacted records from V1 time out from followedUpAt, then updatedAt', () => {
  assert.strictEqual(P.stageOf({ pipelineStage: 'demo_sent', updatedAt: ago(1) }, NOW), 'waiting');
  assert.strictEqual(P.stageOf({ pipelineStage: 'called', updatedAt: ago(3) }, NOW), 'followup');
  assert.strictEqual(P.stageOf({ pipelineStage: 'demo_sent', updatedAt: ago(0), followedUpAt: ago(4) }, NOW), 'followup');
});

test('Follow up lists the longest-waiting first; nobody is listed twice', () => {
  const projects = [
    { slug: 'glow', pipelineStage: 'demo_sent', lastContactedAt: ago(3) },
    { slug: 'auto', pipelineStage: 'demo_sent', lastContactedAt: ago(4) },
    { slug: 'north', pipelineStage: 'demo_sent', lastContactedAt: ago(1) },
    { slug: 'lead', raw: { name: 'Lead' } }
  ];
  const cols = P.board(projects, NOW);
  assert.deepStrictEqual(cols.followup.map(p => p.slug), ['auto', 'glow']);
  assert.deepStrictEqual(cols.waiting.map(p => p.slug), ['north']);
  const all = Object.values(cols).flat().map(p => p.slug).sort();
  assert.deepStrictEqual(all, ['auto', 'glow', 'lead', 'north']);
});

test('manual moves patch the same record into every column', () => {
  const p = { slug: 'x', lastImportUrl: 'https://facebook.com/x' };
  for (const target of ['lead', 'ready', 'waiting', 'followup', 'client', 'archived']) {
    const moved = apply(p, P.moveTo(p, target, NOW));
    assert.strictEqual(P.stageOf(moved, NOW), target, target);
    assert.strictEqual(moved.slug, 'x');
  }
  // Moving a client back out takes them off V1's Clients tab too.
  const client = { slug: 'c', paymentStatus: 'paid' };
  assert.strictEqual(P.moveTo(client, 'waiting', NOW).paymentStatus, 'no');
  assert.deepStrictEqual(P.moveTo(client, 'client', NOW), {});
  assert.throws(() => P.moveTo(p, 'nowhere', NOW));
});

test('Stripe decides the Clients half, and healthy payment moves them back', () => {
  const client = billing => ({ slug: 's', paymentStatus: 'paid', liveUrl: 'https://s.vercel.app', billing });
  let cols = P.board([client({ status: 'failed' })], NOW);
  assert.strictEqual(cols.issue.length, 1);
  assert.strictEqual(P.card(cols.issue[0], NOW).task, 'PAYMENT ISSUE');
  cols = P.board([client({ status: 'cancelling', until: ago(-10) })], NOW);
  assert.strictEqual(P.card(cols.issue[0], NOW).task, 'CANCELLED');
  cols = P.board([client({ status: 'active' })], NOW);
  assert.strictEqual(cols.active.length, 1);
  assert.strictEqual(P.card(cols.active[0], NOW).task, 'Payment OK');
  assert.strictEqual(P.card({ paymentStatus: 'pending' }, NOW).task, 'Awaiting payment');
  assert.strictEqual(P.card(client({ status: 'active' }), NOW).sub, 'Website live');
  assert.strictEqual(P.card({ paymentStatus: 'paid', everLive: true }, NOW).sub, 'Website offline');
});

test('card wording matches the brief', () => {
  assert.deepStrictEqual(
    (({ sub, task }) => ({ sub, task }))(P.card({ raw: { name: "Joe's Gym", location: 'Hull', tagline: 'Gym' } }, NOW)),
    { sub: 'Hull · Gym', task: 'Build website' });
  assert.strictEqual(P.card({ websiteBuiltAt: ago(0) }, NOW).task, 'Ready to send');
  const due = P.card({ pipelineStage: 'demo_sent', lastContactedAt: ago(4) }, NOW);
  assert.deepStrictEqual([due.sub, due.task, due.flag], ['No reply for 4 days', 'Follow up today', '2+ DAYS']);
  assert.strictEqual(P.card({ pipelineStage: 'demo_sent', lastContactedAt: ago(8) }, NOW).flag, '1+ WEEK');
  assert.strictEqual(P.card({ pipelineStage: 'demo_sent', lastContactedAt: ago(1) }, NOW).sub, 'Messaged yesterday');
  assert.strictEqual(P.card({ pipelineStage: 'demo_sent', lastContactedAt: ago(0), lastContactKind: 'follow_up' }, NOW).sub, 'Followed up today');
  assert.strictEqual(P.shortPlace('12 High Street, Beverley, HU17 0AA'), 'Beverley');
});

test('messages use the business’s own link, never the owner-marked one', () => {
  const p = { raw: { name: 'Urban Salon' }, contact: { name: 'Sam Lee' }, liveUrl: 'https://urban.vercel.app' };
  assert.match(P.message(p, 'send'), /^Hi Sam, .*https:\/\/urban\.vercel\.app/);
  assert.doesNotMatch(P.message(p, 'followup'), /bs_owner/);
  assert.match(P.message({ ...p, customDomain: 'urbansalon.co.uk' }, 'send'), /https:\/\/urbansalon\.co\.uk/);
});

test('tasks: cleaned, sorted by due date, labelled', () => {
  const today = '2026-09-13';
  const t = P.newTask({ text: '  Add booking form ', due: 'soon', type: 'Nope' }, NOW);
  assert.strictEqual(t.text, 'Add booking form');
  assert.strictEqual(t.due, '');
  assert.strictEqual(t.type, '');
  assert.ok(t.id);
  const list = P.sortTasks([
    { id: '1', text: 'undated', due: '' },
    { id: '2', text: 'later', due: '2026-09-20' },
    { id: '3', text: 'late', due: '2026-09-10' },
    { id: '4', text: 'done', due: '2026-09-01', done: true, doneAt: ago(1) }
  ]);
  assert.deepStrictEqual(list.map(x => x.id), ['3', '2', '1', '4']);
  assert.ok(P.isOverdue(list[0], today));
  assert.match(P.dueLabel(list[0], today), /^Overdue/);
  assert.strictEqual(P.dueLabel({ due: today }, today), 'Today');
  assert.strictEqual(P.dueLabel({ due: '2026-09-14' }, today), 'Tomorrow');
});
