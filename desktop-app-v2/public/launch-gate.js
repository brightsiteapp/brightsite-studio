// Launch update gate for the installed app.
//
// The blue loading screen normally leaves on a fixed CSS clock (style.css).
// Inside the installed app, this holds it until the launch update check
// (lib/app-updater.js) has answered. If a newer version exists, the screen
// stays up, shows "Updating to the newest version…" with progress, then
// installs silently and restarts. Otherwise it leaves exactly as it always
// has. It never traps anyone: a slow or offline check gives up after
// checkWaitMs, a dragging download can be skipped, and an install that
// doesn't restart falls through into the app.
//
// A plain browser (colleagues on localhost:4173) has no window.brightsiteUpdates,
// so this does nothing there and the CSS clock runs as before.
(function () {
  const DEFAULTS = { introMs: 1650, checkWaitMs: 4000, skipAfterMs: 15000, installTimeoutMs: 20000 };

  // What the screen should do for an updater state, `elapsed` ms after it
  // appeared: 'wait', 'continue' (into the app), 'updating' or 'install'.
  function decide(s, elapsed, o = DEFAULTS) {
    const withinCheck = elapsed < o.checkWaitMs;
    if (!s) return withinCheck ? 'wait' : 'continue';
    // A build that can't install updates itself (an unsigned Mac) never holds.
    if (!s.canAutoInstall) return 'continue';
    switch (s.status) {
      case 'idle':
      case 'checking':
        return withinCheck ? 'wait' : 'continue';
      case 'downloading':
        return 'updating';
      case 'ready':
        return 'install';
      default:
        return 'continue';
    }
  }

  function start(bridge, opts = {}) {
    const screen = document.getElementById('loadingScreen');
    if (!screen || !bridge) return;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const o = { ...DEFAULTS, introMs: reduced ? 700 : DEFAULTS.introMs, ...opts };
    const startedAt = opts.startedAt ?? 0;
    const text = document.getElementById('lsUpdateText');
    const skip = document.getElementById('lsSkip');
    const elapsed = () => performance.now() - startedAt;
    let state = null;
    let done = false;
    let installing = false;
    let updatingSince = null;

    screen.classList.add('ls-hold');

    // The exit never starts before the intro would have finished, so a quick
    // "nothing new" looks exactly like the old fixed-clock screen.
    const leave = () => {
      if (done) return;
      done = true;
      clearInterval(tick);
      setTimeout(() => screen.classList.add('ls-leave'), Math.max(0, o.introMs - elapsed()));
    };

    const evaluate = () => {
      if (done) return;
      const d = decide(state, elapsed(), o);
      if (d === 'continue') return leave();
      // Keep holding, but don't talk over the intro animation.
      if (elapsed() < o.introMs) return;
      screen.classList.add('ls-updating');
      if (d === 'wait') {
        text.textContent = 'Checking for updates…';
      } else if (d === 'updating') {
        if (updatingSince === null) updatingSince = performance.now();
        text.textContent = `Updating to the newest version${state.newVersion ? ` (v${state.newVersion})` : ''}… ${state.percent || 0}%`;
        if (performance.now() - updatingSince > o.skipAfterMs) skip.hidden = false;
      } else if (d === 'install' && !installing) {
        installing = true;
        skip.hidden = true;
        text.textContent = 'Installing the update — BrightSite Studio will restart…';
        bridge.install();
        setTimeout(leave, o.installTimeoutMs);
      }
    };

    // Skipping leaves the download running in the background; the top-bar
    // button picks it up from there ("Restart to update").
    skip.onclick = leave;
    bridge.onState(s => { state = s; evaluate(); });
    bridge.getState().then(s => { if (!state) state = s; evaluate(); }).catch(() => {});
    const tick = setInterval(evaluate, 200);
  }

  const api = { decide, start, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.BrightsiteLaunchGate = api;
    if (window.brightsiteUpdates) start(window.brightsiteUpdates);
  }
})();
