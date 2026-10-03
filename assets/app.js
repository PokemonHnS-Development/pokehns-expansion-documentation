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

// The nav strip scrolls horizontally, and every click loads a fresh document,
// so its scroll position resets and the tab you just used can end up off
// screen. Carried across pages in sessionStorage - same reasoning as the
// mascot above: per browsing session, and gone when the tab closes.
// Restoring the saved offset isn't quite enough on its own. Landing on a page
// directly (a bookmark, a shared link, a different window width) can leave the
// current tab outside the restored view, so the saved position is treated as a
// starting point and then corrected until the active tab is actually visible.
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;
  var KEY = 'hns-nav-scroll';
  var wrap = nav.closest('.nav-wrap');
  var prev = wrap ? wrap.querySelector('.nav-scroll-btn.prev') : null;
  var next = wrap ? wrap.querySelector('.nav-scroll-btn.next') : null;

  function updateNavButtons() {
    if (!prev || !next) return;
    var overflow = nav.scrollWidth > nav.clientWidth + 1;
    var atStart = nav.scrollLeft <= 2;
    var atEnd = nav.scrollLeft >= nav.scrollWidth - nav.clientWidth - 2;
    prev.classList.toggle('visible', overflow && !atStart);
    next.classList.toggle('visible', overflow && !atEnd);
    prev.setAttribute('aria-hidden', String(!overflow || atStart));
    next.setAttribute('aria-hidden', String(!overflow || atEnd));
  }

  if (prev) prev.addEventListener('click', function () {
    nav.scrollBy({ left: -220, behavior: 'smooth' });
  });
  if (next) next.addEventListener('click', function () {
    nav.scrollBy({ left: 220, behavior: 'smooth' });
  });
  if (wrap) {
    nav.addEventListener('scroll', updateNavButtons, { passive: true });
    window.addEventListener('resize', updateNavButtons);
  }

  try {
    var saved = parseInt(sessionStorage.getItem(KEY), 10);
    if (saved > 0) nav.scrollLeft = saved;
  } catch (e) { /* private mode - just start at 0 */ }

  var cur = nav.querySelector('[aria-current="page"]');
  if (cur) {
    // Rects, not offsetLeft: .nav isn't positioned, so offsetParent is not it.
    var navBox = nav.getBoundingClientRect();
    var curBox = cur.getBoundingClientRect();
    var PAD = 12;
    if (curBox.left < navBox.left) {
      nav.scrollLeft -= (navBox.left - curBox.left) + PAD;
    } else if (curBox.right > navBox.right) {
      nav.scrollLeft += (curBox.right - navBox.right) + PAD;
    }
  }

  if (wrap) updateNavButtons();

  // Debounced: momentum scrolling fires this ~60x a second and setItem is
  // synchronous.
  var t = null;
  nav.addEventListener('scroll', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      try { sessionStorage.setItem(KEY, nav.scrollLeft); } catch (e) {}
    }, 120);
  }, { passive: true });
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
  if (!document.body || document.body.dataset.noun !== 'question') return;
  var table = document.querySelector('.prose table');
  if (!table) return;

  var headerRow = table.querySelector('thead tr');
  if (headerRow) {
    var headerCells = Array.prototype.slice.call(headerRow.children);
    if (headerCells.length > 1) {
      headerRow.insertBefore(headerCells[1], headerCells[0]);
    }
  }

  var headers = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function (th) {
    return th.textContent.trim();
  });

  table.querySelectorAll('tbody tr').forEach(function (row) {
    var cells = Array.prototype.slice.call(row.children);
    if (cells.length > 1) row.insertBefore(cells[1], cells[0]);

    Array.prototype.slice.call(row.children).forEach(function (cell, index) {
      if (!headers[index]) return;
      var value = (cell.textContent || '').trim();
      cell.dataset.label = headers[index];
      if (!value) cell.hidden = true;

      if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches &&
          index === cells.length - 1 &&
          headers[index] === 'Detailed Answer (If Applicable)' &&
          value) {
        var details = document.createElement('details');
        details.className = 'faq-details';

        var summary = document.createElement('summary');
        summary.textContent = 'Show details';
        summary.setAttribute('aria-label', 'Detailed Answer (If Applicable)');

        var body = document.createElement('div');
        body.className = 'faq-detail-body';
        body.innerHTML = cell.innerHTML;

        details.addEventListener('toggle', function () {
          summary.textContent = details.open ? 'Hide details' : 'Show details';
        });

        details.appendChild(summary);
        details.appendChild(body);

        cell.innerHTML = '';
        cell.appendChild(details);
      }
    });
  });
})();

