/* Reinforcement Learning Coffee · SARL, IDA Lab, PLUS Salzburg
 *
 * Rendering order: bundled snapshot (js/talks.js) → last good sheet response
 * from localStorage → live Google Sheet. Every step renders the same shape of
 * data, so the page is complete on first paint and only changes if the sheet
 * actually did. No innerHTML: everything goes through templates and textContent.
 */
(function () {
  'use strict';

  var SHEET_ID = '1d9mY-ZdecDYc6HToxOdW3T8OqfTEnK07pExCXUc4NWg';
  var SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:json&gid=0';
  var CACHE_KEY = 'rlc-sheet-v1';
  var SITE_URL = 'https://idalab.at/reinforcement_learning_coffee/';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var state = { talks: [], signature: '', filter: 'all', query: '', today: startOfToday() };

  // ── Utilities ────────────────────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function storage(op, key, value) {
    try {
      if (op === 'get') return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* private mode or blocked storage */ }
    return null;
  }

  function startOfToday() {
    // ?today=YYYY-MM-DD lets you preview the page as of another date.
    var override = new URLSearchParams(location.search).get('today');
    var d = override ? parseIsoDate(override) : null;
    if (d) return d;
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function parseIsoDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Sheet cells arrive as "Date(2024,2,1)" (0-based month) or display text like "1 Mar 2024".
  function sheetDateToIso(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim();
    var m = /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/.exec(s);
    if (m) return isoDate(new Date(+m[1], +m[2], +m[3]));
    m = /^(\d{1,2}) ([A-Za-z]{3})[A-Za-z]*\.? (\d{4})$/.exec(s);
    if (m) {
      var mi = MONTHS.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].toLowerCase());
      if (mi >= 0) return isoDate(new Date(+m[3], mi, +m[1]));
    }
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (m) return isoDate(new Date(+m[3], +m[2] - 1, +m[1]));
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  function clean(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return /^[-–—]+$/.test(s) ? '' : s;
  }

  // Only https links are rendered. Google Calendar redirect wrappers are unwrapped.
  function safeLink(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    try {
      var u = new URL(s);
      if (u.hostname === 'www.google.com' && u.pathname === '/url' && u.searchParams.get('q')) {
        u = new URL(u.searchParams.get('q'));
      }
      return u.protocol === 'https:' ? u : null;
    } catch (e) { return null; }
  }

  function describeLink(u) {
    var host = u.hostname, path = u.pathname;
    if (/arxiv\.org$/.test(host)) return { label: 'Paper', material: true };
    if (/github\.com$/.test(host)) return { label: 'Code', material: true };
    if (/docs\.google\.com$/.test(host) && /presentation/.test(path)) return { label: 'Slides', material: true };
    if (/drive\.google\.com$/.test(host) || /\.pdf$/i.test(path)) return { label: 'Slides', material: true };
    if (/teams\.microsoft\.com$|zoom\.us$|meet\.google\.com$/.test(host)) return { label: 'Join online', material: false };
    return { label: 'Link', material: true };
  }

  function normalize(rows) {
    var talks = [];
    rows.forEach(function (r) {
      var iso = sheetDateToIso(r.date);
      var date = parseIsoDate(iso);
      if (!date) return;
      var speaker = clean(r.speaker).replace(/\s*,\s*/g, ', ');
      var institution = clean(r.institution);
      var topic = clean(r.topic);
      if (/^no affiliation$/i.test(institution)) institution = '';
      // "General discussion" rows put the description in the name column.
      if (!topic && speaker && !institution) { topic = speaker; speaker = ''; }
      var skipped = !topic || /^\(?skipped\b/i.test(topic);
      if (skipped) topic = topic ? topic.replace(/^\((.*)\)$/, '$1') : 'No session';
      var url = safeLink(r.link);
      var link = url ? describeLink(url) : null;
      talks.push({
        iso: iso,
        date: date,
        id: 'talk-' + iso,
        speaker: speaker,
        institution: institution,
        topic: topic,
        skipped: skipped,
        href: url ? url.href : '',
        linkLabel: link ? link.label : '',
        material: !!(link && link.material)
      });
    });
    talks.sort(function (a, b) { return b.date - a.date; });
    return talks;
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function setTalks(rows, source) {
    var talks = normalize(rows);
    if (!talks.length) return;
    var signature = JSON.stringify(talks.map(function (t) { return [t.iso, t.speaker, t.institution, t.topic, t.href]; }));
    if (signature === state.signature) return;
    state.talks = talks;
    state.signature = signature;
    document.documentElement.dataset.source = source;
    buildYearFilters();
    renderNext();
    renderStats();
    renderList();
  }

  function isUpcoming(t) { return t.date >= state.today; }

  function buildYearFilters() {
    var box = $('#filters');
    $all('[data-year]', box).forEach(function (b) { b.remove(); });
    var years = [];
    state.talks.forEach(function (t) {
      var y = String(t.date.getFullYear());
      if (years.indexOf(y) < 0) years.push(y);
    });
    years.forEach(function (y) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.filter = y;
      b.dataset.year = y;
      b.textContent = y;
      b.setAttribute('aria-pressed', String(state.filter === y));
      box.appendChild(b);
    });
    if (/^\d{4}$/.test(state.filter) && years.indexOf(state.filter) < 0) setFilter('all');
  }

  function matches(t) {
    var f = state.filter;
    if (f === 'upcoming' && !isUpcoming(t)) return false;
    if (f === 'materials' && !t.material) return false;
    if (/^\d{4}$/.test(f) && String(t.date.getFullYear()) !== f) return false;
    var q = state.query;
    if (!q) return true;
    var hay = (t.topic + ' ' + t.speaker + ' ' + t.institution + ' ' + t.date.getDate() + ' ' + MONTHS_LONG[t.date.getMonth()] + ' ' + t.date.getFullYear()).toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  // Writes text into el, wrapping query hits in <mark> without touching innerHTML.
  function writeHighlighted(el, text) {
    el.textContent = '';
    var words = state.query ? state.query.split(/\s+/).filter(Boolean) : [];
    if (!words.length) { el.textContent = text; return; }
    var pattern = new RegExp('(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    text.split(pattern).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) {
        var m = document.createElement('mark');
        m.textContent = part;
        el.appendChild(m);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  function renderList() {
    var root = $('#talks');
    var tplYear = $('#tpl-year');
    var tplTalk = $('#tpl-talk');
    var shown = state.talks.filter(matches);
    var frag = document.createDocumentFragment();
    var currentYear = null;
    var list = null;

    shown.forEach(function (t) {
      var y = t.date.getFullYear();
      if (y !== currentYear) {
        currentYear = y;
        var group = tplYear.content.firstElementChild.cloneNode(true);
        $('.year-label', group).textContent = String(y);
        list = $('.talk-list', group);
        frag.appendChild(group);
      }
      var li = tplTalk.content.firstElementChild.cloneNode(true);
      li.id = t.id;
      if (isUpcoming(t)) li.classList.add('is-upcoming');
      if (t.skipped) li.classList.add('is-skipped');
      var time = $('.talk-date', li);
      time.dateTime = t.iso;
      $('.talk-day', li).textContent = String(t.date.getDate());
      $('.talk-month', li).textContent = MONTHS[t.date.getMonth()];
      writeHighlighted($('.talk-topic', li), t.topic);
      var who = [t.speaker, t.institution].filter(Boolean).join(' · ');
      var whoEl = $('.talk-who', li);
      if (who) writeHighlighted(whoEl, who); else whoEl.remove();
      var chip = $('.chip', li);
      // Meeting links are only useful before the session.
      if (t.href && (t.material || isUpcoming(t))) {
        chip.href = t.href;
        chip.textContent = t.linkLabel;
        chip.hidden = false;
      }
      $('[data-action="copy"]', li).dataset.id = t.id;
      if (t.skipped) $('[data-action="copy"]', li).remove();
      list.appendChild(li);
    });

    root.textContent = '';
    if (shown.length) {
      root.appendChild(frag);
    } else {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No talks match. Try another word or clear the filters.';
      root.appendChild(p);
    }
    var held = state.talks.filter(function (t) { return !t.skipped; }).length;
    var n = shown.filter(function (t) { return !t.skipped; }).length;
    $('#results').textContent = (state.query || state.filter !== 'all')
      ? n + ' of ' + held + ' sessions'
      : held + ' sessions, newest first';
  }

  function firstFridayOnOrAfter(d) {
    for (var i = 0; i < 2; i++) {
      var m = new Date(d.getFullYear(), d.getMonth() + i, 1);
      while (m.getDay() !== 5) m.setDate(m.getDate() + 1);
      if (m >= d) return m;
    }
    return null;
  }

  function relativeDays(d) {
    var days = Math.round((d - state.today) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return 'in ' + days + ' days';
  }

  function renderNext() {
    var card = $('#next-card');
    var upcoming = state.talks.filter(function (t) { return isUpcoming(t) && !t.skipped; });
    var talk = upcoming.length ? upcoming[upcoming.length - 1] : null;
    var date = talk ? talk.date : firstFridayOnOrAfter(state.today);
    var slot = function (name) { return $('[data-slot="' + name + '"]', card); };

    slot('weekday').textContent = WEEKDAYS[date.getDay()];
    slot('day').textContent = String(date.getDate());
    slot('month').textContent = MONTHS_LONG[date.getMonth()] + ' ' + date.getFullYear();

    var speaker = slot('speaker');
    speaker.textContent = '';
    var material = slot('material');
    material.hidden = true;

    if (talk) {
      slot('kicker').textContent = 'Next session · ' + relativeDays(date);
      slot('topic').textContent = talk.topic;
      if (talk.speaker) {
        var s = document.createElement('strong');
        s.textContent = talk.speaker;
        speaker.appendChild(s);
      }
      if (talk.institution) speaker.appendChild(document.createTextNode((talk.speaker ? ', ' : '') + talk.institution));
      if (talk.href) {
        material.href = talk.href;
        material.textContent = talk.linkLabel;
        material.hidden = false;
      }
      slot('propose').hidden = true;
    } else {
      slot('kicker').textContent = 'Next regular date · ' + relativeDays(date);
      slot('topic').textContent = 'Speaker to be announced';
      speaker.textContent = 'This slot is still open. Want to present an idea, a result or a paper?';
      slot('propose').hidden = false;
    }

    var ics = $('[data-action="ics"]', card);
    ics.hidden = false;
    ics.onclick = function () { downloadIcs(date, talk); };
  }

  function renderStats() {
    var held = state.talks.filter(function (t) { return !t.skipped && !isUpcoming(t); });
    var affiliations = {};
    held.forEach(function (t) { if (t.institution) affiliations[t.institution.toLowerCase()] = 1; });
    var first = state.talks[state.talks.length - 1];
    $('[data-stat="sessions"]').textContent = String(held.length);
    $('[data-stat="affiliations"]').textContent = String(Object.keys(affiliations).length);
    $('[data-stat="since"]').textContent = String(first.date.getFullYear());
    $('[data-stat="since"]').nextElementSibling.textContent = 'running since ' + MONTHS_LONG[first.date.getMonth()];
  }

  // ── Calendar export (RFC 5545, all-day because times vary) ───────────────
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

  function icsFold(line) {
    var enc = new TextEncoder();
    var out = [];
    var cur = '';
    Array.from(line).forEach(function (ch) {
      var limit = out.length ? 74 : 75; // continuation lines start with a space
      if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ''; }
      cur += ch;
    });
    out.push(cur);
    return out.join('\r\n ');
  }

  function downloadIcs(date, talk) {
    var day = isoDate(date).replace(/-/g, '');
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var summary = talk ? 'RL Coffee: ' + talk.topic : 'Reinforcement Learning Coffee';
    var desc = (talk && talk.speaker ? 'Speaker: ' + talk.speaker + (talk.institution ? ' (' + talk.institution + ')' : '') + '\n' : '') +
      'Time and join link come with the mailing-list reminder.\n' + SITE_URL + (talk ? '#' + talk.id : '');
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SARL PLUS//RL Coffee//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:rl-coffee-' + day + '@idalab.at',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + day,
      'DTEND;VALUE=DATE:' + isoDate(next).replace(/-/g, ''),
      'SUMMARY:' + icsEscape(summary),
      'DESCRIPTION:' + icsEscape(desc),
      'LOCATION:' + icsEscape('IDA Lab, Paris Lodron University of Salzburg, and online'),
      'URL:' + SITE_URL,
      'TRANSP:TRANSPARENT',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    var blob = new Blob([lines.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rl-coffee-' + isoDate(date) + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Calendar file downloaded');
  }

  // ── Live sheet sync ──────────────────────────────────────────────────────
  function parseSheet(text) {
    var data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (data.status !== 'ok' || !data.table) throw new Error('sheet status ' + data.status);
    return data.table.rows.map(function (row) {
      var c = row.c || [];
      var val = function (i) {
        var cell = c[i];
        if (!cell) return '';
        if (typeof cell.v === 'string' && cell.v.indexOf('Date(') === 0) return cell.v;
        return String(cell.f != null ? cell.f : (cell.v != null ? cell.v : ''));
      };
      return { date: val(0), speaker: val(1), institution: val(2), topic: val(3), link: val(4) };
    });
  }

  function syncSheet() {
    if (!window.fetch || location.protocol === 'file:') return;
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 10000);
    fetch(SHEET_URL, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl && ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var rows = parseSheet(text);
        // Guard against a half-emptied or restructured sheet wiping the archive.
        if (normalize(rows).length < Math.min(10, state.talks.length)) throw new Error('too few rows');
        storage('set', CACHE_KEY, JSON.stringify({ at: Date.now(), rows: rows }));
        setTalks(rows, 'live');
      })
      .catch(function (err) {
        if (window.console) console.info('[rl-coffee] schedule sync skipped:', err.message);
      })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  // ── UI wiring ────────────────────────────────────────────────────────────
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('is-visible'); }, 2400);
  }

  function setFilter(f) {
    state.filter = f;
    $all('#filters button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === f)); });
  }

  function revealHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!/^talk-\d{4}-\d{2}-\d{2}$/.test(id)) return;
    if (!document.getElementById(id) && (state.filter !== 'all' || state.query)) {
      setFilter('all');
      state.query = '';
      $('#search').value = '';
      renderList();
    }
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  }

  function wireUi() {
    var header = $('.site-header');
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var toggle = $('.nav-toggle');
    var menu = $('#nav-menu');
    var setMenu = function (open) {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', function (e) {
      if (menu.classList.contains('is-open') && !e.target.closest('.nav')) setMenu(false);
    });

    $('.theme-toggle').addEventListener('click', function () {
      var root = document.documentElement;
      var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      storage('set', 'rlc-theme', root.dataset.theme);
    });

    $('#filters').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-filter]');
      if (!b) return;
      setFilter(b.dataset.filter);
      renderList();
    });

    var search = $('#search');
    search.addEventListener('input', function () {
      state.query = search.value.trim().toLowerCase();
      renderList();
    });

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        search.focus();
      } else if (e.key === 'Escape') {
        if (document.activeElement === search && search.value) {
          search.value = '';
          state.query = '';
          renderList();
        } else if (menu.classList.contains('is-open')) {
          setMenu(false);
          toggle.focus();
        }
      }
    });

    $('#talks').addEventListener('click', function (e) {
      var b = e.target.closest('[data-action="copy"]');
      if (!b) return;
      var url = location.origin + location.pathname + '#' + b.dataset.id;
      history.replaceState(null, '', '#' + b.dataset.id);
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function () { toast('Link copied'); }, function () { toast('Link is in the address bar'); });
      } else {
        toast('Link is in the address bar');
      }
    });

    window.addEventListener('hashchange', revealHash);
    $('#year').textContent = String(new Date().getFullYear());
  }

  // ── Hero: value iteration on a gridworld ─────────────────────────────────
  function gridworld() {
    var canvas = $('#gridworld');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var GAMMA = 0.92, SWEEP_MS = 120, STEP_MS = 170, REST_MS = 1400;
    var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var w = 0, h = 0, cell = 0, cols = 0, rows = 0, ox = 0, oy = 0;
    var walls, V, goal, path, agent, phase, phaseAt, colors, visible = true, raf = 0;

    function readColors() {
      var cs = getComputedStyle(document.documentElement);
      var rgb = function (name) {
        var hex = cs.getPropertyValue(name).trim().replace('#', '');
        if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
        var n = parseInt(hex, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      };
      colors = { surface: rgb('--surface'), line: rgb('--line'), wall: rgb('--line-strong'), ink: rgb('--ink'), muted: rgb('--muted'), accent: rgb('--accent'), teal: rgb('--accent-2') };
    }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function idx(x, y) { return y * cols + x; }
    function inside(x, y) { return x >= 0 && y >= 0 && x < cols && y < rows; }

    function layout() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var pad = 14;
      var target = w < 420 ? 30 : 38;
      cols = Math.max(6, Math.floor((w - 2 * pad) / target));
      rows = Math.max(5, Math.floor((h - 2 * pad) / target));
      cell = Math.min((w - 2 * pad) / cols, (h - 2 * pad) / rows);
      ox = (w - cell * cols) / 2;
      oy = (h - cell * rows) / 2;
      return true;
    }

    function distancesFrom(g) {
      var d = new Array(cols * rows).fill(-1);
      var q = [g];
      d[idx(g[0], g[1])] = 0;
      for (var i = 0; i < q.length; i++) {
        var p = q[i];
        DIRS.forEach(function (dir) {
          var x = p[0] + dir[0], y = p[1] + dir[1];
          if (inside(x, y) && !walls[idx(x, y)] && d[idx(x, y)] < 0) {
            d[idx(x, y)] = d[idx(p[0], p[1])] + 1;
            q.push([x, y]);
          }
        });
      }
      return d;
    }

    function newEpisode() {
      walls = new Array(cols * rows).fill(false);
      // A few short wall segments: enough structure for the value wave to bend around.
      var segments = Math.round(cols * rows / 16);
      for (var s = 0; s < segments; s++) {
        var x = Math.floor(Math.random() * cols), y = Math.floor(Math.random() * rows);
        var dir = DIRS[Math.floor(Math.random() * 4)], len = 2 + Math.floor(Math.random() * 3);
        for (var k = 0; k < len && inside(x, y); k++, x += dir[0], y += dir[1]) walls[idx(x, y)] = true;
      }
      do {
        goal = [Math.floor(Math.random() * cols), Math.floor(Math.random() * rows)];
      } while (walls[idx(goal[0], goal[1])]);
      var dist = distancesFrom(goal);
      var far = 0;
      dist.forEach(function (v, i) { if (v > dist[far]) far = i; });
      agent = { x: far % cols, y: Math.floor(far / cols), from: null, t: 0 };
      V = new Array(cols * rows).fill(0);
      V[idx(goal[0], goal[1])] = 1;
      path = null;
      phase = 'sweep';
    }

    function sweep() {
      var next = V.slice(), delta = 0;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var i = idx(x, y);
        if (walls[i] || (x === goal[0] && y === goal[1])) continue;
        var best = 0;
        for (var d = 0; d < 4; d++) {
          var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (inside(nx, ny) && !walls[idx(nx, ny)]) best = Math.max(best, GAMMA * V[idx(nx, ny)]);
        }
        delta = Math.max(delta, Math.abs(best - V[i]));
        next[i] = best;
      }
      V = next;
      return delta;
    }

    function greedy(x, y) {
      var best = -1, arg = -1;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (inside(nx, ny) && !walls[idx(nx, ny)] && V[idx(nx, ny)] > best) { best = V[idx(nx, ny)]; arg = d; }
      }
      return best > 0 ? arg : -1;
    }

    function tracePath() {
      var p = [[agent.x, agent.y]], x = agent.x, y = agent.y;
      for (var guard = 0; guard < cols * rows && !(x === goal[0] && y === goal[1]); guard++) {
        var d = greedy(x, y);
        if (d < 0) break;
        x += DIRS[d][0]; y += DIRS[d][1];
        p.push([x, y]);
      }
      return p;
    }

    function drawCup(cx, cy, s) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = rgba(colors.accent, 1);
      ctx.strokeStyle = rgba(colors.accent, 1);
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(-s * .32, -s * .12);
      ctx.lineTo(s * .22, -s * .12);
      ctx.lineTo(s * .18, s * .22);
      ctx.quadraticCurveTo(s * .16, s * .3, s * .08, s * .3);
      ctx.lineTo(-s * .18, s * .3);
      ctx.quadraticCurveTo(-s * .26, s * .3, -s * .28, s * .22);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * .25, s * .06, s * .1, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = rgba(colors.teal, 1);
      ctx.lineWidth = s * .06;
      ctx.lineCap = 'round';
      [-0.12, 0.06].forEach(function (x0) {
        ctx.beginPath();
        ctx.moveTo(x0 * s, -s * .2);
        ctx.quadraticCurveTo(x0 * s + s * .07, -s * .3, x0 * s, -s * .4);
        ctx.stroke();
      });
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      var gap = Math.max(1.5, cell * 0.08), r = Math.min(6, cell * 0.18);
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var i = idx(x, y), px = ox + x * cell + gap / 2, py = oy + y * cell + gap / 2, s = cell - gap;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, s, s, r); else ctx.rect(px, py, s, s);
        if (walls[i]) {
          ctx.fillStyle = rgba(colors.wall, 0.9);
        } else {
          var v = Math.pow(V[i], 0.8);
          ctx.fillStyle = v > 0 ? rgba(colors.teal, 0.1 + 0.55 * v) : rgba(colors.line, 0.55);
        }
        ctx.fill();
        if (!walls[i] && V[i] > 0 && !(x === goal[0] && y === goal[1])) {
          var d = greedy(x, y);
          if (d >= 0) {
            var cx = px + s / 2, cy = py + s / 2, a = s * 0.16;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(d * Math.PI / 2);
            ctx.strokeStyle = rgba(colors.ink, 0.18 + 0.4 * V[i]);
            ctx.lineWidth = 1.4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(-a, a * 0.1);
            ctx.lineTo(0, -a * 0.9);
            ctx.lineTo(a, a * 0.1);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      drawCup(ox + (goal[0] + .5) * cell, oy + (goal[1] + .55) * cell, cell);

      if (path) {
        ctx.strokeStyle = rgba(colors.accent, 0.55);
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 5]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        path.forEach(function (p, k) {
          var px2 = ox + (p[0] + .5) * cell, py2 = oy + (p[1] + .5) * cell;
          if (k) ctx.lineTo(px2, py2); else ctx.moveTo(px2, py2);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      var ax = agent.x, ay = agent.y;
      if (agent.from) {
        var e = agent.t < .5 ? 2 * agent.t * agent.t : 1 - Math.pow(-2 * agent.t + 2, 2) / 2;
        ax = agent.from[0] + (agent.x - agent.from[0]) * e;
        ay = agent.from[1] + (agent.y - agent.from[1]) * e;
      }
      ctx.beginPath();
      ctx.arc(ox + (ax + .5) * cell, oy + (ay + .5) * cell, cell * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = rgba(colors.accent, 1);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(colors.surface, 1);
      ctx.stroke();
    }

    function tick(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      var elapsed = now - phaseAt;
      if (phase === 'sweep' && elapsed >= SWEEP_MS) {
        phaseAt = now;
        if (sweep() < 1e-4) { path = tracePath(); path.shift(); phase = 'walk'; }
        draw();
      } else if (phase === 'walk') {
        if (!agent.from) {
          if (!path.length) { phase = 'rest'; phaseAt = now; }
          else { agent.from = [agent.x, agent.y]; var n = path.shift(); agent.x = n[0]; agent.y = n[1]; phaseAt = now; }
        } else {
          agent.t = Math.min(1, elapsed / STEP_MS);
          if (agent.t >= 1) { agent.from = null; agent.t = 0; }
        }
        draw();
      } else if (phase === 'rest' && elapsed >= REST_MS) {
        newEpisode();
        phaseAt = now;
        draw();
      }
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (raf || reduced.matches) return;
      phaseAt = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function staticFrame() {
      // Reduced motion: show the converged value function and the greedy path.
      var guard = 0;
      while (sweep() > 1e-4 && guard++ < 500) { /* converge */ }
      path = tracePath();
      draw();
    }

    function reset() {
      if (!layout()) return;
      newEpisode();
      if (reduced.matches) staticFrame(); else draw();
    }

    readColors();
    reset();
    start();

    var ro = 'ResizeObserver' in window ? new ResizeObserver(function () {
      var rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - w) > 1 || Math.abs(rect.height - h) > 1) reset();
    }) : null;
    if (ro) ro.observe(canvas);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
    var recolor = function () { readColors(); if (walls) draw(); };
    new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
    reduced.addEventListener('change', function () { reset(); start(); });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    wireUi();
    if (Array.isArray(window.RLC_SNAPSHOT)) setTalks(window.RLC_SNAPSHOT, 'snapshot');
    var cached = storage('get', CACHE_KEY);
    if (cached) {
      try { setTalks(JSON.parse(cached).rows || [], 'cache'); } catch (e) { /* ignore a corrupt cache */ }
    }
    if (location.hash) revealHash();
    gridworld();
    syncSheet();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
