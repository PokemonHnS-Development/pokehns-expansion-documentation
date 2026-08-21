// Search + rendering shared by every page.
//
// Small pages ship their cards as plain HTML and are filtered by hiding them.
// Big pages (species, learnsets) would need >100k DOM elements if rendered that
// way, which is painfully slow on a phone, so they ship their cards as strings
// in a JSON payload and only the ones on screen are built.
// The tab icon is Ho-Oh or Lugia, picked once per browsing session. Keeping the
// choice in sessionStorage means it stays put while you move between pages -
// rerolling on every navigation looks like a glitch rather than a flourish.
(function () {
  var MASCOTS = ['ho_oh', 'lugia'];
  var chosen;
  try {
    chosen = sessionStorage.getItem('hns-mascot');
    if (MASCOTS.indexOf(chosen) === -1) {
      chosen = MASCOTS[Math.floor(Math.random() * MASCOTS.length)];
      sessionStorage.setItem('hns-mascot', chosen);
    }
  } catch (e) {
    chosen = MASCOTS[Math.floor(Math.random() * MASCOTS.length)];
  }
  var icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = 'assets/favicon/' + chosen + '-32.png';
  var touch = document.querySelector('link[rel="apple-touch-icon"]');
  if (touch) touch.href = 'assets/favicon/' + chosen + '-180.png';
})();

// The encounters page sticks each route heading below the search toolbar, and
// the toolbar is itself sticky at top:0 - so the offset has to be the
// toolbar's real height. That isn't a constant: the result-count line only
// appears once a search runs, and the bar grows when it wraps on a narrow
// screen. Measured rather than guessed, and watched for changes.
(function () {
  var bar = document.querySelector('.toolbar');
  if (!bar) return;
  function sync() {
    document.documentElement.style.setProperty(
      '--stick-top', bar.offsetHeight + 'px');
  }
  sync();
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(bar);
  else window.addEventListener('resize', sync);
})();

// Pokedex cards have two independent selections: which tab is open, and which
// alternate form is being shown. Both are held on the card as data attributes
// and applied together, so switching form keeps you on the tab you were reading.
// Delegated from the document so it also works for cards the windowed renderer
// adds later.
function hnsSyncCard(card) {
  var form = card.dataset.form || '0';
  var panel = card.dataset.panel || 'stats';

  card.querySelectorAll('.formswap').forEach(function (el) {
    el.hidden = el.dataset.form !== form;
  });
  card.querySelectorAll('.formpill').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.form === form));
  });
  card.querySelectorAll('.tab').forEach(function (t) {
    t.setAttribute('aria-selected', String(t.dataset.panel === panel));
  });
  card.querySelectorAll('.panel').forEach(function (p) {
    // "any" panels (the Forms list) are the same whichever form is selected
    var formOk = p.dataset.form === form || p.dataset.form === 'any';
    p.hidden = !(formOk && p.dataset.panel === panel);
  });
}

document.addEventListener('click', function (e) {
  if (!e.target.closest) return;
  var tab = e.target.closest('.tab');
  var pill = e.target.closest('.formpill');
  if (!tab && !pill) return;
  var card = (tab || pill).closest('.card');
  if (!card) return;
  if (tab) card.dataset.panel = tab.dataset.panel;
  if (pill) card.dataset.form = pill.dataset.form;
  hnsSyncCard(card);
});

// The spinner is markup, not script, so it appears the moment the header
// streams in. Clearing it is this file's job - once for real when the list has
// been drawn, and once on window load in case something above threw first.
function hnsPageReady() {
  document.body.classList.add('ready');
}
window.addEventListener('load', hnsPageReady);

(function () {
  var input = document.getElementById('search');
  var count = document.getElementById('result-count');
  var empty = document.getElementById('empty');
  var noun = document.body.dataset.noun || 'result';
  var nounPlural = document.body.dataset.nounPlural || (noun + 's');
  var payload = document.getElementById('cards');
  var timer = null;

  function label(shown, total, filtered) {
    if (!count) return;
    count.textContent = filtered
      ? shown + ' of ' + total + ' ' + (shown === 1 ? noun : nounPlural) + ' match'
      : total + ' ' + (total === 1 ? noun : nounPlural);
  }

  function rememberQuery(value) {
    var url = new URL(window.location);
    if (value) url.searchParams.set('q', value);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }

  function words() {
    // Punctuation is stripped so "ho-oh" and "farfetch'd" match the index,
    // which stores those names joined as well as split.
    var q = input ? input.value.toLowerCase().trim() : '';
    if (!q) return [];
    return q.split(/\s+/)
            .map(function (w) { return w.replace(/[^a-z0-9]/g, ''); })
            .filter(function (w) { return w.length; });
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
    hnsPageReady();
    return;
  }

  // ---- plain mode ----------------------------------------------------------
  // Cards are already in the DOM by the time this runs, so we're done either
  // way - including on the pages that have no search box at all.
  hnsPageReady();
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