(function () {
  var input = document.getElementById('search');
  var count = document.getElementById('result-count');
  var empty = document.getElementById('empty');
  var categoryBar = document.getElementById('category-bar');
  var typeBar = document.getElementById('type-bar');
  var selectedCategory = 'All';
  var selectedType = 'All';
  var noun = document.body.dataset.noun || 'result';
  var nounPlural = document.body.dataset.nounPlural || (noun + 's');
  var payload = document.getElementById('cards');
  var timer = null;
  var movePage = document.body.dataset.noun === 'move' && input && categoryBar && typeBar;

  function label(shown, total, filtered) {
    if (!count) return;
    // Nothing to count isn't a result of zero - the type chart and the home
    // page have no searchable entries at all, and "0 types" is noise.
    if (!total) { count.textContent = ''; return; }
    count.textContent = filtered
      ? shown + ' of ' + total + ' ' + (shown === 1 ? noun : nounPlural) + ' match'
      : total + ' ' + (total === 1 ? noun : nounPlural);
  }

  function rememberQuery(value, category, type) {
    var url = new URL(window.location);
    if (value) url.searchParams.set('q', value);
    else url.searchParams.delete('q');
    if (category && category !== 'All') url.searchParams.set('cat', category);
    else url.searchParams.delete('cat');
    if (type && type !== 'All') url.searchParams.set('type', type);
    else url.searchParams.delete('type');
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

    function parseMoveTokens(searchText) {
      var hay = (searchText || '').toLowerCase();
      var typeMatches = (hay.match(/\btype[a-z]+\b/g) || []).map(function (token) {
        return token.replace(/^type/, '');
      });
      var categoryMatches = (hay.match(/\bcategory[a-z]+\b/g) || []).map(function (token) {
        return token.replace(/^category/, '');
      });
      return { typeMatches: typeMatches, categoryMatches: categoryMatches };
    }

    function buildWindowedMoveFilterBars() {
      if (!movePage) return;
      var typeMatches = [];
      var categoryMatches = [];
      all.forEach(function (entry) {
        var tokenSets = parseMoveTokens(entry[0]);
        tokenSets.typeMatches.forEach(function (value) {
          if (value && typeMatches.indexOf(value) === -1) typeMatches.push(value);
        });
        tokenSets.categoryMatches.forEach(function (value) {
          if (value && categoryMatches.indexOf(value) === -1) categoryMatches.push(value);
        });
      });

      var typeOrder = ['bug', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'flying', 'ghost', 'grass', 'ground', 'ice', 'normal', 'poison', 'psychic', 'rock', 'steel', 'water'];
      var orderedTypes = typeOrder.filter(function (name) {
        return typeMatches.indexOf(name) !== -1;
      });
      var categoryOrder = ['physical', 'special', 'status'];
      var orderedCategories = categoryOrder.filter(function (name) {
        return categoryMatches.indexOf(name) !== -1;
      });

      function syncMoveButtons() {
        typeBar.querySelectorAll('.category-pill').forEach(function (button) {
          var active = button.dataset.type === selectedType;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        categoryBar.querySelectorAll('.category-pill').forEach(function (button) {
          var active = button.dataset.category === selectedCategory;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      }

      function buildBar(bar, values, key) {
        if (!bar) return;
        ensureCategoryNavButtonsForBar(bar);
        bar.innerHTML = '';
        var allButton = document.createElement('button');
        allButton.type = 'button';
        allButton.className = 'category-pill active';
        allButton.dataset[key] = 'All';
        allButton.textContent = 'All';
        allButton.setAttribute('aria-pressed', 'true');
        bar.appendChild(allButton);

        values.forEach(function (value) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'category-pill';
          button.dataset[key] = value;
          button.textContent = value.charAt(0).toUpperCase() + value.slice(1);
          button.setAttribute('aria-pressed', 'false');
          bar.appendChild(button);
        });

        bar.addEventListener('click', function (e) {
          var button = e.target.closest('.category-pill');
          if (!button) return;
          if (key === 'type') {
            selectedType = button.dataset.type || 'All';
          } else {
            selectedCategory = button.dataset.category || 'All';
          }
          syncMoveButtons();
          refilter();
        }, { passive: true });

        updateCategoryNavButtonsForBar(bar);
      }

      buildBar(typeBar, orderedTypes, 'type');
      buildBar(categoryBar, orderedCategories, 'category');
      syncMoveButtons();
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

      if (movePage) {
        matches = matches.filter(function (c) {
          var hay = (c[0] || '').toLowerCase();
          var categoryValue = (selectedCategory || 'All').toLowerCase();
          var typeValue = (selectedType || 'All').toLowerCase();
          var categoryOk = categoryValue === 'all' || hay.indexOf('category' + categoryValue) !== -1;
          var typeOk = typeValue === 'all' || hay.indexOf('type' + typeValue) !== -1;
          return categoryOk && typeOk;
        });
      }

      list.textContent = '';
      drawn = 0;
      draw(STEP);
      label(matches.length, all.length, w.length > 0 || movePage && (selectedCategory !== 'All' || selectedType !== 'All'));
      // Only a filter that ate everything counts as empty. A page with
      // nothing to filter in the first place is not "no matches".
      if (empty) empty.classList.toggle('show', all.length > 0 && matches.length === 0);
      rememberQuery(input ? input.value : '', selectedCategory, selectedType);
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
    buildWindowedMoveFilterBars();
    refilter();
    hnsPageReady();
    return;
  }

  // ---- plain mode ----------------------------------------------------------
  // Cards are already in the DOM by the time this runs, so we're done either
  // way - including on the pages that have no search box at all.
  hnsPageReady();
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
  var categoryBar = document.getElementById('category-bar');
  var typeBar = document.getElementById('type-bar');
  var selectedCategory = 'All';
  var selectedType = 'All';
  var movePage = document.body.dataset.noun === 'move' && input && categoryBar && typeBar;

  function syncMoveTypeButtons() {
    if (!typeBar) return;
    typeBar.querySelectorAll('.category-pill').forEach(function (button) {
      var active = button.dataset.type === selectedType;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function buildMoveFilterBars() {
    if (!input || !categoryBar || !typeBar) return;

    var typeMatches = [];
    var categoryMatches = [];
    cards.forEach(function (card) {
      var hay = (card.dataset.search || '').toLowerCase();
      var typeTokenMatches = hay.match(/\btype[a-z]+\b/g) || [];
      typeTokenMatches.forEach(function (token) {
        var label = token.replace(/^type/, '');
        if (label && typeMatches.indexOf(label) === -1) typeMatches.push(label);
      });
      var categoryTokenMatches = hay.match(/\bcategory[a-z]+\b/g) || [];
      categoryTokenMatches.forEach(function (token) {
        var label = token.replace(/^category/, '');
        if (label && categoryMatches.indexOf(label) === -1) categoryMatches.push(label);
      });
    });

    var typeOrder = ['bug', 'dark', 'dragon', 'electric',  'fairy', 'fighting', 'fire', 'flying', 'ghost', 'grass', 'ground', 'ice', 'normal', 'poison', 'psychic', 'rock', 'steel', 'water'];
    var orderedTypes = typeOrder.filter(function (name) {
      return typeMatches.indexOf(name) !== -1;
    });

    var categoryOrder = ['physical', 'special', 'status'];
    var orderedCategories = categoryOrder.filter(function (name) {
      return categoryMatches.indexOf(name) !== -1;
    });

    function titleCase(value) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function buildBar(bar, values, key) {
      if (!bar) return;
      ensureCategoryNavButtonsForBar(bar);
      bar.innerHTML = '';
      var allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.className = 'category-pill active';
      allButton.dataset[key] = 'All';
      allButton.textContent = 'All';
      allButton.setAttribute('aria-pressed', 'true');
      bar.appendChild(allButton);
      values.forEach(function (value) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-pill';
        button.dataset[key] = value;
        button.textContent = titleCase(value);
        button.setAttribute('aria-pressed', 'false');
        bar.appendChild(button);
      });
      bar.addEventListener('click', function (e) {
        var button = e.target.closest('.category-pill');
        if (!button) return;
        if (key === 'type') {
          selectedType = button.dataset.type || 'All';
          syncMoveTypeButtons();
        } else {
          selectedCategory = button.dataset.category || 'All';
          syncCategoryButtons();
        }
        apply();
      }, { passive: true });
      updateCategoryNavButtonsForBar(bar);
    }

    buildBar(typeBar, orderedTypes, 'type');
    buildBar(categoryBar, orderedCategories, 'category');

    var initialType = new URL(window.location).searchParams.get('type');
    if (initialType) {
      var normalizedType = initialType.toLowerCase();
      if (orderedTypes.indexOf(normalizedType) !== -1) {
        selectedType = normalizedType;
      }
    }

    var initialCategory = new URL(window.location).searchParams.get('cat');
    if (initialCategory) {
      var normalizedCategory = initialCategory.toLowerCase();
      if (orderedCategories.indexOf(normalizedCategory) !== -1) {
        selectedCategory = normalizedCategory;
      }
    }

    syncMoveTypeButtons();
    syncCategoryButtons();
  }

  if (!input && !categoryBar) return;

  if (movePage) {
    buildMoveFilterBars();
    apply();
    return;
  }

  if (!input && categoryBar) {
    var sectionTargets = Array.prototype.slice.call(document.querySelectorAll('[data-category][data-search]'));
    var versionBar = document.getElementById('version-bar');
    var selectedVersion = 'All';

    function syncDynamicCategoryButtons() {
      if (!categoryBar) return;
      categoryBar.querySelectorAll('.category-pill').forEach(function (button) {
        var active = button.dataset.category === selectedCategory;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    function syncDynamicVersionButtons() {
      if (!versionBar) return;
      versionBar.querySelectorAll('.category-pill').forEach(function (button) {
        var active = button.dataset.category === selectedVersion;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    function buildDynamicCategoryBar() {
      if (!categoryBar) return;
      var categories = [];
      sectionTargets.forEach(function (target) {
        var name = target.dataset.category;
        if (name && categories.indexOf(name) === -1) categories.push(name);
      });

      if (!categories.length) return;
      ensureCategoryNavButtonsForBar(categoryBar);
      categoryBar.innerHTML = '';
      var allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.className = 'category-pill active';
      allButton.dataset.category = 'All';
      allButton.textContent = 'All';
      allButton.setAttribute('aria-pressed', 'true');
      categoryBar.appendChild(allButton);

      categories.forEach(function (category) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-pill';
        button.dataset.category = category;
        button.textContent = category;
        button.setAttribute('aria-pressed', 'false');
        categoryBar.appendChild(button);
      });

      var hashCategory = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (hashCategory) {
        var normalizedHash = hashCategory.replace(/[^a-z0-9]/gi, '').toLowerCase();
        var categoryFromHash = categories.find(function (category) {
          return category.replace(/\s+/g, '').toLowerCase() === normalizedHash;
        });
        if (categoryFromHash) {
          selectedCategory = categoryFromHash;
        }
      }

      categoryBar.addEventListener('click', function (e) {
        var button = e.target.closest('.category-pill');
        if (!button) return;
        selectedCategory = button.dataset.category;
        syncDynamicCategoryButtons();
        applyDynamicFilters();
      }, { passive: true });
      updateCategoryNavButtonsForBar(categoryBar);
    }

    function buildDynamicVersionBar() {
      if (!versionBar) return;
      var versions = [];
      document.querySelectorAll('.changelog-card[data-version]').forEach(function (card) {
        var name = card.dataset.version;
        if (name && versions.indexOf(name) === -1) versions.push(name);
      });

      if (!versions.length) {
        versionBar.parentElement.hidden = true;
        return;
      }

      ensureCategoryNavButtonsForBar(versionBar);
      versionBar.parentElement.hidden = false;
      versionBar.innerHTML = '';
      var allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.className = 'category-pill active';
      allButton.dataset.category = 'All';
      allButton.textContent = 'All';
      allButton.setAttribute('aria-pressed', 'true');
      versionBar.appendChild(allButton);

      versions.forEach(function (version) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-pill';
        button.dataset.category = version;
        button.textContent = version;
        button.setAttribute('aria-pressed', 'false');
        versionBar.appendChild(button);
      });

      versionBar.addEventListener('click', function (e) {
        var button = e.target.closest('.category-pill');
        if (!button) return;
        selectedVersion = button.dataset.category;
        syncDynamicVersionButtons();
        applyDynamicFilters();
      }, { passive: true });
      updateCategoryNavButtonsForBar(versionBar);
    }

    function applyDynamicFilters() {
      sectionTargets.forEach(function (target) {
        var categoryOk = selectedCategory === 'All' || target.dataset.category === selectedCategory;
        target.hidden = !categoryOk;
      });

      var changelogCards = Array.prototype.slice.call(document.querySelectorAll('.changelog-card[data-version]'));
      changelogCards.forEach(function (card) {
        var versionOk = selectedVersion === 'All' || card.dataset.version === selectedVersion;
        var visible = selectedCategory === 'Changelog' || selectedCategory === 'All'
          ? versionOk
          : true;
        card.hidden = !visible;
      });

      if (versionBar) {
        var versionWrap = versionBar.parentElement;
        if (versionWrap) {
          versionWrap.hidden = false;
        }
      }
    }

    buildDynamicCategoryBar();
    buildDynamicVersionBar();
    syncDynamicCategoryButtons();
    syncDynamicVersionButtons();
    applyDynamicFilters();
    return;
  }

  if (!input) return;

  function tmHmSortKey(card) {
    var h2 = card.querySelector('h2');
    if (!h2) return Number.MAX_SAFE_INTEGER;
    var match = h2.textContent.match(/\b(HM|TM)\s*(\d+)/i);
    if (!match) return Number.MAX_SAFE_INTEGER;
    var prefix = match[1].toUpperCase();
    var order = prefix === 'HM' ? 0 : 1;
    return order * 1000 + parseInt(match[2], 10);
  }

  function fixTmHmNamesAndOrder() {
    var parent = cards[0] && cards[0].parentNode;
    if (!parent) return;

    cards.forEach(function (card) {
      var h2 = card.querySelector('h2');
      if (!h2) return;
      h2.innerHTML = h2.innerHTML.replace(/(TM|HM)\s*(\d+)/gi, function (match, prefix, num) {
        return prefix + String(parseInt(num, 10)).padStart(2, '0');
      });
    });

    var firstTmHm = -1;
    var lastTmHm = -1;
    cards.forEach(function (card, index) {
      if (tmHmSortKey(card) !== Number.MAX_SAFE_INTEGER) {
        if (firstTmHm === -1) firstTmHm = index;
        lastTmHm = index;
      }
    });

    if (firstTmHm === -1 || lastTmHm === -1) return;

    var before = cards.slice(0, firstTmHm);
    var tmHmCards = cards.slice(firstTmHm, lastTmHm + 1).slice().sort(function (a, b) {
      return tmHmSortKey(a) - tmHmSortKey(b);
    });
    var after = cards.slice(lastTmHm + 1);
    cards = before.concat(tmHmCards, after);

    cards.forEach(function (card) {
      parent.appendChild(card);
    });
  }

  function isCategoryBadge(text) {
    if (!text) return false;
    text = text.trim();
    if (!text) return false;
    if (text.indexOf('₽') !== -1) return false;
    return true;
  }

  function normalizeCategory(text) {
    if (!text) return text;
    var trimmed = text.trim();
    trimmed = trimmed.replace(/\s+\((?:shiny|non-shiny)\)$/i, '');
    if (/^(?:TM|HM)\d+$/i.test(trimmed)) return 'TM/HM';
    return trimmed;
  }

  function extractCardCategories(card) {
    var categories = [];

    var heading = card.previousElementSibling;
    while (heading) {
      if (heading.matches && heading.matches('h2.group-heading')) {
        var text = heading.textContent.trim();
        if (text && categories.indexOf(text) === -1) categories.push(text);
        break;
      }
      heading = heading.previousElementSibling;
    }

    card.querySelectorAll('.badge').forEach(function (badge) {
      var text = badge.textContent.trim();
      if (!isCategoryBadge(text)) return;
      var normalized = normalizeCategory(text);
      if (categories.indexOf(normalized) === -1) categories.push(normalized);
    });
    return categories;
  }

  function updateCategoryNavButtonsForBar(bar) {
    if (!bar) return;
    var wrap = bar.parentElement;
    if (!wrap) return;
    var prev = wrap.querySelector('.category-nav-prev');
    var next = wrap.querySelector('.category-nav-next');
    if (!prev || !next) return;

    var maxScroll = bar.scrollWidth - bar.clientWidth;
    var overflows = bar.scrollWidth > bar.clientWidth + 1;
    var atStart = bar.scrollLeft <= 2;
    var atEnd = bar.scrollLeft >= maxScroll - 2;

    prev.classList.toggle('visible', overflows && !atStart);
    next.classList.toggle('visible', overflows && !atEnd);
    prev.setAttribute('aria-hidden', String(!overflows || atStart));
    next.setAttribute('aria-hidden', String(!overflows || atEnd));
  }

  function updateCategoryNavButtons() {
    updateCategoryNavButtonsForBar(categoryBar);
  }

  function ensureCategoryNavButtonsForBar(bar) {
    if (!bar) return;
    var wrap = bar.parentElement;
    if (!wrap || wrap.querySelector('.category-nav')) return;

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'category-nav prev category-nav-prev';
    prev.setAttribute('aria-label', 'Scroll categories left');
    prev.innerHTML = '&lsaquo;';
    prev.addEventListener('click', function () {
      bar.scrollBy({ left: -220, behavior: 'smooth' });
    });

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'category-nav next category-nav-next';
    next.setAttribute('aria-label', 'Scroll categories right');
    next.innerHTML = '&rsaquo;';
    next.addEventListener('click', function () {
      bar.scrollBy({ left: 220, behavior: 'smooth' });
    });

    wrap.insertBefore(prev, bar);
    wrap.appendChild(next);

    bar.addEventListener('scroll', function () {
      updateCategoryNavButtonsForBar(bar);
    }, { passive: true });
    window.addEventListener('resize', function () {
      updateCategoryNavButtonsForBar(bar);
    });
  }

  function ensureCategoryNavButtons() {
    ensureCategoryNavButtonsForBar(categoryBar);
  }

  function syncCategoryButtons() {
    if (!categoryBar) return;
    categoryBar.querySelectorAll('.category-pill').forEach(function (button) {
      var active = button.dataset.category === selectedCategory;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function hideEmptyGroupHeadings() {
    document.querySelectorAll('.group-heading').forEach(function (heading) {
      var next = heading.nextElementSibling;
      var groupHasVisibleCard = false;
      while (next && !(next.matches && next.matches('.group-heading'))) {
        if (next.matches && next.matches('.card') && !next.classList.contains('hidden')) {
          groupHasVisibleCard = true;
          break;
        }
        next = next.nextElementSibling;
      }

      var headingCategory = heading.textContent.trim();
      var categoryMismatch = selectedCategory !== 'All' && headingCategory !== selectedCategory;
      heading.hidden = categoryMismatch || !groupHasVisibleCard;
    });
  }

  function buildCategoryBar() {
    if (!categoryBar) return;
    ensureCategoryNavButtons();
    var categories = [];
    cards.forEach(function (card) {
      var names = extractCardCategories(card);
      card.dataset.categories = names.join('|');
      names.forEach(function (name) {
        if (categories.indexOf(name) === -1) categories.push(name);
      });
    });
    if (!categories.length) {
      categoryBar.hidden = true;
      return;
    }

    categoryBar.hidden = false;
    categoryBar.innerHTML = '';

    var allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'category-pill active';
    allButton.dataset.category = 'All';
    allButton.textContent = 'All';
    allButton.setAttribute('aria-pressed', 'true');
    categoryBar.appendChild(allButton);

    categories.forEach(function (category) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'category-pill';
      button.dataset.category = category;
      button.textContent = category;
      button.setAttribute('aria-pressed', 'false');
      categoryBar.appendChild(button);
    });

    categoryBar.addEventListener('click', function (e) {
      var button = e.target.closest('.category-pill');
      if (!button) return;
      selectedCategory = button.dataset.category;
      syncCategoryButtons();
      apply();
    });

    var initialCategory = new URL(window.location).searchParams.get('cat');
    if (initialCategory && categories.indexOf(initialCategory) !== -1) {
      selectedCategory = initialCategory;
    }
    syncCategoryButtons();
    updateCategoryNavButtons();
  }

  function apply() {
    var w = words();
    var shown = 0;
    cards.forEach(function (card) {
      var hay = (card.dataset.search || '').toLowerCase();
      var categoryValue = (selectedCategory || 'All').toLowerCase();
      var typeValue = (selectedType || 'All').toLowerCase();
      var categoryOk = categoryValue === 'all'
        || (document.body.dataset.noun === 'move' && hay.indexOf('category' + categoryValue) !== -1)
        || (document.body.dataset.noun !== 'move' && card.dataset.categories && card.dataset.categories.split('|').indexOf(selectedCategory) !== -1);
      var typeOk = typeValue === 'all'
        || (document.body.dataset.noun === 'move' && hay.indexOf('type' + typeValue) !== -1);
      var ok = categoryOk && typeOk && w.every(function (word) { return hay.indexOf(word) !== -1; });
      card.classList.toggle('hidden', !ok);
      if (ok) shown++;
    });

    hideEmptyGroupHeadings();

    label(shown, cards.length, w.length > 0);
    if (empty) empty.classList.toggle('show', cards.length > 0 && shown === 0);
    rememberQuery(input ? input.value : '', selectedCategory, selectedType);
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
  fixTmHmNamesAndOrder();
  if (categoryBar && !movePage) buildCategoryBar();
  if (movePage) {
    buildMoveFilterBars();
    apply();
    return;
  }
  apply();
})();
