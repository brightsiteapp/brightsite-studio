(() => {
  const state = {
    projects: [], current: null, found: {}, search: '',
    viewport: 'desktop', appFullscreen: false, desktopExpanded: true,
    tab: 'businesses', liveAdding: false, canDeploy: true, sideExpanded: null
  };

  const el = {
    builderView: document.getElementById('builderView'),
    liveView: document.getElementById('liveView'),
    liveTotals: document.getElementById('liveTotals'),
    liveList: document.getElementById('liveList'),
    projectList: document.getElementById('projectList'),
    projectSearch: document.getElementById('projectSearch'),
    editor: document.getElementById('editor'),
    preview: document.getElementById('preview'),
    previewFrameWrap: document.getElementById('previewFrameWrap'),
    viewportToggle: document.getElementById('viewportToggle'),
    desktopExpandIndicator: document.getElementById('desktopExpandIndicator'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    exportBtn: document.getElementById('exportBtn'),
    deployBtn: document.getElementById('deployBtn'),
    copyLiveBtn: document.getElementById('copyLiveBtn'),
    closePreviewBtn: document.getElementById('closePreviewBtn'),
    offlineBtn: document.getElementById('offlineBtn'),
    editTextBtn: document.getElementById('editTextBtn'),
    notice: document.getElementById('noticeStrip'),
    appVersion: document.getElementById('appVersion'),
    updateBtn: document.getElementById('updateBtn'),
    syncStatus: document.getElementById('syncStatus'),
    syncStatusText: document.getElementById('syncStatusText'),
    syncTooltipUrl: document.getElementById('syncTooltipUrl'),
    gearBtn: document.getElementById('gearBtn'),
    settingsDialog: document.getElementById('settingsDialog'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn')
  };

  async function api(path, opts) {
    const res = await fetch(path, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  // Build/Re-fetch/AI-edit/Deploy all depend on tools (Claude Code CLI,
  // Vercel CLI) that live on whoever's Mac is set up as "admin" — a
  // colleague without those installed would otherwise see a raw, technical
  // "claude-not-found"/"Vercel CLI not found, run npm install..." message.
  // Collapse that whole class of error into one plain sentence.
  function friendlyError(message) {
    const toolMissing = /claude-not-found|claude code cli|vercel-not-found|vercel cli not found/i.test(message || '');
    return toolMissing ? 'Only admin can update sites' : message;
  }

  // Shows a message in a status element and clears it again after a few
  // seconds, instead of leaving a stale error sitting there forever.
  function showTempStatus(target, message, ms = 4000) {
    target.textContent = message;
    clearTimeout(target._clearTimer);
    target._clearTimer = setTimeout(() => { if (target.textContent === message) target.textContent = ''; }, ms);
  }

  // Shared sync (see lib/supabase-sync.js) is entirely optional — when
  // it's not configured, "disabled" comes back and the indicator just
  // stays hidden, no visual change from before this feature existed.
  const SYNC_LABELS = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline — changes will sync later' };
  let syncEnabled = false;
  async function refreshSyncStatus() {
    try {
      const s = await api('/api/sync-status');
      syncEnabled = s.state !== 'disabled';
      if (s.state === 'disabled') { el.syncStatus.hidden = true; return; }
      el.syncStatus.hidden = false;
      el.syncStatus.className = `sync-status is-${s.state}`;
      el.syncStatusText.textContent = SYNC_LABELS[s.state] || s.state;
      el.syncTooltipUrl.textContent = s.projectUrl || '';
    } catch { /* status is best-effort, never block the app on it */ }
  }
  refreshSyncStatus();
  setInterval(refreshSyncStatus, 5000);

  // Live cross-device refresh: if someone else's edit (a colour, brand name,
  // etc.) lands in shared sync while this project is open here too, pull it
  // in without waiting for a manual reopen. Skipped whenever a field inside
  // the editor is focused, so it never clobbers text someone is mid-typing.
  async function refreshCurrentProjectIfChanged() {
    if (!syncEnabled || state.editingText) return;
    if (state.current && el.editor.contains(document.activeElement)) return;
    try {
      // /api/projects pulls remote and merges anything newer into local
      // storage as a side effect — reuse it so this never duplicates that
      // pull/merge logic, then just re-render from the now-fresh local copy.
      state.projects = await api('/api/projects');
      renderSidebar();
      if (!state.current) return;
      const row = state.projects.find(p => p.slug === state.current.slug);
      if (row && row.updatedAt !== state.current.updatedAt) {
        const prevError = state.current.deployError;
        replaceCurrent(await api(`/api/projects/${state.current.slug}`));
        if (state.current.deployError && state.current.deployError !== prevError) {
          notify(`Couldn’t go live: ${state.current.deployError}`, { sticky: false });
        }
        renderEditor();
        renderPreview({ seedDeployed: true });
        renderLiveActions();
      }
    } catch { /* best-effort — next tick tries again */ }
  }
  setInterval(refreshCurrentProjectIfChanged, 5000);

  let noticeTimer = null;
  function notify(text, opts = {}) {
    clearTimeout(noticeTimer);
    el.notice.textContent = text;
    el.notice.hidden = false;
    if (!opts.sticky) noticeTimer = setTimeout(() => (el.notice.hidden = true), 4500);
  }

  el.gearBtn.onclick = () => { el.settingsDialog.showModal(); refreshSignInStatus(); refreshPlacesStatus(); refreshServices(); };

  // Optional Google Places API key (lib/places.js) — saving tests it first.
  const placesStatus = document.getElementById('placesStatus');
  const placesBtn = document.getElementById('placesBtn');
  const placesForm = document.getElementById('placesForm');
  const placesInput = document.getElementById('placesKeyInput');
  const placesSaveBtn = document.getElementById('placesSaveBtn');
  let placesSet = false;
  function showPlaces(set) {
    placesSet = set;
    placesStatus.textContent = set ? 'Key saved ✓ — used for business search' : 'Not set — using the Maps website';
    placesStatus.classList.toggle('is-signed-in', set);
    placesBtn.textContent = set ? 'Remove' : 'Add key';
    placesBtn.classList.toggle('primary', !set);
    if (set) placesForm.hidden = true;
  }
  async function refreshPlacesStatus() {
    try { showPlaces((await api('/api/places-key')).set); } catch {}
  }
  const savePlacesKey = apiKey => api('/api/places-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
  });
  placesBtn.onclick = async () => {
    if (!placesSet) {
      placesForm.hidden = !placesForm.hidden;
      if (!placesForm.hidden) placesInput.focus();
      return;
    }
    placesBtn.disabled = true;
    try { showPlaces((await savePlacesKey('')).set); } catch (err) { placesStatus.textContent = err.message; }
    placesBtn.disabled = false;
  };
  placesSaveBtn.onclick = async () => {
    const key = placesInput.value.trim();
    if (!key) return;
    placesSaveBtn.disabled = true;
    placesStatus.textContent = 'Testing key with Google…';
    try {
      showPlaces((await savePlacesKey(key)).set);
      placesInput.value = '';
    } catch (err) {
      placesStatus.textContent = err.message;
      placesStatus.classList.remove('is-signed-in');
    }
    placesSaveBtn.disabled = false;
  };
  placesInput.addEventListener('keydown', e => { if (e.key === 'Enter') placesSaveBtn.click(); });
  el.closeSettingsBtn.onclick = () => el.settingsDialog.close();

  // Connected services: the Claude and Vercel CLIs (sign in through a
  // Terminal window, polled until it takes), the Stripe key, and shared
  // sync (built in, shown for information only).
  let services = {};
  let servicePoll = null;
  const serviceRows = () => [...el.settingsDialog.querySelectorAll('[data-service]')];
  const stripeForm = document.getElementById('stripeForm');
  const stripeInput = document.getElementById('stripeKeyInput');
  const accountsForm = document.getElementById('accountsForm');
  const accountsInput = document.getElementById('accountsKeyInput');
  // Setup strip under the top bar: which optional services this copy is
  // missing. None are required, so ✕ hides it for good.
  const SETUP_SERVICES = [['claude', 'Claude'], ['vercel', 'Vercel'], ['stripe', 'Stripe'], ['sync', 'Sync']];
  const setupStrip = document.getElementById('setupStrip');
  async function refreshSetupStrip() {
    let dismissed = false;
    try { dismissed = localStorage.getItem('setupStripHidden') === '1'; } catch {}
    if (dismissed) { setupStrip.hidden = true; return; }
    let s;
    try { s = await api('/api/connections'); } catch { return; }
    const done = SETUP_SERVICES.filter(([key]) => s[key]?.signedIn).length;
    setupStrip.hidden = done === SETUP_SERVICES.length;
    document.getElementById('setupStripText').innerHTML = `<b>Setup ${done}/${SETUP_SERVICES.length}</b>` +
      SETUP_SERVICES.map(([key, label]) => `<span class="${s[key]?.signedIn ? 'is-ok' : 'is-missing'}">${s[key]?.signedIn ? '✓' : '✗'} ${label}</span>`).join('');
  }
  document.getElementById('setupStripOpen').onclick = () => el.gearBtn.click();
  document.getElementById('setupStripClose').onclick = () => {
    try { localStorage.setItem('setupStripHidden', '1'); } catch {}
    setupStrip.hidden = true;
  };
  el.settingsDialog.addEventListener('close', refreshSetupStrip);
  refreshSetupStrip();

  async function refreshServices() {
    try { services = await api('/api/connections'); } catch { return; }
    for (const row of serviceRows()) {
      const target = row.dataset.service;
      const s = services[target] || {};
      if (s.signedIn) delete row.dataset.waiting;
      const status = row.querySelector('.account-status');
      if (!row.dataset.waiting) {
        status.textContent = s.installed === false ? 'Not installed on this computer'
          : s.signedIn ? `Connected ✓${s.account ? ` — ${s.account}` : ''}`
          : target === 'sync' ? (s.state === 'disabled' ? 'Not set up — this copy works on its own' : 'Can’t reach it right now — changes are saved locally')
          : 'Not connected';
      }
      status.classList.toggle('is-signed-in', Boolean(s.signedIn));
      const btn = row.querySelector('button');
      if (!btn) continue;
      btn.textContent = (target === 'stripe' || target === 'accounts') ? (s.signedIn ? 'Remove' : 'Add key') : (s.signedIn ? 'Sign out' : 'Sign in');
      btn.classList.toggle('primary', !s.signedIn);
      btn.disabled = s.installed === false;
    }
    if (services.stripe?.signedIn) stripeForm.hidden = true;
    if (services.accounts?.signedIn) accountsForm.hidden = true;
    if (!serviceRows().some(r => r.dataset.waiting)) { clearInterval(servicePoll); servicePoll = null; }
  }
  el.settingsDialog.addEventListener('click', async e => {
    const btn = e.target.closest('[data-service] button');
    if (!btn) return;
    const row = btn.closest('[data-service]');
    const target = row.dataset.service;
    const label = row.querySelector('b').textContent;
    const status = row.querySelector('.account-status');
    const connected = Boolean(services[target]?.signedIn);
    if (target === 'stripe' && !connected) {
      stripeForm.hidden = !stripeForm.hidden;
      if (!stripeForm.hidden) stripeInput.focus();
      return;
    }
    if (target === 'accounts' && !connected) {
      accountsForm.hidden = !accountsForm.hidden;
      if (!accountsForm.hidden) accountsInput.focus();
      return;
    }
    const why = { claude: 'Edit with AI, imports and AI search won’t work until you sign in again — this also signs Claude Code out on this computer.', vercel: 'Make live and domains won’t work on this computer until you sign in again.', stripe: 'You won’t be able to create payment links until you add a key again.', accounts: 'Customer logins won’t show in Accounts until you add a key again.' }[target];
    if (connected && !await showConfirm(`${(target === 'stripe' || target === 'accounts') ? 'Remove the key' : `Sign out of ${label}`}?`, why, (target === 'stripe' || target === 'accounts') ? 'Remove' : 'Sign out')) return;
    btn.disabled = true;
    try {
      if (target === 'stripe') {
        await api('/api/stripe-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: '' }) });
      } else if (target === 'accounts') {
        await api('/api/accounts-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceRoleKey: '' }) });
      } else if (connected) {
        await api(`/api/connections/${target}/sign-out`, { method: 'POST' });
      } else {
        await api(`/api/connections/${target}/sign-in`, { method: 'POST' });
        row.dataset.waiting = '1';
        status.textContent = 'Finish signing in in the Terminal window…';
        status.classList.remove('is-signed-in');
        if (!servicePoll) servicePoll = setInterval(refreshServices, 3000);
      }
      await refreshServices();
      if (target === 'vercel') api('/api/can-deploy').then(r => { state.canDeploy = r.canDeploy; renderLiveActions(); }).catch(() => {});
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById('stripeSaveBtn').onclick = async e => {
    const key = stripeInput.value.trim();
    if (!key) return;
    const status = el.settingsDialog.querySelector('[data-service="stripe"] .account-status');
    e.target.disabled = true;
    status.textContent = 'Checking the key with Stripe…';
    try {
      await api('/api/stripe-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) });
      stripeInput.value = '';
      await refreshServices();
    } catch (err) {
      status.textContent = err.message;
      status.classList.remove('is-signed-in');
    }
    e.target.disabled = false;
  };
  stripeInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('stripeSaveBtn').click(); });
  document.getElementById('accountsSaveBtn').onclick = async e => {
    const key = accountsInput.value.trim();
    if (!key) return;
    const status = el.settingsDialog.querySelector('[data-service="accounts"] .account-status');
    e.target.disabled = true;
    status.textContent = 'Checking the key with Supabase…';
    try {
      await api('/api/accounts-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceRoleKey: key }) });
      accountsInput.value = '';
      await refreshServices();
    } catch (err) {
      status.textContent = err.message;
      status.classList.remove('is-signed-in');
    }
    e.target.disabled = false;
  };
  accountsInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('accountsSaveBtn').click(); });
  el.settingsDialog.addEventListener('close', () => {
    clearInterval(servicePoll);
    servicePoll = null;
    serviceRows().forEach(r => delete r.dataset.waiting);
  });

  // Electron's renderer doesn't implement window.prompt()/confirm() (they
  // silently return null/false), so this dialog replaces confirm() with a
  // real, reliable UI (used for delete confirmations).
  const confirmDialog = document.getElementById('confirmDialog');
  function showConfirm(title, message, okLabel = 'Delete') {
    return new Promise(resolve => {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message || '';
      document.getElementById('confirmOkBtn').textContent = okLabel;
      confirmDialog.showModal();
      const cleanup = value => { confirmDialog.close(); resolve(value); };
      document.getElementById('confirmOkBtn').onclick = () => cleanup(true);
      document.getElementById('confirmCancelBtn').onclick = () => cleanup(false);
    });
  }
  // While a sign-in window is open the row shows "finish signing in…" and
  // status is polled, so it flips to "Signed in" the moment it takes.
  let signIn = { google: false, facebook: false };
  let signInPoll = null;
  const accountRows = () => [...el.settingsDialog.querySelectorAll('[data-account]')];
  async function refreshSignInStatus() {
    try { signIn = await api('/api/sign-in-status'); } catch { return; }
    for (const row of accountRows()) {
      const on = Boolean(signIn[row.dataset.account]);
      if (on) delete row.dataset.waiting;
      const status = row.querySelector('.account-status');
      if (!row.dataset.waiting) status.textContent = on ? 'Signed in ✓' : 'Not signed in';
      status.classList.toggle('is-signed-in', on);
      const btn = row.querySelector('button');
      btn.textContent = on ? 'Sign out' : 'Sign in';
      btn.classList.toggle('primary', !on);
    }
    if (!accountRows().some(r => r.dataset.waiting)) { clearInterval(signInPoll); signInPoll = null; }
  }

  el.settingsDialog.addEventListener('click', async e => {
    const btn = e.target.closest('[data-account] button');
    if (!btn) return;
    const row = btn.closest('[data-account]');
    const target = row.dataset.account;
    const status = row.querySelector('.account-status');
    const post = (path) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) });
    btn.disabled = true;
    try {
      if (signIn[target]) {
        await post('/api/sign-out');
      } else {
        await post('/api/sign-in');
        row.dataset.waiting = '1';
        status.textContent = 'Finish signing in in the new window…';
        status.classList.remove('is-signed-in');
        if (!signInPoll) signInPoll = setInterval(refreshSignInStatus, 2000);
      }
      await refreshSignInStatus();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  el.settingsDialog.addEventListener('close', () => {
    clearInterval(signInPoll);
    signInPoll = null;
    accountRows().forEach(r => delete r.dataset.waiting);
  });

  // ---------------- projects ----------------
  async function loadProjects() {
    state.projects = await api('/api/projects');
    state.projectsLoaded = true;
    renderSidebar();
    refreshSyncStatus();
    loadDemoViews();
  }

  // How often each live demo has been opened by the business (see
  // supabase/demo_views.sql) — a tick in the sidebar, a line under Contact.
  state.views = {};
  async function loadDemoViews() {
    try { state.views = (await api('/api/demo-views')) || {}; } catch { return; }
    renderSidebar();
    renderDemoViews();
    checkFollowUps();
  }
  setInterval(loadDemoViews, 60000);
  const viewsText = v => `Demo opened ${v.count}× · last ${timeAgo(v.last).replace(/^Just/, 'just')}`;
  // Opened the demo 2+ days ago and still at "Demo sent" (see follow-ups.js).
  // Clicks of "Followed up" are also kept here, so an autosave that was
  // already on its way back can't bring the reminder back with stale data.
  state.followedUp = {};
  const withFollowUp = p => ({ ...p, followedUpAt: [p.followedUpAt, state.followedUp[p.slug]].filter(Boolean).sort().pop() });
  const isFollowUpDue = p => FollowUps.followUpDue(withFollowUp(p), state.views[p.slug]);
  const followUpSince = p => FollowUps.firstUnansweredOpen(withFollowUp(p), state.views[p.slug]);
  function renderDemoViews() {
    const box = document.getElementById('demoViews');
    if (!box || !state.current) return;
    const v = state.views[state.current.slug];
    const due = isFollowUpDue(state.current);
    box.hidden = !state.current.liveUrl && !v;
    box.classList.toggle('is-opened', Boolean(v) && !due);
    box.classList.toggle('is-due', due);
    box.textContent = due ? `⏰ Follow up: ${viewsText(v)}, no reply yet ` : `👁 ${v ? viewsText(v) : 'Demo not opened yet'}`;
    if (!due) return;
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'follow-up-done';
    done.textContent = 'Followed up';
    done.title = 'Clears the reminder until they open the demo again';
    done.onclick = async () => {
      const slug = state.current.slug;
      state.followedUp[slug] = new Date().toISOString();
      done.disabled = true;
      try {
        await saveProjectFields(slug, { followedUpAt: state.followedUp[slug] });
      } catch (err) {
        delete state.followedUp[slug];
        notify(friendlyError(err.message), { sticky: false });
      }
      renderSidebar();
      renderDemoViews();
    };
    box.append(done);
  }

  // Red/yellow/green sales-stage colour, not live-deploy status (that's
  // liveStatusFor below, shown separately as a small icon on the row).
  const STAGE_COLOUR_RANK = { red: 0, yellow: 1, green: 2, grey: 3 };
  function stageColour(p) {
    const stage = stageOf(p);
    if (stage === 'uncontacted') return 'red';
    if (stage === 'interested') return 'green';
    if (stage === 'not_interested') return 'grey';
    return 'yellow'; // called, follow_up, demo_sent — waiting to hear back
  }

  function sortedProjects() {
    let list = state.projects.slice();
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      list = list.filter(p => (p.raw?.name || p.name || p.slug).toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const rankDiff = STAGE_COLOUR_RANK[stageColour(a)] - STAGE_COLOUR_RANK[stageColour(b)];
      return rankDiff !== 0 ? rankDiff : (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return list;
  }

  // Live-deploy status (is the actual website online right now) — separate
  // from the sales-stage dot. The open project reuses the exact same
  // comparison as the deploy button (current render vs what's actually
  // live); for the rest we only know whether they've ever been deployed,
  // since computing their current render just for a row icon isn't worth it.
  function liveStatusFor(p) {
    if (state.current && state.current.slug === p.slug) {
      const liveUrl = state.current.liveUrl;
      const currentHtml = el.preview.dataset.lastHtml;
      const needsUpdate = Boolean(liveUrl) && currentHtml !== state.current.deployedHtml;
      return !liveUrl ? 'not-live' : needsUpdate ? 'needs-update' : 'live';
    }
    return p.liveUrl ? 'live' : 'not-live';
  }

  // Sections follow the sales Stage only (never whether a demo is live).
  // Default: the top three share the panel equally and Not interested is
  // collapsed to its title at the bottom. Clicking any title grows that
  // section to the full panel (the rest shrink to titles); clicking it
  // again goes back. Paying customers live on the Live tab instead.
  // Follow up sits on top and only appears while something is due; those
  // businesses leave their usual section until the reminder is cleared.
  const SIDE_SECTIONS = [
    { id: 'due', label: 'Follow up', stages: ['demo_sent'], followUps: true },
    { id: 'red', label: 'Uncontacted', stages: ['uncontacted'] },
    { id: 'yellow', label: 'Waiting / ring back', stages: ['called', 'follow_up', 'interested'] },
    { id: 'green', label: 'Demo sent', stages: ['demo_sent'] },
    { id: 'grey', label: 'Not interested', stages: ['not_interested'], collapsedByDefault: true }
  ];
  const CHEVRON = '<svg class="side-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  function renderSidebar() {
    checkNotifications();
    const scrolls = Object.fromEntries([...el.projectList.querySelectorAll('.side-section')]
      .map(s => [s.dataset.section, s.querySelector('.side-section-list').scrollTop]));
    const list = sortedProjects().filter(p => !isPaid(p) && !isPending(p));
    // Follow up hides once empty, so don't leave it as the expanded section.
    if (state.sideExpanded === 'due' && !list.some(isFollowUpDue)) state.sideExpanded = null;
    const expanded = state.sideExpanded;
    el.projectList.innerHTML = '';
    SIDE_SECTIONS.forEach(section => {
      const items = list.filter(p => section.stages.includes(stageOf(p)) && isFollowUpDue(p) === Boolean(section.followUps));
      if (section.followUps && !items.length) return;
      const open = expanded ? expanded === section.id : !section.collapsedByDefault;
      const box = document.createElement('section');
      box.dataset.section = section.id;
      box.className = `side-section side-${section.id}${open ? '' : ' is-collapsed'}${expanded === section.id ? ' is-expanded' : ''}`;
      box.innerHTML = `<button type="button" class="side-section-head" title="${expanded === section.id ? 'Back to all sections' : 'Show this section full height'}"><span>${section.label}</span><b>${items.length}</b>${CHEVRON}</button><div class="side-section-list"></div>`;
      const body = box.querySelector('.side-section-list');
      if (items.length) items.forEach(p => body.appendChild(projectRow(p)));
      else body.innerHTML = `<p class="side-empty">${state.search.trim() ? 'No matches' : 'None yet'}</p>`;
      el.projectList.appendChild(box);
      body.scrollTop = scrolls[section.id] || 0;
    });
    // Studio V2 (../desktop-app-v2) redraws its pipeline on this.
    document.dispatchEvent(new CustomEvent('studio:projects'));
  }
  el.projectList.addEventListener('click', e => {
    const head = e.target.closest('.side-section-head');
    if (!head) return;
    const id = head.closest('.side-section').dataset.section;
    state.sideExpanded = state.sideExpanded === id ? null : id;
    renderSidebar();
  });

  function projectRow(p) {
    const row = document.createElement('div');
    row.className = 'project' + (state.current && state.current.slug === p.slug ? ' active' : '');
    row.title = stageLabel(stageOf(p));
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = businessName(p);
    const site = websiteOf(p);
    // Live status as a small secondary icon, separate from the stage dot —
    // opens the site directly, same as the green deploy button does.
    const live = document.createElement('button');
    live.className = `project-live status-${liveStatusFor(p)}`;
    live.title = site ? { 'not-live': 'Not live', 'needs-update': 'Live — needs updating', live: 'Open live site' }[liveStatusFor(p)] : 'No website yet';
    live.textContent = '●';
    live.hidden = !site;
    live.onclick = e => { e.stopPropagation(); if (site) openExternal(ownerUrl(site)); };
    const views = state.views?.[p.slug];
    if (views) {
      const tick = document.createElement('span');
      tick.className = 'project-opened';
      tick.textContent = '✓';
      tick.title = viewsText(views);
      name.append(tick);
    }
    const del = document.createElement('button');
    del.className = 'project-delete';
    del.title = 'Delete this business';
    del.textContent = '✕';
    del.onclick = e => { e.stopPropagation(); deleteProject(p.slug, name.textContent); };
    row.append(name, live, del);
    // Clicking the already-open site again closes it back to the start screen.
    row.onclick = () => {
      if (state.current?.slug === p.slug) closeCurrentProject();
      else selectProject(p.slug);
    };
    return row;
  }

  el.projectSearch.oninput = () => { state.search = el.projectSearch.value; renderSidebar(); };

  async function deleteProject(slug, displayName) {
    const ok = await showConfirm(`Delete "${displayName}"?`, "This removes its files permanently and can't be undone.");
    if (!ok) return;
    try {
      await api(`/api/projects/${slug}`, { method: 'DELETE' });
      if (state.current?.slug === slug) {
        state.current = null;
        state.found = {};
        state.placementSuggestion = null;
        state.placementDismissed = null;
      }
      await loadProjects();
      if (state.tab === 'live') renderLive();
      renderEditor();
      renderPreview();
      renderLiveActions();
      notify(`Deleted "${displayName}".`);
    } catch (err) {
      notify(err.message, { sticky: false });
    }
  }

  async function selectProject(slug) {
    state.current = await api(`/api/projects/${slug}`);
    state.found = {};
    state.placementSuggestion = null;
    state.placementDismissed = null;
    if (state.current.importImages?.length) state.found.hero = state.current.importImages[0];
    renderSidebar();
    renderEditor();
    renderPreview({ seedDeployed: true });
    renderLiveActions();
    checkLive();
    document.dispatchEvent(new CustomEvent('studio:current'));
  }

  function closeCurrentProject() {
    if (state.editingText) setTextEditing(false);
    state.current = null;
    state.found = {};
    state.placementSuggestion = null;
    state.placementDismissed = null;
    renderSidebar();
    renderEditor();
    if (el.preview.hasAttribute('src')) freshPreviewFrame();
    el.preview.srcdoc = '';
    delete el.preview.dataset.lastHtml;
    renderLiveActions();
    document.dispatchEvent(new CustomEvent('studio:current'));
  }

  // Shows a "copy site URL" button and switches the deploy button's label/
  // colour once a site has a live URL — the button itself always still
  // triggers a fresh deploy (pushing edits live). Colour is a simple
  // traffic light: red = never deployed, amber = live but the current
  // preview no longer matches what was last deployed, green = live and
  // matching. Comparing the actual rendered HTML (rather than a sticky
  // "has anything been touched" flag) means undoing an edit back to what's
  // already live correctly goes back to green instead of staying amber.
  function renderLiveActions() {
    const liveUrl = state.current?.liveUrl;
    const currentHtml = el.preview.dataset.lastHtml;
    const needsUpdate = Boolean(liveUrl) && currentHtml !== state.current?.deployedHtml;
    const waiting = isDeployPending(state.current);
    el.deployBtn.textContent = waiting ? 'Waiting to go live…' : !liveUrl ? 'Make live' : needsUpdate ? 'Update live site' : 'Open live site';
    el.deployBtn.title = waiting ? 'Publishes automatically from the admin’s computer' : (state.current?.deployError ? `Last attempt failed: ${state.current.deployError}` : '');
    el.deployBtn.classList.remove('status-not-live', 'status-deploying', 'status-live', 'status-needs-update');
    el.deployBtn.classList.add(waiting ? 'status-deploying' : !liveUrl ? 'status-not-live' : needsUpdate ? 'status-needs-update' : 'status-live');
    el.copyLiveBtn.hidden = !liveUrl;
    const goingOffline = isOfflinePending(state.current);
    el.offlineBtn.hidden = !liveUrl || waiting;
    el.offlineBtn.disabled = goingOffline;
    el.offlineBtn.textContent = goingOffline ? 'Going offline…' : 'Take offline';
    // Imported websites aren't template pages, so the text editor doesn't
    // apply; a linked one is hosted elsewhere, so the button just opens it.
    const site = state.current?.importedSite;
    document.getElementById('editTextBtn').hidden = Boolean(site);
    el.exportBtn.hidden = site?.mode === 'link';
    if (site?.mode === 'link') {
      el.deployBtn.textContent = 'Open website';
      el.deployBtn.title = site.url;
      el.deployBtn.classList.remove('status-not-live', 'status-needs-update', 'status-deploying');
      el.deployBtn.classList.add('status-live');
    }
    renderSidebar();
  }

  // `deployedHtml` is a client-only snapshot (the server has no concept of
  // it) — every time the server hands back a fresh project object it has
  // to be carried over by hand, or the "matches what's live" comparison
  // would forget it on every save and show amber even when nothing
  // actually changed.
  function replaceCurrent(updated) {
    const deployedHtml = state.current?.deployedHtml;
    state.current = updated;
    if (deployedHtml !== undefined) state.current.deployedHtml = deployedHtml;
  }

  async function persist() {
    if (!state.current) return;
    replaceCurrent(await api(`/api/projects/${state.current.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.current)
    }));
    renderLiveActions();
    // Patch the already-loaded sidebar list in place instead of calling
    // loadProjects() here — that re-fetches /api/projects, which (when
    // shared sync is on) pulls from Supabase every time, and persist()
    // fires (debounced) while typing via scheduleSave(). The PUT response
    // already has everything the sidebar needs (name, timestamps); a real
    // remote
    // refresh happens on the actions that actually warrant one (opening
    // the app, creating/deleting/importing a project).
    const idx = state.projects.findIndex(p => p.slug === state.current.slug);
    if (idx !== -1) state.projects[idx] = state.current;
    renderSidebar();
  }

  function setRaw(patch) {
    state.current.raw = { ...state.current.raw, ...patch };
  }

  function categoryOptions(selected) {
    return `<option value="">Choose…</option>` + BUSINESS_TYPES.map(t =>
      `<option value="${t.label}" ${t.label === selected ? 'selected' : ''}>${t.label}</option>`
    ).join('');
  }

  function templateOptions(selected) {
    return DEMO_LAYOUTS.map(t =>
      `<button type="button" class="template-tile${t.id === selected ? ' selected' : ''}" data-layout="${t.id}">${t.name}</button>`
    ).join('');
  }

  // Simple tick-boxes + up/down arrows for which home page sections show
  // and in what order — mirrors fresh-templates.js's hiddenSections/
  // sectionOrder fields. "Your work/services" is the main content block
  // and always stays on; lume/studio have their own fixed narrative so
  // the list is replaced with a note instead.
  const HOME_SECTIONS = [
    { id: 'reviews', label: 'Reviews' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'booking', label: 'Call to action' }
  ];
  function homeSectionOrder(raw) {
    const order = (raw.sectionOrder || []).filter(id => HOME_SECTIONS.some(s => s.id === id));
    return [...order, ...HOME_SECTIONS.map(s => s.id).filter(id => !order.includes(id))];
  }
  function sectionsListHtml(raw) {
    const layout = effectiveLayout(raw);
    if (layout === 'lume' || layout === 'studio') {
      return `<p class="sections-note">This template has its own fixed page layout, so sections can’t be turned off or reordered.</p>`;
    }
    const hidden = new Set(raw.hiddenSections || []);
    const ids = homeSectionOrder(raw);
    return `<div class="sections-list">${ids.map((id, i) => {
      const meta = HOME_SECTIONS.find(s => s.id === id);
      return `<div class="section-row">
        <label><input type="checkbox" data-section-toggle="${id}" ${hidden.has(id) ? '' : 'checked'}> ${meta.label}</label>
        <div class="section-row-actions">
          <button type="button" data-section-up="${id}" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-section-down="${id}" title="Move down" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  // Which template the preview is actually rendering right now — mirrors
  // fresh-templates.js's own fallback exactly (an explicit choice if it's
  // still a valid id, otherwise the category default), so the picker
  // shows the true active template even before anyone's clicked a tile.
  // Without this, a brand-new or freshly-imported project (raw.layout
  // unset) always rendered a fallback template but showed no tile as
  // selected, leaving no way to tell which one was actually in use.
  function effectiveLayout(raw) {
    if (DEMO_LAYOUTS.some(t => t.id === raw.layout)) return raw.layout;
    const info = typeInfo(raw.tagline) || BUSINESS_TYPES[BUSINESS_TYPES.length - 1];
    return demoLayoutForCategory(info.cat || 'office');
  }

  // Same named colour palettes brightsite.app's own live builder offers
  // (homepage-builder.js) — duplicated here as plain data rather than
  // loading that file, since it's wired directly to the marketing site's
  // own DOM, not a reusable generator module. Grouped into the same 5
  // mood families as that builder, rather than one flat 30-swatch grid,
  // so the field stays compact — a family is a single pill until opened.
  const COLOUR_FAMILIES = {
    Soft: [['Porcelain', '#b59b94'], ['Rose', '#b77988'], ['Lavender', '#9180a5'], ['Cloud', '#8b9ca7'], ['Sand', '#b69b72'], ['Pearl', '#92918b']],
    Bold: [['Ruby', '#ac2637'], ['Cobalt', '#245bb0'], ['Forest', '#286148'], ['Ochre', '#a97618'], ['Plum', '#763d67'], ['Copper', '#a75132']],
    Natural: [['Sage', '#70836a'], ['Clay', '#a86e52'], ['Olive', '#797744'], ['Ocean', '#3d7479'], ['Oat', '#a29378'], ['Moss', '#506951']],
    Bright: [['Coral', '#cf5547'], ['Azure', '#267fba'], ['Berry', '#b33e7e'], ['Tangerine', '#c96623'], ['Teal', '#16847b'], ['Violet', '#7652b0']],
    Dark: [['Ink', '#26313e'], ['Espresso', '#4a3630'], ['Midnight', '#283958'], ['Pine', '#29473e'], ['Charcoal', '#3e4145'], ['Aubergine', '#4f354d']]
  };

  // Black or white, whichever reads clearly on a given swatch colour —
  // the palette hexes span from near-white (Pearl) to near-black (Ink),
  // so the name label needs its own contrast check per swatch rather
  // than one fixed text colour.
  function contrastTextColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#17181a' : '#ffffff';
  }

  function familyForHex(hex) {
    for (const [family, choices] of Object.entries(COLOUR_FAMILIES)) {
      if (choices.some(([, h]) => h === hex)) return family;
    }
    return null;
  }

  function nameForHex(hex) {
    for (const choices of Object.values(COLOUR_FAMILIES)) {
      const match = choices.find(([, h]) => h === hex);
      if (match) return match[0];
    }
    return null;
  }

  function colourCurrentHtml(hex) {
    return hex ? `<i style="background:${hex}"></i>${nameForHex(hex) || ''}` : '';
  }

  // The whole "Colour" field: a row of 5 family pills (each a tiny 3-dot
  // preview of its own colours) plus, when one is open, a floating panel
  // of that family's 6 swatches underneath. Picking a swatch closes the
  // panel straight back down — the compact state is always what's on
  // screen except for the moment you're actually choosing.
  function colourPickerHtml(selectedHex, openFamily) {
    const activeFamily = familyForHex(selectedHex);
    const families = Object.entries(COLOUR_FAMILIES).map(([family, choices]) => `
      <button type="button" class="colour-cat-btn${family === openFamily ? ' open' : ''}${family === activeFamily ? ' selected-fam' : ''}" data-family="${family}">
        <span class="colour-cat-dots">${choices.slice(0, 3).map(([, hex]) => `<i style="background:${hex}"></i>`).join('')}</span>
        ${family}
      </button>`).join('');
    const popover = openFamily ? `
      <div class="colour-popover">
        <div class="colour-grid">${COLOUR_FAMILIES[openFamily].map(([name, hex]) =>
          `<button type="button" class="colour-swatch${hex === selectedHex ? ' selected' : ''}" data-hex="${hex}" title="${name}" style="background:${hex};color:${contrastTextColor(hex)}">${name}</button>`
        ).join('')}</div>
      </div>` : '';
    return `<div class="colour-families">${families}</div>${popover}`;
  }

  // ---------------- start screen (no project selected) ----------------
  function renderStartScreen() {
    el.editor.innerHTML = `
      <div class="start-screen">
        <img src="/generator/img/brightsite-logo.png" alt="BrightSite" class="start-logo">
        <div class="link-bar">
          <input id="startLink" type="text" placeholder="Paste a link, type a name, or ask AI to find some…">
          <button id="startBuildBtn">Build website</button>
        </div>
        <div class="import-status" id="startStatus"></div>
      </div>
    `;
    wireBuildBar(document.getElementById('startLink'), document.getElementById('startBuildBtn'), document.getElementById('startStatus'));
  }

  function splitLinks(text) {
    const urls = (text.match(/https?:\/\/\S+/g) || []).map(u => u.trim());
    return [urls[0], urls[1]];
  }

  // What a typed request means: a link (the existing lookup flow), a short
  // name (just create it, nothing to look up), or a longer natural-language
  // request ("find hairdressers in Beverley") — search the web for several
  // real matches instead of one. The word-count cutoff is a heuristic, not
  // a parser — a very short "find X" still reads as a name, and an unusual
  // multi-word business name could misfire into search mode, but a plain
  // name is always still one Enter-press away from working via a link.
  function classifyBuildInput(text) {
    const trimmed = text.trim();
    const [url, url2] = splitLinks(trimmed);
    if (url) return { mode: 'link', url, url2 };
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (!words.length) return { mode: 'empty' };
    // "hairdressers in Beverley" / "garages near Hull" read as a search even
    // when short — a business name rarely has "in <place>" in it.
    const looksLikeSearch = words.length >= 5 || (words.length >= 3 && /\b(in|near|around)\s+\S/i.test(trimmed));
    return looksLikeSearch ? { mode: 'search', query: trimmed } : { mode: 'name', name: trimmed };
  }

  // Shared by the sidebar's build box and the empty-state one on the start
  // screen — same three modes, same behaviour, wherever it's typed.
  function wireBuildBar(input, btn, status) {
    const bar = input.closest('.link-bar');
    const updateMode = () => {
      const mode = classifyBuildInput(input.value).mode;
      if (bar) bar.classList.toggle('ai-mode', mode === 'search');
      btn.textContent = mode === 'search' ? 'Search & add' : 'Build website';
    };
    updateMode();
    input.oninput = updateMode;
    input.onkeydown = e => { if (e.key === 'Enter') runSmartBuild(input, btn, status); };
    btn.onclick = () => runSmartBuild(input, btn, status);
  }

  // Live feed for business search — the server streams newline-delimited
  // JSON events (see /api/ai-search) and each one becomes a step in the
  // panel: Google Maps → websites/Facebook → AI, and names as they're found.
  const SEARCH_TIPS = [
    'Checking each business is real before adding it…',
    'Looking through Facebook pages and Google listings…',
    'Cross-checking names, phone numbers and addresses…',
    'Good searches take a couple of minutes — hang tight…'
  ];
  const STAGE_ICONS = { google: '📍', facebook: '📘', ai: '✨' };
  const FIELD_LABELS = { phone: 'phone', facebookUrl: 'Facebook', email: 'email', instagram: 'Instagram', website: 'website', address: 'address' };
  const SOURCE_LABELS = { google: 'Google Maps', facebook: 'Facebook', ai: 'AI' };

  async function runAiSearch(query, anchor) {
    const panel = document.createElement('div');
    panel.className = 'ai-live';
    panel.innerHTML = `
      <div class="ai-live-head">
        <span class="ai-orb"></span>
        <span class="ai-live-phase">Starting the search…</span>
        <span class="ai-live-time">0:00</span>
      </div>
      <div class="ai-live-query">“${escapeHtml(query)}”</div>
      <div class="ai-live-steps"></div>
      <div class="ai-live-found" hidden><div class="ai-live-label">Found so far</div><div class="ai-live-chips"></div></div>`;
    if (anchor) anchor.after(panel);
    const $ = sel => panel.querySelector(sel);
    const phase = text => { $('.ai-live-phase').textContent = text; };
    const started = Date.now();
    let lastActivity = Date.now();
    let tipIndex = 0;
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      $('.ai-live-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      // Long quiet gaps (Claude reading results) get a rotating reassurance.
      if (Date.now() - lastActivity > 9000) {
        phase(SEARCH_TIPS[tipIndex++ % SEARCH_TIPS.length]);
        lastActivity = Date.now();
      }
    }, 1000);

    const addStep = (icon, html, cls = '') => {
      panel.querySelectorAll('.ai-step.current').forEach(s => s.classList.remove('current'));
      const row = document.createElement('div');
      row.className = `ai-step current ${cls}`;
      row.innerHTML = `<span class="ai-step-icon">${icon}</span><span class="ai-step-text">${html}</span>`;
      $('.ai-live-steps').appendChild(row);
      const steps = $('.ai-live-steps');
      while (steps.children.length > 6) steps.firstElementChild.remove();
      lastActivity = Date.now();
    };
    let searches = 0;
    let found = 0;
    const chipNames = new Set();

    const onEvent = ev => {
      if (ev.type === 'stage') {
        // Server-built HTML: only fixed wording plus an escaped query.
        addStep(STAGE_ICONS[ev.stage] || '•', ev.text, ev.muted ? 'muted' : '');
        phase(ev.text.replace(/<[^>]+>/g, ''));
      } else if (ev.type === 'progress') {
        phase(ev.text);
        lastActivity = Date.now();
      } else if (ev.type === 'filled') {
        const fields = (ev.fields || []).map(f => FIELD_LABELS[f] || f).join(', ');
        addStep('➕', `<b>${escapeHtml(ev.name)}</b> — ${escapeHtml(fields)} <span class="ai-host">${escapeHtml(SOURCE_LABELS[ev.source] || ev.source)}</span>`, 'muted');
      } else if (ev.type === 'saved') {
        phase(`Saved ${ev.count} — still filling gaps…`);
        loadProjects().catch(() => {});
      } else if (ev.type === 'thinking') {
        phase(searches ? 'Thinking about what it found…' : 'Planning the search…');
        lastActivity = Date.now();
      } else if (ev.type === 'search') {
        searches++;
        phase(`Searching the web (${searches})…`);
        addStep('🔍', `Searching <b>${escapeHtml(ev.query)}</b>`);
      } else if (ev.type === 'sources') {
        const hosts = [...new Set(ev.sources.map(s => s.host))].slice(0, 4);
        addStep('📄', `Reading ${ev.count} results ${hosts.map(h => `<span class="ai-host">${escapeHtml(h)}</span>`).join('')}`, 'muted');
        phase('Reading the results…');
      } else if (ev.type === 'note') {
        addStep('💭', escapeHtml(ev.text), 'note');
      } else if (ev.type === 'found') {
        // Claude re-lists businesses Google already found when filling gaps.
        const key = ev.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (chipNames.has(key)) return;
        chipNames.add(key);
        found++;
        phase(`${SOURCE_LABELS[ev.source] || 'AI'} — ${found} found…`);
        const box = $('.ai-live-found');
        box.hidden = false;
        const chip = document.createElement('span');
        chip.className = `ai-chip src-${ev.source || 'ai'}`;
        chip.title = `Found via ${SOURCE_LABELS[ev.source] || 'AI'}`;
        chip.textContent = ev.name;
        box.querySelector('.ai-live-chips').appendChild(chip);
        lastActivity = Date.now();
      } else if (ev.type === 'saving') {
        phase(`Adding ${ev.count} to your list…`);
      }
    };

    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'done') return ev;
          if (ev.type === 'error') throw new Error(ev.error);
          onEvent(ev);
        }
      }
      throw new Error('Search stopped unexpectedly');
    } finally {
      clearInterval(tick);
      panel.remove();
    }
  }

  // Facebook pages and Google listings are read for business details; any
  // other website can also be imported as it is.
  const isBusinessProfileLink = url => /(^|[/.])(facebook\.com|fb\.com|fb\.me)\//i.test(url)
    || /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page\//i.test(url);

  // Asked right under the bar, since the choice changes what gets made.
  // Resolves to { mode: 'copy' | 'link' | 'build', paying } or null.
  function chooseWebsiteImport(status, url) {
    if (!status) return Promise.resolve({ mode: 'build', paying: false });
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* show as typed */ }
    return new Promise(resolve => {
      status.innerHTML = `
        <div class="site-import-choice">
          <div class="site-import-title">Import ${escapeHtml(host)}</div>
          <button type="button" data-mode="copy"><b>Copy the whole site as it is</b><span>Every page and file, no templates — preview and make it live from Studio</span></button>
          <button type="button" data-mode="link"><b>Link to it</b><span>Stays hosted where it is — shows in the preview and Clients</span></button>
          <button type="button" data-mode="build"><b>Build a new site from its details</b><span>Reads the business details into one of Studio’s templates</span></button>
          <label class="site-import-paying"><input type="checkbox"> Already a paying client</label>
          <button type="button" class="site-import-cancel">Cancel</button>
        </div>`;
      status.onclick = e => {
        const choice = e.target.closest('button');
        if (!choice) return;
        const paying = Boolean(status.querySelector('.site-import-paying input')?.checked);
        status.onclick = null;
        status.innerHTML = '';
        resolve(choice.dataset.mode ? { mode: choice.dataset.mode, paying } : null);
      };
    });
  }

  async function runSmartBuild(input, btn, status) {
    const parsed = classifyBuildInput(input.value);
    if (parsed.mode === 'empty' || btn.disabled) return;
    btn.disabled = true;
    try {
      if (parsed.mode === 'link') {
        const choice = parsed.url2 || isBusinessProfileLink(parsed.url)
          ? { mode: 'build', paying: false }
          : await chooseWebsiteImport(status, parsed.url);
        if (!choice) return;
        let project;
        if (choice.mode === 'build') {
          if (status) setLoading(status, 'Reading the page…');
          project = await api('/api/quick-import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: parsed.url, url2: parsed.url2 })
          });
          if (choice.paying) await saveProjectFields(project.slug, { paymentStatus: 'paid' });
        } else {
          if (status) setLoading(status, choice.mode === 'copy' ? 'Copying every page and file — bigger sites take a minute…' : 'Linking the website…');
          project = await api('/api/import-site', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: parsed.url, mode: choice.mode, paying: choice.paying })
          });
        }
        await loadProjects();
        await selectProject(project.slug);
        const site = project.importedSite;
        const where = choice.paying ? ' — added to Clients' : '';
        notify(!site ? `Built a site for ${project.raw?.name || 'this business'}${where}.`
          : site.mode === 'copy'
            ? `Imported ${businessName(project)} as it is — ${site.pages} page${site.pages === 1 ? '' : 's'}${site.skipped ? `, ${site.skipped} file${site.skipped === 1 ? '' : 's'} couldn’t be copied` : ''}${where}.`
            : `Linked ${businessName(project)}${where}.`);
      } else if (parsed.mode === 'name') {
        if (status) setLoading(status, 'Adding…');
        const project = await api('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: parsed.name }) });
        await loadProjects();
        await selectProject(project.slug);
        notify(`Added ${parsed.name}.`);
      } else {
        // AI search mode: several businesses at once, so there's no single
        // one to open — just drop them into the list.
        if (status) status.textContent = '';
        const result = await runAiSearch(parsed.query, status);
        await loadProjects();
        const already = result.skipped ? ` (${result.skipped} already in your list)` : '';
        notify(
          result.projects.length
            ? `Found ${result.projects.length} business${result.projects.length === 1 ? '' : 'es'} — added to the list${already}.`
            : result.skipped ? `Nothing new — all ${result.skipped} are already in your list.` : "Couldn't find any real businesses matching that.",
          { sticky: !result.projects.length }
        );
      }
      input.value = '';
      if (status) status.textContent = '';
    } catch (err) {
      if (status) showTempStatus(status, friendlyError(err.message));
      notify(friendlyError(err.message), { sticky: false });
    } finally {
      btn.disabled = false;
      // Reflect whatever's left in the box (cleared on success, still there
      // after a failure) rather than assuming it's back to empty.
      if (input.isConnected) {
        const mode = classifyBuildInput(input.value).mode;
        const bar = input.closest('.link-bar');
        if (bar) bar.classList.toggle('ai-mode', mode === 'search');
        btn.textContent = mode === 'search' ? 'Search & add' : 'Build website';
      }
    }
  }

  // ---------------- Builder editor ----------------
  function renderEditor() {
    document.querySelector('.layout').classList.toggle('no-project', !state.current);
    if (!state.current) return renderStartScreen();
    const raw = state.current.raw || {};
    const profile = raw.businessProfile || {};
    const site = state.current.importedSite;

    el.editor.innerHTML = `
      <div class="sales-block" id="salesBlock"></div>
      <div class="section-divider"><span>Website</span></div>
      ${site ? importedSiteHtml(site) : `<div class="link-bar compact">
        <input id="f_link" type="text" placeholder="Paste a Facebook or Google Maps link…" value="${escapeAttr(state.current.lastImportUrl || state.current.contact?.facebookUrl || profile.mapsUrl || '')}">
        <button id="importBtn">${state.current.lastImportUrl ? 'Re-fetch' : 'Fetch'}</button>
      </div>`}
      <div class="import-status" id="importStatus"></div>

      <div class="form-grid name-row">
        <div class="field"><label>Business name</label>
          <input id="f_name" value="${escapeAttr(raw.name || '')}"></div>
        <div class="field field-compact"><label>Category</label>
          <select id="f_category">${categoryOptions(raw.tagline)}</select></div>
        <div class="field"><label>Name</label>
          <input id="f_contactName" placeholder="Contact’s name" value="${escapeAttr(state.current.contact?.name || '')}"></div>
      </div>
      <div class="phone-row">
        <div class="field"><label>Phone</label>
          <input id="f_phone" value="${escapeAttr(profile.phone || '')}"></div>
        <button id="whatsappBtn" class="contact-btn whatsapp-btn" title="WhatsApp a welcome message" aria-label="Open WhatsApp">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5s-.6-1.5-.9-2c-.2-.5-.5-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4z"/><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>
        </button>
        <div class="field"><label>Email</label>
          <input id="f_email" type="email" value="${escapeAttr(state.current.contact?.email || '')}"></div>
        <button id="emailBtn" class="contact-btn email-btn" title="Email a welcome message" aria-label="Send email">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>
        </button>
      </div>
      <div class="demo-views" id="demoViews" hidden></div>
      <div class="field"><label>Location / address</label>
        <input id="f_location" value="${escapeAttr(profile.address || raw.location || '')}"></div>

      ${site ? '' : `<div class="media-row-3">
        ${mediaSlot('logo', 'Logo')}
        ${mediaSlot('hero', 'Hero image')}
        <div class="media-slot" data-slot="gallery">
          <div class="media-head">
            <label>Gallery</label>
            <div class="media-head-actions"><button id="galleryUploadBtn">+ Add</button></div>
          </div>
          <div class="gallery-grid" id="galleryGrid">${galleryThumbs()}</div>
          <input type="file" id="galleryUpload" accept="image/*" multiple hidden>
        </div>
      </div>

      <div class="field"><label>Template</label>
        <div class="template-grid-6" id="templateGrid">${templateOptions(effectiveLayout(raw))}</div></div>

      <div class="field"><label>Home page sections</label>
        <div id="sectionsField">${sectionsListHtml(raw)}</div></div>

      <div class="field"><label>Colour <span class="colour-current" id="colourCurrent">${colourCurrentHtml(raw.tones?.base)}</span></label>
        <div class="colour-picker" id="colourPicker">${colourPickerHtml(raw.tones?.base, null)}</div></div>

      <div class="ai-edit-box">
        <label>Edit with AI</label>
        <div class="ai-edit-input">
          <textarea id="aiInstruction" rows="2" placeholder="e.g. Make the about section warmer and mention it's family-run"></textarea>
          <button id="aiEditBtn" title="Apply (Enter)" aria-label="Apply edit"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
        </div>
        <div class="ai-edit-status" id="aiEditStatus"></div>
        ${editLogHtml()}
      </div>`}
    `;

    document.getElementById('f_name').oninput = e => { setRaw({ name: e.target.value }); scheduleSave(); };
    document.getElementById('f_category').onchange = e => { setRaw({ tagline: e.target.value }); scheduleSave(); };
    document.getElementById('f_contactName').oninput = e => {
      state.current.contact = { ...(state.current.contact || {}), name: e.target.value };
      scheduleSave();
    };
    document.getElementById('f_phone').oninput = e => { setRaw({ businessProfile: { ...profile, phone: e.target.value } }); scheduleSave(); };
    document.getElementById('f_email').oninput = e => {
      state.current.contact = { ...(state.current.contact || {}), email: e.target.value };
      scheduleSave();
    };
    document.getElementById('whatsappBtn').onclick = () => openWhatsApp(document.getElementById('f_phone').value);
    document.getElementById('emailBtn').onclick = () => openEmail(document.getElementById('f_email').value);
    renderDemoViews();
    document.getElementById('f_location').oninput = e => {
      setRaw({ location: e.target.value, businessProfile: { ...profile, address: e.target.value } });
      scheduleSave();
    };
    if (site) wireImportedSite(site);
    else wireSiteBuilderControls(raw);
    renderSales();
    if (!site) {
      wirePlacementSuggestion();
      maybeSuggestPlacement();
    }
  }

  // The template side of the editor — link fetch, template, colour, photos
  // and AI edits. An imported website has none of these.
  function wireSiteBuilderControls(raw) {
    document.getElementById('importBtn').onclick = runImport;
    const linkInput = document.getElementById('f_link');
    let linkTimer = null;
    linkInput.addEventListener('input', () => {
      clearTimeout(linkTimer);
      linkTimer = setTimeout(() => {
        const value = linkInput.value.trim();
        if (/^https?:\/\//i.test(value) && value !== (state.current.lastImportUrl || '')) runImport();
      }, 400);
    });
    document.getElementById('templateGrid').addEventListener('click', e => {
      const tile = e.target.closest('.template-tile');
      if (!tile) return;
      setRaw({ layout: tile.dataset.layout });
      document.querySelectorAll('.template-tile').forEach(t => t.classList.toggle('selected', t === tile));
      document.getElementById('sectionsField').innerHTML = sectionsListHtml(state.current.raw);
      persist();
      schedulePreview();
    });
    document.getElementById('sectionsField').addEventListener('change', e => {
      const cb = e.target.closest('[data-section-toggle]');
      if (!cb) return;
      const hidden = new Set(state.current.raw.hiddenSections || []);
      if (cb.checked) hidden.delete(cb.dataset.sectionToggle); else hidden.add(cb.dataset.sectionToggle);
      setRaw({ hiddenSections: [...hidden] });
      persist();
      schedulePreview();
    });
    document.getElementById('sectionsField').addEventListener('click', e => {
      const btn = e.target.closest('[data-section-up],[data-section-down]');
      if (!btn) return;
      const id = btn.dataset.sectionUp || btn.dataset.sectionDown;
      const ids = homeSectionOrder(state.current.raw);
      const from = ids.indexOf(id);
      const to = btn.dataset.sectionUp ? from - 1 : from + 1;
      if (to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      setRaw({ sectionOrder: ids });
      document.getElementById('sectionsField').innerHTML = sectionsListHtml(state.current.raw);
      persist();
      schedulePreview();
    });
    (() => {
      const colourPicker = document.getElementById('colourPicker');
      const colourCurrent = document.getElementById('colourCurrent');
      let selectedColourHex = raw.tones?.base;
      let openColourFamily = null;
      const rerender = () => { colourPicker.innerHTML = colourPickerHtml(selectedColourHex, openColourFamily); };
      colourPicker.addEventListener('click', e => {
        const catBtn = e.target.closest('.colour-cat-btn');
        if (catBtn) {
          openColourFamily = openColourFamily === catBtn.dataset.family ? null : catBtn.dataset.family;
          rerender();
          return;
        }
        const swatch = e.target.closest('.colour-swatch');
        if (!swatch) return;
        selectedColourHex = swatch.dataset.hex;
        openColourFamily = null;
        setRaw({ tones: tonesFromHex(selectedColourHex) });
        rerender();
        colourCurrent.innerHTML = colourCurrentHtml(selectedColourHex);
        persist();
        schedulePreview();
      });
    })();
    document.getElementById('galleryUploadBtn').onclick = () => document.getElementById('galleryUpload').click();
    document.getElementById('galleryUpload').addEventListener('change', e => uploadGallery(e.target.files));
    document.getElementById('aiEditBtn').onclick = runAiEdit;
    document.getElementById('aiInstruction').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAiEdit(); }
    });
    document.querySelectorAll('.edit-log .undo').forEach(btn => (btn.onclick = () => undoEdit(Number(btn.dataset.i))));
    document.querySelectorAll('.gallery-grid .thumb-remove').forEach(btn => (btn.onclick = () => removeGalleryItem(Number(btn.dataset.i))));
    wireMediaSlot('logo');
    wireMediaSlot('hero');
  }

  // Imported website (no template): where it came from, what was copied,
  // and Re-import to fetch a fresh copy after the original changes.
  function importedSiteHtml(site) {
    let host = site.url;
    try { host = new URL(site.url).hostname.replace(/^www\./, ''); } catch { /* show as saved */ }
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const detail = site.mode === 'copy'
      ? `Copied ${plural(site.pages || 0, 'page')} and ${plural(site.files || 0, 'file')} · ${timeAgo(site.importedAt)}${site.skipped ? ` · ${site.skipped} couldn’t be copied` : ''}`
      : 'Stays hosted where it is — Studio doesn’t publish it';
    return `
      <div class="imported-site">
        <div class="imported-site-head">
          <span class="imported-site-badge">${site.mode === 'copy' ? 'Imported as it is' : 'Linked website'}</span>
          <a href="#" id="importedSiteOpen" title="${escapeAttr(site.url)}">${escapeHtml(host)}</a>
        </div>
        ${site.mode === 'copy' ? '<button type="button" id="reimportSiteBtn">Re-import</button>' : ''}
        <div class="imported-site-detail">${escapeHtml(detail)}</div>
      </div>`;
  }

  function wireImportedSite(site) {
    document.getElementById('importedSiteOpen').onclick = e => { e.preventDefault(); openExternal(site.url); };
    const btn = document.getElementById('reimportSiteBtn');
    if (!btn) return;
    btn.onclick = async () => {
      const slug = state.current.slug;
      const status = document.getElementById('importStatus');
      btn.disabled = true;
      setLoading(status, 'Copying the website again…');
      try {
        const saved = await api(`/api/projects/${slug}/reimport-site`, { method: 'POST' });
        if (state.current?.slug !== slug) return;
        replaceCurrent(saved);
        renderEditor();
        await renderPreview();
        notify(`Re-imported ${businessName(saved)} — ${saved.importedSite.pages} page${saved.importedSite.pages === 1 ? '' : 's'}.`);
      } catch (err) {
        btn.disabled = false;
        showTempStatus(status, friendlyError(err.message));
      }
    };
  }

  // Cold-calling details for the open business, at the top of the form.
  // Changing the stage moves it between the sidebar halves; setting it to
  // Paid moves it onto the Live & Paying tab.
  function renderSales() {
    const box = document.getElementById('salesBlock');
    if (!box || !state.current) return;
    const p = state.current;
    const options = (list, selected) => list.map(([id, label]) =>
      `<option value="${id}" ${id === selected ? 'selected' : ''}>${label}</option>`).join('');
    box.innerHTML = `
      <div class="section-heading">Admin <span>Cold calling</span></div>
      <div class="sales-row">
        <div class="field"><label>Stage</label>
          <select id="s_stage">${options(SALES_STAGES, stageOf(p))}</select></div>
        <div class="field"><label>Monthly price</label>
          <input id="s_price" value="${escapeAttr(p.price || '')}" placeholder="e.g. 45"></div>
        <div class="field"><label>Paying?</label>
          <select id="s_payment">${options(PAYMENT_STATUSES, p.paymentStatus || 'no')}</select></div>
      </div>
      <div class="field"><label>Call notes</label>
        <textarea id="s_notes" placeholder="What happened on the call, what to do next…">${escapeHtml(p.notes || '')}</textarea></div>`;
    document.getElementById('s_stage').onchange = e => { state.current.pipelineStage = e.target.value; persist(); };
    document.getElementById('s_price').oninput = e => { state.current.price = e.target.value; scheduleSave(); };
    document.getElementById('s_notes').oninput = e => { state.current.notes = e.target.value; scheduleSave(); };
    document.getElementById('s_payment').onchange = async e => {
      state.current.paymentStatus = e.target.value;
      await persist();
      if (e.target.value !== 'no') notify(`"${businessName(state.current)}" is now on the Clients tab${e.target.value === 'pending' ? ', under Pending' : ''}.`);
    };
  }

  function editLogHtml() {
    const log = state.current.editLog || [];
    if (!log.length) return '';
    return `<div class="edit-log">${log.slice().reverse().map((entry, idx) => {
      const i = log.length - 1 - idx;
      return `<div class="entry"><span>"${escapeHtml(entry.instruction)}"</span><button class="undo" data-i="${i}">Undo</button></div>`;
    }).join('')}</div>`;
  }

  async function runAiEdit() {
    const input = document.getElementById('aiInstruction');
    const status = document.getElementById('aiEditStatus');
    const btn = document.getElementById('aiEditBtn');
    const instruction = input.value.trim();
    if (!instruction || btn.disabled) return;
    btn.disabled = true;
    input.disabled = true;
    setLoading(status, 'Asking Claude…');
    try {
      await flushSave();
      const updated = await api(`/api/projects/${state.current.slug}/ai-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction })
      });
      replaceCurrent(updated);
      renderEditor();
      renderPreview();
      renderLiveActions();
      document.getElementById('aiEditStatus').textContent = 'Done — undo it below if it’s not right.';
    } catch (err) {
      btn.disabled = false;
      input.disabled = false;
      showTempStatus(status, friendlyError(err.message), 8000);
    }
  }

  async function undoEdit(index) {
    const log = state.current.editLog || [];
    const entry = log[index];
    if (!entry) return;
    // Restore the exact pre-edit values captured server-side when the edit
    // was applied (see server.js /ai-edit), not just clear the fields.
    const restoredRaw = { ...state.current.raw, ...(entry.beforeFields || {}) };
    if (entry.beforeProfile && Object.keys(entry.beforeProfile).length) {
      restoredRaw.businessProfile = { ...(restoredRaw.businessProfile || {}), ...entry.beforeProfile };
    }
    state.current.raw = restoredRaw;
    state.current.editLog = log.filter((_, i) => i !== index);
    await persist();
    renderEditor();
    renderPreview();
  }

  function mediaSlot(slot, label) {
    const raw = state.current.raw || {};
    const path = slot === 'logo' ? raw.logoImage : raw.heroImage;
    const thumbStyle = path ? `style="background-image:url('/projects/${state.current.slug}/${path}')"` : '';
    const found = state.found[slot];
    const autoHeroHint = slot === 'hero' && !path
      ? `<div class="auto-hint">Auto: ${raw.logoImage ? 'your logo' : 'name'} on a 3D scene</div>`
      : '';
    // Realistic placement needs a real uploaded photo (not the procedurally
    // composited hero) plus a real logo — offer it only once both exist.
    const canPlaceLogo = slot === 'hero' && path && raw.logoImage;
    const suggestion = slot === 'hero' ? placementSuggestionHtml() : '';
    return `
      <div class="media-slot" data-slot="${slot}">
        <div class="media-head">
          <label>${label}</label>
          ${path ? `<div class="media-head-actions">
            <button data-action="upload">Replace</button>
            <button class="media-remove" data-action="remove" title="Remove" aria-label="Remove">✕</button>
          </div>` : ''}
        </div>
        <div class="thumb ${path ? '' : 'is-empty'}" data-action="pick" ${thumbStyle} title="${path ? 'Replace' : 'Upload'}">${path ? '' : '<span>+ Upload</span>'}</div>
        ${autoHeroHint}
        <div class="actions extra">
          ${found ? `<button data-action="use-found" class="found">Use found</button>` : ''}
          ${canPlaceLogo ? `<button data-action="place-logo" class="found">Place logo on photo</button>` : ''}
        </div>
        ${suggestion}
        <input type="file" accept="image/*" style="display:none">
      </div>`;
  }

  // BrightSite automatically works out the best spot for the logo on the
  // uploaded/imported hero photo as soon as both exist, and offers it here
  // rather than silently overwriting the photo — a bad auto-guess should
  // never surprise the user on the live site.
  function placementSuggestionHtml() {
    const s = state.placementSuggestion;
    const raw = state.current.raw || {};
    if (!s || s.key !== placementKey(raw) || raw.heroPlacementApplied) return '';
    if (state.placementDismissed === s.key) return '';
    return `
      <div class="placement-suggestion" id="placementSuggestion">
        <div class="thumb" style="background-image:url('${s.dataUrl}')"></div>
        <div class="ps-text">Suggested: your logo placed on this photo.</div>
        <div class="ps-actions">
          <button data-action="ps-use" class="found">Use this</button>
          <button data-action="ps-adjust">Adjust</button>
          <button data-action="ps-dismiss" class="ghost">Dismiss</button>
        </div>
      </div>`;
  }

  function wirePlacementSuggestion() {
    const box = document.getElementById('placementSuggestion');
    if (!box) return;
    const s = state.placementSuggestion;
    box.querySelector('[data-action="ps-use"]').onclick = async () => {
      const blob = await (await fetch(s.dataUrl)).blob();
      const form = new FormData();
      form.append('file', blob, 'hero-with-logo.jpg');
      const result = await api(`/api/projects/${state.current.slug}/media/hero`, { method: 'POST', body: form });
      setRaw({ heroImage: result.path, heroPlacementApplied: true });
      await persist();
      renderEditor();
      schedulePreview();
      notify('Logo placed on the hero photo.');
    };
    box.querySelector('[data-action="ps-adjust"]').onclick = () => openLogoPlacement({ quad: s.quad, strength: s.strength });
    box.querySelector('[data-action="ps-dismiss"]').onclick = () => {
      state.placementDismissed = s.key;
      renderEditor();
    };
  }

  function placementKey(raw) {
    return raw?.logoImage && raw?.heroImage ? `${state.current.slug}|${raw.logoImage}|${raw.heroImage}` : null;
  }

  // Runs the same detect-surface + warp pipeline as the manual "Place logo
  // on photo" button, but in the background against whatever hero photo and
  // logo the project currently has (typically straight off an import) and
  // stores the result as a dismissible suggestion rather than applying it.
  let placementRunKey = null;
  async function maybeSuggestPlacement() {
    const raw = state.current?.raw;
    const key = placementKey(raw);
    if (!key || raw.heroPlacementApplied || placementRunKey === key) return;
    if (state.placementSuggestion?.key === key) return;
    placementRunKey = key;
    const slug = state.current.slug;
    try {
      const [photo, logoImg] = await Promise.all([
        loadImageEl(`/projects/${slug}/${raw.heroImage}`),
        loadImageEl(`/projects/${slug}/${raw.logoImage}`)
      ]);
      const cleaned = await LogoPlacement.removeBackground(logoImg);
      const surfaces = await LogoPlacement.detectSurfaces(photo, { limit: 1 });
      if (!surfaces.length || placementKey(state.current?.raw) !== key) return; // stale by the time it resolved
      const dataUrl = await LogoPlacement.render({
        photo, logo: cleaned, quad: surfaces[0].quad, strength: 'realistic', output: 'dataURL'
      });
      if (placementKey(state.current?.raw) !== key) return;
      state.placementSuggestion = { key, dataUrl, quad: surfaces[0].quad, strength: 'realistic' };
      renderEditor();
    } catch (error) {
      console.error('Placement suggestion failed', error);
    }
  }

  function galleryThumbs() {
    const gallery = state.current.raw?.gallery || [];
    return gallery.map((g, i) => `<div class="thumb" style="background-image:url('/projects/${state.current.slug}/${g}')"><button class="thumb-remove" data-i="${i}" title="Remove">✕</button></div>`).join('')
      || '<span class="gallery-empty">No images yet</span>';
  }

  function wireMediaSlot(slot) {
    const wrap = document.querySelector(`.media-slot[data-slot="${slot}"]`);
    if (!wrap) return;
    const fileInput = wrap.querySelector('input[type=file]');
    wrap.querySelectorAll('[data-action="upload"], [data-action="pick"]').forEach(b => (b.onclick = () => fileInput.click()));
    fileInput.onchange = () => uploadMedia(slot, fileInput.files[0]);
    const useFound = wrap.querySelector('[data-action="use-found"]');
    if (useFound) useFound.onclick = () => useFoundImage(slot);
    const remove = wrap.querySelector('[data-action="remove"]');
    if (remove) remove.onclick = e => { e.stopPropagation(); removeMedia(slot); };
    const placeLogo = wrap.querySelector('[data-action="place-logo"]');
    if (placeLogo) placeLogo.onclick = () => openLogoPlacement();
  }

  // Realistic Logo Placement — warps and blends the uploaded logo onto the
  // uploaded hero photo (wall, sign, window or van panel) so it reads as
  // physically installed rather than pasted on, then saves the result as
  // the hero image. Auto-suggests a flat placement area but the user can
  // drag the four corners to fit the real surface exactly.
  async function openLogoPlacement(initial) {
    const raw = state.current.raw || {};
    if (!raw.heroImage || !raw.logoImage) return;
    const slug = state.current.slug;
    const photo = `/projects/${slug}/${raw.heroImage}`;
    let logo = `/projects/${slug}/${raw.logoImage}`;
    try {
      const cleaned = await LogoPlacement.removeBackground(await loadImageEl(logo));
      logo = cleaned.toDataURL('image/png');
    } catch (error) {
      console.error('Logo background removal skipped', error);
    }
    LogoPlacement.openEditor({
      photo, logo,
      quad: initial?.quad,
      strength: initial?.strength,
      onSave: async ({ dataUrl }) => {
        const blob = await (await fetch(dataUrl)).blob();
        const form = new FormData();
        form.append('file', blob, 'hero-with-logo.jpg');
        const result = await api(`/api/projects/${slug}/media/hero`, { method: 'POST', body: form });
        setRaw({ heroImage: result.path, heroPlacementApplied: true });
        await persist();
        renderEditor();
        schedulePreview();
        notify('Logo placed on the hero photo.');
      }
    });
  }

  function loadImageEl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image.'));
      img.src = src;
    });
  }

  async function removeMedia(slot) {
    setRaw({ [slot === 'logo' ? 'logoImage' : 'heroImage']: '' });
    await persist();
    renderEditor();
    schedulePreview();
  }

  async function removeGalleryItem(index) {
    const gallery = (state.current.raw.gallery || []).filter((_, i) => i !== index);
    setRaw({ gallery });
    await persist();
    renderEditor();
    schedulePreview();
  }

  async function uploadMedia(slot, file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const result = await api(`/api/projects/${state.current.slug}/media/${slot}`, { method: 'POST', body: form });
    setRaw({ [slot === 'logo' ? 'logoImage' : 'heroImage']: result.path });
    await persist();
    renderEditor();
    schedulePreview();
  }

  async function uploadGallery(files) {
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      const result = await api(`/api/projects/${state.current.slug}/media/gallery`, { method: 'POST', body: form });
      const gallery = state.current.raw.gallery || [];
      setRaw({ gallery: [...gallery, result.path] });
    }
    await persist();
    renderEditor();
    schedulePreview();
  }

  async function useFoundImage(slot) {
    const url = state.found[slot];
    if (!url) return;
    const result = await api(`/api/projects/${state.current.slug}/media/${slot}/fetch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    setRaw({ [slot === 'logo' ? 'logoImage' : 'heroImage']: result.path });
    await persist();
    renderEditor();
    schedulePreview();
  }

  async function runImport() {
    const [url, url2] = splitLinks(document.getElementById('f_link').value.trim());
    const status = document.getElementById('importStatus');
    if (!url && !url2) return;
    setLoading(status, 'Reading the page…');
    try {
      const data = await api('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, url2 })
      });
      const aiFilled = (state.current.aiFilled || []).slice();
      const raw = state.current.raw || {};
      const profile = { ...(raw.businessProfile || {}) };
      if (data.name && !raw.name) setRaw({ name: data.name });
      if (data.category && !raw.tagline) setRaw({ tagline: data.category });
      if (data.location && !raw.location) setRaw({ location: data.location });
      if (data.address) profile.address = data.address;
      if (data.phone) profile.phone = data.phone;
      if (data.about) profile.about = data.about;
      if (data.mapsUrl) profile.mapsUrl = data.mapsUrl;
      if (data.hours?.length) profile.hours = data.hours;
      if (!data.about && !aiFilled.includes('about')) aiFilled.push('about');
      setRaw({ businessProfile: profile });
      state.current.aiFilled = aiFilled;
      state.current.lastImportUrl = url || url2;
      const contact = { ...(state.current.contact || {}) };
      for (const link of [url, url2].filter(Boolean)) {
        contact[/share\.google|goo\.gl|google\.[a-z.]+\/(maps|search)/i.test(link) ? 'googleUrl' : 'facebookUrl'] = link;
      }
      state.current.contact = contact;
      if (data.images?.length) state.found.hero = data.images[0];
      await persist();
      renderEditor();
      schedulePreview();
      const source = data.method === 'claude' ? 'Claude' : (data.fallbackError ? 'partial fallback' : 'the page');
      status.textContent = `Read via ${source}. ${data.images?.length ? data.images.length + ' image(s) found — see "Use found".' : ''}`;
      notify(`Imported for ${state.current.raw.name || 'this site'}.`);
    } catch (err) {
      showTempStatus(status, friendlyError(err.message));
      notify(friendlyError(err.message), { sticky: false });
    }
  }

  // Debounces just the (CPU-bound: HTML string build + hero compositing)
  // preview re-render — renderPreview() only reads already-updated local
  // state, so it never needs to wait on a server response. Used after
  // callers that persist a change immediately themselves (media actions,
  // template picks) and just want the preview to catch up.
  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 150);
  }

  // Debounces the (network) save too, on top of the preview render above —
  // for continuous-typing field edits, where persisting on every single
  // keystroke would mean a PUT request (and, with shared sync on, a
  // Supabase write) per character typed.
  let saveTimer = null;
  function scheduleSave() {
    schedulePreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 500);
  }

  // Runs a still-pending debounced save immediately. Leaving the Businesses
  // tab goes through here, so a tab switch can never drop an edit that was
  // sat waiting on its timer.
  async function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    await persist();
  }

  function projectMediaAbsolute(raw, slug) {
    const withAbsolute = { ...raw };
    if (raw.logoImage) withAbsolute.logo = `${location.origin}/projects/${slug}/${raw.logoImage}`;
    if (raw.heroImage) withAbsolute.heroImage = `${location.origin}/projects/${slug}/${raw.heroImage}`;
    if (raw.gallery?.length) withAbsolute.gallery = raw.gallery.map(g => `${location.origin}/projects/${slug}/${g}`);
    return withAbsolute;
  }

  // Auto-composited 3D hero — the same HeroBrandCompositor brightsite.app's
  // own builder uses. With a logo uploaded, it's placed into the scene
  // (wall/van/sign per category); without one, the business name itself is
  // lettered onto the scene as a procedural 3D wordmark. Only kicks in when
  // the user hasn't uploaded/picked their own hero photo (raw.heroImage) —
  // a manual choice always wins. Cached so it doesn't re-render on every
  // unrelated keystroke, only when name/location/category/template/logo
  // actually change.
  let heroCache = { key: null, dataUrl: null };
  async function composeAutoHero(raw, slug) {
    const info = typeInfo(raw.tagline) || BUSINESS_TYPES[BUSINESS_TYPES.length - 1];
    const key = JSON.stringify([raw.name, raw.location, raw.tagline, raw.layout, raw.logoImage]);
    if (heroCache.key === key) return heroCache.dataUrl;
    try {
      const dataUrl = await HeroBrandCompositor.render({
        category: info.cat,
        businessName: raw.name || 'Your business',
        location: raw.location || '',
        logo: raw.logoImage ? `${location.origin}/projects/${slug}/${raw.logoImage}` : undefined,
        layout: raw.layout,
        output: 'dataURL'
      });
      heroCache = { key, dataUrl };
      return dataUrl;
    } catch (err) {
      console.error('Hero compositor failed', err);
      return null;
    }
  }

  // The exact page that gets deployed for any business — used for the
  // open project's preview and for publishing teammates' requests.
  async function buildSiteHtml(project) {
    const raw = projectMediaAbsolute(project.raw, project.slug);
    if (!raw.heroImage) {
      const auto = await composeAutoHero(project.raw, project.slug);
      if (auto) raw.heroImage = auto;
    }
    return applyImageOverrides(applyTextOverrides(buildDemoHTML(raw), project.raw.textOverrides), project.raw.imageOverrides, project.slug);
  }

  // Photos swapped from edit mode that aren't one of the project's own
  // gallery uploads (Google / demo photos): original src → uploaded file.
  function applyImageOverrides(html, overrides, slug) {
    if (!overrides?.length) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imgs = [...doc.querySelectorAll('img')];
    for (const { from, to } of overrides) {
      imgs.forEach(img => {
        if (img.getAttribute('src') !== from) return;
        // An empty "to" means the photo was removed in edit mode.
        if (to) img.setAttribute('src', `${location.origin}/projects/${slug}/${to}`);
        else (img.closest('figure') || img).remove();
      });
    }
    doc.querySelectorAll('.gallery').forEach(g => { if (!g.querySelector('img')) g.closest('section')?.remove(); });
    return (/^\s*<!doctype/i.test(html) ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
  }

  // A computer that can deploy (Vercel signed in) publishes any site a
  // teammate asked to go live, then the new live URL syncs back to them.
  const isDeployPending = p => Boolean(p?.deployRequestedAt);
  const isOfflinePending = p => Boolean(p?.offlineRequestedAt);
  let processingDeploys = false;
  async function processDeployRequests() {
    if (!state.canDeploy || !syncEnabled || processingDeploys) return;
    processingDeploys = true;
    try {
      const pending = (await api('/api/projects')).filter(p => isDeployPending(p) || isOfflinePending(p));
      for (const p of pending) {
        if (isOfflinePending(p)) {
          try {
            const saved = await api(`/api/projects/${p.slug}/offline`, { method: 'POST' });
            if (state.current?.slug === p.slug) { replaceCurrent(saved); delete state.current.deployedHtml; }
            notify(`Took “${businessName(p)}” offline for a teammate.`);
          } catch (err) {
            await saveProjectFields(p.slug, { offlineRequestedAt: '', deployError: friendlyError(err.message) }).catch(() => {});
            notify(`Couldn’t take “${businessName(p)}” offline: ${friendlyError(err.message)}`, { sticky: false });
          }
          continue;
        }
        try {
          const html = p.importedSite ? importedMarker(p) : await buildSiteHtml(p);
          const result = await api(`/api/projects/${p.slug}/deploy`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html })
          });
          if (state.current?.slug === p.slug) {
            Object.assign(state.current, { liveUrl: result.url, deployRequestedAt: '', deployError: '', deployedHtml: html });
          }
          notify(`Published “${businessName(p)}” for a teammate — ${result.url}`);
        } catch (err) {
          await saveProjectFields(p.slug, { deployRequestedAt: '', deployError: friendlyError(err.message) }).catch(() => {});
          notify(`Couldn’t publish “${businessName(p)}”: ${friendlyError(err.message)}`, { sticky: false });
        }
      }
      if (pending.length) {
        state.projects = await api('/api/projects');
        renderLiveActions();
      }
    } catch { /* best-effort — next tick tries again */ } finally {
      processingDeploys = false;
    }
  }
  api('/api/can-deploy').then(r => { state.canDeploy = r.canDeploy; renderLiveActions(); }).catch(() => {});
  setInterval(processDeployRequests, 10000);

  // An imported website (see /api/import-site) shows as it is — a copied
  // one from its own files on this computer, a linked one straight from
  // where it's hosted. lastHtml becomes a marker of which import is on
  // screen, so the usual "matches what's live" check still works: it only
  // changes when the site is re-imported.
  // Switching between another website and Studio's own pages gets a brand
  // new frame, so nothing left from the other site (a page that refused to
  // load, its history) can keep the preview stuck on it.
  const isExternal = src => /^https?:/i.test(src || '');
  function freshPreviewFrame() {
    const fresh = el.preview.cloneNode(false);
    fresh.removeAttribute('src');
    fresh.removeAttribute('srcdoc');
    fresh.onload = el.preview.onload;
    el.preview.replaceWith(fresh);
    el.preview = fresh;
  }

  const importedMarker = p => `imported:${p.importedSite.mode}:${p.importedSite.importedAt}`;
  async function renderImportedPreview(opts = {}) {
    const p = state.current;
    const site = p.importedSite;
    let src = site.url;
    if (site.mode === 'copy') {
      const base = `/projects/${p.slug}/site/`;
      const here = await fetch(`${base}index.html`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
      if (state.current?.slug !== p.slug) return;
      if (!here) {
        if (el.preview.hasAttribute('src')) freshPreviewFrame();
        el.preview.srcdoc = '<div style="font:14px -apple-system,system-ui,sans-serif;padding:40px;color:#6b6f76">This website was copied on another computer — click <b>Re-import</b> to copy it onto this one.</div>';
        delete el.preview.dataset.lastHtml;
        return renderLiveActions();
      }
      // The query changes on every re-import, so the frame reloads.
      src = `${base}?v=${encodeURIComponent(site.importedAt)}`;
    }
    const current = el.preview.getAttribute('src');
    if (current !== src && (isExternal(current) || isExternal(src))) freshPreviewFrame();
    el.preview.removeAttribute('srcdoc');
    if (el.preview.getAttribute('src') !== src) el.preview.src = src;
    el.preview.dataset.lastHtml = importedMarker(p);
    if (opts.seedDeployed) p.deployedHtml = el.preview.dataset.lastHtml;
    renderLiveActions();
  }

  async function renderPreview(opts = {}) {
    if (!state.current || !state.current.raw?.name) {
      // Nothing to preview yet (e.g. a brand-new blank project) — clear
      // it out rather than leaving the previously open site's preview on
      // screen looking like it belongs to this one.
      el.preview.srcdoc = '';
      delete el.preview.dataset.lastHtml;
      renderLiveActions();
      return;
    }
    const slug = state.current.slug;
    if (state.current.importedSite) return renderImportedPreview(opts);
    if (el.preview.hasAttribute('src')) freshPreviewFrame();
    try {
      const html = await buildSiteHtml(state.current);
      if (state.current?.slug !== slug) return; // project switched mid-render
      if (!opts.keepFrame) el.preview.srcdoc = state.editingText ? html + EDIT_SCRIPT : html;
      el.preview.dataset.lastHtml = html;
      // Freshly opening a project: whatever it currently renders is assumed
      // to match what's live, until an edit changes it.
      if (opts.seedDeployed) state.current.deployedHtml = html;
      renderLiveActions();
    } catch (err) {
      el.preview.srcdoc = `<pre style="padding:20px;font:12px monospace">${err.message}</pre>`;
    }
  }

  // The preview iframe always renders at a real desktop (or mobile) pixel
  // width AND height — a fixed device viewport, same ratio as a real
  // browser window / phone screen — then gets scaled to fit the pane.
  // The site itself can be any length; the iframe's own native scrollbar
  // handles that, exactly like scrolling a real page in a real window,
  // instead of shrinking the whole page down to see it all at once. This
  // also means full screen actually pays off: a bigger pane just means a
  // bigger, closer-to-real-size device window, not more of a tiny page
  // crammed into view.
  const DEVICE_WIDTHS = { desktop: 1440, mobile: 390 };
  const DEVICE_HEIGHTS = { desktop: 900, mobile: 844 };
  let restoreScrollY = null;
  // In edit mode a re-render (adding, removing or moving a header page)
  // reopens whichever page you were on instead of dumping you back on
  // Home — and a brand-new page opens with its title selected to rename.
  let previewPage = null; // { slug, page }
  let pendingTitleFocus = null;
  el.preview.onload = () => {
    fitPreviewFrame();
    const page = state.editingText && previewPage?.slug === state.current?.slug && previewPage.page !== 'home' ? previewPage.page : '';
    if (page) {
      el.preview.contentWindow?.postMessage({ type: 'bs-show-page', page, focusTitle: pendingTitleFocus === page, scrollY: restoreScrollY || 0 }, '*');
    } else if (restoreScrollY !== null) {
      el.preview.contentWindow?.scrollTo(0, restoreScrollY);
    }
    restoreScrollY = null;
    pendingTitleFocus = null;
  };

  // ---------------- Manual text editing in the preview ----------------
  // "Edit" makes every plain text element on the generated page (headings,
  // subtitles, buttons, paragraphs) directly editable in place. Only the
  // editing aid is injected into the frame — the deployed/exported HTML
  // (dataset.lastHtml) never contains it. Edits to the business name or
  // About text write straight back to those fields; anything else is kept
  // as a from→to text override applied on top of the generated template.
  const EDIT_SCRIPT = `<style>
[data-bs-edit]{outline:1.5px dashed rgba(59,130,246,.45);outline-offset:3px;border-radius:3px;cursor:text;transition:outline-color .15s,background .15s}
[data-bs-edit]:hover{outline-color:#3B82F6;background:rgba(59,130,246,.06)}
[data-bs-edit]:focus{outline:2px solid #3B82F6;background:rgba(59,130,246,.08)}
.bs-tab-bar{position:fixed;z-index:2147483647;transform:translateX(-50%);display:flex;gap:2px;padding:3px;border-radius:9px;background:#111827;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.bs-tab-bar::before{content:'';position:absolute;left:0;right:0;top:-10px;height:10px}
.bs-tab-bar button{width:26px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:#fff;font:600 15px/24px -apple-system,sans-serif;cursor:pointer}
.bs-tab-bar button:hover:not(:disabled){background:rgba(255,255,255,.14)}
.bs-tab-bar button:disabled{opacity:.3;cursor:default}
.bs-tab-bar .bs-tab-del:hover:not(:disabled){background:#ef4444}
.bs-page-add{padding:5px 11px;border:1.5px dashed #3B82F6;border-radius:999px;background:rgba(59,130,246,.08);color:#3B82F6;font:600 11px -apple-system,sans-serif;cursor:pointer;white-space:nowrap}
.bs-page-add:hover{background:rgba(59,130,246,.16)}
.bs-img-btn{position:fixed;z-index:2147483647;transform:translateX(-100%);display:flex;gap:2px;padding:3px;border-radius:9px;background:#111827;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.bs-img-btn[hidden],.bs-img-btn button[hidden]{display:none}
.bs-img-btn button{padding:6px 11px;border:0;border-radius:6px;background:transparent;color:#fff;font:600 12px -apple-system,sans-serif;cursor:pointer}
.bs-img-btn button:hover{background:#3B82F6}
.bs-img-btn .bs-img-del:hover{background:#ef4444}
img[data-bs-src]{outline:1.5px dashed rgba(59,130,246,.45);outline-offset:-2px}
</style><script>(()=>{
const SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','TEXTAREA','INPUT','SELECT','OPTION','TITLE']);
document.querySelectorAll('body *').forEach(el=>{
  if(SKIP.has(el.tagName)||el.closest('svg')||el.children.length)return;
  const t=el.textContent.trim();
  if(!t)return;
  el.setAttribute('data-bs-edit','');
  el.contentEditable='plaintext-only';
  el.dataset.bsFrom=t;
});
document.querySelectorAll('a.nav-link[data-nav]').forEach(a=>{a.dataset.bsPage=a.dataset.nav;});
const nav=document.querySelector('.site-header .nav');
if(nav){
  // Hovering a header tab shows a small toolbar under it: move left/right
  // or remove. Typing on the tab itself renames it.
  const tabs=[...nav.querySelectorAll('a.nav-link[data-nav]')];
  const bar=document.createElement('div');bar.className='bs-tab-bar';bar.hidden=true;
  bar.innerHTML='<button type="button" data-act="left" title="Move left">‹</button><button type="button" data-act="right" title="Move right">›</button><button type="button" data-act="remove" class="bs-tab-del" title="Remove this page">×</button>';
  document.body.appendChild(bar);
  let cur=null,hideT=null;
  const show=a=>{
    clearTimeout(hideT);
    if(a.dataset.nav==='home'){bar.hidden=true;return;}
    cur=a;const i=tabs.indexOf(a);
    bar.querySelector('[data-act=left]').disabled=i<=1;
    bar.querySelector('[data-act=right]').disabled=i>=tabs.length-1;
    const r=a.getBoundingClientRect();bar.hidden=false;bar.style.left=(r.left+r.width/2)+'px';bar.style.top=(r.bottom+8)+'px';
  };
  const hide=()=>{clearTimeout(hideT);hideT=setTimeout(()=>{if(!bar.matches(':hover')&&document.activeElement!==cur)bar.hidden=true;},250);};
  tabs.forEach(a=>{a.addEventListener('mouseenter',()=>show(a));a.addEventListener('focus',()=>show(a));a.addEventListener('mouseleave',hide);a.addEventListener('blur',hide);});
  bar.addEventListener('mouseleave',hide);
  bar.addEventListener('mousedown',e=>e.preventDefault());
  bar.addEventListener('click',e=>{
    const b=e.target.closest('button');
    e.preventDefault();e.stopPropagation();
    if(!b||b.disabled||!cur)return;
    const id=cur.dataset.nav;
    if(b.dataset.act==='remove'){parent.postMessage({type:'bs-page-remove',page:id},'*');return;}
    const order=tabs.map(t=>t.dataset.nav).filter(x=>x!=='home');
    const i=order.indexOf(id),j=i+(b.dataset.act==='left'?-1:1);
    if(j<0||j>=order.length)return;
    [order[i],order[j]]=[order[j],order[i]];
    parent.postMessage({type:'bs-page-order',order},'*');
  });
  const before=nav.querySelector('a.button');
  const addBtn=(label,restore)=>{const b=document.createElement('button');b.type='button';b.className='bs-page-add';b.textContent=label;b.title=restore?'Bring this page back':'Add a new page';if(restore)b.dataset.restore=restore;nav.insertBefore(b,before);};
  const meta=document.querySelector('meta[name="bs-hidden-pages"]');
  (meta&&meta.content||'').split(',').filter(Boolean).forEach(id=>addBtn('+ '+(id==='services'?meta.dataset.servicesLabel:(meta.dataset.contactLabel||'Contact')),id));
  addBtn('+ Page');
}
// Hovering any photo shows Replace / Remove buttons in its corner (Remove
// only on the hero and gallery photos, where the layout copes without it).
// elementsFromPoint finds the photo even under overlaid text (the hero).
document.querySelectorAll('img').forEach(img=>{if(!img.closest('svg'))img.dataset.bsSrc=img.getAttribute('src')||'';});
const imgBtn=document.createElement('div');imgBtn.className='bs-img-btn';imgBtn.hidden=true;
imgBtn.innerHTML='<button type="button" data-act="replace">Replace photo</button><button type="button" data-act="remove" class="bs-img-del">Remove</button>';
document.body.appendChild(imgBtn);
let curImg=null;
const placeImgBtn=img=>{
  const r=img.getBoundingClientRect();imgBtn.style.left=(r.right-12)+'px';imgBtn.style.top=(Math.max(r.top,0)+12)+'px';imgBtn.hidden=false;
  imgBtn.querySelector('[data-act=remove]').hidden=!(img.classList.contains('brand-scene')||img.closest('figure.gallery-demo'));
};
document.addEventListener('mousemove',e=>{
  if(imgBtn.contains(e.target))return;
  const img=document.elementsFromPoint(e.clientX,e.clientY).find(n=>n.tagName==='IMG'&&n.dataset.bsSrc!=null);
  if(img){curImg=img;placeImgBtn(img);}else{curImg=null;imgBtn.hidden=true;}
});
window.addEventListener('scroll',()=>{if(curImg)placeImgBtn(curImg);},{passive:true});
imgBtn.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  const b=e.target.closest('button');
  if(b&&curImg)parent.postMessage({type:b.dataset.act==='remove'?'bs-img-remove':'bs-img-replace',src:curImg.dataset.bsSrc,hero:curImg.classList.contains('brand-scene')},'*');
});
window.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type!=='bs-show-page')return;
  const a=document.querySelector('a[data-nav="'+CSS.escape(d.page)+'"]');
  if(!a)return;
  a.click();
  if(d.scrollY)window.scrollTo(0,d.scrollY);
  if(d.focusTitle){
    const h=document.querySelector('.page[data-page="'+CSS.escape(d.page)+'"] .page-intro h2[data-bs-edit]');
    if(h){h.focus();const r=document.createRange();r.selectNodeContents(h);const s=getSelection();s.removeAllRanges();s.addRange(r);}
  }
});
// Buttons and links are for editing, not clicking: swallow real clicks on
// them before the site's own handlers see them. Header tabs still switch
// pages, and our own programmatic a.click() (bs-show-page) is let through.
window.addEventListener('click',e=>{
  const pb=e.target.closest('.bs-page-add');
  if(pb){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'bs-page-add',restore:pb.dataset.restore||''},'*');return;}
  if(e.target.closest('.bs-tab-bar,.bs-img-btn'))return;
  const a=e.target.closest('a,button,[role=button],[onclick]');
  if(!a)return;
  e.preventDefault();
  if(e.isTrusted&&!a.matches('a.nav-link[data-nav]'))e.stopImmediatePropagation();
},true);
// Space on an editable button would "press" it instead of typing a space.
document.addEventListener('keydown',e=>{
  if(e.key!==' '||!e.target.hasAttribute||!e.target.hasAttribute('data-bs-edit')||!e.target.closest('a,button'))return;
  e.preventDefault();document.execCommand('insertText',false,' ');
},true);
document.addEventListener('submit',e=>e.preventDefault(),true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.hasAttribute&&e.target.hasAttribute('data-bs-edit')){e.preventDefault();e.target.blur();}});
document.addEventListener('focusout',e=>{
  const el=e.target;
  if(!el.hasAttribute||!el.hasAttribute('data-bs-edit'))return;
  const to=el.textContent.trim(),from=el.dataset.bsFrom;
  if(!to){el.textContent=from;return;}
  if(el.dataset.bsPage){
    if(to!==from){parent.postMessage({type:'bs-page-rename',page:el.dataset.bsPage,to},'*');document.querySelectorAll('a.nav-link[data-bs-page="'+CSS.escape(el.dataset.bsPage)+'"]').forEach(o=>{o.textContent=to;o.dataset.bsFrom=to;});}
    return;
  }
  if(to!==from){parent.postMessage({type:'bs-text-edit',from,to},'*');document.querySelectorAll('[data-bs-edit]').forEach(o=>{if(o.dataset.bsFrom===from){if(o!==el)o.textContent=to;o.dataset.bsFrom=to;}});}
});
})();<\/script>`;

  function applyTextOverrides(html, overrides) {
    if (!overrides?.length) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const leaves = [...doc.body.querySelectorAll('*')].filter(n => !n.children.length);
    for (const { from, to } of overrides) {
      leaves.forEach(n => { if (n.textContent.trim() === from) n.textContent = to; });
    }
    return (/^\s*<!doctype/i.test(html) ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
  }

  // Must match the placeholder fresh-templates.js renders for an empty page.
  const customPageBody = p => p.body || `Write about “${p.title}” here — click to edit.`;

  function handleTextEdit(from, to) {
    const raw = state.current.raw || {};
    const profile = raw.businessProfile || {};
    if (raw.name && from.toLowerCase() === raw.name.trim().toLowerCase()) {
      setRaw({ name: to });
    } else if (profile.about && from === profile.about.trim()) {
      setRaw({ businessProfile: { ...profile, about: to } });
    } else if ((raw.customPages || []).some(p => p.title === from || customPageBody(p) === from)) {
      setRaw({ customPages: raw.customPages.map(p =>
        p.title === from ? { ...p, title: to } : customPageBody(p) === from ? { ...p, body: to } : p) });
    } else {
      const list = raw.textOverrides || [];
      const chained = list.some(o => o.to === from);
      const next = chained ? list.map(o => (o.to === from ? { ...o, to } : o)) : [...list, { from, to }];
      setRaw({ textOverrides: next.filter(o => o.from !== o.to) });
    }
    // The frame already shows the new text — only refresh the deployable
    // HTML and save, without reloading the frame mid-edit.
    renderPreview({ keepFrame: true });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 500);
  }

  // Header pages, changed from the × / "+ Page" controls edit mode adds to
  // the preview's nav (see EDIT_SCRIPT). Built-in pages are only hidden, so
  // restoring one brings it back with its content intact.
  function handlePageChange({ add, restore, remove }) {
    const raw = state.current.raw || {};
    const hidden = raw.hiddenPages || [];
    const pages = raw.customPages || [];
    const slug = state.current.slug;
    if (restore) {
      setRaw({ hiddenPages: hidden.filter(id => id !== restore) });
      previewPage = { slug, page: restore };
    } else if (add) {
      const titles = new Set(pages.map(p => p.title));
      let title = 'New page';
      for (let n = 2; titles.has(title); n++) title = `New page ${n}`;
      const id = `page-${Date.now().toString(36)}`;
      setRaw({ customPages: [...pages, { id, title, body: '' }] });
      previewPage = { slug, page: id };
      pendingTitleFocus = id;
    } else if (remove) {
      const custom = pages.find(p => p.id === remove);
      if (custom?.body?.trim() && !confirm(`Delete the “${custom.title}” page and everything written on it?`)) return;
      if (remove === 'services' || remove === 'contact') {
        // Built-in pages are only hidden — its "+" button in the nav brings it back.
        setRaw({ hiddenPages: [...new Set([...hidden, remove])] });
      } else if (custom) {
        setRaw({ customPages: pages.filter(p => p.id !== remove), pageOrder: (raw.pageOrder || []).filter(id => id !== remove) });
      }
      if (previewPage?.page === remove) previewPage = { slug, page: 'home' };
    }
    refreshAfterPageChange();
  }

  // Typing on a header tab renames it: custom pages keep their title on the
  // page record, built-in tabs (Home/Services/Contact) get a label override.
  // The frame already shows the new name, so it isn't reloaded.
  function handlePageRename(page, to) {
    const raw = state.current.raw || {};
    if ((raw.customPages || []).some(p => p.id === page)) {
      setRaw({ customPages: raw.customPages.map(p => (p.id === page ? { ...p, title: to } : p)) });
    } else {
      setRaw({ pageTitles: { ...(raw.pageTitles || {}), [page]: to } });
    }
    renderPreview({ keepFrame: true });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 500);
  }

  // "Replace photo" in edit mode. The hero photo goes to the Media
  // section's hero slot; a photo that's one of the project's gallery
  // uploads is swapped in the gallery; any other (Google / demo) photo is
  // uploaded and kept as an original-src → file override.
  const imagePicker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  document.body.appendChild(imagePicker);
  let pendingImage = null;
  function pickReplacementImage(src, hero) {
    pendingImage = { src, hero, slug: state.current.slug };
    imagePicker.value = '';
    imagePicker.click();
  }
  imagePicker.onchange = async () => {
    const file = imagePicker.files[0], target = pendingImage;
    pendingImage = null;
    if (!file || !target || target.slug !== state.current?.slug) return;
    restoreScrollY = el.preview.contentWindow?.scrollY || 0;
    try {
      if (target.hero) return await uploadMedia('hero', file);
      const form = new FormData();
      form.append('file', file);
      const { path } = await api(`/api/projects/${target.slug}/media/gallery`, { method: 'POST', body: form });
      const raw = state.current.raw || {};
      const local = rel => `${location.origin}/projects/${target.slug}/${rel}`;
      const gallery = raw.gallery || [];
      const list = raw.imageOverrides || [];
      if (gallery.some(g => local(g) === target.src)) {
        setRaw({ gallery: gallery.map(g => (local(g) === target.src ? path : g)) });
      } else if (list.some(o => local(o.to) === target.src)) {
        setRaw({ imageOverrides: list.map(o => (local(o.to) === target.src ? { ...o, to: path } : o)) });
      } else {
        setRaw({ imageOverrides: [...list, { from: target.src, to: path }] });
      }
      await persist();
      renderEditor();
      schedulePreview();
    } catch (err) {
      notify(friendlyError(err.message));
    }
  };

  // "Remove" in edit mode: an uploaded hero goes back to the automatic one;
  // a gallery upload leaves the gallery; a Google / demo photo is dropped
  // with an empty override (see applyImageOverrides).
  async function removePreviewImage(src, hero) {
    const raw = state.current.raw || {};
    const slug = state.current.slug;
    const local = rel => `${location.origin}/projects/${slug}/${rel}`;
    restoreScrollY = el.preview.contentWindow?.scrollY || 0;
    if (hero) {
      if (!raw.heroImage) return notify('That’s the automatic hero picture — use “Replace photo” to put your own in.', { sticky: false });
      return removeMedia('hero');
    }
    const gallery = raw.gallery || [];
    const list = raw.imageOverrides || [];
    if (gallery.some(g => local(g) === src)) {
      setRaw({ gallery: gallery.filter(g => local(g) !== src) });
    } else if (list.some(o => o.to && local(o.to) === src)) {
      setRaw({ imageOverrides: list.map(o => (o.to && local(o.to) === src ? { ...o, to: '' } : o)) });
    } else {
      setRaw({ imageOverrides: [...list, { from: src, to: '' }] });
    }
    await persist();
    renderEditor();
    schedulePreview();
  }

  function refreshAfterPageChange() {
    restoreScrollY = el.preview.contentWindow?.scrollY || 0;
    renderPreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 500);
  }

  window.addEventListener('message', e => {
    if (e.source !== el.preview.contentWindow || !state.current) return;
    if (e.data?.source === 'ai-demo') previewPage = { slug: state.current.slug, page: String(e.data.path || 'home') };
    else if (e.data?.type === 'bs-text-edit') handleTextEdit(String(e.data.from), String(e.data.to));
    else if (e.data?.type === 'bs-page-add') handlePageChange({ add: true, restore: String(e.data.restore || '') });
    else if (e.data?.type === 'bs-page-remove') handlePageChange({ remove: String(e.data.page || '') });
    else if (e.data?.type === 'bs-page-rename') handlePageRename(String(e.data.page || ''), String(e.data.to || '').trim());
    else if (e.data?.type === 'bs-img-replace') pickReplacementImage(String(e.data.src || ''), Boolean(e.data.hero));
    else if (e.data?.type === 'bs-img-remove') removePreviewImage(String(e.data.src || ''), Boolean(e.data.hero));
    else if (e.data?.type === 'bs-page-order' && Array.isArray(e.data.order)) {
      setRaw({ pageOrder: e.data.order.map(String) });
      refreshAfterPageChange();
    }
  });

  function setTextEditing(on) {
    state.editingText = on;
    el.editTextBtn.classList.toggle('is-editing', on);
    el.editTextBtn.innerHTML = on ? 'Done' : `${PENCIL_ICON}Edit`;
    el.editTextBtn.title = on ? 'Finish editing text' : 'Edit text on the page';
  }
  const PENCIL_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  el.editTextBtn.onclick = async () => {
    if (!el.preview.dataset.lastHtml) return;
    restoreScrollY = el.preview.contentWindow?.scrollY || 0;
    const turningOff = state.editingText;
    setTextEditing(!turningOff);
    if (turningOff) {
      await flushSave();
      renderEditor();
    }
    renderPreview();
  };

  // Padding the white frame (.preview-frame-border) adds on each side —
  // kept in sync with style.css so the scale math leaves room for it
  // instead of the frame pushing the content past the pane's edges.
  // Mobile gets a thicker top/bottom bezel than left/right (see
  // .mobile-frame in style.css), hence separate X/Y values.
  const FRAME_PAD_X = { desktop: 10, mobile: 9 };
  const FRAME_PAD_Y = { desktop: 10, mobile: 26 };

  function fitPreviewFrame() {
    if (!el.preview.dataset.lastHtml) return;
    const isMobile = state.viewport === 'mobile';
    const border = document.getElementById('previewFrameBorder');
    border.classList.toggle('mobile-frame', isMobile);
    const deviceWidth = DEVICE_WIDTHS[state.viewport] || DEVICE_WIDTHS.desktop;
    const deviceHeight = DEVICE_HEIGHTS[state.viewport] || DEVICE_HEIGHTS.desktop;
    const padX = (isMobile ? FRAME_PAD_X.mobile : FRAME_PAD_X.desktop) * 2;
    const padY = (isMobile ? FRAME_PAD_Y.mobile : FRAME_PAD_Y.desktop) * 2;
    const wrapWidth = el.previewFrameWrap.clientWidth - 32 - padX;
    const wrapHeight = el.previewFrameWrap.clientHeight - 32 - padY;
    let scale, finalHeight;
    if (!isMobile && state.desktopExpanded) {
      // "Fill the preview area" — scale by width only, then stretch the
      // device viewport's height to use all the vertical room that frees
      // up, instead of stopping at the fixed 900px device height. More of
      // the real page is visible before you need to scroll it at all.
      scale = Math.max(0.2, Math.min(1, wrapWidth / deviceWidth));
      finalHeight = wrapHeight / scale;
    } else {
      scale = Math.max(0.2, Math.min(1, wrapWidth / deviceWidth, wrapHeight / deviceHeight));
      finalHeight = deviceHeight;
    }
    el.preview.style.width = `${deviceWidth}px`;
    el.preview.style.height = `${finalHeight}px`;
    el.preview.style.transform = `scale(${scale})`;
    const box = document.getElementById('previewScaleBox');
    box.style.width = `${deviceWidth * scale}px`;
    box.style.height = `${finalHeight * scale}px`;
  }

  // A small spinner + text for "this is in progress" states, instead of
  // plain status text that looked identical to a finished/error message.
  function setLoading(el, text) {
    el.innerHTML = `<span class="status-spinner"></span>${escapeHtml(text)}`;
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

  // UK-first phone → WhatsApp international format: a local "07…" number
  // becomes "447…" (WhatsApp's click-to-chat API needs digits only, no
  // leading +, no spaces) — numbers already in +44/44/other-country form
  // are left as they are, just stripped of formatting.
  function toWhatsAppNumber(phone) {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    if (!digits) return '';
    if (digits.startsWith('+')) return digits.slice(1);
    if (digits.startsWith('0')) return '44' + digits.slice(1);
    return digits;
  }

  function welcomeMessage() {
    const name = businessName(state.current);
    const url = state.current?.liveUrl;
    const firstName = String(state.current?.contact?.name || '').trim().split(/\s+/)[0];
    const hi = firstName ? `Hi ${firstName}` : 'Hi';
    return url
      ? `${hi}, thanks for chatting with us today! We've put together a website for ${name} — you can take a look here: ${url}\n\nAny questions at all, just let me know.`
      : `${hi}, thanks for chatting with us today! We'd love to help ${name} with a brand new website — any questions at all, just let me know.`;
  }

  function openWhatsApp(phone) {
    const number = toWhatsAppNumber(phone);
    if (!number) return notify('Add a phone number first.', { sticky: false });
    openExternal(`https://wa.me/${number}?text=${encodeURIComponent(welcomeMessage())}`);
  }

  function openEmail(email) {
    const to = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(to)) return notify('Add an email address first.', { sticky: false });
    const subject = `A website for ${businessName(state.current)}`;
    openExternal(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(welcomeMessage())}`);
  }

  // Electron's renderer blocks window.open() for new windows by default
  // (no window-open handler configured), so external links are opened via
  // the main process's shell.openExternal instead — same real system
  // browser a person would expect.
  // Our own opens of a live site carry ?bs_owner=1 so its view counter
  // skips this browser from then on — only the business's opens count.
  function ownerUrl(url) {
    return `${url}${url.includes('?') ? '&' : '?'}bs_owner=1`;
  }

  function openExternal(url) {
    api('/api/open-external', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    }).catch(err => notify(err.message, { sticky: false }));
  }

  // Reflects state.viewport onto the toggle buttons + expand indicator.
  // Full screen is desktop-only, so switching into it while on mobile
  // routes through here too, to force the view back to desktop.
  function setViewport(viewport) {
    state.viewport = viewport;
    el.viewportToggle.querySelectorAll('button[data-viewport]').forEach(b => b.classList.toggle('active', b.dataset.viewport === viewport));
    el.desktopExpandIndicator.classList.toggle('on-mobile', viewport !== 'desktop');
    el.desktopExpandIndicator.classList.toggle('expanded', state.desktopExpanded);
  }

  // "Full screen" expands the preview to fill the app window itself
  // (hiding the sidebar/editor) rather than taking over the whole Mac
  // display — a real OS-level fullscreen felt jarring for a quick preview.
  // It only ever shows the desktop ratio, so entering it while mobile
  // view is selected switches back to desktop first.
  const EXPAND_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const CONTRACT_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  el.fullscreenBtn.onclick = () => {
    if (!el.preview.dataset.lastHtml) return;
    state.appFullscreen = !state.appFullscreen;
    if (state.appFullscreen && state.viewport !== 'desktop') setViewport('desktop');
    document.querySelector('.layout').classList.toggle('preview-fullscreen', state.appFullscreen);
    el.fullscreenBtn.innerHTML = state.appFullscreen ? CONTRACT_ICON : EXPAND_ICON;
    el.fullscreenBtn.title = state.appFullscreen ? 'Exit full screen' : 'Full screen';
    fitPreviewFrame();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.appFullscreen) el.fullscreenBtn.onclick();
  });
  el.closePreviewBtn.onclick = () => closeCurrentProject();
  // The desktop button doubles as the "fill full length" toggle: clicking
  // it while desktop view is already active flips between the default
  // device ratio and filling all available vertical space, rather than
  // that living on a separate control. The chevron to its left is a
  // read-only indicator of which state you're in — only app-level full
  // screen (el.fullscreenBtn) already fills everything, so this toggle
  // is inert while that's active to avoid the two fighting each other.
  el.viewportToggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-viewport]');
    if (!btn) return;
    const clickedViewport = btn.dataset.viewport;
    const alreadyOnDesktop = state.viewport === 'desktop' && clickedViewport === 'desktop';
    if (alreadyOnDesktop) {
      if (!state.appFullscreen) state.desktopExpanded = !state.desktopExpanded;
    } else if (clickedViewport === 'desktop') {
      // Desktop view always starts expanded by default (mirrors the
      // initial state), whether that's the first switch back from mobile
      // or any later one — only an explicit second click collapses it.
      state.desktopExpanded = true;
    }
    setViewport(clickedViewport);
    fitPreviewFrame();
  });
  window.addEventListener('resize', fitPreviewFrame);
  el.exportBtn.onclick = async () => {
    if (!state.current || !el.preview.dataset.lastHtml) return alert('Nothing to export yet.');
    const result = await api(`/api/projects/${state.current.slug}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: el.preview.dataset.lastHtml })
    });
    notify('Website exported and ready to send.');
    alert(`Exported to:\n${result.path}`);
  };
  el.copyLiveBtn.onclick = async () => {
    const liveUrl = state.current?.liveUrl;
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      notify('Live website link copied — ready to send.');
    } catch {
      notify(`Live at ${liveUrl}`, { sticky: true });
    }
  };
  el.deployBtn.onclick = async () => {
    // Green already means "live and matching what's on screen" — clicking
    // it then opens the site instead of redeploying something unchanged.
    // Red/amber (never deployed, or deployed but stale) still deploy.
    if (state.current?.importedSite?.mode === 'link') return openExternal(state.current.importedSite.url);
    if (el.deployBtn.classList.contains('status-live') && state.current?.liveUrl) {
      return openExternal(ownerUrl(state.current.liveUrl));
    }
    if (!state.current || !el.preview.dataset.lastHtml) return alert('Nothing to deploy yet.');
    // No Vercel on this computer: hand it to a copy that has it, via the
    // shared data (see processDeployRequests below).
    if (!state.canDeploy) {
      if (!syncEnabled) return notify('Can’t send this to go live — shared sync is off.', { sticky: false });
      if (isDeployPending(state.current)) return notify('Already waiting to go live.', { sticky: false });
      state.current.deployRequestedAt = new Date().toISOString();
      state.current.deployError = '';
      await persist();
      return notify('Sent to go live — it publishes from the admin’s computer while their app is open.');
    }
    el.deployBtn.disabled = true;
    el.deployBtn.innerHTML = `<span class="status-spinner light"></span>Deploying…`;
    el.deployBtn.classList.remove('status-not-live', 'status-live', 'status-needs-update');
    el.deployBtn.classList.add('status-deploying');
    try {
      const result = await api(`/api/projects/${state.current.slug}/deploy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: el.preview.dataset.lastHtml })
      });
      state.current.liveUrl = result.url;
      state.current.deployedHtml = el.preview.dataset.lastHtml;
      try { await navigator.clipboard.writeText(result.url); } catch { /* clipboard may be unavailable */ }
      notify(`Live at ${result.url} (copied to clipboard).`, { sticky: true });
    } catch (err) {
      notify(friendlyError(err.message), { sticky: false });
    } finally {
      el.deployBtn.disabled = false;
      renderLiveActions();
    }
  };

  // A site can go offline outside this app (removed in Vercel, or taken
  // offline from another computer) — so the open site's live URL is
  // re-checked when it's opened and every minute, and the button drops
  // back to red "Make live" if it's gone.
  async function checkLive() {
    const slug = state.current?.slug;
    if (!slug || !state.current.liveUrl || el.deployBtn.disabled) return;
    try {
      const checked = await api(`/api/projects/${slug}/check-live`, { method: 'POST' });
      if (!checked.liveUrl && state.current?.slug === slug && state.current.liveUrl) {
        replaceCurrent(checked);
        delete state.current.deployedHtml;
        renderLiveActions();
        notify('This site is offline — click Make live to put it back up.');
      }
    } catch { /* best-effort */ }
  }
  setInterval(checkLive, 60000);

  el.offlineBtn.onclick = async () => {
    if (!state.current?.liveUrl) return;
    const ok = await showConfirm(`Take “${businessName(state.current)}” offline?`,
      'The live link stops working until you make it live again — it comes back on the same link.', 'Take offline');
    if (!ok) return;
    if (!state.canDeploy) {
      if (!syncEnabled) return notify('Can’t send this — shared sync is off.', { sticky: false });
      state.current.offlineRequestedAt = new Date().toISOString();
      await persist();
      renderLiveActions();
      return notify('Sent — it goes offline from the admin’s computer while their app is open.');
    }
    el.offlineBtn.disabled = true;
    el.offlineBtn.innerHTML = '<span class="status-spinner"></span>Taking offline…';
    try {
      replaceCurrent(await api(`/api/projects/${state.current.slug}/offline`, { method: 'POST' }));
      delete state.current.deployedHtml;
      notify('Site taken offline.');
    } catch (err) {
      notify(friendlyError(err.message), { sticky: false });
    } finally {
      el.offlineBtn.disabled = false;
      renderLiveActions();
    }
  };

  // ---------------- version + app updates ----------------
  // The version shows everywhere, including colleagues on the plain browser
  // at localhost:4173. The update button only exists inside the installed
  // app, where preload.js exposes window.brightsiteUpdates.
  api('/api/app-info').then(info => {
    el.appVersion.textContent = `v${info.version}`;
    el.appVersion.hidden = false;
  }).catch(() => {});

  const updates = window.brightsiteUpdates;
  let upToDateTimer = null;
  let updateState = null;
  function renderUpdateState(s) {
    const btn = el.updateBtn;
    updateState = s;
    clearTimeout(upToDateTimer);
    btn.hidden = !s || s.status === 'dev';
    if (btn.hidden) return;
    btn.disabled = s.status === 'checking' || s.status === 'downloading';
    // 'available' = newer version out, but this build can't install it
    // itself (a Mac without a Developer ID signature) — offer the download.
    btn.classList.toggle('is-ready', s.status === 'ready' || s.status === 'available');
    btn.classList.toggle('is-error', s.status === 'error');
    btn.title = s.status === 'error' ? `Last check failed: ${s.message || 'unknown error'}`
      : s.status === 'available' ? 'Opens the download page — this Mac can’t install updates automatically yet.' : '';
    const labels = {
      idle: 'Check for updates',
      checking: 'Checking…',
      downloading: `Downloading${s.newVersion ? ` v${s.newVersion}` : ''} ${s.percent || 0}%`,
      ready: `Restart to update${s.newVersion ? ` to v${s.newVersion}` : ''}`,
      available: `Download v${s.newVersion || 'update'}`,
      'up-to-date': 'Up to date ✓',
      error: 'Update failed — retry'
    };
    btn.innerHTML = (btn.disabled ? '<span class="status-spinner"></span>' : '') + escapeHtml(labels[s.status] || labels.idle);
    // "Up to date" is a confirmation, not a resting state — fall back to
    // the check button after a moment.
    if (s.status === 'up-to-date') upToDateTimer = setTimeout(() => renderUpdateState({ ...s, status: 'idle' }), 5000);
  }
  if (updates) {
    updates.getState().then(renderUpdateState).catch(() => {});
    updates.onState(renderUpdateState);
    el.updateBtn.onclick = () => {
      const status = updateState?.status;
      if (status === 'ready') {
        el.updateBtn.disabled = true;
        el.updateBtn.textContent = 'Restarting…';
        updates.install();
      } else if (status === 'available') {
        updates.openDownload();
      } else {
        updates.check().then(renderUpdateState).catch(() => {});
      }
    };
  }

  // ---------------- Sales stages + Live & Paying ----------------
  // Both tabs are pure views over the same project records the Businesses
  // tab edits (one data.json per business, synced by lib/supabase-sync.js),
  // reading and writing the fields that already exist on them:
  // pipelineStage, contact.email, raw.businessProfile.phone, notes, price,
  // paymentStatus and liveUrl. Nothing here creates a second record.
  const SALES_STAGES = [
    ['uncontacted', 'Uncontacted'],
    ['called', 'Called'],
    ['follow_up', 'Follow-up needed'],
    ['interested', 'Interested'],
    ['demo_sent', 'Demo sent'],
    ['not_interested', 'Not interested']
  ];
  const PAYMENT_STATUSES = [['no', 'Not paying'], ['pending', 'Pending'], ['paid', 'Paid']];

  const stageLabel = id => (SALES_STAGES.find(([s]) => s === id) || [])[1] || 'Uncontacted';
  const paymentLabel = id => (PAYMENT_STATUSES.find(([s]) => s === id) || [])[1] || 'Not paying';

  // Records created before these stages existed (or with no stage at all)
  // count as uncontacted, so nothing needs migrating on disk.
  function stageOf(p) {
    const stage = p.pipelineStage;
    return SALES_STAGES.some(([id]) => id === stage) ? stage : 'uncontacted';
  }
  const businessName = p => p.raw?.name || p.name || p.slug;
  const phoneOf = p => p.raw?.businessProfile?.phone || p.contact?.phone || '';
  // Pending or paid is what puts a business on the Live tab — with or
  // without a site built here (customers can be added straight onto it).
  const isPaid = p => p.paymentStatus === 'paid';
  const isPending = p => p.paymentStatus === 'pending';
  const websiteOf = p => (p.customDomain ? `https://${p.customDomain}` : '') || p.liveUrl || p.contact?.existingWebsite || '';

  // ---------------- Notifications (bell) ----------------
  // Major events only — a business added or deleted, going live or offline,
  // payment status, plan and domain changes. Worked out by diffing each
  // fresh project list against the last one seen on this computer, so
  // changes a teammate makes (arriving via shared sync) show up too.
  // Edits like a title or address never notify.
  const NOTIF_KEY = 'bs.notifications';
  const NOTIF_SNAPSHOT_KEY = 'bs.notifSnapshot';
  const bellBtn = document.getElementById('bellBtn');
  const bellBadge = document.getElementById('bellBadge');
  const notifPanel = document.getElementById('notifPanel');
  const notifList = document.getElementById('notifList');
  const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };
  let notifications = readStore(NOTIF_KEY, []);

  const snapshotOf = p => ({
    name: businessName(p), pay: p.paymentStatus || 'no', live: Boolean(p.liveUrl),
    plan: p.plan ? JSON.stringify(p.plan) : '', domain: p.customDomain || '', bill: p.billing?.status || ''
  });

  function checkNotifications() {
    if (!state.projectsLoaded) return;
    const now = Object.fromEntries(state.projects.map(p => [p.slug, snapshotOf(p)]));
    const before = readStore(NOTIF_SNAPSHOT_KEY, null);
    writeStore(NOTIF_SNAPSHOT_KEY, now);
    if (!before) return; // first run on this computer — nothing to compare against
    const found = [];
    const add = (slug, icon, text) => found.push({ id: `${Date.now()}-${found.length}`, slug, icon, text, at: new Date().toISOString(), read: false });
    for (const [slug, cur] of Object.entries(now)) {
      const old = before[slug];
      const name = `“${cur.name}”`;
      if (!old) { add(slug, '✨', `${name} was added`); continue; }
      if (cur.pay !== old.pay) {
        if (cur.pay === 'paid') add(slug, '💷', `${name} is now paying`);
        else if (cur.pay === 'pending') add(slug, '⏳', `${name} is now pending payment`);
        else add(slug, '⚠️', `${name} is no longer ${old.pay === 'paid' ? 'paying' : 'pending'}`);
      }
      if (cur.live !== old.live) {
        const paying = cur.pay === 'paid' || cur.pay === 'pending';
        add(slug, cur.live ? '🚀' : paying ? '🔴' : '⏸', cur.live ? `${name} is now live` : paying ? `${name}’s site is offline — a paying customer` : `${name} was taken offline`);
      }
      if (cur.bill && cur.bill !== (old.bill || '')) {
        const text = { cancelling: 'cancelled their subscription', failed: 'has a failed payment', cancelled: 'subscription has ended', active: old.bill ? 'subscription is active again' : '' }[cur.bill];
        if (text) add(slug, cur.bill === 'active' ? '💷' : '🚨', `${name} ${text}`);
      }
      if (cur.plan && cur.plan !== old.plan) add(slug, '📋', `${name} ${old.plan ? 'changed plan' : 'chose a plan'}: ${planSummary(JSON.parse(cur.plan)) || 'custom'}`);
      if (cur.domain && cur.domain !== old.domain) add(slug, '🌐', `${name} connected ${cur.domain}`);
    }
    for (const [slug, old] of Object.entries(before)) {
      if (!now[slug]) add(slug, '🗑', `“${old.name}” was deleted`);
    }
    if (!found.length) return;
    notifications = [...found.reverse(), ...notifications].slice(0, 100);
    writeStore(NOTIF_KEY, notifications);
    renderNotifications();
  }

  // One bell reminder each time a business becomes due (keyed by its first
  // unanswered open). The first run on a computer just remembers what's
  // already due, so old demos don't all ring at once.
  const FOLLOW_SEEN_KEY = 'bs.followUpsNotified';
  function checkFollowUps() {
    if (!state.projectsLoaded) return;
    const stored = readStore(FOLLOW_SEEN_KEY, null);
    const seen = stored || {};
    const fresh = state.projects.filter(p => isFollowUpDue(p) && seen[p.slug] !== followUpSince(p));
    fresh.forEach(p => { seen[p.slug] = followUpSince(p); });
    if (!stored || fresh.length) writeStore(FOLLOW_SEEN_KEY, seen);
    if (!stored || !fresh.length) return;
    const at = new Date().toISOString();
    notifications = [...fresh.map((p, i) => ({
      id: `${Date.now()}-f${i}`, slug: p.slug, icon: '⏰', at, read: false,
      text: `Follow up with “${businessName(p)}”: they opened the demo but haven’t replied`
    })), ...notifications].slice(0, 100);
    writeStore(NOTIF_KEY, notifications);
    renderNotifications();
  }

  function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function renderNotifications() {
    const unread = notifications.filter(n => !n.read).length;
    bellBadge.hidden = !unread;
    bellBadge.textContent = unread > 9 ? '9+' : String(unread);
    if (notifPanel.hidden) return;
    notifList.innerHTML = notifications.length ? notifications.map(n => `
      <button type="button" class="notif-item ${n.read ? '' : 'unread'}" data-slug="${escapeHtml(n.slug)}">
        <span class="notif-icon">${n.icon}</span>
        <span class="notif-text">${escapeHtml(n.text)}<small>${timeAgo(n.at)}</small></span>
      </button>`).join('') : '<div class="notif-empty">No notifications yet</div>';
  }

  function closeNotifications() {
    if (notifPanel.hidden) return;
    notifPanel.hidden = true;
    bellBtn.classList.remove('open');
    notifications = notifications.map(n => ({ ...n, read: true }));
    writeStore(NOTIF_KEY, notifications);
    renderNotifications();
  }

  bellBtn.onclick = e => {
    e.stopPropagation();
    if (!notifPanel.hidden) return closeNotifications();
    notifPanel.hidden = false;
    bellBtn.classList.add('open');
    renderNotifications();
  };
  document.getElementById('notifClearBtn').onclick = () => {
    notifications = [];
    writeStore(NOTIF_KEY, notifications);
    renderNotifications();
  };
  notifList.addEventListener('click', e => {
    const item = e.target.closest('.notif-item');
    const p = item && state.projects.find(x => x.slug === item.dataset.slug);
    if (!p) return;
    closeNotifications();
    if (isPaid(p) || isPending(p)) document.querySelector('.tab-switch [data-tab="live"]')?.click();
    else selectProject(p.slug);
  });
  document.addEventListener('click', e => { if (!e.target.closest('.notif-wrap')) closeNotifications(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNotifications(); });
  renderNotifications();

  // The plans on brightsite.app/pricing. Pro and Prestige can be paid
  // monthly or yearly; the booking form is a £20/mo add-on on any plan.
  const PLANS = [
    { id: 'essential', name: 'Essential', billing: { monthly: { setup: 0, amount: 19 } } },
    { id: 'pro', name: 'Pro', billing: { monthly: { setup: 199, amount: 15 }, annual: { setup: 99, amount: 180 } } },
    { id: 'prestige', name: 'Prestige', billing: { monthly: { setup: 299, amount: 15 }, annual: { setup: 149, amount: 180 } } }
  ];
  const BOOKING_ADDON = 20;
  const money = n => `£${Number(n).toFixed(2).replace(/\.00$/, '')}`;

  // What a plan charges: a one-off setup plus one recurring amount. Billed
  // yearly, the booking add-on is charged yearly too — Stripe needs every
  // recurring item on one payment link to share an interval.
  function planCharges(plan) {
    if (!plan) return null;
    if (plan.id === 'custom') {
      const setup = Number(plan.setup) || 0, amount = Number(plan.monthly) || 0;
      return setup || amount ? { name: 'Custom', setup, amount, interval: 'month' } : null;
    }
    const def = PLANS.find(x => x.id === plan.id);
    if (!def) return null;
    const annual = plan.billing === 'annual' && Boolean(def.billing.annual);
    const { setup, amount } = def.billing[annual ? 'annual' : 'monthly'];
    const booking = plan.booking ? BOOKING_ADDON * (annual ? 12 : 1) : 0;
    return { name: def.name, setup, amount: amount + booking, interval: annual ? 'year' : 'month', booking: Boolean(plan.booking) };
  }
  function planSummary(plan) {
    const c = planCharges(plan);
    return c ? `${c.name}${c.booking ? ' + booking form' : ''} · ${money(c.setup)} setup + ${money(c.amount)}/${c.interval === 'year' ? 'yr' : 'mo'}` : '';
  }

  // A chosen plan wins; otherwise only prices that are actually a number
  // contribute to the monthly total — an agreed price written as free text
  // ("TBC", "£50 + VAT") still shows on its row, it just can't be summed.
  function monthlyValue(p) {
    const c = planCharges(p.plan);
    if (c) return c.interval === 'year' ? c.amount / 12 : c.amount;
    const amount = parseFloat(String(p.price ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(amount) ? amount : 0;
  }

  function rememberProject(saved) {
    const idx = state.projects.findIndex(p => p.slug === saved.slug);
    if (idx !== -1) state.projects[idx] = saved;
    checkNotifications();
    // Keep the Businesses tab's in-memory copy in step, so its next save
    // can't overwrite what was just changed here with a stale object.
    if (state.current?.slug === saved.slug) replaceCurrent(saved);
    return saved;
  }

  // Saves a patch against any business by slug (not just the open one, the
  // way persist() does). Goes through the same PUT the Businesses tab uses,
  // so it saves locally first and pushes through Supabase sync exactly the
  // same way.
  async function saveProjectFields(slug, patch) {
    return rememberProject(await api(`/api/projects/${slug}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
    }));
  }

  function projectBySlug(slug) {
    return state.projects.find(p => p.slug === slug) || null;
  }

  // Which Live-tab section a customer is in. A Stripe subscription that's
  // cancelled, cancelling or failing is urgent whatever else is set; an
  // active one (or a manual "Paid" for customers paying another way) is Live.
  const LAPSED_BILLING = ['cancelling', 'failed', 'cancelled'];
  const liveSection = p => LAPSED_BILLING.includes(p.billing?.status) ? 'urgent'
    : (p.billing?.status === 'active' || isPaid(p)) ? 'live' : 'pending';
  // A linked website (imported, hosted elsewhere) is up but never published
  // from Studio, so it gets no Make live / Take offline.
  const isLinkedSite = p => p.importedSite?.mode === 'link';
  const siteBuiltHere = p => Boolean(p.raw?.name) && !isLinkedSite(p);
  // Green = live, red = a site that was live and has gone down, hollow = a
  // site built here that hasn't been published yet, grey = no site of ours
  // (e.g. a customer added with their own existing website). Only red
  // counts towards the "sites are offline" warning.
  const siteState = p => p.liveUrl || isLinkedSite(p) ? 'up'
    : !siteBuiltHere(p) ? 'none' : p.everLive ? 'down' : 'unpublished';

  function billingNote(p) {
    const b = p.billing;
    if (!b) return '';
    const date = b.until ? new Date(b.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    if (b.status === 'cancelling') return `Cancelled — ends ${date || 'soon'}`;
    if (b.status === 'failed') return 'Payment failing';
    if (b.status === 'cancelled') return `Subscription cancelled${date ? ` ${date}` : ''}`;
    return '';
  }

  // One compact line per customer: status dot, name, badge, price, site,
  // then every action. Every row has the same button slots (an empty one
  // where a button doesn't apply), so the columns line up down the list.
  function liveRow(p) {
    const c = planCharges(p.plan);
    const section = liveSection(p);
    const price = c ? planSummary(p.plan) + (c.interval === 'year' ? ` (≈ ${money(monthlyValue(p))}/mo)` : '')
      : p.price ? `${String(p.price).replace(/^£?/, '£')} /mo` : 'No plan';
    const site = websiteOf(p);
    const slug = escapeAttr(p.slug);
    const dot = siteState(p);
    const busy = isDeployPending(p) ? 'Waiting to go live…' : isOfflinePending(p) ? 'Going offline…' : '';
    const badge = section === 'urgent' ? `<span class="crm-stage stage-urgent">${escapeHtml(billingNote(p))}</span>`
      : section === 'live' ? (p.paidOutsideStripe && !p.billing
        ? '<span class="crm-stage stage-paid" title="Marked paid by hand — not through Stripe">Paying · not Stripe</span>'
        : '<span class="crm-stage stage-paid">Paying</span>')
      : '<span class="crm-stage stage-pending">Pending</span>';
    const dotTitle = dot === 'up' ? 'Site is live' : dot === 'down' ? 'Site is offline'
      : dot === 'unpublished' ? 'Not published yet' : 'No site built in Studio';
    return `
      <div class="crm-row live-row ${section === 'live' && dot === 'down' ? 'is-offline' : ''}" ${p.notes ? `title="${escapeAttr(p.notes.trim())}"` : ''}>
        <span class="live-dot is-${dot}" title="${dotTitle}"></span>
        <span class="crm-name">${escapeHtml(businessName(p))}</span>
        ${badge}
        <span class="live-price">${escapeHtml(price)}</span>
        ${site ? `<button type="button" class="live-url" data-open="${escapeAttr(site)}" title="Open ${escapeAttr(site)}">${escapeHtml(site.replace(/^https?:\/\//, ''))}</button>` : '<span class="crm-dim live-url">No website</span>'}
        <div class="crm-row-actions">
          ${busy ? `<span class="crm-dim live-busy">${busy}</span>`
            : p.liveUrl ? `<button type="button" class="crm-move crm-move-quiet" data-offline="${slug}">Take offline</button>`
            : siteBuiltHere(p) ? `<button type="button" class="crm-move live-go" data-golive="${slug}">Make live</button>` : '<span></span>'}
          <button type="button" class="crm-move" data-plan="${slug}">${c ? 'Plan' : 'Choose plan'}</button>
          <button type="button" class="crm-move" data-pay="${slug}" title="${section === 'urgent' ? 'Resend the payment link' : 'Send a payment link'}">${section === 'urgent' ? 'Resend link' : 'Payment link'}</button>
          <button type="button" class="crm-move" data-domain="${slug}">${p.customDomain ? '🌐 Domain' : 'Domain'}</button>
          <button type="button" class="crm-move" data-edit="${slug}">Edit</button>
          ${section === 'pending'
            ? `<button type="button" class="crm-move" data-status="paid" data-slug="${slug}">Mark paid</button>
               <button type="button" class="crm-move crm-move-quiet" data-status="no" data-slug="${slug}">Not going ahead</button>`
            : `<span></span>
               <button type="button" class="crm-move crm-move-quiet" data-status="no" data-slug="${slug}" title="Takes them off the Clients tab">${section === 'urgent' ? 'Remove' : 'Stopped paying'}</button>`}
          <button type="button" class="crm-delete" data-delete="${slug}" title="Delete this customer">✕</button>
        </div>
      </div>`;
  }

  function renderLive() {
    const onTab = state.projects.filter(p => isPaid(p) || isPending(p));
    const paying = onTab.filter(p => liveSection(p) === 'live');
    const pending = onTab.filter(p => liveSection(p) === 'pending');
    const urgent = onTab.filter(p => liveSection(p) === 'urgent');
    const offline = paying.filter(p => siteState(p) === 'down');
    const sum = list => list.reduce((total, p) => total + monthlyValue(p), 0);
    el.liveTotals.innerHTML = `
      <div class="live-stat"><b>${paying.length}</b><span>paying customer${paying.length === 1 ? '' : 's'}</span></div>
      <div class="live-stat"><b>${money(sum(paying))}</b><span>total monthly value</span></div>
      <div class="live-stat"><b>${pending.length} · ${money(sum(pending))}</b><span>pending /mo</span></div>
      ${urgent.length ? `<div class="live-stat is-urgent"><b>${urgent.length} · ${money(sum(urgent))}</b><span>at risk /mo</span></div>` : ''}
      <button type="button" class="crm-save live-add-btn" data-add-customer ${state.liveAdding ? 'hidden' : ''}>+ Add customer</button>`;
    const form = state.liveAdding ? `
      <form class="crm-row live-add-form" id="liveAddForm">
        <div class="live-add-grid">
          <div class="field"><label>Business name</label><input name="name" required></div>
          <div class="field"><label>Status</label><select name="status"><option value="pending">Pending</option><option value="paid">Paid</option></select></div>
          <div class="field"><label>Website (optional)</label><input name="website" placeholder="https://…"></div>
        </div>
        <button type="submit" class="crm-save">Add customer</button>
        <button type="button" class="crm-move" data-cancel-add>Cancel</button>
      </form>` : '';
    const half = (title, list, empty, cls = '') => `
      <section class="live-half ${cls}">
        <div class="live-half-head">${title} <span class="crm-count">${list.length}</span></div>
        <div class="live-half-list">${list.length ? list.map(liveRow).join('') : `<p class="crm-empty">${empty}</p>`}</div>
      </section>`;
    const alert = offline.length ? `
      <div class="live-alert">⚠️ <span><b>${offline.length} paying customer${offline.length === 1 ? '’s site is' : 's’ sites are'} offline:</b> ${offline.map(p => escapeHtml(businessName(p))).join(', ')} — click “Make live” to put ${offline.length === 1 ? 'it' : 'them'} back up.</span></div>` : '';
    // Urgent customers get the bottom half to themselves, so they can never
    // be pushed out of sight by a long Pending/Live list — each half
    // scrolls on its own, and keeps its place when the list re-renders.
    const scrolls = ['.live-main', '.live-urgent'].map(s => el.liveList.querySelector(s)?.scrollTop || 0);
    el.liveList.classList.toggle('has-urgent', urgent.length > 0);
    el.liveList.innerHTML = `<div class="live-main">${form}${alert}`
      + half('Pending', pending, 'Nobody pending. Set “Paying?” to Pending on a business in the Leads tab, or click “+ Add customer”.')
      + half('Live', paying, 'No paying customers yet. They move here automatically once their Stripe subscription is active, or click “Mark paid”.')
      + '</div>'
      + (urgent.length ? `<div class="live-urgent">${half('⚠️ Urgent — stopped paying or cancelled', urgent, '', 'is-urgent')}</div>` : '');
    ['.live-main', '.live-urgent'].forEach((s, i) => { const box = el.liveList.querySelector(s); if (box) box.scrollTop = scrolls[i]; });
    if (state.liveAdding) el.liveList.querySelector('input[name="name"]').focus();
  }

  // Plan picker: the brightsite.app plans as cards, or a custom price.
  // Saves the plan and its monthly equivalent as the business's price, so
  // the Businesses tab and the totals agree.
  const planDialog = document.getElementById('planDialog');
  function openPlanDialog(slug) {
    const p = projectBySlug(slug);
    if (!p) return;
    let draft = { ...(p.plan || { id: 'pro', billing: 'monthly', booking: false }) };
    const render = () => {
      const def = PLANS.find(x => x.id === draft.id);
      planDialog.innerHTML = `
        <h3>Plan for ${escapeHtml(businessName(p))}</h3>
        <p class="dim">The plans on brightsite.app — click one, or set a custom price.</p>
        <div class="plan-grid">
          ${PLANS.map(pl => `<button type="button" class="plan-card ${draft.id === pl.id ? 'selected' : ''}" data-pick="${pl.id}">
            <b>${pl.name}</b><span>${money(pl.billing.monthly.setup)} setup + ${money(pl.billing.monthly.amount)}/mo</span>
            ${pl.billing.annual ? `<span class="dim">or ${money(pl.billing.annual.setup)} setup + ${money(pl.billing.annual.amount)}/yr</span>` : ''}</button>`).join('')}
          <button type="button" class="plan-card ${draft.id === 'custom' ? 'selected' : ''}" data-pick="custom"><b>Custom</b><span>Your own price</span></button>
        </div>
        ${draft.id === 'custom' ? `
          <div class="plan-custom">
            <label>Setup £<input type="number" min="0" step="1" data-field="setup" value="${escapeAttr(draft.setup ?? '')}"></label>
            <label>Monthly £<input type="number" min="0" step="0.5" data-field="monthly" value="${escapeAttr(draft.monthly ?? '')}"></label>
          </div>` : `
          ${def?.billing.annual ? `<div class="plan-billing">
            <button type="button" data-billing="monthly" class="${draft.billing !== 'annual' ? 'selected' : ''}">Monthly</button>
            <button type="button" data-billing="annual" class="${draft.billing === 'annual' ? 'selected' : ''}">Yearly</button></div>` : ''}
          <label class="plan-addon"><input type="checkbox" data-booking ${draft.booking ? 'checked' : ''}> Booking form (+${money(BOOKING_ADDON)}/mo)</label>`}
        <p class="plan-total">${escapeHtml(planSummary(draft) || 'Enter a price')}</p>
        <div class="dialog-actions">
          ${p.plan ? '<button type="button" class="ghost" data-clear>Clear plan</button>' : ''}
          <button type="button" class="ghost" data-cancel>Cancel</button>
          <button type="button" class="primary" data-save>Save plan</button>
        </div>`;
    };
    planDialog.onclick = async e => {
      const t = e.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      if (d.pick) {
        draft = d.pick === 'custom'
          ? { id: 'custom', setup: draft.setup ?? '', monthly: draft.monthly ?? '' }
          : { id: d.pick, billing: draft.billing || 'monthly', booking: Boolean(draft.booking) };
        return render();
      }
      if (d.billing) { draft.billing = d.billing; return render(); }
      if ('cancel' in d) return planDialog.close();
      if ('save' in d || 'clear' in d) {
        const plan = 'clear' in d ? null : draft;
        if (plan && !planCharges(plan)) return;
        t.disabled = true;
        try {
          await saveProjectFields(slug, { plan, ...(plan ? { price: String(+monthlyValue({ plan }).toFixed(2)) } : {}) });
          planDialog.close();
          renderLive();
        } catch (err) {
          notify(friendlyError(err.message), { sticky: false });
          t.disabled = false;
        }
      }
    };
    planDialog.onchange = e => { if (e.target.matches('[data-booking]')) { draft.booking = e.target.checked; render(); } };
    // Custom price inputs update the total without re-rendering, so typing keeps focus.
    planDialog.oninput = e => {
      const field = e.target.dataset.field;
      if (!field) return;
      draft[field] = e.target.value;
      planDialog.querySelector('.plan-total').textContent = planSummary(draft) || 'Enter a price';
    };
    render();
    planDialog.showModal();
  }

  // Payment link: created in Stripe for the customer's plan (reused while
  // the plan is unchanged), then sent by email, text or WhatsApp.
  const payDialog = document.getElementById('payDialog');
  function openPayDialog(slug) {
    const p = projectBySlug(slug);
    if (!p) return;
    const c = planCharges(p.plan);
    const key = JSON.stringify(c);
    const email = String(p.contact?.email || '').trim();
    const phone = phoneOf(p);
    let link = p.paymentLink?.key === key ? p.paymentLink.url : '';
    const firstName = String(p.contact?.name || '').trim().split(/\s+/)[0];
    const message = () => `${firstName ? `Hi ${firstName}` : 'Hi'}, here's the secure payment link for your ${businessName(p)} website (${planSummary(p.plan)}):\n${link}\n\nAny questions at all, just let me know.`;
    const render = (status = '', ok = false) => {
      payDialog.innerHTML = `
        <h3>Payment link — ${escapeHtml(businessName(p))}</h3>
        ${!c ? `
          <p class="dim">Choose a plan first, so the link charges the right amount.</p>
          <div class="dialog-actions"><button type="button" class="ghost" data-cancel>Close</button><button type="button" class="primary" data-choose-plan>Choose plan</button></div>` : `
          <p class="plan-total">${escapeHtml(planSummary(p.plan))}</p>
          ${link ? `
            <div class="pay-link"><input type="text" readonly value="${escapeAttr(link)}"><button type="button" data-copy>Copy</button></div>
            <div class="pay-send">
              <button type="button" class="primary" data-email ${email ? '' : 'disabled title="No email saved for this business"'}>Email${email ? ` ${escapeHtml(email)}` : ''}</button>
              <button type="button" class="primary" data-sms ${phone ? '' : 'disabled title="No phone number saved for this business"'}>Text${phone ? ` ${escapeHtml(phone)}` : ''}</button>
              <button type="button" data-whatsapp ${phone ? '' : 'disabled'}>WhatsApp</button>
            </div>` : `<p class="dim">Creates a Stripe payment link: ${c.setup ? `${money(c.setup)} setup today, then ` : ''}${money(c.amount)} every ${c.interval}.</p>`}
          <p class="dim pay-status ${ok ? 'ok' : ''}">${escapeHtml(status)}</p>
          <div class="dialog-actions">
            <button type="button" class="ghost" data-cancel>Close</button>
            ${link ? '<button type="button" data-create>New link</button>' : '<button type="button" class="primary" data-create>Create Stripe link</button>'}
          </div>`}`;
    };
    payDialog.onclick = async e => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      const d = t.dataset;
      if ('cancel' in d) { payDialog.close(); return renderLive(); }
      if ('choosePlan' in d) { payDialog.close(); return openPlanDialog(slug); }
      if ('copy' in d) { await navigator.clipboard.writeText(link); return render('Copied.', true); }
      if ('create' in d) {
        render('Creating the link in Stripe…');
        try {
          const result = await api(`/api/projects/${slug}/payment-link`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planName: c.name + (c.booking ? ' + booking form' : ''), setup: c.setup, amount: c.amount, interval: c.interval, key })
          });
          link = result.url;
          rememberProject(result.project);
          render('Link ready — send it below.', true);
        } catch (err) {
          render(friendlyError(err.message));
        }
        return;
      }
      const url = 'email' in d ? `mailto:${email}?subject=${encodeURIComponent(`Your ${businessName(p)} website — payment link`)}&body=${encodeURIComponent(message())}`
        : 'sms' in d ? `sms:${phone.replace(/[^\d+]/g, '')}&body=${encodeURIComponent(message())}`
        : 'whatsapp' in d ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message())}` : '';
      if (!url) return;
      openExternal(url);
      try { await saveProjectFields(slug, { paymentLink: { ...(projectBySlug(slug)?.paymentLink || {}), sentAt: new Date().toISOString() } }); } catch {}
      render('Opened — press send there. They move to Live by themselves once Stripe shows the payment.', true);
    };
    render();
    payDialog.showModal();
  }

  // Connect a domain the customer owns: Vercel adds it to their site's
  // project, then the DNS records shown here go in at their registrar.
  const domainDialog = document.getElementById('domainDialog');
  const TWO_PART_SUFFIX = /\.(co|org|me|ltd|plc|net|ac|gov)\.uk$|\.com\.au$|\.co\.nz$|\.co\.za$/;
  function cleanDomain(text) {
    const d = String(text || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d) ? d : '';
  }
  const isRootDomain = d => d.split('.').length === (TWO_PART_SUFFIX.test(d) ? 3 : 2);
  const dnsRecords = d => isRootDomain(d)
    ? [['A', '@', '76.76.21.21'], ['CNAME', 'www', 'cname.vercel-dns.com']]
    : [['CNAME', d.split('.')[0], 'cname.vercel-dns.com']];
  function openDomainDialog(slug) {
    const render = (status = '', ok = false) => {
      const p = projectBySlug(slug);
      if (!p) return domainDialog.close();
      const domain = p.customDomain || '';
      domainDialog.innerHTML = `
        <h3>Domain — ${escapeHtml(businessName(p))}</h3>
        <p class="dim">Use a domain the customer owns (GoDaddy, 123-reg, IONOS, Namecheap…). Studio adds it to their site, then you add the DNS records below wherever the domain was bought.</p>
        ${state.canDeploy ? '' : '<p class="pay-status">Sign in to Vercel in Settings (⚙) on this computer to connect domains.</p>'}
        ${p.liveUrl ? '' : '<p class="dim">This site isn’t live yet — it goes live by itself once they’re paying and the domain points here (or click “Make live”).</p>'}
        <div class="pay-link">
          <input type="text" id="domainInput" placeholder="theirbusiness.co.uk" value="${escapeAttr(domain)}" ${state.canDeploy ? '' : 'disabled'}>
          <button type="button" class="primary" data-connect ${state.canDeploy ? '' : 'disabled'}>${domain ? 'Change' : 'Connect'}</button>
        </div>
        ${domain ? `
          <table class="dns-table">
            <tr><th>Type</th><th>Name / Host</th><th>Value / Points to</th><th></th></tr>
            ${dnsRecords(domain).map(([type, name, value]) => `<tr><td>${type}</td><td><code>${escapeHtml(name)}</code></td><td><code>${escapeHtml(value)}</code></td><td><button type="button" data-copy="${escapeAttr(value)}">Copy</button></td></tr>`).join('')}
          </table>
          <p class="dim">Delete any other A or CNAME records with the same names. It usually works within an hour, occasionally up to 48.</p>` : ''}
        <p class="dim pay-status ${ok ? 'ok' : ''}">${escapeHtml(status)}</p>
        <div class="dialog-actions">
          ${domain ? '<button type="button" class="ghost" data-remove>Remove domain</button><button type="button" data-check>Check DNS</button>' : ''}
          <button type="button" class="primary" data-done>Done</button>
        </div>`;
    };
    domainDialog.onclick = async e => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      const d = t.dataset;
      if ('done' in d) { domainDialog.close(); return renderLive(); }
      if (d.copy) { await navigator.clipboard.writeText(d.copy); return render('Copied.', true); }
      if ('connect' in d) {
        const domain = cleanDomain(document.getElementById('domainInput').value);
        if (!domain) return render('That doesn’t look like a domain — e.g. theirbusiness.co.uk');
        t.disabled = true;
        t.textContent = 'Connecting…';
        try {
          rememberProject(await api(`/api/projects/${slug}/domain`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, www: isRootDomain(domain) })
          }));
          render(`Added ${domain} to the site. Now add these records at the domain’s registrar.`, true);
        } catch (err) {
          render(friendlyError(err.message));
        }
        return;
      }
      if ('check' in d) {
        t.disabled = true;
        t.textContent = 'Checking…';
        try {
          const r = await api(`/api/projects/${slug}/domain-check`);
          render(r.ok ? `${r.domain} points to the site ✓ — the secure padlock (SSL) can take a few more minutes.`
            : `Not pointing at the site yet${r.found ? ` (it currently points to ${r.found})` : ''}. Check the records, or give it a little longer.`, r.ok);
        } catch (err) {
          render(friendlyError(err.message));
        }
        return;
      }
      if ('remove' in d) {
        const p = projectBySlug(slug);
        if (!await showConfirm(`Remove ${p.customDomain}?`, 'The site stops showing at this domain. Its Vercel address keeps working.', 'Remove')) return;
        try {
          rememberProject(await api(`/api/projects/${slug}/domain`, { method: 'DELETE' }));
          render('Domain removed.');
        } catch (err) {
          render(friendlyError(err.message));
        }
      }
    };
    render();
    domainDialog.showModal();
  }

  // Make live / Take offline straight from a Live-tab row — the same
  // deploy the builder does, building the site's HTML without opening it.
  // Without Vercel on this computer it's handed to the admin's copy.
  async function goLiveFromList(slug, btn) {
    const p = projectBySlug(slug);
    if (!p) return;
    if (!state.canDeploy) {
      if (!syncEnabled) return notify('Can’t send this to go live — shared sync is off.', { sticky: false });
      await saveProjectFields(slug, { deployRequestedAt: new Date().toISOString(), deployError: '' });
      renderLive();
      return notify('Sent to go live — it publishes from the admin’s computer while their app is open.');
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="status-spinner light"></span>Going live…';
    try {
      const html = p.importedSite ? importedMarker(p) : await buildSiteHtml(p);
      const result = await api(`/api/projects/${slug}/deploy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html })
      });
      rememberProject(await api(`/api/projects/${slug}`));
      if (state.current?.slug === slug) state.current.deployedHtml = html;
      notify(`“${businessName(p)}” is live at ${result.url}`);
    } catch (err) {
      notify(friendlyError(err.message), { sticky: false });
    } finally {
      renderLive();
      renderLiveActions();
    }
  }

  async function takeOfflineFromList(slug, btn) {
    const p = projectBySlug(slug);
    if (!p?.liveUrl) return;
    const ok = await showConfirm(`Take “${businessName(p)}” offline?`,
      'The live link stops working until you make it live again — it comes back on the same link.', 'Take offline');
    if (!ok) return;
    if (!state.canDeploy) {
      if (!syncEnabled) return notify('Can’t send this — shared sync is off.', { sticky: false });
      await saveProjectFields(slug, { offlineRequestedAt: new Date().toISOString() });
      renderLive();
      return notify('Sent — it goes offline from the admin’s computer while their app is open.');
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="status-spinner"></span>Taking offline…';
    try {
      rememberProject(await api(`/api/projects/${slug}/offline`, { method: 'POST' }));
      if (state.current?.slug === slug) delete state.current.deployedHtml;
      notify(`“${businessName(p)}” taken offline.`);
    } catch (err) {
      notify(friendlyError(err.message), { sticky: false });
    } finally {
      renderLive();
      renderLiveActions();
    }
  }

  // Keeps the Live tab honest: asks Stripe where each subscription stands
  // (only on the computer with the Stripe key — the result syncs to the
  // rest) and checks each customer's site is actually still up.
  async function refreshBilling() {
    try {
      const r = await api('/api/billing/refresh', { method: 'POST' });
      if (r.changed?.length) {
        await loadProjects();
        if (state.tab === 'live') renderLive();
      }
    } catch { /* Stripe unreachable or no permission — try again later */ }
    autoGoLive();
  }

  // Near-instant Stripe updates: every 30 seconds the server asks Stripe
  // whether anything billing-related happened since it last looked (one
  // small request); the full refresh only runs when something did.
  async function checkBillingEvents() {
    try {
      if ((await api('/api/billing/events')).changed) await refreshBilling();
    } catch { /* offline or no Stripe — the 5-minute refresh still runs */ }
  }
  setInterval(checkBillingEvents, 30 * 1000);

  // A paying customer whose domain now points at their site goes live by
  // itself, from the computer that can publish. Each business is tried
  // once per session, so a publish that fails can't repeat every check.
  const autoLiveTried = new Set();
  let autoLiveRunning = false;
  async function autoGoLive() {
    if (!state.canDeploy || autoLiveRunning) return;
    const ready = state.projects.filter(p => liveSection(p) === 'live' && p.customDomain && !p.liveUrl
      && siteBuiltHere(p) && !isDeployPending(p) && !autoLiveTried.has(p.slug));
    if (!ready.length) return;
    autoLiveRunning = true;
    try {
      for (const p of ready) {
        const dns = await api(`/api/projects/${p.slug}/domain-check`).catch(() => null);
        if (!dns?.ok) continue; // not pointing here yet — checked again next time
        autoLiveTried.add(p.slug);
        try {
          const html = p.importedSite ? importedMarker(p) : await buildSiteHtml(p);
          await api(`/api/projects/${p.slug}/deploy`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html })
          });
          rememberProject(await api(`/api/projects/${p.slug}`));
          if (state.current?.slug === p.slug) state.current.deployedHtml = html;
          notify(`“${businessName(p)}” is paying and ${p.customDomain} is connected — it’s live now.`, { sticky: true });
        } catch (err) {
          await saveProjectFields(p.slug, { deployError: friendlyError(err.message) }).catch(() => {});
          notify(`Couldn’t put “${businessName(p)}” live automatically: ${friendlyError(err.message)}`, { sticky: false });
        }
      }
    } finally {
      autoLiveRunning = false;
      if (state.tab === 'live') renderLive();
      renderLiveActions();
    }
  }
  async function recheckLiveSites() {
    const sites = state.projects.filter(p => (isPaid(p) || isPending(p)) && p.liveUrl);
    const results = await Promise.all(sites.map(p => api(`/api/projects/${p.slug}/check-live`, { method: 'POST' }).catch(() => null)));
    const gone = results.filter(r => r && !r.liveUrl);
    gone.forEach(rememberProject);
    if (gone.length && state.tab === 'live') renderLive();
  }
  setInterval(() => { refreshBilling(); recheckLiveSites(); }, 5 * 60 * 1000);

  // "Mark paid" goes by Stripe: paid there → Live straight away; lapsed →
  // Urgent; nothing yet → stays Pending and moves by itself once they pay,
  // unless they pay some other way (bank transfer, cash) — then by hand.
  async function markPaid(slug, btn) {
    const p = projectBySlug(slug);
    if (!p) return;
    btn.disabled = true;
    btn.textContent = 'Checking Stripe…';
    try {
      const r = await api(`/api/projects/${slug}/check-payment`, { method: 'POST' });
      rememberProject(r.project);
      if (r.billing && ['active', 'paid'].includes(r.billing.status)) {
        notify(`Stripe shows ${businessName(p)} has paid — moved to Live.`);
      } else if (r.billing) {
        notify(`${businessName(p)}’s Stripe payments have stopped (${billingNote(r.project)}) — shown under Urgent.`, { sticky: false });
      } else {
        const why = r.noStripe
          ? 'Add your Stripe key in Settings (⚙) and paying customers move to Live by themselves.'
          : 'They’ll move to Live by themselves as soon as they pay through Stripe.';
        const ok = await showConfirm(
          r.noStripe ? 'Stripe isn’t connected' : `No Stripe payment from ${businessName(p)} yet`,
          `${why} Mark them paid anyway only if they pay another way — bank transfer or cash.`,
          'Mark paid anyway');
        if (ok) await saveProjectFields(slug, { paymentStatus: 'paid', paidOutsideStripe: true });
      }
    } catch (err) {
      notify(friendlyError(err.message), { sticky: false });
    } finally {
      renderLive();
    }
  }

  el.liveTotals.addEventListener('click', e => {
    if (e.target.closest('[data-add-customer]')) { state.liveAdding = true; renderLive(); }
  });

  el.liveList.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.open) return openExternal(btn.dataset.open);
    if (btn.dataset.edit) {
      await switchTab('businesses');
      return selectProject(btn.dataset.edit);
    }
    if ('cancelAdd' in btn.dataset) { state.liveAdding = false; return renderLive(); }
    if (btn.dataset.plan) return openPlanDialog(btn.dataset.plan);
    if (btn.dataset.pay) return openPayDialog(btn.dataset.pay);
    if (btn.dataset.domain) return openDomainDialog(btn.dataset.domain);
    if (btn.dataset.golive) return goLiveFromList(btn.dataset.golive, btn);
    if (btn.dataset.offline) return takeOfflineFromList(btn.dataset.offline, btn);
    if (btn.dataset.delete) {
      const p = projectBySlug(btn.dataset.delete);
      return deleteProject(btn.dataset.delete, p ? businessName(p) : btn.dataset.delete);
    }
    if (btn.dataset.status === 'paid') return markPaid(btn.dataset.slug, btn);
    if (btn.dataset.status) {
      btn.disabled = true;
      try {
        // "no" sends it back to wherever it was before (database or calling list).
        await saveProjectFields(btn.dataset.slug, { paymentStatus: btn.dataset.status });
        renderLive();
      } catch (err) {
        notify(friendlyError(err.message), { sticky: false });
        btn.disabled = false;
      }
    }
  });

  // A customer added here is an ordinary business record, just created as
  // paying — so it also shows in the Businesses tab and syncs like any other.
  // Their existing website goes in contact.existingWebsite, not liveUrl, so
  // the builder never mistakes it for a site it deployed.
  el.liveList.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    if (!name) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const created = await api('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      const website = String(data.get('website') || '').trim();
      const paymentStatus = data.get('status') === 'paid' ? 'paid' : 'pending';
      await saveProjectFields(created.slug, {
        paymentStatus,
        contact: { ...(created.contact || {}), existingWebsite: website }
      });
      state.liveAdding = false;
      await loadProjects();
      renderLive();
      notify(`Added "${name}" as ${paymentStatus === 'paid' ? 'a paying' : 'a pending'} customer — choose their plan next.`);
    } catch (err) {
      notify(friendlyError(err.message), { sticky: false });
      submit.disabled = false;
    }
  });

  // Switching tabs only shows/hides views — the builder view keeps its DOM
  // (and so its editor state, preview iframe and scroll position) exactly
  // as it was. Any debounced edit still pending is flushed first so a tab
  // change can never drop it.
  async function switchTab(tab) {
    if (state.tab === tab) return;
    if (state.tab === 'businesses') await flushSave();
    state.tab = tab;
    document.querySelectorAll('.tab-switch button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    el.builderView.hidden = tab !== 'businesses';
    el.liveView.hidden = tab !== 'live';
    if (tab === 'live') {
      // Pull anything teammates changed elsewhere before showing a list
      // that's all about shared status.
      await loadProjects();
      renderLive();
      refreshBilling();
      recheckLiveSites();
    } else {
      fitPreviewFrame();
    }
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('.tab-switch button[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  // Studio V2 (../desktop-app-v2) loads this same file for the builder,
  // preview, settings, sync and billing, and drives it through these. This
  // page never reads them.
  window.StudioCore = {
    state, api, notify, showConfirm, openExternal, ownerUrl, friendlyError,
    loadProjects, selectProject, closeCurrentProject, deleteProject,
    saveProjectFields, setRaw, scheduleSave, flushSave, persist,
    renderEditor, renderPreview, fitPreviewFrame, renderLiveActions, setViewport, setTextEditing,
    wireBuildBar, openPlanDialog, openPayDialog, openDomainDialog, markPaid, goLiveFromList,
    refreshBilling, recheckLiveSites, openWhatsApp, openEmail, toWhatsAppNumber,
    businessName, phoneOf, websiteOf, timeAgo, escapeHtml, escapeAttr,
    billingNote, planSummary, planCharges, isDeployPending, isOfflinePending, siteState, viewsText
  };

  loadProjects().then(() => { renderEditor(); renderLiveActions(); });
})();
