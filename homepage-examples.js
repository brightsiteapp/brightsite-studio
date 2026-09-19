/* Three example homepages, desktop preview only: a fixed 1440x900 iframe
   scaled down via CSS transform, so a small card still shows the site's
   real desktop layout. (There used to be a Mobile toggle too, but it's
   been dropped — back to a single, simple preview per card.) */
(() => {
  const grid = document.getElementById('exGrid');
  if (!grid) return;

  const DESKTOP_W = 1440, DESKTOP_H = 900;
  // Crops each site's own header off the top of the preview (it's just their
  // brand/logo — the card already gets its own fake browser chrome above it).
  const HEADER_CROP = 84;

  // Static screenshots, not live iframes: this carousel used to embed all
  // six sites live at once (each its own full page load, scripts and all),
  // which on a phone was enough concurrent memory pressure to get Safari's
  // WebContent process killed — seen as "the page refreshes, then goes
  // black" within seconds of opening the homepage, before any interaction.
  // The iframes were pointer-events:none anyway (see .ex-view iframe below),
  // so nothing interactive was ever reachable inside them — a screenshot
  // looks identical here and costs one image decode instead of a full page.
  const examples = [
    { url: 'https://sisko-hairdressing.vercel.app', image: 'img/work-previews/sisko.webp' },
    { url: 'https://kings-valeting-hull.vercel.app', live: true },
    { url: 'https://de-lacy.vercel.app', image: 'img/work-previews/de-lacy.webp' },
    { url: 'https://muse-hull-deploy.vercel.app', image: 'img/work-previews/muse.webp' },
    { url: 'https://mgs-beverley.vercel.app', image: 'img/work-previews/mgs-beverley.webp?v=20260907' },
    { url: 'https://brian-griffin-electrical.vercel.app', live: true },
  ];

  function scaleFrame(view, iframe, intrinsicW, intrinsicH, cropTop) {
    const scale = view.clientWidth / intrinsicW;
    iframe.style.width = `${intrinsicW}px`;
    iframe.style.height = `${intrinsicH}px`;
    iframe.style.transform = `scale(${scale}) translateY(-${cropTop}px)`;
    view.style.height = `${Math.round((intrinsicH - cropTop) * scale)}px`;
  }

  // Same idea as scaleFrame, but for a view with its own fixed box (rather
  // than one sized to fit the content): scales to COVER the box — like
  // object-fit:cover — cropping whichever edge has spare width or height,
  // so the card matches its two fixed-aspect-ratio neighbours exactly.
  function coverFrame(view, iframe, intrinsicW, intrinsicH, cropTop) {
    const contentH = intrinsicH - cropTop;
    const scale = Math.max(view.clientWidth / intrinsicW, view.clientHeight / contentH);
    const scaledW = intrinsicW * scale;
    const offsetX = Math.max(0, (scaledW - view.clientWidth) / 2) / scale;
    // Apply transform to the wrapper div, not the iframe directly — avoids
    // Safari freezing CSS animations inside a transformed iframe element.
    const scaler = iframe.closest('.ex-scaler') || iframe;
    scaler.style.width = `${intrinsicW}px`;
    scaler.style.height = `${intrinsicH}px`;
    scaler.style.transform = `scale(${scale}) translate(-${offsetX}px, -${cropTop}px)`;
    iframe.style.width = `${intrinsicW}px`;
    iframe.style.height = `${intrinsicH}px`;
  }

  examples.forEach((ex) => {
    const card = document.createElement('article');
    card.className = 'ex-card';
    const siteName = ex.url.replace(/^https:\/\/|\.vercel\.app$/g, '');
    if (ex.live) {
      card.innerHTML = `
        <div class="ex-frame ex-frame-desktop is-active">
          <div class="ex-bar" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="ex-view"><div class="ex-scaler"><iframe title="${siteName} live homepage" data-src="${ex.url}" tabindex="-1"></iframe></div><span class="ex-view-lock" aria-hidden="true"></span></div>
        </div>`;
    } else {
      card.innerHTML = `
        <div class="ex-frame ex-frame-desktop is-active">
          <div class="ex-bar" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="ex-view"><img alt="Screenshot of ${siteName}'s live homepage" loading="lazy" src="${ex.image}"></div>
        </div>`;
    }
    grid.appendChild(card);

    const desktopFrame = card.querySelector('.ex-frame-desktop');
    const view = desktopFrame.querySelector('.ex-view');

    let layout;
    if (ex.live) {
      const scaler = view.querySelector('.ex-scaler');
      const iframe = view.querySelector('iframe');
      layout = () => {
        const scale = view.clientWidth / DESKTOP_W;
        scaler.style.width = `${DESKTOP_W}px`;
        scaler.style.height = `${DESKTOP_H}px`;
        scaler.style.transform = `scale(${scale}) translateY(-${HEADER_CROP}px)`;
        iframe.style.width = `${DESKTOP_W}px`;
        iframe.style.height = `${DESKTOP_H}px`;
        view.style.height = `${Math.round((DESKTOP_H - HEADER_CROP) * scale)}px`;
      };
    } else {
      const img = view.querySelector('img');
      layout = () => scaleFrame(view, img, DESKTOP_W, DESKTOP_H, HEADER_CROP);
    }

    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(card);
    else window.addEventListener('resize', layout);
    layout();
  });

  // Step 3 of "How it works" reuses this same live-frame treatment, outside
  // the carousel, so its Kings Valeting preview actually animates (the foam
  // wash) instead of being a static screenshot. Unlike the carousel cards,
  // this one has to fill the same fixed box as its two sibling step
  // pictures, so it covers rather than sizes-to-fit.
  const step3Frame = document.getElementById('step3LiveFrame');
  if (step3Frame) {
    const step3View = step3Frame.querySelector('.ex-view');
    const step3Iframe = step3View.querySelector('iframe');
    const layoutStep3 = () => coverFrame(step3View, step3Iframe, DESKTOP_W, DESKTOP_H, HEADER_CROP);
    if ('ResizeObserver' in window) new ResizeObserver(layoutStep3).observe(step3Frame);
    else window.addEventListener('resize', layoutStep3);
    layoutStep3();
  }

  /* One card centred at a time, the neighbours peeking off each edge —
     no arrows, no dots, just autoplay and drag/swipe, like the original
     carousel. Autoplay stops for good the moment a visitor drags it or
     clicks into a card, since at that point they're driving it themselves. */
  const carousel = document.getElementById('exCarousel');
  const slides = [...grid.children];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let active = 0;
  let timer = null;

  const VISIBLE_POSITIONS = new Set([-1, 0, 1]);

  function signedDistance(index) {
    let distance = ((index - active) % slides.length + slides.length) % slides.length;
    if (distance > slides.length / 2) distance -= slides.length;
    return distance;
  }

  function render() {
    slides.forEach((slide, i) => {
      const distance = signedDistance(i);
      const pos = VISIBLE_POSITIONS.has(distance) ? String(distance) : 'hidden';
      slide.dataset.pos = pos;
      // Reload live iframes when they become the active (centre) card so
      // load-triggered animations (e.g. van drive-in) replay each time.
      if (pos === '0') {
        const iframe = slide.querySelector('iframe[data-src]');
        if (iframe) iframe.src = iframe.dataset.src;
      }
    });
    // the stage is a position:relative box sized to the active card, since
    // its absolutely-positioned neighbours can't otherwise give it a height
    grid.style.height = `${slides[active].offsetHeight}px`;
  }

  function goTo(index) {
    active = ((index % slides.length) + slides.length) % slides.length;
    render();
  }

  function stopAutoplay() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  }

  function startAutoplay() {
    if (timer || reduceMotion) return;
    timer = window.setInterval(() => goTo(active + 1), 2000);
  }

  // re-measure the stage height if the active card's own content changes size
  if ('ResizeObserver' in window) {
    slides.forEach((slide) => new ResizeObserver(() => {
      if (slide === slides[active]) grid.style.height = `${slide.offsetHeight}px`;
    }).observe(slide));
  }

  /* Fine-pointer dragging stays available without registering touch
     handlers, so vertical swipes on phones always belong to the page
     scroller (touch users instead just wait for autoplay or tap a peeking
     neighbour into the centre). */
  if (finePointer) {
    let dragging = false;
    let startX = 0;
    let deltaX = 0;
    let suppressClick = false;

    carousel.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      deltaX = 0;
      suppressClick = false;
      stopAutoplay();
    });
    carousel.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      deltaX = e.clientX - startX;
      suppressClick = Math.abs(deltaX) > 8;
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      if (Math.abs(deltaX) > 40) goTo(active + (deltaX < 0 ? 1 : -1));
    };
    carousel.addEventListener('pointerup', release);
    carousel.addEventListener('pointercancel', release);
    carousel.addEventListener('pointerleave', release);
    carousel.addEventListener('click', (e) => {
      if (suppressClick) { e.preventDefault(); suppressClick = false; return; }
      const card = e.target.closest('.ex-card');
      if (!card) return;
      const distance = signedDistance(slides.indexOf(card));
      if (distance !== 0) { stopAutoplay(); goTo(active + distance); }
    }, true);
  }

  grid.addEventListener('click', (e) => { if (e.target.closest('.ex-card')) stopAutoplay(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? startAutoplay() : stopAutoplay()));
    }, { threshold: 0.4 }).observe(carousel);
  } else {
    startAutoplay();
  }

  render();
})();
