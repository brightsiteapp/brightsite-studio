(function () {
  // Messages to cycle through
  var messages = [
    { text: 'Welcome to BrightSite! 👋', delay: 3500 },
    { text: 'Websites for free! 🎉', delay: 3000 },
    { text: '✓ Website built for you at no cost', delay: 2800 },
    { text: '✓ Hosting, security & maintenance', delay: 2800 },
    { text: '✓ SEO & SEO-focused content', delay: 2800 },
    { text: '✓ Mobile optimisation', delay: 2600 },
    { text: '✓ 1–5 pages with contact & enquiry forms', delay: 3000 },
    { text: '✓ Chatbot if required', delay: 2600 },
    { text: '✓ Changes & support included', delay: 2600 },
    { text: '⚡ Only 5 slots left this month!', delay: 4000 }
  ];

  var idx = 0;
  var timer = null;
  var opened = false;

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#bs-bot{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;cursor:pointer}',
      '#bs-bot-model{width:90px;height:120px;border-radius:50% 50% 44% 44%;overflow:hidden;filter:drop-shadow(0 4px 14px rgba(0,0,0,.22));animation:bsBob 2.4s ease-in-out infinite;transition:transform .2s;background:transparent}',
      '#bs-bot-model.stopped{animation:none}',
      '@keyframes bsBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}',
      '#bs-bubble{max-width:200px;background:#fff;border:1.5px solid var(--accent,#3b7cf4);border-radius:14px 14px 4px 14px;padding:9px 13px;font-size:13px;font-weight:600;line-height:1.4;color:#111;box-shadow:0 3px 14px rgba(0,0,0,.12);opacity:0;transform:translateY(6px) scale(.96);transition:opacity .3s,transform .3s;pointer-events:none;text-align:right}',
      '#bs-bubble.show{opacity:1;transform:translateY(0) scale(1)}',
      '#bs-actions{display:flex;flex-direction:column;gap:7px;align-items:flex-end;animation:bsFadeIn .3s ease}',
      '@keyframes bsFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '#bs-actions a{display:block;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;text-align:center;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.13)}',
      '#bs-actions .bs-signup{background:var(--accent,#3b7cf4);color:#fff}',
      '#bs-actions .bs-wa{background:#25D366;color:#fff;display:flex;align-items:center;gap:7px}',
      '#bs-close{font-size:11px;color:#999;text-align:right;margin-top:-2px;padding-right:4px}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildWidget() {
    var wrap = document.createElement('div');
    wrap.id = 'bs-bot';
    wrap.innerHTML = [
      '<div id="bs-bubble"></div>',
      '<model-viewer id="bs-bot-model"',
      '  src="/img/bot/avatar.glb"',
      '  auto-rotate',
      '  rotation-per-second="30deg"',
      '  disable-zoom',
      '  camera-orbit="0deg 80deg 2.2m"',
      '  shadow-intensity="0"',
      '  exposure="1"',
      '  style="--poster-color:transparent;background:transparent">',
      '</model-viewer>'
    ].join('');
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      if (opened) return;
      open();
    });
  }

  function showBubble(text) {
    var el = document.getElementById('bs-bubble');
    if (!el) return;
    el.classList.remove('show');
    setTimeout(function () {
      el.textContent = text;
      el.classList.add('show');
    }, 220);
  }

  function nextMessage() {
    if (opened) return;
    showBubble(messages[idx].text);
    timer = setTimeout(function () {
      idx = (idx + 1) % messages.length;
      nextMessage();
    }, messages[idx].delay);
    // advance after reading
  }

  function open() {
    opened = true;
    clearTimeout(timer);

    var bubble = document.getElementById('bs-bubble');
    var model = document.getElementById('bs-bot-model');
    if (bubble) { bubble.classList.remove('show'); }
    if (model) { model.classList.add('stopped'); }

    var actions = document.createElement('div');
    actions.id = 'bs-actions';
    actions.innerHTML = [
      '<a class="bs-signup" href="/account/login.html?signup=1">Sign up free →</a>',
      '<a class="bs-wa" href="https://wa.me/447535928879" target="_blank" rel="noopener">',
        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
        'WhatsApp us',
      '</a>',
      '<div id="bs-close" onclick="(function(){document.getElementById(\'bs-bot\').remove()})()" style="cursor:pointer">✕ close</div>'
    ].join('');

    var wrap = document.getElementById('bs-bot');
    if (wrap) wrap.insertBefore(actions, wrap.firstChild);
  }

  function init() {
    injectStyles();

    // Load model-viewer if not already present
    if (!customElements.get('model-viewer')) {
      var mv = document.createElement('script');
      mv.type = 'module';
      mv.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
      document.head.appendChild(mv);
    }

    buildWidget();

    // Start speech bubbles after a short delay
    setTimeout(nextMessage, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
