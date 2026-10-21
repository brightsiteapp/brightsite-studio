(function () {
  var messages = [
    { text: 'Welcome to BrightSite!', delay: 3500 },
    { text: 'Websites for free!', delay: 3000 },
    { text: 'Website built for you at no cost', delay: 2800 },
    { text: 'Hosting, security & maintenance', delay: 2800 },
    { text: 'SEO & SEO-focused content', delay: 2800 },
    { text: 'Mobile optimisation', delay: 2600 },
    { text: '1–5 pages with contact & enquiry forms', delay: 3000 },
    { text: 'Chatbot if required', delay: 2600 },
    { text: 'Changes & support included', delay: 2600 },
    { text: 'Only 5 slots left this month!', delay: 4000 }
  ];

  var WA_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  var idx = 0;
  var timer = null;
  var jumpTimer = null;
  var opened = false;
  var minimised = false;
  var root, bubble, model, actions;

  try { minimised = localStorage.getItem('bsBotMin') === '1'; } catch (e) {}

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#bs-bot{position:fixed;bottom:28px;right:36px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:inherit}',
      '#bs-bubble{position:relative;max-width:220px;background:#3B82F6;color:#fff;border-radius:16px 16px 4px 16px;padding:10px 14px;font-size:13.5px;font-weight:700;line-height:1.35;box-shadow:0 6px 20px rgba(59,130,246,.35);opacity:0;transform:translateY(6px) scale(.95);transform-origin:100% 100%;transition:opacity .3s,transform .3s;pointer-events:none}',
      '#bs-bubble:after{content:"";position:absolute;right:26px;bottom:-7px;width:14px;height:14px;background:#3B82F6;transform:rotate(45deg);border-radius:0 0 3px 0}',
      '#bs-bubble.show{opacity:1;transform:none}',
      '#bs-actions{display:none;flex-direction:column;gap:7px;align-items:flex-end}',
      '#bs-bot.open #bs-actions{display:flex;animation:bsIn .25s ease}',
      '#bs-bot.open #bs-bubble{display:none}',
      '@keyframes bsIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '#bs-actions a{display:flex;align-items:center;gap:7px;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.15)}',
      '#bs-actions .bs-signup{background:#3B82F6}',
      '#bs-actions .bs-wa{background:#25D366}',
      '#bs-figure{position:relative}',
      '#bs-bot-model{display:block;width:120px;height:150px;background:transparent;cursor:pointer;--poster-color:transparent;--progress-bar-height:0}',
      '#bs-min{position:absolute;top:2px;right:0;width:22px;height:22px;border-radius:50%;border:0;background:#fff;color:#3B82F6;font:800 15px/1 inherit;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:2}',
      '#bs-bot.min #bs-bubble,#bs-bot.min #bs-actions,#bs-bot.min #bs-figure{display:none}',
      '#bs-icon{display:none;width:54px;height:54px;border-radius:50%;border:0;background:#3B82F6;box-shadow:0 6px 18px rgba(59,130,246,.4);cursor:pointer;align-items:center;justify-content:center;padding:0;transition:transform .15s}',
      '#bs-icon:hover{transform:scale(1.07)}',
      '#bs-icon img{width:24px;height:auto}',
      '#bs-bot.min #bs-icon{display:flex}',
      '#bs-bot.min{bottom:20px;right:20px}',
      '@media(max-width:640px){#bs-bot{bottom:80px;right:20px}#bs-bot.min{bottom:80px}#bs-bot-model{width:96px;height:120px}#bs-bubble{max-width:180px;font-size:12.5px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function build() {
    root = document.createElement('div');
    root.id = 'bs-bot';
    root.innerHTML =
      '<div id="bs-bubble" aria-live="polite"></div>' +
      '<div id="bs-actions">' +
        '<a class="bs-signup" href="/account/login.html?signup=1">Sign up free →</a>' +
        '<a class="bs-wa" href="https://wa.me/447535928879" target="_blank" rel="noopener">' + WA_ICON + 'WhatsApp us</a>' +
      '</div>' +
      '<div id="bs-figure">' +
        '<button id="bs-min" type="button" aria-label="Minimise">–</button>' +
        '<model-viewer id="bs-bot-model" src="/img/bot/avatar.glb?v=20261021-2" animation-name="Idle" autoplay' +
        ' camera-orbit="0deg 80deg auto" field-of-view="26deg" disable-zoom disable-pan disable-tap' +
        ' interaction-prompt="none" shadow-intensity="0" exposure="1.05" alt="BrightSite assistant"></model-viewer>' +
      '</div>' +
      '<button id="bs-icon" type="button" aria-label="Open BrightSite assistant"><img src="/img/brightsite-b-white.png" alt=""></button>';
    document.body.appendChild(root);

    bubble = root.querySelector('#bs-bubble');
    model = root.querySelector('#bs-bot-model');
    actions = root.querySelector('#bs-actions');

    root.querySelector('#bs-min').addEventListener('click', function (e) {
      e.stopPropagation();
      setMinimised(!minimised);
    });
    model.addEventListener('click', function () { playJump(); setOpen(!opened); });
    root.querySelector('#bs-icon').addEventListener('click', function () { setMinimised(false); });

    applyMinimised();
  }

  function showBubble(text) {
    bubble.classList.remove('show');
    setTimeout(function () {
      bubble.textContent = text;
      bubble.classList.add('show');
    }, 220);
  }

  function cycle() {
    clearTimeout(timer);
    if (opened || minimised) return;
    showBubble(messages[idx].text);
    timer = setTimeout(function () {
      idx = (idx + 1) % messages.length;
      cycle();
    }, messages[idx].delay);
  }

  function jump() {
    if (!model || opened || minimised) return;
    playJump();
  }

  function playJump() {
    model.animationName = 'Jump';
    model.play({ repetitions: 1 });
  }

  function scheduleJump() {
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(function () { jump(); scheduleJump(); }, 20000 + Math.random() * 25000);
  }

  function setOpen(v) {
    opened = v;
    root.classList.toggle('open', v);
    if (v) { clearTimeout(timer); bubble.classList.remove('show'); }
    else cycle();
  }

  function applyMinimised() {
    root.classList.toggle('min', minimised);
  }

  function setMinimised(v) {
    minimised = v;
    try { localStorage.setItem('bsBotMin', v ? '1' : '0'); } catch (e) {}
    if (v) { opened = false; root.classList.remove('open'); clearTimeout(timer); bubble.classList.remove('show'); }
    applyMinimised();
    if (!v) cycle();
  }

  function init() {
    injectStyles();
    if (!customElements.get('model-viewer')) {
      var mv = document.createElement('script');
      mv.type = 'module';
      mv.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
      document.head.appendChild(mv);
    }
    build();
    // after a one-shot Jump, return to the Idle loop
    model.addEventListener('finished', function () {
      model.animationName = 'Idle';
      model.play();
    });
    setTimeout(cycle, 1200);
    scheduleJump();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
