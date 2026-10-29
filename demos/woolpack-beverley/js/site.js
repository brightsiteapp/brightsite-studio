(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  var scrim = document.getElementById('navScrim');
  if (!toggle || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', function () {
    setOpen(!nav.classList.contains('open'));
  });
  if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { setOpen(false); });
  });

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();

// Tripadvisor widget: rebuild its review snippets as separate cards.
(function () {
  var grid = document.getElementById('reviewGrid');
  var head = document.getElementById('taHead');
  var source = document.getElementById('taSource');
  if (!grid || !head || !source) return;

  function build() {
    var items = source.querySelectorAll('.widSSPOneReview li');
    if (!items.length) return false;

    items.forEach(function (li) {
      var quote = li.querySelector('.widSSPQuote');
      var link = li.querySelector('a');
      if (!quote) return;
      var card = document.createElement('article');
      card.className = 'review-card';
      var p = document.createElement('p');
      p.textContent = quote.textContent.trim();
      card.appendChild(p);
      if (link) {
        var a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener nofollow';
        a.textContent = 'Read full review';
        card.appendChild(a);
      }
      grid.appendChild(card);
    });

    var logo = source.querySelector('.widSSPBranding img');
    var rank = source.querySelector('.widSSPPopIdx');
    if (logo) {
      var img = document.createElement('img');
      img.src = logo.src;
      img.alt = 'Tripadvisor';
      head.appendChild(img);
    }
    if (rank) {
      var span = document.createElement('span');
      span.innerHTML = '<strong>Woolpack</strong> &middot; ' + rank.textContent.replace(/\s+/g, ' ').trim();
      head.appendChild(span);
    }
    head.hidden = false;
    source.hidden = true;
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (build() || ++tries > 40) clearInterval(timer);
  }, 400);
})();
