// Small cookie notice. Only essential cookies are used, so Accept and Decline both just record the choice.
(function () {
  var KEY = 'bs_cookie_notice_seen';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* storage blocked: still show the notice */ }
  function btn(label, primary) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'border-radius:999px;padding:8px 16px;font:inherit;font-weight:700;cursor:pointer;border:1.5px solid #3B82F6;' +
      (primary ? 'background:#3B82F6;color:#fff' : 'background:#fff;color:#3B82F6');
    return b;
  }
  function build() {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;background:#fff;color:#1F2530;border:1px solid #E7DED2;border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 10px 30px rgba(31,37,48,.12);font:14px/1.45 "Nunito Sans",system-ui,sans-serif';
    var text = document.createElement('span');
    text.style.cssText = 'flex:1 1 260px';
    text.innerHTML = 'We only use essential cookies to keep the site working and take payments. <a href="cookies.html" style="color:#3B82F6">Cookies</a>';
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px';
    var decline = btn('Decline', false);
    var accept = btn('Accept', true);
    function done() {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.remove();
    }
    decline.addEventListener('click', done);
    accept.addEventListener('click', done);
    actions.appendChild(decline);
    actions.appendChild(accept);
    bar.appendChild(text);
    bar.appendChild(actions);
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
