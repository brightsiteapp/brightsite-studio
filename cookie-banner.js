// Small cookie notice. Only essential cookies are used, so this just informs visitors.
(function () {
  var KEY = 'bs_cookie_notice_seen';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* storage blocked: still show the notice */ }
  function build() {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;background:#1C2832;color:#fff;border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 10px 30px rgba(0,0,0,.2);font:14px/1.45 "Nunito Sans",system-ui,sans-serif';
    bar.innerHTML = '<span style="flex:1 1 260px">We only use essential cookies to keep the site working and take payments. <a href="cookies.html" style="color:#9CC3FF">Cookies</a></span>' +
      '<button type="button" style="border:0;border-radius:999px;padding:8px 16px;background:#2563EB;color:#fff;font:inherit;font-weight:700;cursor:pointer">OK</button>';
    bar.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
