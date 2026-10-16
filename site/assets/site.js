// Patrick Stokes + Co: site interactions
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on scroll
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  }), { threshold: .15 });
  document.querySelectorAll('.reveal, #steps').forEach(el => io.observe(el));

  // Burger menu
  const burger = $('#burger'), menu = $('#mobileMenu');
  if (burger && menu) {
    const setOpen = open => {
      burger.setAttribute('aria-expanded', open);
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('open', open);
    };
    burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    document.addEventListener('click', e => { if (!menu.contains(e.target) && !burger.contains(e.target)) setOpen(false); });
  }

  // Header shadow + mobile call bar after the first screen
  const hdr = $('#hdr'), bar = $('#mbar');
  const onScroll = () => {
    hdr && hdr.classList.toggle('scrolled', scrollY > 10);
    bar && bar.classList.toggle('show', scrollY > 400);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Reviews carousel: seamless loop, arrows, dots, gentle auto-advance (paused on hover/focus).
  // Copies of the cards follow the originals, so moving past the last review glides onto a copy of the
  // first and then resets to the real first card without any visible backwards slide.
  const track = $('#track');
  if (track) {
    const originals = [...track.children], n = originals.length, dots = $('#dots');
    originals.forEach(c => { const k = c.cloneNode(true); k.setAttribute('aria-hidden', 'true'); track.appendChild(k); });
    const step = () => originals.length > 1 ? originals[1].offsetLeft - originals[0].offsetLeft : originals[0].offsetWidth;
    let pos = 0, moving = false, settleTimer, autoTimer;
    const shown = () => pos % n;
    const setDots = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i === shown()));
    const place = (p, smooth) => {
      track.style.scrollSnapType = 'none';
      track.scrollTo({ left: p * step(), behavior: smooth && !reduce ? 'smooth' : 'auto' });
      if (!smooth) track.style.scrollSnapType = '';
    };
    const settle = () => {
      if (pos === n) { pos = 0; place(0, false); }
      setDots();
      track.style.scrollSnapType = '';
      moving = false;
    };
    const slide = p => {
      pos = p; moving = true; setDots();
      place(p, true);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, reduce ? 0 : 650);
    };
    // Leave the copy zone silently before moving again (only matters if a click lands mid-slide)
    const leaveCopies = () => { if (pos === n) { clearTimeout(settleTimer); pos = 0; place(0, false); } };
    const next = () => { leaveCopies(); slide(pos + 1); };
    const prev = () => {
      if (pos === 0) { pos = n; place(n, false); }
      slide(pos - 1);
    };
    const go = p => { leaveCopies(); if (p !== pos) slide(p); };
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', 'Show review ' + (i + 1));
      b.addEventListener('click', () => go(i));
      dots.appendChild(b);
    }
    setDots();
    $('#prev').addEventListener('click', prev);
    $('#next').addEventListener('click', next);
    // Swiping or scrollbar use: follow the user's position
    track.addEventListener('scroll', () => {
      if (moving) return;
      pos = Math.round(track.scrollLeft / step()); setDots();
    }, { passive: true });
    addEventListener('resize', () => place(pos, false));
    const start = () => { if (!reduce) autoTimer = setInterval(next, 6500); };
    const stop = () => clearInterval(autoTimer);
    const car = track.closest('.carousel');
    car.addEventListener('mouseenter', stop); car.addEventListener('mouseleave', start);
    car.addEventListener('focusin', stop); car.addEventListener('focusout', start);
    start();
  }

  // Hero postcode box: carry the postcode into the valuation form
  const heroForm = $('#heroForm');
  if (heroForm) heroForm.addEventListener('submit', e => {
    e.preventDefault();
    const pc = $('#heroPc').value.trim(), field = $('#a');
    if (field) { field.value = pc; }
    $('#valuation').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(() => { const n = $('#n'); n && n.focus({ preventScroll: true }); }, 600);
  });

  // Cookie consent: analytics only load after "Allow"
  const cookie = $('#cookie');
  const getConsent = () => { try { return localStorage.getItem('ps-consent'); } catch { return null; } };
  const loadAnalytics = () => {
    // Add the Google Analytics tag here (gtag.js with the site's measurement ID).
  };
  if (cookie) {
    if (getConsent() === 'accepted') loadAnalytics();
    if (!getConsent()) setTimeout(() => cookie.classList.add('show'), 1200);
    cookie.querySelectorAll('[data-consent]').forEach(b => b.addEventListener('click', () => {
      try { localStorage.setItem('ps-consent', b.dataset.consent); } catch {}
      if (b.dataset.consent === 'accepted') loadAnalytics();
      cookie.classList.remove('show');
    }));
    const settings = $('#cookieSettings');
    settings && settings.addEventListener('click', () => cookie.classList.add('show'));
  }

  // Valuation form: opens the visitor's email app addressed to the agency
  const form = $('#valForm');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const v = id => ($('#' + id, form) || {}).value || '';
    const body = `Hello Patrick Stokes + Co,%0D%0A%0D%0AI'd like a free valuation.%0D%0A%0D%0AName: ${encodeURIComponent(v('n'))}%0D%0APhone: ${encodeURIComponent(v('p'))}%0D%0APostcode: ${encodeURIComponent(v('a'))}`;
    location.href = `mailto:team@patrickstokes.co.uk?subject=${encodeURIComponent('Valuation request')}&body=${body}`;
    form.querySelectorAll('.fields').forEach(el => el.style.display = 'none');
    $('.sent', form).style.display = 'block';
  });
})();
