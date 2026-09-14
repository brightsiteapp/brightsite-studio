// BrightSite Studio V2 — the pipeline, tasks and business profile.
//
// Underneath it's V1 (../desktop-app): V1's page markup (settings, dialogs,
// notifications, the builder and preview) is read from /v1/index.html and
// its app.js runs unchanged, exposing what this page drives as
// window.StudioCore. This file only adds the new screens and moves V1's
// pieces into them, so building, editing, sync, billing, deploys, domains
// and settings behave exactly as they do in V1.
(async () => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const P = window.Pipeline;

  try {
    await mountV1();
  } catch (err) {
    return showFatal(err);
  }
  const core = window.StudioCore;
  if (!core) return showFatal(new Error('Studio didn’t finish loading.'));

  const esc = s => core.escapeHtml(s).replace(/"/g, '&quot;');
  const nameOf = p => core.businessName(p);
  const project = slug => core.state.projects.find(p => p.slug === slug) || null;
  const current = () => core.state.current;
  const JSON_HEADERS = { 'Content-Type': 'application/json' };
  const v2 = { view: 'pipeline', slug: null, query: '', archivedOpen: false, editing: false, localTasks: [], doneOpen: false, detailsFor: null, bannerFor: null, leadCategory: '' };

  // ---------------- V1, mounted into V2 ----------------
  async function mountV1() {
    const res = await fetch('/v1/index.html');
    if (!res.ok) throw new Error(`Couldn’t load Studio (${res.status}).`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const take = sel => {
      const node = doc.querySelector(sel);
      if (!node) throw new Error(`Studio’s page is missing ${sel}.`);
      return document.adoptNode(node);
    };
    // V1's Leads/Clients switch would hide the builder; V2 has its own navigation.
    doc.querySelectorAll('.tab-switch').forEach(n => n.remove());
    const topbar = take('header.topbar');
    $('#v2BellSlot').append(topbar.querySelector('.notif-wrap'));
    $('#v1Hidden').append(topbar, take('#liveView'));
    $('#v2Strips').append(take('#setupStrip'));
    document.body.append(take('#noticeStrip'));
    $('#v2Site').append(take('#builderView'));
    $('#v2SettingsMount').append(take('#settingsDialog'));
    ['#planDialog', '#payDialog', '#domainDialog', '#confirmDialog'].forEach(sel => document.body.append(take(sel)));
    await loadScript('/follow-ups.js');
    await loadScript('/app.js');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Couldn’t load ${src}.`));
      document.body.append(s);
    });
  }

  function showFatal(err) {
    $('#v2Board').innerHTML = `<p class="v2-fatal">Studio couldn’t start: ${String(err.message || err).replace(/[<&]/g, '')}</p>`;
    console.error(err);
  }

  // ---------------- rendering ----------------
  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderNow(); });
  }
  function renderNow() {
    renderNav();
    if (v2.view === 'pipeline') renderBoard();
    else if (v2.view === 'tasks') renderTasks();
    else if (v2.view === 'accounts') renderAccounts();
    else if (v2.view === 'profile') renderProfile();
  }
  document.addEventListener('studio:projects', render);
  document.addEventListener('studio:current', onCurrentChanged);
  // Follow-ups fall due with time alone, so the board rechecks every minute.
  setInterval(render, 60 * 1000);

  function showView(view, slug) {
    if (view !== 'profile' && v2.editing) setEditing(false);
    closeMenu();
    v2.view = view;
    if (view !== 'settings') closeSettings();
    if (slug) v2.slug = slug;
    $('#v2PipelineView').hidden = view !== 'pipeline';
    $('#v2TasksView').hidden = view !== 'tasks';
    $('#v2AccountsView').hidden = view !== 'accounts';
    $('#v2SettingsView').hidden = view !== 'settings';
    $('#v2ProfileView').hidden = view !== 'profile';
    $$('.v2-nav[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === (view === 'profile' ? 'pipeline' : view)));
    if (view === 'profile') {
      v2.detailsFor = null;
      v2.bannerFor = null;
      requestAnimationFrame(() => core.fitPreviewFrame());
    }
    renderNow();
  }

  // The open business in V1 changed — V1's add bar opens what it just
  // built, a notification opens its business — so follow it here.
  function onCurrentChanged() {
    const p = current();
    if (p) {
      if (v2.view !== 'profile' || v2.slug !== p.slug) showView('profile', p.slug);
      else render();
    } else if (v2.view === 'profile') {
      showView('pipeline');
    }
  }

  async function openProfile(slug, opts = {}) {
    v2.focusBuild = Boolean(opts.focusBuild);
    if (current()?.slug === slug) return showView('profile', slug);
    await core.flushSave();
    try {
      await core.selectProject(slug);
    } catch (err) {
      core.notify(core.friendlyError(err.message), { sticky: false });
    }
  }

  async function leaveProfile(then = 'pipeline') {
    if (v2.editing) setEditing(false);
    await core.flushSave();
    if (current()) core.closeCurrentProject();
    showView(then);
  }

  // Saves a patch on one business record, the way V1's own lists do (local
  // file first, then shared sync). A pending V1 autosave on the open
  // business goes first, so it can't be overwritten by an older copy.
  async function save(slug, patch) {
    if (current()?.slug === slug) await core.flushSave();
    const saved = await core.saveProjectFields(slug, patch);
    render();
    return saved;
  }

  // A move with an Undo that puts back exactly the fields it changed.
  async function applyPatch(p, patch, text) {
    if (!Object.keys(patch).length) return;
    const undo = Object.fromEntries(Object.keys(patch).map(k => [k, p[k] === undefined ? null : p[k]]));
    try {
      await save(p.slug, patch);
    } catch (err) {
      return core.notify(core.friendlyError(err.message), { sticky: false });
    }
    toast(text, () => save(p.slug, undo).catch(err => core.notify(core.friendlyError(err.message), { sticky: false })));
  }

  const moveText = (p, target) => `${nameOf(p)} moved to ${target === 'client' ? 'Clients' : P.STAGE_LABELS[target]}.`;
  async function moveBusiness(slug, target) {
    const p = slug === current()?.slug ? current() : project(slug);
    if (!p || P.stageOf(p) === target) return;
    await applyPatch(p, P.moveTo(p, target, Date.now()), moveText(p, target));
  }
  const markBuilt = p => applyPatch(p, P.markBuilt(p, Date.now()), `${nameOf(p)}’s website is ready to send.`);
  const markContacted = p => applyPatch(p, P.markContacted(p, Date.now()), `${nameOf(p)} moved to Waiting for reply.`);
  const markFollowedUp = p => applyPatch(p, P.markFollowedUp(p, Date.now()), `Followed up with ${nameOf(p)} — waiting for a reply.`);

  // ---------------- toast (with Undo) ----------------
  let toastTimer = null;
  function toast(text, onUndo) {
    const box = $('#v2Toast');
    box.innerHTML = `<span>${esc(text)}</span>${onUndo ? '<button type="button">Undo</button>' : ''}`;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 6000);
    const btn = box.querySelector('button');
    if (btn) btn.onclick = () => { box.hidden = true; onUndo(); };
  }

  // ---------------- menus / popovers ----------------
  let menuEl = null;
  function closeMenu() {
    if (!menuEl) return;
    if (menuEl.dataset.persistent) menuEl.hidden = true;
    else menuEl.remove();
    menuEl._anchor?.classList.remove('is-open');
    menuEl = null;
  }
  function placeMenu(menu, anchor) {
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    const below = r.bottom + 6;
    menu.style.top = `${below + menu.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - menu.offsetHeight - 6) : below}px`;
  }
  // items: { label, hint, act, primary, danger, disabled } | { note } | 'sep'
  function openMenu(anchor, items, title) {
    const toggling = menuEl?._anchor === anchor;
    closeMenu();
    if (toggling) return;
    const menu = document.createElement('div');
    menu.className = 'v2-menu';
    menu.innerHTML = (title ? `<div class="v2-menu-title">${esc(title)}</div>` : '') + items.map((it, i) => {
      if (it === 'sep') return '<hr>';
      if (it.note) return `<p class="v2-menu-note">${esc(it.note)}</p>`;
      return `<button type="button" data-i="${i}" class="${it.primary ? 'is-primary' : ''}${it.danger ? ' is-danger' : ''}" ${it.disabled ? 'disabled' : ''}><span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`;
    }).join('');
    document.body.append(menu);
    placeMenu(menu, anchor);
    menu.onclick = e => {
      const b = e.target.closest('button[data-i]');
      if (!b || b.disabled) return;
      closeMenu();
      items[b.dataset.i].act();
    };
    menu._anchor = anchor;
    anchor.classList.add('is-open');
    menuEl = menu;
  }
  function openPersistentMenu(menu, anchor) {
    const toggling = menuEl === menu;
    closeMenu();
    if (toggling) return;
    menu.hidden = false;
    placeMenu(menu, anchor);
    menu._anchor = anchor;
    anchor.classList.add('is-open');
    menuEl = menu;
  }
  document.addEventListener('mousedown', e => {
    if (menuEl && !menuEl.contains(e.target) && !menuEl._anchor?.contains(e.target)) closeMenu();
  });
  window.addEventListener('resize', closeMenu);

  // ---------------- nav ----------------
  function renderNav() {
    const cols = P.board(core.state.projects, Date.now());
    const due = cols.followup.length + cols.issue.filter(p => P.paymentState(p) === 'issue').length;
    const badge = $('#v2PipelineBadge');
    badge.hidden = !due;
    badge.textContent = due > 9 ? '9+' : String(due);
    const today = P.todayKey();
    const dueTasks = allTasks().filter(t => !t.done && t.due && t.due <= today).length;
    const tBadge = $('#v2TasksBadge');
    tBadge.hidden = !dueTasks;
    tBadge.textContent = dueTasks > 9 ? '9+' : String(dueTasks);
  }

  const navigate = view => (v2.view === 'profile' ? leaveProfile(view) : showView(view));
  // Settings goes through V1's own gear button, so V1 refreshes every
  // account and service status exactly as it does when its pop-up opens.
  $$('.v2-nav[data-view]').forEach(btn => {
    btn.onclick = () => (btn.dataset.view === 'settings' ? $('#gearBtn').click() : navigate(btn.dataset.view));
  });

  // V1's settings panel as a page instead of a pop-up: V1 "opening" it
  // (its gear button, the setup strip's "Finish setup") shows the Settings
  // view, and leaving the view closes it the way V1's Done button would,
  // which also stops V1's sign-in polling.
  const settingsPanel = $('#settingsDialog');
  settingsPanel.showModal = () => {
    settingsPanel.setAttribute('open', '');
    if (v2.view !== 'settings') navigate('settings');
  };
  function closeSettings() {
    if (settingsPanel.open) settingsPanel.close();
  }
  settingsPanel.addEventListener('close', () => { if (v2.view === 'settings') showView('pipeline'); });

  // Shared sync status under the bell (V1's full status stays in Settings).
  const SYNC_TITLES = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline — changes will sync later' };
  const SYNC_SHORT = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline' };
  async function refreshSyncDot() {
    try {
      const s = await core.api('/api/sync-status');
      const label = $('#v2SyncLabel');
      label.hidden = s.state === 'disabled';
      label.title = SYNC_TITLES[s.state] || s.state;
      $('#v2Sync').className = `v2-sync is-${s.state}`;
      $('#v2SyncText').textContent = SYNC_SHORT[s.state] || s.state;
    } catch { /* best-effort */ }
  }
  refreshSyncDot();
  setInterval(refreshSyncDot, 10000);

  // A downloaded update shows as a dot on Settings, where V1's "Restart to
  // update" button is.
  const updates = window.brightsiteUpdates;
  if (updates) {
    const showUpdate = s => { $('#v2UpdateDot').hidden = !s || !['ready', 'available'].includes(s.status); };
    updates.getState().then(showUpdate).catch(() => {});
    updates.onState(showUpdate);
  }

  // ---------------- pipeline board ----------------
  core.wireBuildBar($('#v2AddInput'), $('#v2AddBtn'), $('#v2AddStatus'));
  $('#v2Search').oninput = e => { v2.query = e.target.value; renderBoard(); };
  const svg = (body, fill = false) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
  const BOARD_ICONS = {
    lead: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.2 14.8c1.9.7 3 2.4 3.4 5.2"/>'),
    ready: svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>'),
    follow: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'),
    clients: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5 1.6 0 3 .4 4.1 1.2"/><path d="M15.5 17.5l2 2 4-4.5"/>'),
    chat: svg('<path d="M20 15a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>'),
    card: svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>'),
    bolt: svg('<path d="M13.5 2L4 13.5h6.5L9.5 22 20 10h-6.5z"/>', true),
    send: svg('<path d="M21.5 2.5L10.5 13.5M21.5 2.5l-7 19-4-8-8-4z"/>'),
    dots: svg('<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>', true),
    hdots: svg('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', true)
  };
  const COLUMNS = {
    lead: { title: 'Leads', sub: 'New businesses ready to build' },
    ready: { title: 'Website ready', sub: 'Built and ready to send' },
    follow: { title: 'Follow up', sub: 'Keep the conversation going' },
    clients: { title: 'Clients', sub: 'Paying clients and live sites' }
  };
  const EMPTY = {
    lead: { icon: 'lead', title: 'No new leads', text: 'Add one with the bar above — a link, a name, or an AI search.', cta: ['add', 'Add a lead'] },
    ready: { icon: 'ready', title: 'Nothing ready yet', text: 'Sites you’ve finished building will appear here.', cta: ['build', 'Build a website'] },
    followup: { icon: 'follow', title: 'No follow-ups right now', text: 'Leads that need a nudge will appear here.' },
    waiting: { text: 'No one waiting on a reply.' },
    active: { text: 'No paying clients yet.' },
    issue: { icon: 'card', title: 'All good!', text: 'No payment problems.', quiet: true }
  };
  function emptyHtml(key) {
    const e = EMPTY[key];
    if (!e.icon) return `<p class="v2-empty">${esc(e.text)}</p>`;
    const icon = `<span class="v2-empty-icon">${BOARD_ICONS[e.icon]}</span>`;
    if (e.quiet) return `<div class="v2-empty-state is-quiet"><p>${esc(e.text)}</p>${icon}<b>${esc(e.title)}</b></div>`;
    return `<div class="v2-empty-state">${icon}<b>${esc(e.title)}</b><p>${esc(e.text)}</p>
      ${e.cta ? `<button type="button" class="v2-empty-cta" data-empty-act="${e.cta[0]}">${esc(e.cta[1])} ›</button>` : ''}</div>`;
  }

  // Categories come from raw.tagline ("hair", "laser & skin · Hull", …) —
  // only the part before "·" groups businesses across locations.
  const categoryOf = p => (p.raw?.tagline || '').split('·')[0].trim();

  function cardHtml(p, now) {
    const c = P.card(p, now);
    const views = core.state.views?.[p.slug];
    const opened = views && ['ready', 'waiting', 'followup'].includes(c.stage) ? `<span class="v2-card-meta">Opened the demo ${views.count}×</span>` : '';
    const task = c.stage === 'lead' || c.stage === 'ready'
      ? `<span class="v2-pill">${BOARD_ICONS[c.stage === 'lead' ? 'bolt' : 'send']}${esc(c.task)}</span>`
      : c.stage === 'waiting'
        ? `<span class="v2-card-task is-quiet">${BOARD_ICONS.chat}${esc(c.task)}</span>`
        : `<span class="v2-card-task"><i></i>${esc(c.task)}</span>`;
    return `<div class="v2-card tone-${c.tone}" tabindex="0" draggable="true" data-slug="${esc(p.slug)}" data-stage="${c.stage}">
      <div class="v2-card-top"><span class="v2-card-name">${esc(nameOf(p))}</span>${c.flag ? `<span class="v2-flag">${esc(c.flag)}</span>` : ''}
        <button type="button" class="v2-card-more" data-card-more title="Move or delete" aria-label="Move or delete">${BOARD_ICONS.dots}</button></div>
      ${c.sub ? `<div class="v2-card-sub">${esc(c.sub)}</div>` : ''}
      ${task}${opened}
    </div>`;
  }

  function renderBoard() {
    const now = Date.now();
    const cols = P.board(core.state.projects, now, v2.query);
    const all = v2.query ? P.board(core.state.projects, now) : cols;
    v2.archivedCount = all.archived.length;
    $('#v2Summary').textContent = core.state.projectsLoaded ? P.summary(all) : 'Loading…';
    const archived = $('#v2Archived');
    archived.hidden = !v2.archivedOpen || !cols.archived.length;
    archived.innerHTML = cols.archived.length ? '<span class="v2-archived-label">Not interested</span>'
      + cols.archived.map(p => `<button type="button" class="v2-archived-chip" data-slug="${esc(p.slug)}">${esc(nameOf(p))}</button>`).join('') : '';

    const board = $('#v2Board');
    const scrolls = Object.fromEntries($$('.v2-list', board).map(l => [l.dataset.list, l.scrollTop]));
    const list = (key, items) => (items.length ? items.map(p => cardHtml(p, now)).join('') : emptyHtml(key));
    const col = (id, count, body, extraHead = '') => `
      <section class="v2-col col-${id}">
        <header class="v2-col-head">
          <span class="v2-col-icon">${BOARD_ICONS[id]}</span><span class="v2-col-title">${COLUMNS[id].title}</span><b>${count}</b>
          <button type="button" class="v2-col-more" data-col-more="${id}" aria-label="${COLUMNS[id].title} options">${BOARD_ICONS.hdots}</button>
        </header>
        <p class="v2-col-sub">${COLUMNS[id].sub}</p>
        ${extraHead}
        <div class="v2-col-body">${body}</div>
      </section>`;
    const whole = (key, items) => `<div class="v2-list" data-list="${key}" data-drop="${key}">${list(key, items)}</div>`;
    const half = (key, drop, title, icon, items) => `
      <div class="v2-half half-${key}" data-drop="${drop}">
        <div class="v2-half-head">${icon}<span>${title}</span><b>${items.length}</b></div>
        <div class="v2-list" data-list="${key}">${list(key, items)}</div>
      </div>`;

    const leadCategories = [...new Set(cols.lead.map(categoryOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (v2.leadCategory && !leadCategories.includes(v2.leadCategory)) v2.leadCategory = '';
    const leadItems = v2.leadCategory ? cols.lead.filter(p => categoryOf(p) === v2.leadCategory) : cols.lead;
    const leadCategoryPicker = leadCategories.length
      ? `<select class="v2-lead-cat" data-lead-cat aria-label="Filter leads by category">
          <option value="">All categories</option>
          ${leadCategories.map(c => `<option value="${esc(c)}"${c === v2.leadCategory ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>`
      : '';

    board.innerHTML =
      col('lead', leadItems.length, whole('lead', leadItems), leadCategoryPicker)
      + col('ready', cols.ready.length, whole('ready', cols.ready))
      + col('follow', cols.followup.length,
        half('followup', 'followup', 'Needs follow-up', '<i class="v2-half-dot"></i>', cols.followup)
        + half('waiting', 'waiting', 'Waiting for reply', BOARD_ICONS.chat, cols.waiting))
      + col('clients', cols.active.length + cols.issue.length,
        half('active', 'client', 'Active paying', '<i class="v2-half-dot is-ok"></i>', cols.active)
        + half('issue', 'client', 'Payment issue / cancelled', BOARD_ICONS.card, cols.issue));
    $$('.v2-list', board).forEach(l => { l.scrollTop = scrolls[l.dataset.list] || 0; });
  }

  const focusAdd = () => $('#v2AddInput').focus();
  function openColumnMenu(anchor, id) {
    const items = [{ label: 'Add a lead', act: focusAdd }];
    if (v2.archivedCount) {
      items.push({ label: `${v2.archivedOpen ? 'Hide' : 'Show'} not interested`, hint: String(v2.archivedCount), act: () => { v2.archivedOpen = !v2.archivedOpen; renderBoard(); } });
    }
    if (id === 'clients') {
      items.push({ label: 'Check Stripe now', act: async () => { await core.refreshBilling(); render(); toast('Checked Stripe for payment changes.'); } });
    }
    openMenu(anchor, items, COLUMNS[id].title);
  }
  // "Build a website" on the empty Website ready column opens the newest lead.
  function emptyAction(act) {
    const first = act === 'build' && P.board(core.state.projects, Date.now()).lead[0];
    return first ? openProfile(first.slug, { focusBuild: true }) : focusAdd();
  }

  const board = $('#v2Board');
  board.addEventListener('change', e => {
    const catSel = e.target.closest('[data-lead-cat]');
    if (catSel) { v2.leadCategory = catSel.value; renderBoard(); }
  });
  board.addEventListener('click', e => {
    const more = e.target.closest('[data-card-more]');
    if (more) {
      const p = project(more.closest('.v2-card').dataset.slug);
      return p && openMoveMenu(more, p);
    }
    const colMore = e.target.closest('[data-col-more]');
    if (colMore) return openColumnMenu(colMore, colMore.dataset.colMore);
    const empty = e.target.closest('[data-empty-act]');
    if (empty) return emptyAction(empty.dataset.emptyAct);
    const card = e.target.closest('.v2-card');
    if (card) openProfile(card.dataset.slug, { focusBuild: card.dataset.stage === 'lead' });
  });
  board.addEventListener('keydown', e => {
    const card = e.target.classList.contains('v2-card') && e.target;
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.click(); }
  });
  $('#v2Archived').addEventListener('click', e => {
    const chip = e.target.closest('[data-slug]');
    if (chip) openProfile(chip.dataset.slug);
  });

  // Drag a card onto another column to move it by hand.
  let dragSlug = null;
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.v2-card');
    if (!card) return;
    dragSlug = card.dataset.slug;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSlug);
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });
  board.addEventListener('dragend', () => {
    dragSlug = null;
    $$('.is-dragging, .is-over', board).forEach(n => n.classList.remove('is-dragging', 'is-over'));
  });
  board.addEventListener('dragover', e => {
    const zone = dragSlug && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    $$('.is-over', board).forEach(n => n !== zone && n.classList.remove('is-over'));
    zone.classList.add('is-over');
  });
  board.addEventListener('dragleave', e => {
    const zone = e.target.closest('[data-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
  });
  board.addEventListener('drop', e => {
    const zone = e.target.closest('[data-drop]');
    if (!zone || !dragSlug) return;
    e.preventDefault();
    zone.classList.remove('is-over');
    moveBusiness(dragSlug, zone.dataset.drop);
  });

  // ---------------- business profile ----------------
  const ICONS = {
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.4c.1-.2 0-.3 0-.5s-.6-1.5-.9-2c-.2-.5-.5-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4z"/><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };

  function renderProfile() {
    const p = current();
    if (!p || p.slug !== v2.slug) return;
    const now = Date.now();
    const stage = P.stageOf(p, now);
    renderProfileHead(p, stage, now);
    renderAlert(p, stage);
    renderBuildBanner(p, stage);
    renderDetails(p, stage, now);
    $('#v2EditTitle').textContent = nameOf(p);
    v2.detailsFor = p.slug;
  }

  function stageActions(p, stage) {
    const btn = (act, label, cls = '') => `<button type="button" class="v2-btn ${cls}" data-act="${act}">${label}</button>`;
    if (stage === 'lead') return btn('mark-built', 'Mark website ready') + btn('build', 'Build website', 'primary');
    if (stage === 'ready') return btn('send', 'Send website', 'primary');
    if (stage === 'waiting') return btn('followup', 'Follow up now');
    if (stage === 'followup') return btn('followup', 'Follow up', 'primary');
    if (stage === 'archived') return btn('reopen', 'Back to pipeline');
    const pay = P.paymentState(p);
    const tools = btn('plan', p.plan ? 'Plan' : 'Choose plan') + btn('domain', p.customDomain ? 'Domain ✓' : 'Domain');
    if (pay === 'issue' || pay === 'cancelled') return tools + btn('pay', 'Resend payment link') + btn('stripe', 'Open Stripe', 'danger');
    if (pay === 'awaiting') return tools + btn('pay', 'Payment link') + btn('mark-paid', 'Mark paid', 'primary');
    return tools + btn('pay', 'Payment link');
  }

  function renderProfileHead(p, stage, now) {
    const c = P.card(p, now);
    const where = P.placeAndCategory(p);
    const status = P.statusLine(p, now);
    const chip = stage === 'client' ? `Client · ${P.PAYMENT_LABELS[P.paymentState(p)]}` : P.STAGE_LABELS[stage];
    $('#v2ProfileHead').innerHTML = `
      <button type="button" class="v2-back" data-act="back" title="Back to the pipeline">‹ Pipeline</button>
      <div class="v2-title">
        <h1>${esc(nameOf(p) || 'Untitled business')}</h1>
        <div class="v2-title-meta"><span class="v2-chip tone-${c.tone}">${esc(chip)}</span>${where ? `<span>${esc(where)}</span>` : ''}${status ? `<span>${esc(status)}</span>` : ''}</div>
      </div>
      <div class="v2-head-actions">${stageActions(p, stage)}<button type="button" class="v2-btn ghost v2-move" data-act="move">Move ▾</button></div>`;
  }

  function renderAlert(p, stage) {
    const box = $('#v2ProfileAlert');
    const pay = stage === 'client' ? P.paymentState(p) : null;
    const note = core.billingNote(p);
    if (pay === 'issue' || pay === 'cancelled') {
      box.innerHTML = `<div class="v2-alert">
        <span class="v2-alert-icon">!</span>
        <div><b>${pay === 'issue' ? 'Payment issue' : 'Subscription cancelled'}</b><span>${esc(pay === 'issue' ? `Stripe reports a failed payment for this client${note ? ` — ${note}` : ''}.` : `${note || 'Stripe shows this subscription has been cancelled'}.`)}</span></div>
        <button type="button" class="v2-btn" data-act="stripe">Open Stripe</button></div>`;
    } else if (stage === 'client' && p.everLive && !p.liveUrl) {
      box.innerHTML = `<div class="v2-alert is-warn"><span class="v2-alert-icon">!</span>
        <div><b>Their website is offline</b><span>A paying client’s site isn’t live right now.</span></div>
        <button type="button" class="v2-btn" data-act="make-live">Make live</button></div>`;
    } else {
      box.innerHTML = '';
    }
  }

  // "Build website" for a lead: paste their link and V1's own import (the
  // Fetch in the builder) reads it into the site. When it succeeds the lead
  // moves to Website ready by itself.
  function renderBuildBanner(p, stage) {
    const box = $('#v2BuildBanner');
    const show = stage === 'lead' && !p.importedSite;
    if (!show) { box.innerHTML = ''; v2.bannerFor = null; return; }
    if (v2.bannerFor === p.slug && box.firstChild) return; // keep what's typed
    v2.bannerFor = p.slug;
    const link = p.contact?.facebookUrl || p.contact?.googleUrl || p.lastImportUrl || p.raw?.businessProfile?.mapsUrl || '';
    box.innerHTML = `<div class="v2-build">
      <div class="v2-build-copy"><b>Build website</b><span>Paste their Facebook page or Google Maps link — Studio reads it and builds the site.</span></div>
      <div class="link-bar compact"><input id="v2BuildLink" type="text" placeholder="Facebook or Google Maps link…" value="${esc(link)}"><button type="button" id="v2BuildBtn">Build website</button></div>
      <div class="v2-build-foot"><span class="v2-build-status import-status" id="v2BuildStatus"></span><button type="button" class="v2-link" data-act="mark-built">Built it another way? Mark website ready</button></div>
    </div>`;
    $('#v2BuildBtn').onclick = runBuild;
    $('#v2BuildLink').onkeydown = e => { if (e.key === 'Enter') runBuild(); };
    if (v2.focusBuild) { v2.focusBuild = false; requestAnimationFrame(() => $('#v2BuildLink')?.focus()); }
  }

  function runBuild() {
    const url = $('#v2BuildLink').value.trim();
    const status = $('#v2BuildStatus');
    if (!/^https?:\/\//i.test(url)) {
      status.textContent = 'Paste a Facebook or Google Maps link first.';
      return $('#v2BuildLink').focus();
    }
    const field = $('#f_link');
    const fetchBtn = $('#importBtn');
    if (!field || !fetchBtn) return core.notify('Open “Edit website” to build this one.', { sticky: false });
    v2.pendingBuild = current().slug;
    field.value = url;
    fetchBtn.click();
  }

  // V1 reports import progress in the builder's status line and success as
  // "Imported for …" in its notice strip; mirror both for the banner.
  new MutationObserver(() => {
    const src = $('#importStatus');
    const dst = $('#v2BuildStatus');
    if (src && dst && v2.pendingBuild) dst.innerHTML = src.innerHTML;
  }).observe($('#editor'), { childList: true, subtree: true, characterData: true });
  new MutationObserver(() => {
    const text = $('#noticeStrip').textContent;
    if (!v2.pendingBuild || $('#noticeStrip').hidden) return;
    const slug = v2.pendingBuild;
    if (/^Imported for /.test(text)) {
      v2.pendingBuild = null;
      const p = current()?.slug === slug ? current() : project(slug);
      if (p && P.stageOf(p) === 'lead') markBuilt(p);
    } else if (!/^Read/.test(text)) {
      v2.pendingBuild = null;
      const dst = $('#v2BuildStatus');
      if (dst) dst.textContent = text;
    }
  }).observe($('#noticeStrip'), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

  // ---- details column ----
  // A section being typed in is left alone when data refreshes underneath
  // (every save, and other computers' edits through sync), so nothing
  // someone is typing gets overwritten.
  function setSection(id, html) {
    const box = $(id);
    if (v2.detailsFor === v2.slug && box.contains(document.activeElement) && document.activeElement !== document.body) return;
    box.innerHTML = html;
  }

  function field(key, label, value, opts = {}) {
    const open = opts.open ? `<button type="button" class="v2-open" data-open="${esc(opts.open)}" title="Open">${ICONS.open}</button>` : '';
    return `<label class="v2-field${open ? ' has-open' : ''}"><span>${label}</span><input data-f="${key}" value="${esc(value)}" placeholder="${esc(opts.placeholder || '')}" ${opts.type ? `type="${opts.type}"` : ''} spellcheck="false">${open}</label>`;
  }
  const httpLink = url => (/^https:\/\//i.test(url || '') ? url : '');

  function renderDetails(p, stage, now) {
    const raw = p.raw || {};
    const profile = raw.businessProfile || {};
    const types = typeof BUSINESS_TYPES !== 'undefined' ? BUSINESS_TYPES : [];
    const category = raw.tagline || '';
    const categoryOptions = `<option value="">Choose…</option>` + types.map(t => `<option ${t.label === category ? 'selected' : ''}>${esc(t.label)}</option>`).join('')
      + (category && !types.some(t => t.label === category) ? `<option selected>${esc(category)}</option>` : '');
    setSection('#v2dContact', `
      <div class="v2-quick">
        <button type="button" data-act="whatsapp">${ICONS.whatsapp}<span>WhatsApp</span></button>
        <button type="button" data-act="email">${ICONS.email}<span>Email</span></button>
        <button type="button" data-act="call">${ICONS.call}<span>Call</span></button>
        <button type="button" data-act="copy">${ICONS.copy}<span>Copy</span></button>
      </div>
      ${field('name', 'Business', raw.name || '')}
      ${field('contactName', 'Contact', p.contact?.name || '', { placeholder: 'Contact’s name' })}
      ${field('phone', 'Phone', core.phoneOf(p), { type: 'tel' })}
      ${field('email', 'Email', p.contact?.email || '', { type: 'email' })}
      ${field('address', 'Address', profile.address || raw.location || '')}
      <label class="v2-field"><span>Category</span><select data-f="category">${categoryOptions}</select></label>`);

    setSection('#v2dPrices', pricePreviewHtml(p));

    const site = P.siteUrl(p);
    const website = site || p.importedSite?.url || p.contact?.existingWebsite || '';
    setSection('#v2dLinks', `
      <h2>Links</h2>
      ${field('facebookUrl', 'Facebook', p.contact?.facebookUrl || '', { placeholder: 'facebook.com/…', open: httpLink(p.contact?.facebookUrl) })}
      ${field('googleUrl', 'Google', p.contact?.googleUrl || profile.mapsUrl || '', { placeholder: 'Google Maps link', open: httpLink(p.contact?.googleUrl || profile.mapsUrl) })}
      <div class="v2-field has-open"><span>Website</span>
        <span class="v2-field-value">${website ? esc(website.replace(/^https?:\/\//, '')) : '<i>Not live yet</i>'}</span>
        ${website ? `<button type="button" class="v2-open" data-open="${esc(website)}" data-owner="${site ? '1' : ''}" title="Open">${ICONS.open}</button>` : ''}
      </div>
      <div class="v2-field"><span>Domain</span>
        <button type="button" class="v2-link v2-field-value" data-act="domain">${p.customDomain ? esc(p.customDomain) : 'Connect a domain'}</button>
      </div>`);

    const views = core.state.views?.[p.slug];
    const created = P.relativeDay(p.createdAt ? new Date(p.createdAt).getTime() : null, now);
    const last = ['waiting', 'followup'].includes(stage) || p.lastContactedAt ? P.lastContactAt(p) : null;
    const rows = [
      ['Status', `<span class="v2-chip tone-${P.card(p, now).tone}">${esc(stage === 'client' ? `Client · ${P.PAYMENT_LABELS[P.paymentState(p)]}` : P.STAGE_LABELS[stage])}</span>`],
      ['Created', esc(created ? created[0].toUpperCase() + created.slice(1) : '—')],
      ['Last contacted', last ? esc(`${p.lastContactKind === 'follow_up' ? 'Followed up' : 'Messaged'} ${P.relativeDay(last, now)}`) : 'Not yet'],
      views ? ['Demo', esc(core.viewsText(views))] : null,
      stage === 'client' ? ['Plan', esc(core.planSummary(p.plan) || (p.price ? `£${String(p.price).replace(/^£/, '')}/mo` : 'No plan yet'))] : null
    ].filter(Boolean);
    setSection('#v2dInfo', `<h2>Details</h2><dl class="v2-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`);

    setSection('#v2dNotes', `<h2>Notes</h2><textarea class="v2-notes" data-f="notes" placeholder="Calls, what they said, what’s next…">${esc(p.notes || '')}</textarea>`);

    const tasks = P.sortTasks(tasksFor(p.slug));
    const today = P.todayKey(now);
    setSection('#v2dTasks', `
      <h2>Tasks${tasks.filter(t => !t.done).length ? ` <b class="v2-count">${tasks.filter(t => !t.done).length}</b>` : ''}</h2>
      <div class="v2-mini-tasks">${tasks.filter(t => !t.done || t.doneAt > new Date(now - 7 * P.DAY_MS).toISOString()).map(t => taskRow({ ...t, slug: p.slug }, today, true)).join('') || '<p class="v2-empty">No tasks for this business.</p>'}</div>
      <form class="v2-mini-add" data-form="profile-task" autocomplete="off">
        <input name="text" placeholder="Add a task…" required><input name="due" type="date" title="Due date"><button type="submit" class="v2-btn">Add</button>
      </form>`);
  }

  function writeField(key, value) {
    const p = current();
    if (!p || p.slug !== v2.slug) return;
    const profile = p.raw?.businessProfile || {};
    const contact = patch => { p.contact = { ...(p.contact || {}), ...patch }; };
    switch (key) {
      case 'name': core.setRaw({ name: value }); break;
      case 'category': core.setRaw({ tagline: value }); break;
      case 'phone': core.setRaw({ businessProfile: { ...profile, phone: value } }); break;
      case 'address': core.setRaw({ location: value, businessProfile: { ...profile, address: value } }); break;
      case 'contactName': contact({ name: value }); break;
      case 'email': contact({ email: value }); break;
      case 'facebookUrl': contact({ facebookUrl: value }); break;
      case 'googleUrl': contact({ googleUrl: value }); break;
      case 'notes': p.notes = value; break;
      default: return;
    }
    core.scheduleSave();
    if (key === 'name') {
      $('#v2ProfileHead h1').textContent = value || 'Untitled business';
      $('#v2EditTitle').textContent = value;
    }
  }
  const details = $('#v2Details');
  details.addEventListener('input', e => { if (e.target.dataset.f) writeField(e.target.dataset.f, e.target.value); });
  details.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.dataset.f) writeField(e.target.dataset.f, e.target.value); });
  details.addEventListener('focusout', () => setTimeout(() => { if (!details.contains(document.activeElement)) render(); }, 0));

  // ---- contacting ----
  function contactKind(p) {
    const stage = P.stageOf(p);
    return stage === 'waiting' || stage === 'followup' ? 'followup' : stage === 'lead' || stage === 'ready' ? 'send' : 'hello';
  }
  // Opens WhatsApp / email / a call; false if the detail it needs is missing.
  function reachOut(how, p = current(), kind = contactKind(p)) {
    const phone = core.phoneOf(p);
    const email = String(p.contact?.email || '').trim();
    if (how === 'whatsapp') {
      const number = core.toWhatsAppNumber(phone);
      if (!number) return core.notify('Add a phone number first.', { sticky: false }), false;
      core.openExternal(`https://wa.me/${number}?text=${encodeURIComponent(P.message(p, kind))}`);
    } else if (how === 'email') {
      if (!/^[^\s@]+@[^\s@]+$/.test(email)) return core.notify('Add an email address first.', { sticky: false }), false;
      core.openExternal(`mailto:${email}?subject=${encodeURIComponent(P.subject(p, kind))}&body=${encodeURIComponent(P.message(p, kind))}`);
    } else if (how === 'call') {
      const digits = phone.replace(/[^\d+]/g, '');
      if (!digits) return core.notify('Add a phone number first.', { sticky: false }), false;
      core.openExternal(`tel:${digits}`);
    }
    return true;
  }
  async function copyText(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      core.notify(done);
    } catch {
      core.notify(text, { sticky: true });
    }
  }

  // "Send website" (Website ready) and "Follow up": each way of reaching
  // them also records the contact, which moves the card on and restarts
  // the two-day clock. "Mark as …" is for a call or a chat in person.
  function openContactMenu(anchor, kind) {
    const p = current();
    const phone = core.phoneOf(p);
    const email = String(p.contact?.email || '').trim();
    const link = P.siteUrl(p);
    const done = () => (kind === 'send' ? markContacted(current()) : markFollowedUp(current()));
    const items = [];
    if (kind === 'send' && !link) {
      items.push({ note: 'Not live yet — make it live so they can open the link.' }, { label: 'Make live', act: () => $('#deployBtn').click() }, 'sep');
    }
    items.push(
      { label: 'WhatsApp', hint: phone || 'No phone number', disabled: !phone, act: () => reachOut('whatsapp', p, kind) && done() },
      { label: 'Email', hint: email || 'No email address', disabled: !email, act: () => reachOut('email', p, kind) && done() }
    );
    if (kind === 'followup') items.push({ label: 'Call', hint: phone || 'No phone number', disabled: !phone, act: () => reachOut('call', p, kind) && done() });
    if (link) items.push({ label: 'Copy website link', hint: link.replace(/^https?:\/\//, ''), act: () => copyText(link, 'Website link copied.').then(done) });
    items.push('sep', { label: kind === 'send' ? 'Mark as contacted' : 'Mark as followed up', primary: true, act: done });
    openMenu(anchor, items, kind === 'send' ? 'Send website' : 'Follow up');
  }

  const MOVE_TARGETS = ['lead', 'ready', 'waiting', 'followup', 'client', 'archived'];
  function openMoveMenu(anchor, p = current()) {
    const stage = P.stageOf(p);
    const items = MOVE_TARGETS.filter(t => t !== stage).map(t => ({
      label: t === 'client' ? 'Client' : P.STAGE_LABELS[t],
      hint: t === 'client' ? 'Awaiting payment until Stripe shows it' : t === 'followup' ? 'Due now' : t === 'waiting' ? 'Follow up in 2 days' : '',
      act: () => moveBusiness(p.slug, t)
    }));
    items.push('sep', { label: 'Delete business…', danger: true, act: () => deleteBusiness(p) });
    openMenu(anchor, items, 'Move to');
  }

  async function deleteBusiness(p) {
    if (v2.editing) setEditing(false);
    await core.deleteProject(p.slug, nameOf(p));
    if (!current()) showView('pipeline');
  }

  // Every [data-act] in the profile (header, alert, details, banner, editor bar).
  $('#v2ProfileView').addEventListener('click', async e => {
    const open = e.target.closest('[data-open]');
    if (open) return core.openExternal(open.dataset.owner ? core.ownerUrl(open.dataset.open) : open.dataset.open);
    const btn = e.target.closest('[data-act]');
    const p = current();
    if (!btn || !p) return;
    switch (btn.dataset.act) {
      case 'back': return leaveProfile();
      case 'build': {
        const input = $('#v2BuildLink');
        if (input?.value.trim()) return runBuild();
        return input ? input.focus() : setEditing(true);
      }
      case 'mark-built': return markBuilt(p);
      case 'send': return openContactMenu(btn, 'send');
      case 'followup': return openContactMenu(btn, 'followup');
      case 'move': return openMoveMenu(btn);
      case 'reopen': return moveBusiness(p.slug, P.websiteBuilt(p) ? 'ready' : 'lead');
      case 'plan': return core.openPlanDialog(p.slug);
      case 'pay': return core.openPayDialog(p.slug);
      case 'domain': return core.openDomainDialog(p.slug);
      case 'stripe': return core.openExternal(P.stripeUrl(p));
      case 'make-live': return $('#deployBtn').click();
      case 'mark-paid': await core.markPaid(p.slug, btn); return render();
      case 'whatsapp': case 'email': case 'call': return reachOut(btn.dataset.act, p);
      case 'copy': return copyText(P.contactCard(p), 'Contact details copied.');
      case 'prices': return openPriceList();
      case 'edit': return setEditing(true);
      case 'edit-done': return setEditing(false);
      case 'site-more': return openPersistentMenu(siteMenu, btn);
    }
  });
  // V1's plan / payment link / domain dialogs change the record; redraw once they close.
  ['#planDialog', '#payDialog', '#domainDialog', '#confirmDialog'].forEach(sel => $(sel).addEventListener('close', render));

  // ---------------- the website: V1's preview + builder ----------------
  // The profile shows V1's preview big, with the most useful actions; the
  // full builder (V1's editor, every control) opens with "Edit website" as a
  // full-window editor: fields under the desktop preview, or beside the
  // phone in mobile view.
  const site = $('#v2Site');
  const actions = $('.preview-actions', site);
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.id = 'v2EditBtn';
  editBtn.className = 'v2-edit-site';
  editBtn.dataset.act = 'edit';
  editBtn.innerHTML = `${ICONS.pencil}Edit website`;
  actions.insertBefore(editBtn, $('#deployBtn'));
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'icon-only v2-site-more';
  moreBtn.dataset.act = 'site-more';
  moreBtn.title = 'More';
  moreBtn.setAttribute('aria-label', 'More website actions');
  moreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  actions.insertBefore(moreBtn, $('#closePreviewBtn'));
  $('#editTextBtn').title = 'Edit text and photos right on the page';

  // Less-used website actions move into the ⋯ menu. They're V1's own
  // buttons, so they keep V1's behaviour (and V1 still shows/hides them).
  const siteMenu = document.createElement('div');
  siteMenu.className = 'v2-menu v2-site-menu';
  siteMenu.dataset.persistent = '1';
  siteMenu.hidden = true;
  const label = (btn, text) => { btn.insertAdjacentHTML('beforeend', `<span>${text}</span>`); return btn; };
  const domainBtn = document.createElement('button');
  domainBtn.type = 'button';
  domainBtn.innerHTML = '<span>Connect a domain…</span>';
  domainBtn.onclick = () => current() && core.openDomainDialog(current().slug);
  siteMenu.append(label($('#copyLiveBtn'), 'Copy website link'), label($('#exportBtn'), 'Export folder'), domainBtn, $('#offlineBtn'));
  siteMenu.addEventListener('click', e => { if (e.target.closest('button')) closeMenu(); });
  document.body.append(siteMenu);

  // ---- the compact editor ----
  // V1 redraws its whole editor (#editor innerHTML) after every import,
  // upload, AI edit and undo. Each time, the fresh markup is rearranged
  // here: the same V1 elements (same ids, same handlers) moved into a
  // two-column grid, and the big Logo / Hero / Gallery boxes folded into a
  // tray behind three small thumbnail cards. Nothing is re-implemented,
  // so every V1 control keeps working exactly as before.
  const editorEl = $('#editor');
  const mediaUrl = path => `/projects/${current().slug}/${path}`;
  const sectionLabel = text => Object.assign(document.createElement('div'), { className: 'v2-ed-label', textContent: text });

  function compactEditor() {
    const p = current();
    if (!p || !$('#f_name', editorEl) || $('.v2-ed-grid', editorEl)) return;
    const fieldOf = id => $(`#${id}`, editorEl)?.closest('.field');

    const source = $('.link-bar.compact', editorEl) || $('.imported-site', editorEl);
    source?.before(sectionLabel('Source'));
    if ($('#importBtn')) $('#f_link').placeholder = 'Facebook or Google Maps link…';

    // Two fields per row; WhatsApp / Email sit inside their own fields.
    const phone = fieldOf('f_phone');
    const email = fieldOf('f_email');
    phone.classList.add('v2-has-btn');
    email.classList.add('v2-has-btn');
    phone.append($('#whatsappBtn', editorEl));
    email.append($('#emailBtn', editorEl));
    $('#f_contactName', editorEl).placeholder = '';
    const nameRow = $('.form-grid.name-row', editorEl);
    const grid = document.createElement('div');
    grid.className = 'v2-ed-grid';
    grid.append(fieldOf('f_name'), fieldOf('f_category'), fieldOf('f_contactName'), fieldOf('f_location'), phone, email);
    nameRow.replaceWith(sectionLabel('Business'), grid);
    $('.phone-row', editorEl).remove();
    const count = PL.counts(p.priceList).services;
    const prices = document.createElement('button');
    prices.type = 'button';
    prices.className = 'v2-ed-prices';
    prices.dataset.act = 'prices';
    prices.innerHTML = `<span>Prices &amp; services</span><b>${count ? esc(PL.summary(p.priceList)) : 'Add prices'}</b><i aria-hidden="true">›</i>`;
    grid.after(prices);

    const row = $('.media-row-3', editorEl);
    if (row) {
      const cards = document.createElement('div');
      cards.className = 'v2-media-cards';
      cards.innerHTML = mediaCardsHtml(p);
      row.before(sectionLabel('Media'), cards);
      cards.after(row);
      row.classList.add('v2-media-tray');
      cards.onclick = e => {
        const card = e.target.closest('[data-media]');
        if (card) setMediaOpen(v2.mediaOpen === card.dataset.media ? null : card.dataset.media);
      };
      if (v2.mediaFor !== p.slug) { v2.mediaFor = p.slug; v2.mediaOpen = null; }
      setMediaOpen(v2.mediaOpen);
    }

    // Edit with AI: one line, growing only when there's more to say.
    const ai = $('#aiInstruction', editorEl);
    if (ai) {
      ai.rows = 1;
      ai.placeholder = 'e.g. Make the about section warmer…';
    }
  }

  function mediaCardsHtml(p) {
    const raw = p.raw || {};
    const found = core.state.found || {};
    const suggestion = $('#placementSuggestion', editorEl);
    const card = (slot, label, inner, badge) => `
      <button type="button" class="v2-media-card${inner ? ' has-media' : ''} is-${slot}" data-media="${slot}" aria-expanded="false" title="${inner ? `${label} — change or remove` : `Add a ${label.toLowerCase()}`}">
        ${inner || `<span class="v2-media-empty">+ ${label}</span>`}
        ${inner ? `<span class="v2-media-name">${label}</span>` : ''}
        ${badge ? `<i class="v2-media-badge" title="${esc(badge)}">${esc(badge)}</i>` : ''}
      </button>`;
    const img = path => `<img src="${esc(mediaUrl(path))}" alt="" loading="lazy">`;
    const gallery = raw.gallery || [];
    const collage = gallery.length
      ? `<span class="v2-collage n-${Math.min(gallery.length, 3)}">${gallery.slice(0, 3).map(img).join('')}</span>`
      : '';
    return card('logo', 'Logo', raw.logoImage ? img(raw.logoImage) : '', !raw.logoImage && found.logo ? 'Found' : '')
      + card('hero', 'Hero', raw.heroImage ? img(raw.heroImage) : '', suggestion ? 'Suggestion' : !raw.heroImage && found.hero ? 'Found' : '')
      + card('gallery', gallery.length > 3 ? `Gallery · ${gallery.length}` : 'Gallery', collage, '');
  }

  function setMediaOpen(slot) {
    v2.mediaOpen = slot;
    const row = $('.v2-media-tray', editorEl);
    if (!row) return;
    if (slot) row.dataset.open = slot;
    else delete row.dataset.open;
    $$('.v2-media-card', editorEl).forEach(c => {
      const on = c.dataset.media === slot;
      c.classList.toggle('is-open', on);
      c.setAttribute('aria-expanded', String(on));
    });
  }

  new MutationObserver(compactEditor).observe(editorEl, { childList: true });

  // ---- editor width: drag the divider, or collapse it away ----
  const EDITOR_MIN = 340;
  const EDITOR_MAX = 640;
  const layoutEl = $('.layout', site);
  const divider = document.createElement('div');
  divider.className = 'v2-ed-divider';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-label', 'Resize the editor');
  divider.tabIndex = 0;
  divider.innerHTML = '<button type="button" class="v2-ed-collapse" title="Hide the editor" aria-label="Hide the editor"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>';
  layoutEl.append(divider);
  const readWidth = () => {
    try { return Number(localStorage.getItem('v2EditorWidth')) || 392; } catch { return 392; }
  };
  const clampWidth = w => Math.round(Math.max(EDITOR_MIN, Math.min(EDITOR_MAX, layoutEl.clientWidth * 0.6 || EDITOR_MAX, w)));
  function setEditorWidth(w, remember) {
    v2.editorWidth = clampWidth(w);
    site.style.setProperty('--v2-ed-w', `${v2.editorWidth}px`);
    if (remember) try { localStorage.setItem('v2EditorWidth', String(v2.editorWidth)); } catch { /* per-computer nicety */ }
  }
  function setCollapsed(on) {
    v2.editorCollapsed = on;
    site.classList.toggle('ed-collapsed', on);
    const btn = $('.v2-ed-collapse', divider);
    btn.title = on ? 'Show the editor' : 'Hide the editor';
    btn.setAttribute('aria-label', btn.title);
  }
  site.style.setProperty('--v2-ed-w', `${readWidth()}px`);
  $('.v2-ed-collapse', divider).onclick = () => setCollapsed(!v2.editorCollapsed);
  divider.addEventListener('pointerdown', e => {
    if (e.button !== 0 || v2.editorCollapsed || e.target.closest('.v2-ed-collapse')) return;
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    site.classList.add('is-resizing');
    const left = layoutEl.getBoundingClientRect().left;
    const move = ev => setEditorWidth(ev.clientX - left, false);
    const up = () => {
      divider.removeEventListener('pointermove', move);
      site.classList.remove('is-resizing');
      setEditorWidth(v2.editorWidth || readWidth(), true);
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up, { once: true });
    divider.addEventListener('pointercancel', up, { once: true });
  });
  divider.addEventListener('keydown', e => {
    if (e.target !== divider || v2.editorCollapsed) return;
    const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!step) return;
    e.preventDefault();
    setEditorWidth((v2.editorWidth || $('#editor').offsetWidth) + step, true);
  });

  function setEditing(on) {
    if (v2.editing === on) return;
    v2.editing = on;
    closeMenu();
    site.classList.toggle('is-editing', on);
    document.body.classList.toggle('v2-is-editing', on);
    if (on) {
      setCollapsed(false);
      core.renderEditor();
      compactEditor();
    } else {
      if (core.state.editingText) $('#editTextBtn').click();
      if (core.state.appFullscreen) $('#fullscreenBtn').click();
      core.flushSave();
      v2.detailsFor = null;
      render();
    }
    syncViewport();
  }

  function syncViewport() {
    site.classList.toggle('vp-mobile', core.state.viewport === 'mobile');
    requestAnimationFrame(() => core.fitPreviewFrame());
  }
  $('#viewportToggle').addEventListener('click', syncViewport);
  $('#fullscreenBtn').addEventListener('click', syncViewport);
  new ResizeObserver(() => core.fitPreviewFrame()).observe($('#previewFrameWrap'));

  // Escape leaves the editor — but not when it's closing something else
  // first (full screen, a dialog or a menu). Capture phase, so this sees the
  // state before V1's own Escape handler changes it.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menuEl) { closeMenu(); return; }
    if (pl.open) { e.stopPropagation(); closePriceList(); return; }
    if (v2.editing && !core.state.appFullscreen && !document.querySelector('dialog[open]') && !$('#notifPanel:not([hidden])')) setEditing(false);
  }, true);

  // ---------------- price list ----------------
  // Sections of services (service, price, time) stored on the business
  // record as `priceList`, so it syncs with the record like tasks. Opened
  // from the profile's Prices panel or the editor's Prices button. Text
  // pasted from anywhere fills it in without AI (public/price-list.js); a
  // photo of their prices is read by Claude Code (lib/price-photo.js).
  // Every change saves by itself.
  const PL = window.PriceList;
  const pl = { open: false, slug: null, list: null, timer: null, undo: null, dragFrom: null };
  const plModal = document.createElement('div');
  plModal.className = 'v2-modal';
  plModal.hidden = true;
  document.body.append(plModal);

  function pricePreviewHtml(p) {
    const list = PL.clean(p.priceList);
    const c = PL.counts(list);
    if (!c.services) {
      return `<h2>Prices</h2><p class="v2-pl-empty">Add their services and prices — paste them from anywhere, type them, or read them from a photo.</p>
        <button type="button" class="v2-btn v2-pl-open" data-act="prices">Add prices</button>`;
    }
    const rows = list.sections.flatMap(s => [s.title ? { head: s.title } : null, ...s.items.map(it => ({ it }))]).filter(Boolean).slice(0, 7);
    return `<h2>Prices <b class="v2-count">${c.services}</b><button type="button" class="v2-link v2-h2-act" data-act="prices">Edit</button></h2>
      <div class="v2-pl-mini">${rows.map(r => (r.head ? `<div class="v2-pl-mini-head">${esc(r.head)}</div>`
        : `<div class="v2-pl-mini-row"><span>${esc(r.it.service)}</span><b>${esc(r.it.price)}</b>${r.it.time ? `<i>${esc(r.it.time)}</i>` : ''}</div>`)).join('')}</div>
      <button type="button" class="v2-link v2-pl-more" data-act="prices">${esc(PL.summary(list))} · Open price list ›</button>`;
  }

  function openPriceList() {
    const p = current();
    if (!p) return;
    closeMenu();
    Object.assign(pl, { open: true, slug: p.slug, list: PL.clean(p.priceList), undo: null });
    if (!pl.list.sections.length) pl.list.sections.push({ title: '', items: [{ service: '', price: '', time: '' }] });
    plModal.hidden = false;
    renderPriceModal();
    setPriceStatus('');
    requestAnimationFrame(() => $('.v2-pl-body input', plModal)?.focus());
  }

  async function closePriceList() {
    if (!pl.open) return;
    await flushPriceSave();
    pl.open = false;
    plModal.hidden = true;
    render();
  }

  const blankRow = () => ({ service: '', price: '', time: '' });
  function renderPriceModal() {
    const p = project(pl.slug) || current();
    const btn = (act, label, title, cls = '') => `<button type="button" class="v2-pl-icon ${cls}" data-pl="${act}" title="${title}" aria-label="${title}">${label}</button>`;
    const scrollTop = $('.v2-pl-body', plModal)?.scrollTop || 0;
    plModal.innerHTML = `
      <div class="v2-modal-card" role="dialog" aria-modal="true" aria-label="Prices and services">
        <header class="v2-pl-top">
          <div class="v2-pl-title"><h2>Prices &amp; services</h2><p>${esc(nameOf(p) || '')} · <span id="v2PlSaved">Saves automatically</span></p></div>
          <div class="v2-pl-tools">
            <button type="button" class="v2-btn" data-pl="paste">Paste a list</button>
            <button type="button" class="v2-btn" data-pl="photo">Read a photo</button>
            <button type="button" class="v2-btn primary" data-pl="close">Done</button>
          </div>
          <input type="file" accept="image/*" id="v2PlPhoto" hidden>
        </header>
        <div class="v2-pl-paste" id="v2PlPaste" hidden>
          <textarea id="v2PlPasteText" placeholder="Paste their prices here — from a website, Facebook, a PDF or a spreadsheet. Headings become sections; prices and times are picked out by themselves." spellcheck="false"></textarea>
          <div class="v2-pl-paste-foot"><span id="v2PlPastePreview">Nothing pasted yet.</span>
            <button type="button" class="v2-btn ghost" data-pl="paste-cancel">Cancel</button>
            <button type="button" class="v2-btn" data-pl="paste-replace" disabled>Replace list</button>
            <button type="button" class="v2-btn primary" data-pl="paste-add" disabled>Add to list</button></div>
        </div>
        <div class="v2-pl-status" id="v2PlStatus" hidden></div>
        <div class="v2-pl-body">
          <div class="v2-pl-cols"><span></span><span>Service</span><span>Price</span><span>Time</span><span></span></div>
          ${pl.list.sections.map((s, si) => `
          <section class="v2-pl-sec" data-s="${si}">
            <div class="v2-pl-sec-head">
              <span class="v2-pl-grip" title="Drag to move this section" aria-hidden="true">⋮⋮</span>
              <input data-k="title" value="${esc(s.title)}" placeholder="Section title — e.g. Hair, Nails, Menu" aria-label="Section title">
              ${btn('sec-up', '↑', 'Move section up', si === 0 ? 'is-off' : '')}${btn('sec-down', '↓', 'Move section down', si === pl.list.sections.length - 1 ? 'is-off' : '')}${btn('sec-del', '✕', 'Delete section', 'is-del')}
            </div>
            ${s.items.map((it, ri) => `
            <div class="v2-pl-row" data-r="${ri}">
              <span class="v2-pl-num">${ri + 1}</span>
              <input data-k="service" value="${esc(it.service)}" placeholder="Service" aria-label="Service">
              <input data-k="price" value="${esc(it.price)}" placeholder="£" aria-label="Price">
              <input data-k="time" value="${esc(it.time)}" placeholder="e.g. 30 mins" aria-label="Time">
              <span class="v2-pl-row-btns">${btn('row-up', '↑', 'Move up', ri === 0 ? 'is-off' : '')}${btn('row-down', '↓', 'Move down', ri === s.items.length - 1 ? 'is-off' : '')}${btn('row-del', '✕', 'Delete', 'is-del')}</span>
            </div>`).join('')}
            <button type="button" class="v2-link v2-pl-add-row" data-pl="add-row">+ Add service</button>
          </section>`).join('')}
          <button type="button" class="v2-btn v2-pl-add-sec" data-pl="add-sec">+ Add section</button>
          <p class="v2-pl-tip">Tip: paste several lines into any box and they’re sorted into services, prices and times for you.</p>
        </div>
      </div>`;
    $('.v2-pl-body', plModal).scrollTop = scrollTop;
  }

  function setPriceStatus(html, undoable = false) {
    const box = $('#v2PlStatus', plModal);
    if (!box) return;
    box.hidden = !html;
    box.innerHTML = html + (undoable && pl.undo ? ' <button type="button" class="v2-link" data-pl="undo">Undo</button>' : '');
  }

  // Saves a moment after typing stops; moves, deletes and bulk changes save at once.
  function schedulePriceSave(delay = 700) {
    clearTimeout(pl.timer);
    const saved = $('#v2PlSaved', plModal);
    if (saved) saved.textContent = 'Saving…';
    pl.timer = setTimeout(flushPriceSave, delay);
  }
  async function flushPriceSave() {
    if (!pl.timer) return;
    clearTimeout(pl.timer);
    pl.timer = null;
    try {
      await save(pl.slug, { priceList: PL.clean(pl.list) });
      const saved = $('#v2PlSaved', plModal);
      if (saved) saved.textContent = 'Saved';
    } catch (err) {
      const saved = $('#v2PlSaved', plModal);
      if (saved) saved.textContent = 'Not saved — will retry';
      core.notify(core.friendlyError(err.message), { sticky: false });
      schedulePriceSave(4000);
    }
  }

  // A bulk change (paste, photo, replace) keeps the list before it for Undo.
  function bulkChange(list, message) {
    pl.undo = PL.clean(pl.list);
    pl.list = list;
    if (!pl.list.sections.length) pl.list.sections.push({ title: '', items: [blankRow()] });
    renderPriceModal();
    schedulePriceSave(0);
    setPriceStatus(message, true);
  }
  const withoutBlank = list => ({ sections: PL.clean(list).sections });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function pastePreview() {
    const parsed = PL.parse($('#v2PlPasteText', plModal).value);
    const c = PL.counts(parsed);
    $('#v2PlPastePreview', plModal).textContent = c.services
      ? `Found ${plural(c.services, 'service')}${c.sections > 1 || parsed.sections[0]?.title ? ` in ${plural(c.sections, 'section')}` : ''}${parsed.sections.some(s => s.items.some(i => !i.price)) ? ' — some without a price' : ''}.`
      : 'Nothing found yet — each service on its own line works best.';
    $$('[data-pl="paste-add"], [data-pl="paste-replace"]', plModal).forEach(b => { b.disabled = !c.services; });
    return parsed;
  }

  async function readPricePhoto(file) {
    if (!file) return;
    const slug = pl.slug;
    setPriceStatus('<span class="status-spinner"></span> Reading the photo with AI — this can take up to a minute…');
    $$('[data-pl="photo"]', plModal).forEach(b => { b.disabled = true; });
    try {
      const res = await fetch(`/api/v2/projects/${encodeURIComponent(slug)}/price-photo`, { method: 'POST', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Couldn’t read the photo (${res.status}).`);
      if (!pl.open || pl.slug !== slug) return;
      const got = PL.counts(data.priceList).services;
      const existing = withoutBlank(pl.list);
      bulkChange(existing.sections.length ? { sections: [...existing.sections, ...data.priceList.sections] } : data.priceList,
        `Added ${plural(got, 'service')} from the photo and saved — check them over.`);
    } catch (err) {
      if (pl.open) setPriceStatus(esc(err.message));
    } finally {
      $$('[data-pl="photo"]', plModal).forEach(b => { b.disabled = false; });
    }
  }

  plModal.addEventListener('click', e => {
    if (e.target === plModal) return closePriceList();
    const b = e.target.closest('[data-pl]');
    if (!b || b.disabled || b.classList.contains('is-off')) return;
    const sec = b.closest('[data-s]');
    const si = sec ? Number(sec.dataset.s) : -1;
    const ri = b.closest('[data-r]') ? Number(b.closest('[data-r]').dataset.r) : -1;
    const secs = pl.list.sections;
    const swap = (arr, a, c) => { [arr[a], arr[c]] = [arr[c], arr[a]]; };
    const structural = () => { renderPriceModal(); schedulePriceSave(150); };
    switch (b.dataset.pl) {
      case 'close': return closePriceList();
      case 'paste': {
        const box = $('#v2PlPaste', plModal);
        box.hidden = !box.hidden;
        if (!box.hidden) $('#v2PlPasteText', plModal).focus();
        return;
      }
      case 'paste-cancel': $('#v2PlPaste', plModal).hidden = true; return;
      case 'paste-add': case 'paste-replace': {
        const parsed = pastePreview();
        const n = PL.counts(parsed).services;
        const existing = withoutBlank(pl.list);
        const replace = b.dataset.pl === 'paste-replace';
        bulkChange(replace ? parsed : { sections: [...existing.sections, ...parsed.sections] }, `${replace ? 'Replaced the list with' : 'Added'} ${plural(n, 'service')} from your paste.`);
        return;
      }
      case 'photo': return $('#v2PlPhoto', plModal).click();
      case 'undo':
        if (pl.undo) { const back = pl.undo; pl.undo = null; pl.list = back.sections.length ? back : { sections: [{ title: '', items: [blankRow()] }] }; renderPriceModal(); schedulePriceSave(0); setPriceStatus('Undone.'); }
        return;
      case 'add-sec':
        secs.push({ title: '', items: [blankRow()] });
        renderPriceModal();
        $$('.v2-pl-sec', plModal).pop()?.querySelector('input')?.focus();
        return schedulePriceSave(150);
      case 'add-row': {
        secs[si].items.push(blankRow());
        renderPriceModal();
        const rows = $$(`.v2-pl-sec[data-s="${si}"] .v2-pl-row`, plModal);
        rows[rows.length - 1]?.querySelector('input')?.focus();
        return schedulePriceSave(150);
      }
      case 'sec-up': swap(secs, si, si - 1); return structural();
      case 'sec-down': swap(secs, si, si + 1); return structural();
      case 'sec-del': {
        const s = secs[si];
        const filled = s.items.filter(i => i.service || i.price).length;
        if (filled && !confirm(`Delete “${s.title || 'this section'}” and its ${plural(filled, 'service')}?`)) return;
        secs.splice(si, 1);
        if (!secs.length) secs.push({ title: '', items: [blankRow()] });
        return structural();
      }
      case 'row-up': swap(secs[si].items, ri, ri - 1); return structural();
      case 'row-down': swap(secs[si].items, ri, ri + 1); return structural();
      case 'row-del':
        secs[si].items.splice(ri, 1);
        if (!secs[si].items.length) secs[si].items.push(blankRow());
        return structural();
    }
  });

  plModal.addEventListener('input', e => {
    if (e.target.id === 'v2PlPasteText') return pastePreview();
    const k = e.target.dataset.k;
    const sec = e.target.closest('[data-s]');
    if (!k || !sec) return;
    const s = pl.list.sections[Number(sec.dataset.s)];
    if (k === 'title') s.title = e.target.value;
    else s.items[Number(e.target.closest('[data-r]').dataset.r)][k] = e.target.value;
    schedulePriceSave();
  });
  plModal.addEventListener('change', e => { if (e.target.id === 'v2PlPhoto') { readPricePhoto(e.target.files[0]); e.target.value = ''; } });

  // Smart paste: several lines pasted into any box are sorted into
  // services (and sections, if it has headings) right where they land.
  plModal.addEventListener('paste', e => {
    const input = e.target.closest('.v2-pl-body input');
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!input || !/[\n\t]/.test(text.trim())) return;
    const parsed = PL.parse(text);
    const n = PL.counts(parsed).services;
    if (!n) return;
    e.preventDefault();
    const si = Number(input.closest('[data-s]').dataset.s);
    const ri = input.closest('[data-r]') ? Number(input.closest('[data-r]').dataset.r) : -1;
    // An exact copy (blank rows kept), so the row indexes still line up.
    const secs = JSON.parse(JSON.stringify(pl.list.sections));
    const target = secs[si];
    const isBlank = it => !it.service && !it.price && !it.time;
    const blankAt = ri >= 0 && isBlank(target.items[ri]);
    const targetEmpty = !target.title && target.items.every(isBlank);
    const [first, ...others] = parsed.sections;
    if (!first.title || targetEmpty) {
      // Untitled lines join this section after the row pasted into (a
      // titled first block names an empty section).
      if (first.title && !target.title) target.title = first.title;
      target.items.splice(ri >= 0 ? ri + 1 : target.items.length, 0, ...first.items);
      secs.splice(secs.indexOf(target) + 1, 0, ...others);
    } else {
      secs.splice(secs.indexOf(target) + 1, 0, ...parsed.sections);
    }
    // A blank row the paste landed in is replaced rather than left behind.
    if (blankAt) target.items.splice(ri, 1);
    if (!target.title && !target.items.length) secs.splice(secs.indexOf(target), 1);
    bulkChange({ sections: secs }, `Filled in ${plural(n, 'service')} from your paste.`);
  });

  // Drag a section by its ⋮⋮ grip to reorder.
  plModal.addEventListener('mousedown', e => {
    const grip = e.target.closest('.v2-pl-grip');
    if (grip) grip.closest('.v2-pl-sec').draggable = true;
  });
  plModal.addEventListener('dragstart', e => {
    const sec = e.target.closest?.('.v2-pl-sec');
    if (!sec) return;
    pl.dragFrom = Number(sec.dataset.s);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pl.dragFrom));
    requestAnimationFrame(() => sec.classList.add('is-dragging'));
  });
  plModal.addEventListener('dragover', e => {
    const sec = pl.dragFrom !== null && e.target.closest('.v2-pl-sec');
    if (!sec) return;
    e.preventDefault();
    const after = e.clientY > sec.getBoundingClientRect().top + sec.offsetHeight / 2;
    $$('.v2-pl-sec', plModal).forEach(n => n.classList.remove('drop-before', 'drop-after'));
    sec.classList.add(after ? 'drop-after' : 'drop-before');
  });
  plModal.addEventListener('drop', e => {
    const sec = pl.dragFrom !== null && e.target.closest('.v2-pl-sec');
    if (!sec) return;
    e.preventDefault();
    const to = Number(sec.dataset.s) + (sec.classList.contains('drop-after') ? 1 : 0);
    const [moved] = pl.list.sections.splice(pl.dragFrom, 1);
    pl.list.sections.splice(to > pl.dragFrom ? to - 1 : to, 0, moved);
    pl.dragFrom = null;
    renderPriceModal();
    schedulePriceSave(150);
  });
  plModal.addEventListener('dragend', () => {
    pl.dragFrom = null;
    $$('.v2-pl-sec', plModal).forEach(n => { n.draggable = false; n.classList.remove('is-dragging', 'drop-before', 'drop-after'); });
  });

  // ---------------- tasks ----------------
  // Linked tasks live on their business's record (so they sync with it);
  // the rest in this computer's tasks file (see lib/tasks.js).
  const tasksFor = slug => (slug ? ((current()?.slug === slug ? current() : project(slug))?.tasks || []) : v2.localTasks);
  function allTasks() {
    return [
      ...v2.localTasks.map(t => ({ ...t, slug: '' })),
      ...core.state.projects.flatMap(p => (tasksFor(p.slug) || []).map(t => ({ ...t, slug: p.slug })))
    ];
  }
  async function saveTaskList(slug, list) {
    const clean = list.map(P.cleanTask);
    if (slug) await save(slug, { tasks: clean });
    else v2.localTasks = await core.api('/api/v2/tasks', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(clean) });
    render();
  }
  const taskError = err => core.notify(core.friendlyError(err.message), { sticky: false });
  const addTask = (slug, fields) => saveTaskList(slug, [...tasksFor(slug), P.newTask(fields)]).catch(taskError);
  const updateTask = (slug, id, patch) => saveTaskList(slug, tasksFor(slug).map(t => (t.id === id ? { ...t, ...patch } : t))).catch(taskError);
  const deleteTask = (slug, id) => saveTaskList(slug, tasksFor(slug).filter(t => t.id !== id)).catch(taskError);

  function taskRow(t, today, compact = false) {
    const p = t.slug ? project(t.slug) : null;
    const due = P.dueLabel(t, today);
    return `<div class="v2-task${t.done ? ' is-done' : ''}${P.isOverdue(t, today) ? ' is-overdue' : ''}" data-id="${esc(t.id)}" data-slug="${esc(t.slug || '')}">
      <label class="v2-check"><input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Done"></label>
      <span class="v2-task-text">${esc(t.text)}</span>
      ${!compact && p ? `<button type="button" class="v2-task-biz" data-biz="${esc(p.slug)}">${esc(nameOf(p))}</button>` : ''}
      ${due ? `<span class="v2-task-due">${esc(due)}</span>` : ''}
      ${!compact && t.type ? `<span class="v2-task-type">${esc(t.type)}</span>` : ''}
      <button type="button" class="v2-task-del" title="Delete task" aria-label="Delete task">✕</button>
    </div>`;
  }

  $('#v2TaskType').innerHTML = `<option value="">Type</option>` + P.TASK_TYPES.map(t => `<option>${t}</option>`).join('');
  function renderTasks() {
    const today = P.todayKey();
    const tasks = P.sortTasks(allTasks());
    const open = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    $('#v2TaskList').innerHTML = open.length ? open.map(t => taskRow(t, today)).join('')
      : '<p class="v2-empty v2-empty-big">Nothing to do. Add one-off jobs here — building, sending and follow-ups live in the Pipeline.</p>';
    const toggle = $('#v2DoneToggle');
    toggle.hidden = !done.length;
    toggle.textContent = `${v2.doneOpen ? 'Hide' : 'Show'} done (${done.length})`;
    $('#v2DoneList').hidden = !v2.doneOpen || !done.length;
    $('#v2DoneList').innerHTML = v2.doneOpen ? done.map(t => taskRow(t, today)).join('') : '';
    const select = $('#v2TaskBiz');
    if (document.activeElement !== select) {
      const chosen = select.value;
      const sorted = core.state.projects.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      select.innerHTML = '<option value="">No business</option>' + sorted.map(p => `<option value="${esc(p.slug)}">${esc(nameOf(p))}</option>`).join('');
      select.value = sorted.some(p => p.slug === chosen) ? chosen : '';
    }
  }
  $('#v2DoneToggle').onclick = () => { v2.doneOpen = !v2.doneOpen; renderTasks(); };
  $('#v2TaskForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    if (!String(data.text || '').trim()) return;
    await addTask(data.slug, { text: data.text, due: data.due, type: data.type });
    form.reset();
    form.elements.text.focus();
  });

  // ---------------- accounts (customer logins at account/login.html) ----------------
  let accountsCache = null;
  async function renderAccounts() {
    const mount = $('#v2Accounts');
    if (!accountsCache) {
      mount.innerHTML = '<p class="v2-empty v2-empty-big">Loading accounts…</p>';
      try {
        accountsCache = await (await fetch('/api/accounts')).json();
      } catch {
        accountsCache = { enabled: false, accounts: [] };
      }
    }
    if (v2.view !== 'accounts') return;
    if (!accountsCache.enabled) {
      mount.innerHTML = '<p class="v2-empty v2-empty-big">Accounts aren’t connected yet — add the Supabase service role key in Settings (⚙) to list customer logins here.</p>';
      return;
    }
    const accounts = accountsCache.accounts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    mount.innerHTML = accounts.length ? `<div class="v2-task-list">${accounts.map(accountRow).join('')}</div>`
      : '<p class="v2-empty v2-empty-big">No customer accounts yet.</p>';
  }
  function accountRow(a) {
    const sites = a.sites.length
      ? a.sites.map(s => `<button type="button" class="v2-task-biz" data-biz="${esc(s.slug)}">${esc(s.name || s.slug)}</button>`).join(' ')
      : '<span class="v2-task-type">No site designed yet</span>';
    return `<div class="v2-task">
      <span class="v2-task-text">${esc(a.email || a.id)}</span>
      ${sites}
      <span class="v2-task-due">${a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
    </div>`;
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('#v2Accounts [data-biz]');
    if (btn) openProfile(btn.dataset.biz);
  });

  document.addEventListener('submit', async e => {
    if (e.target.dataset.form !== 'profile-task') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!String(data.text || '').trim() || !current()) return;
    const slug = current().slug;
    e.target.reset();
    await addTask(slug, { text: data.text, due: data.due, type: 'Other' });
    requestAnimationFrame(() => $('[data-form="profile-task"] input[name="text"]')?.focus());
  });
  document.addEventListener('change', e => {
    const row = e.target.closest('.v2-task');
    if (!row || e.target.type !== 'checkbox') return;
    const done = e.target.checked;
    updateTask(row.dataset.slug, row.dataset.id, { done, doneAt: done ? new Date().toISOString() : '' });
  });
  document.addEventListener('click', e => {
    const row = e.target.closest('.v2-task');
    if (!row) return;
    if (e.target.closest('.v2-task-del')) return deleteTask(row.dataset.slug, row.dataset.id);
    const biz = e.target.closest('[data-biz]');
    if (biz) openProfile(biz.dataset.biz);
  });

  async function loadLocalTasks() {
    try { v2.localTasks = await core.api('/api/v2/tasks'); } catch { v2.localTasks = []; }
    render();
  }

  // ---------------- start ----------------
  // Stripe and live-site checks normally start when V1's Clients tab opens;
  // V2 shows clients on the main board, so run them once projects are in
  // (V1 repeats them every few minutes by itself).
  let firstLoad = true;
  document.addEventListener('studio:projects', () => {
    if (!firstLoad || !core.state.projectsLoaded) return;
    firstLoad = false;
    core.refreshBilling();
    core.recheckLiveSites();
  });
  loadLocalTasks();
  showView('pipeline');
})();
