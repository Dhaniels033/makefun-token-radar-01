// Token Radar dashboard: renders window.RADAR (written by main.ts as data.js)
// with no fetch and no network. One page, three views: the ranked pre-token
// board, a detail view per protocol with its worked model numbers and its
// seven-step farm plan, and the live-token comparables the board is priced
// from. State lives in the URL hash, so #p=<slug> opens a detail view and
// #cat=<category> opens a filtered board.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    document.getElementById('rows').innerHTML =
      '<tr><td colspan="9" class="empty">No board data loaded.</td></tr>';
    return;
  }

  var rows = DATA.rows;
  var live = DATA.live || [];
  var comparable = DATA.model.base_multiple;

  /** Escape text for insertion into HTML. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** $1.58B, $376.0M, $75.0K, $512. */
  function fmtMoney(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  /** Full dollars with thousands separators. */
  function fmtFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  /** +5.77%, -3.29%, or — when unreported. */
  function fmtPct(n) {
    if (n == null || !isFinite(n)) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    var sign = n > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + n.toFixed(2) + '%</span>';
  }

  /** 412d, or — when DefiLlama reports no listing date. The listing date is shown in the detail view. */
  function fmtAge(days, listed) {
    if (days == null) return '—';
    return days + 'd';
  }

  function chainPills(chains) {
    var shown = (chains || []).slice(0, 2).map(function (c) {
      return '<span class="pill">' + esc(c) + '</span>';
    }).join('');
    if ((chains || []).length > 2) shown += '<span class="pill">+' + (chains.length - 2) + '</span>';
    return shown || '<span class="pill">—</span>';
  }

  // -- state ---------------------------------------------------------------
  var state = { q: '', cat: '', chain: '', sort: 'implied', watch: false, tab: 'board', detail: '' };

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var p = new URLSearchParams(h);
    state.q = p.get('q') || '';
    state.cat = p.get('cat') || '';
    state.chain = p.get('chain') || '';
    state.sort = p.get('sort') || 'implied';
    state.watch = p.get('watch') === '1';
    state.tab = p.get('tab') === 'live' ? 'live' : 'board';
    state.detail = p.get('p') || '';
  }

  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.chain) p.set('chain', state.chain);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.watch) p.set('watch', '1');
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.detail) p.set('p', state.detail);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : '#');
  }

  // -- filtering and sorting -------------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat && (r.category || '') !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
      name: function (a, b) { return a.name.localeCompare(b.name); },
    }[state.sort] || function (a, b) { return a.rank - b.rank; };
    return out.slice().sort(function (a, b) {
      var d = by(a, b);
      return d !== 0 ? d : a.rank - b.rank;
    });
  }

  // -- board -----------------------------------------------------------------
  var tbody = document.getElementById('rows');
  var countEl = document.getElementById('count');

  function renderBoard() {
    var list = filtered();
    var wl = rows.filter(function (r) { return r.watchlist; }).length;
    countEl.textContent = 'Showing ' + list.length + ' of ' + rows.length +
      ' ranked protocols (' + wl + ' on the watchlist, ' + (rows.length - wl) + ' early finds below the floor).';
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">Nothing matches those filters. Clear the search or widen the category.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
          (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
          '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td>' + chainPills(r.chains) + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days, r.listed_at) + '</td>' +
        '<td class="num"><strong>' + fmtMoney(r.implied_value_usd) + '</strong></td>' +
        '<td><button type="button" class="planbtn" data-plan="' + esc(r.slug) + '">Farm plan</button></td>' +
        '</tr>';
    }).join('');
  }

  // -- detail ----------------------------------------------------------------
  var detailEl = document.getElementById('detail');

  /** One protocol's detail: worked model numbers, then its farm plan. */
  function renderDetail() {
    var slug = state.detail;
    if (!slug) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var base = r.tvl_usd * comparable;
    var check = base * r.growth_multiplier * r.maturity_multiplier * r.breadth_multiplier;
    detailEl.innerHTML =
      '<button type="button" class="back" id="backBtn">&larr; Back to the board</button>' +
      '<h2>#' + r.rank + ' &nbsp;' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="fine">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'no category') + ' &middot; ' +
        esc((r.chains || []).join(', ') || 'no chains listed') +
        ' &middot; records no token in the snapshot.</p>' +
      '<dl class="kv">' +
      '<div><dt>Implied value</dt><dd>' + fmtFull(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + fmtFull(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</dd></div>' +
      '<div><dt>Age with no token</dt><dd>' + (r.age_days == null ? '—' : r.age_days + ' days') +
        '<small>' + (r.listed_at ? 'tracked since ' + esc(r.listed_at) : 'no listing date reported') + '</small></dd></div>' +
      '<div><dt>Chains</dt><dd>' + (r.chains || []).length + '<small>' + esc((r.chains || []).slice(0, 3).join(', ')) + '</small></dd></div>' +
      '</dl>' +
      '<h3>How rank #' + r.rank + ' is worked out</h3>' +
      '<div class="tablewrap"><table class="modeltable"><tbody>' +
      '<tr><td>Base: TVL &times; comparable (' + comparable.toFixed(4) + ')</td><td class="num">' + fmtFull(base) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d, clamped &minus;50%..+100%, weight 0.8)</td><td class="num">&times; ' + r.growth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier (age ' + (r.age_days == null ? 'unknown, counted as 365d' : r.age_days + 'd') + ' of 1,460d)</td><td class="num">&times; ' + r.maturity_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Breadth multiplier (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')</td><td class="num">&times; ' + r.breadth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td><strong>Implied value</strong> (product rounds to this value; shown &asymp; ' + fmtFull(check) + ' before rounding)</td><td class="num"><strong>' + fmtFull(r.implied_value_usd) + '</strong></td></tr>' +
      '</tbody></table></div>' +
      '<h3 id="farmplan">Farm plan &mdash; seven steps</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="fine">A plan positions a wallet; it does not promise a token or an airdrop. Never pay to claim, and only use links the protocol itself publishes.</p>';
    detailEl.hidden = false;
    document.getElementById('backBtn').addEventListener('click', function () {
      state.detail = '';
      writeHash();
      renderDetail();
      document.getElementById('board').scrollIntoView();
    });
  }

  // -- live comparables --------------------------------------------------------
  function renderLive() {
    document.getElementById('liveRows').innerHTML = live.map(function (p) {
      var ratio = p.tvl_usd > 0 && p.mcap_usd != null ? (p.mcap_usd / p.tvl_usd).toFixed(2) : '—';
      return '<tr><td><strong>' + esc(p.name) + '</strong><span class="sub">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + fmtMoney(p.tvl_usd) + '</td>' +
        '<td class="num">' + fmtMoney(p.mcap_usd) + '</td>' +
        '<td class="num">' + ratio + '&times;</td>' +
        '<td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  // -- header, stats, worked example ------------------------------------------
  function renderMeta() {
    var top = rows[0];
    var wl = rows.filter(function (r) { return r.watchlist; }).length;
    document.getElementById('stats').innerHTML =
      '<div><dt>Snapshot date</dt><dd>' + esc(DATA.as_of) + '</dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + wl + ' <small>of ' + DATA.watchlist_size + ' named</small></dd></div>' +
      '<div><dt>Board rows</dt><dd>' + rows.length + '</dd></div>' +
      '<div><dt>Watchlist floor</dt><dd>' + fmtMoney(DATA.floor_usd) + '</dd></div>' +
      '<div><dt>Model</dt><dd>' + esc(DATA.model_version) + '</dd></div>';
    document.getElementById('comparable').textContent = comparable.toFixed(4) +
      ' (median market-cap / TVL of the live-token protocols in this snapshot)';
    if (top) {
      var base = top.tvl_usd * comparable;
      document.getElementById('worked').innerHTML = '<strong>Worked example &mdash; rank #1, ' + esc(top.name) + ':</strong> ' +
        fmtFull(top.tvl_usd) + ' TVL &times; ' + comparable.toFixed(4) + ' = ' + fmtFull(base) +
        '; &times; ' + top.growth_multiplier.toFixed(4) + ' growth &times; ' + top.maturity_multiplier.toFixed(4) +
        ' maturity &times; ' + top.breadth_multiplier.toFixed(4) + ' breadth = <strong>' +
        fmtFull(top.implied_value_usd) + '</strong>.';
    }
  }

  // -- tabs --------------------------------------------------------------------
  var boardView = document.getElementById('boardView');
  var liveView = document.getElementById('liveView');
  var tabBoard = document.getElementById('tabBoard');
  var tabLive = document.getElementById('tabLive');

  function renderTabs() {
    var liveOn = state.tab === 'live';
    boardView.hidden = liveOn;
    liveView.hidden = !liveOn;
    tabBoard.classList.toggle('active', !liveOn);
    tabLive.classList.toggle('active', liveOn);
    tabBoard.setAttribute('aria-pressed', String(!liveOn));
    tabLive.setAttribute('aria-pressed', String(liveOn));
  }

  // -- controls ------------------------------------------------------------------
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var sortEl = document.getElementById('sort');
  var watchEl = document.getElementById('watchOnly');

  function fillSelect(el, values) {
    var keep = el.value;
    var seen = {};
    values.forEach(function (v) { if (v) seen[v] = true; });
    var opts = Object.keys(seen).sort();
    el.innerHTML = '<option value="">' + (el === catEl ? 'All categories' : 'All chains') + '</option>' +
      opts.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
    el.value = opts.indexOf(keep) >= 0 ? keep : '';
  }

  fillSelect(catEl, rows.map(function (r) { return r.category; }));
  var allChains = [];
  rows.forEach(function (r) { (r.chains || []).forEach(function (c) { allChains.push(c); }); });
  fillSelect(chainEl, allChains);

  function syncControls() {
    qEl.value = state.q;
    catEl.value = state.cat;
    chainEl.value = state.chain;
    sortEl.value = state.sort;
    watchEl.checked = state.watch;
  }

  function rerender() { renderBoard(); renderDetail(); renderTabs(); }

  qEl.addEventListener('input', function () { state.q = qEl.value; state.detail = ''; writeHash(); renderBoard(); });
  catEl.addEventListener('change', function () { state.cat = catEl.value; writeHash(); renderBoard(); });
  chainEl.addEventListener('change', function () { state.chain = chainEl.value; writeHash(); renderBoard(); });
  sortEl.addEventListener('change', function () { state.sort = sortEl.value; writeHash(); renderBoard(); });
  watchEl.addEventListener('change', function () { state.watch = watchEl.checked; writeHash(); renderBoard(); });
  tabBoard.addEventListener('click', function () { state.tab = 'board'; writeHash(); renderTabs(); });
  tabLive.addEventListener('click', function () { state.tab = 'live'; writeHash(); renderTabs(); });

  tbody.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-plan]') : null;
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (!tr) return;
    state.detail = tr.getAttribute('data-slug');
    writeHash();
    renderDetail();
    detailEl.scrollIntoView({ behavior: 'auto', block: 'start' });
    if (btn) {
      var h = document.getElementById('farmplan');
      if (h) h.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  });
  tbody.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (!tr) return;
    state.detail = tr.getAttribute('data-slug');
    writeHash();
    renderDetail();
    detailEl.scrollIntoView();
  });
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      state.sort = key === 'implied' ? 'implied' : key;
      sortEl.value = state.sort;
      writeHash();
      renderBoard();
    });
  });

  readHash();
  syncControls();
  renderMeta();
  renderLive();
  rerender();
  if (state.detail) detailEl.scrollIntoView({ behavior: 'auto', block: 'start' });
})();
