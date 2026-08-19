// Search + rendering shared by every page.
//
// Small pages ship their cards as plain HTML and are filtered by hiding them.
// Big pages (species, learnsets) would need >100k DOM elements if rendered that
// way, which is painfully slow on a phone, so they ship their cards as strings
// in a JSON payload and only the ones on screen are built.
(function () {
  var input = document.getElementById('search');
  var count = document.getElementById('result-count');
  var empty = document.getElementById('empty');
  var noun = document.body.dataset.noun || 'result';
  var payload = document.getElementById('cards');
  var timer = null;

  function label(shown, total, filtered) {
    if (!count) return;
    var plural = noun + (shown === 1 ? '' : 's');
    count.textContent = filtered
      ? shown + ' of ' + total + ' ' + plural + ' match'
      : total + ' ' + plural;
  }

  function rememberQuery(value) {
    var url = new URL(window.location);
    if (value) url.searchParams.set('q', value);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }

  function words() {
    var q = input ? input.value.toLowerCase().trim() : '';
    return q ? q.split(/\s+/) : [];
  }

  // ---- windowed mode -------------------------------------------------------
  if (payload) {
    var all = JSON.parse(payload.textContent);
    var list = document.getElementById('list');
    var sentinel = document.getElementById('sentinel');
    var STEP = 40;
    var matches = all;
    var drawn = 0;

    function draw(n) {
      var slice = matches.slice(drawn, drawn + n);
      if (!slice.length) return;
      var buffer = document.createElement('div');
      buffer.innerHTML = slice.map(function (c) { return c[1]; }).join('');
      while (buffer.firstChild) list.appendChild(buffer.firstChild);
      drawn += slice.length;
      if (sentinel) sentinel.style.display = drawn < matches.length ? '' : 'none';
    }

    function refilter() {
      var w = words();
      matches = w.length
        ? all.filter(function (c) {
            for (var i = 0; i < w.length; i++) {
              if (c[0].indexOf(w[i]) === -1) return false;
            }
            return true;
          })
        : all;
      list.textContent = '';
      drawn = 0;
      draw(STEP);
      label(matches.length, all.length, w.length > 0);
      if (empty) empty.classList.toggle('show', matches.length === 0);
      rememberQuery(input ? input.value : '');
    }

    if ('IntersectionObserver' in window && sentinel) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) draw(STEP);
      }, { rootMargin: '600px' }).observe(sentinel);
    } else {
      window.addEventListener('scroll', function () {
        if (window.innerHeight + window.scrollY > document.body.offsetHeight - 900) {
          draw(STEP);
        }
      }, { passive: true });
    }

    if (input) {
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(refilter, 120);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { input.value = ''; refilter(); }
      });
      var seed = new URL(window.location).searchParams.get('q');
      if (seed) input.value = seed;
    }
    refilter();
    return;
  }

  // ---- plain mode ----------------------------------------------------------
  if (!input) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));

  function apply() {
    var w = words();
    var shown = 0;
    cards.forEach(function (card) {
      var hay = card.dataset.search;
      var ok = w.every(function (word) { return hay.indexOf(word) !== -1; });
      card.classList.toggle('hidden', !ok);
      if (ok) shown++;
    });
    label(shown, cards.length, w.length > 0);
    if (empty) empty.classList.toggle('show', shown === 0);
    rememberQuery(input.value);
  }

  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.value = ''; apply(); }
  });
  var initial = new URL(window.location).searchParams.get('q');
  if (initial) input.value = initial;
  apply();
})();
