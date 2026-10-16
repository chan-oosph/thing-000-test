/* Thing_000 Stage 1: the researcher's debug results screen. Descriptive only.
   Plain on purpose: this is not the designed evidence phase. */
(function () {
  'use strict';

  var TR = T0Tracker;

  function s(ms) { return ms == null ? '—' : (ms / 1000).toFixed(2); }
  function pct(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function num(v, d) { return v == null ? '—' : (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString(); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // The wording the session actually showed (stored with it), falling back to the current copy.
  var current = null;
  function firstWords(id) {
    var t = current && current.texts && current.texts[id];
    if (!t) { var f = T0.fragments.filter(function (x) { return x.id === id; })[0]; t = f ? f.text : id; }
    return t.split(' ').slice(0, 5).join(' ') + '…';
  }

  var METRICS = [
    ['firstMs', 'First-visit dwell', s],
    ['returnMs', 'Return dwell', s],
    ['returns', 'Returns', function (v) { return num(v, 2); }],
    ['postMs', 'Dwell after full coverage', s],
    ['totalMs', 'Total dwell', s]
  ];

  function summary(session, d) {
    var e = d.rows.filter(function (r) { return r.engineered; })[0];
    var cov = d.coverageReadAt == null
      ? 'never (unread: ' + d.unread.join(', ') + ')'
      : s(d.coverageReadAt) + ' s';
    var touched = d.coverageTouchedAt == null
      ? 'never (untouched: ' + d.unvisited.join(', ') + ')'
      : s(d.coverageTouchedAt) + ' s';
    return '' +
      '<dl class="kv">' +
        '<dt>Session</dt><dd>' + esc(session.id) + ' · ' + esc(session.startedAt) + '</dd>' +
        '<dt>Versions</dt><dd>app ' + esc(session.app) + ' · copy ' + esc(session.copy) + ' (' + esc(session.copyHash) + ')</dd>' +
        '<dt>Window</dt><dd>' + session.config.durationSec + ' s · tracked ' + s(d.trackedMs) + ' s · paused ' + s(d.pausedMs) + ' s · idle (mouse still > ' + d.thresholds.idleMs / 1000 + ' s) ' + s(d.idleMs) + ' s · lost ' + s(d.lostMs) + ' s</dd>' +
        '<dt>Before switch</dt><dd>' + s(session.timeline.preSwitchMs) + ' s</dd>' +
        '<dt>All 8 touched</dt><dd>' + touched + '</dd>' +
        '<dt>All 8 plausibly read</dt><dd>' + cov + ' <span class="hint">(≥ ' + d.thresholds.readMs + ' ms each, provisional)</span></dd>' +
        '<dt>E ranked #1 by total dwell</dt><dd><strong>' + (e.rank_totalMs === 1 ? 'yes' : 'no (rank ' + num(e.rank_totalMs, 1) + ')') + '</strong></dd>' +
        '<dt>Layout</dt><dd>rotation ' + session.layout.rotationDeg + '° · radius ' + session.layout.radius + ' · E in slot ' + e.slot + ' at ' + e.angleDeg + '°, ' + num(e.dist) + ' from centre</dd>' +
      '</dl>';
  }

  function convergence(d) {
    var h = '<table class="tbl"><thead><tr><th>Metric</th><th>E</th><th>Controls mean</th><th>median</th><th>SD</th><th>E − mean</th><th>E − median</th><th>E rank / 8</th><th class="muted">z <span class="hint">descriptive, unstable (7 controls)</span></th></tr></thead><tbody>';
    METRICS.forEach(function (m) {
      var c = d.compare[m[0]], f = m[2];
      if (!c) { h += '<tr><td>' + m[1] + '</td><td colspan="8" class="muted">not available (full coverage not reached)</td></tr>'; return; }
      h += '<tr><td>' + m[1] + '</td><td><strong>' + f(c.e) + '</strong></td><td>' + f(c.mean) + '</td><td>' + f(c.median) + '</td><td>' + f(c.sd) +
        '</td><td>' + f(c.diffMean) + '</td><td>' + f(c.diffMedian) + '</td><td><strong>' + num(c.rank, 1) + '</strong></td><td class="muted">' + num(c.z, 2) + '</td></tr>';
    });
    return h + '</tbody></table><p class="hint">Times in seconds. Rank 1 = most. Ties share a rank. One session is a single observation: none of these differences is a statistical result.</p>';
  }

  function fragments(d) {
    var rows = d.rows.slice().sort(function (a, b) { return a.rank_totalMs - b.rank_totalMs; });
    var h = '<table class="tbl tbl-wide"><thead><tr>' +
      '<th>Rank</th><th>Fragment</th><th>Slot · angle · distance</th><th>1st order</th><th>First</th><th>Return</th><th>Returns</th><th>Return times (s)</th><th>Brush</th><th>Total</th><th>% tracked</th><th>% of fragment time</th><th>Idle</th><th>After coverage</th><th>% after coverage</th><th>Touched at</th><th>Read at</th><th>Lines · words · chars</th><th>Est. read</th><th>Flesch≈</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr class="' + (r.engineered ? 'is-e' : '') + '">' +
        '<td>' + num(r.rank_totalMs, 1) + '</td>' +
        '<td><strong>' + esc(r.id) + '</strong>' + (r.engineered ? ' <span class="badge">E</span>' : '') + '<br><span class="hint">' + esc(firstWords(r.id)) + '</span></td>' +
        '<td>' + r.slot + ' · ' + r.angleDeg + '° · ' + num(r.dist) + '</td>' +
        '<td>' + num(r.firstOrder) + '</td>' +
        '<td>' + s(r.firstMs) + '</td><td>' + s(r.returnMs) + '</td><td>' + r.returns + '</td>' +
        '<td>' + (r.returnTimes.length ? r.returnTimes.map(function (t) { return (t / 1000).toFixed(1); }).join(', ') : '—') + '</td>' +
        '<td>' + s(r.brushMs) + '</td><td><strong>' + s(r.totalMs) + '</strong></td>' +
        '<td>' + pct(r.shareTracked) + '</td><td>' + pct(r.shareFragment) + '</td><td>' + s(r.idleMs) + '</td>' +
        '<td>' + s(r.postMs) + '</td><td>' + pct(r.postShare) + '</td>' +
        '<td>' + s(r.touchedAt) + '</td><td>' + s(r.readAt) + '</td>' +
        '<td>' + r.lines + ' · ' + r.words + ' · ' + r.chars + '</td><td>' + s(r.estReadMs) + '</td><td>' + num(r.fre, 1) + '</td>' +
        '</tr>';
    });
    return h + '</tbody></table><p class="hint">Times in seconds. First + return + brush = total. "Brush" is time from passes shorter than ' + d.thresholds.minVisitMs + ' ms. Equal share would be 12.5% of fragment time.</p>';
  }

  function checks(session) {
    var L = session.layout, out = [];
    out.push((L.linesEqual ? '✓' : '⚠') + ' Rendered line counts: ' + L.lineCounts.join(', ') + (L.linesEqual ? ' (all equal)' : ' (not equal: adjust fragment width or copy)'));
    out.push('✓ Stage ' + L.stage.w + ' × ' + L.stage.h + ' units, scaled ' + session.env.stageScale + ' to a ' + session.env.viewport.join(' × ') + ' window · fragment width ' + L.fragmentWidth + ' · text ≈ ' + (session.config.fragment.fontSize * session.env.stageScale).toFixed(1) + ' px');
    out.push('Ring: ' + (L.rotationMode || 'random') + ' rotation at ' + L.rotationDeg + '°, fragments shuffled across the slots');
    out.push('Darkness check: before the switch, all eight should be visibly present but none readable. Confirm by eye at the start of each pilot session.');
    return '<ul class="checks">' + out.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  function drawPath(canvas, session, d) {
    var L = session.layout, w = canvas.clientWidth, h = Math.round(w * L.stage.h / L.stage.w);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
    var g = canvas.getContext('2d'), k = w / L.stage.w;
    g.scale(dpr, dpr);
    g.fillStyle = '#0b0a09'; g.fillRect(0, 0, w, h);
    L.fragments.forEach(function (f) {
      g.strokeStyle = f.engineered ? '#e9a63a' : 'rgba(245,241,230,.35)';
      g.setLineDash(f.engineered ? [4, 3] : []);
      g.strokeRect(f.box.x * k, f.box.y * k, f.box.w * k, f.box.h * k);
      g.fillStyle = f.engineered ? '#e9a63a' : 'rgba(245,241,230,.6)';
      g.font = '11px "IBM Plex Mono", monospace';
      g.fillText(f.id, f.box.x * k + 4, f.box.y * k + 13);
    });
    g.setLineDash([]);
    var sm = session.samples, end = sm.length ? sm[sm.length - 1][0] : 1;
    for (var i = 1; i < sm.length; i++) {
      var a = sm[i - 1], b = sm[i];
      var u = a[0] / end;
      g.strokeStyle = 'rgba(' + Math.round(120 + 135 * u) + ',' + Math.round(160 + 40 * u) + ',' + Math.round(255 - 150 * u) + ',.55)';
      g.beginPath(); g.moveTo(a[1] * k, a[2] * k); g.lineTo(b[1] * k, b[2] * k); g.stroke();
    }
  }

  function testerForm(session) {
    var t = session.tester || {};
    function opt(v, cur) { return '<option' + (v === cur ? ' selected' : '') + '>' + v + '</option>'; }
    return '<form class="tester" data-tester>' +
      '<label>Tester code <input name="code" value="' + esc(t.code || '') + '" placeholder="e.g. P01 (no names)"></label>' +
      '<label>Psychology background <select name="psych">' + ['', 'none', 'some (A level / modules)', 'degree or above'].map(function (v) { return opt(v, t.psych || ''); }).join('') + '</select></label>' +
      '<label>Input device <select name="input">' + ['', 'mouse', 'trackpad', 'other'].map(function (v) { return opt(v, t.input || ''); }).join('') + '</select></label>' +
      '<label class="wide">Note <input name="note" value="' + esc(t.note || '') + '" placeholder="e.g. knows T3, watched by Chan, interrupted…"></label>' +
      '<button type="submit">Save tester details</button> <span class="hint" data-saved></span>' +
      '</form>';
  }

  function testerInfo(session) {
    var t = session.tester || {};
    return '<dl class="kv">' +
      '<dt>Name</dt><dd><strong>' + esc(t.name || t.code || '—') + '</strong></dd>' +
      '<dt>Device</dt><dd>' + esc(t.input || '—') + '</dd>' +
      '<dt>Psychology background</dt><dd>' + esc(t.psych || '—') + '</dd>' +
      '<dt>Sound</dt><dd>' + (session.env && session.env.sound === false ? 'off' : 'on') + '</dd>' +
      '</dl>';
  }

  function noteBox(note) {
    return '<div class="note-box"><label class="hint" for="t0-note">Your notes on this session (only you see these)</label>' +
      '<textarea id="t0-note" data-note rows="3" maxlength="2000" placeholder="e.g. knows me; I watched; got interrupted…">' + esc(note || '') + '</textarea>' +
      '<p class="actions"><button type="button" data-act="save-note">Save note</button> <span class="hint" data-note-status></span></p></div>';
  }

  function idleFlag(d) {
    if (d.idleShare < 0.15) return '';
    return '<p class="flag">⚠ The mouse sat still for ' + Math.round(d.idleShare * 100) + '% of this session' +
      (d.postIdleMs ? ' (' + s(d.postIdleMs) + ' s of it after seeing all eight)' : '') +
      '. Still time is left out of “after seeing all eight”, but read this session with care.</p>';
  }

  window.T0Results = {
    // opts.readOnly: the private pilot results page (no editing, no local-storage actions); opts.head: extra header HTML
    render: function (root, session, store, opts) {
      opts = opts || {};
      current = session;
      var d = TR.derive(session);
      if (opts.readOnly) {
        root.innerHTML = (opts.head || '') +
          '<h2>Tester</h2>' + testerInfo(session) + (opts.onNote ? noteBox(opts.note) : '') +
          '<h2>Summary</h2>' + idleFlag(d) + summary(session, d) +
          '<h2>E against the seven controls</h2>' + convergence(d) +
          '<h2>Fragments, by total dwell</h2><div class="scroll">' + fragments(d) + '</div>' +
          '<h2>Path</h2><canvas class="path" data-path></canvas><p class="hint">The light’s centre over time: blue = early, amber = late. E is dashed.</p>' +
          '<h2>Checks</h2>' + checks(session) +
          '<h2>Data</h2><p class="actions"><button type="button" data-act="json-one">Download this session (JSON)</button> ' +
          '<button type="button" data-act="csv-one">Download this session (CSV)</button>' +
          (opts.onDelete ? ' <button type="button" class="danger" data-act="delete">Delete this session…</button>' : '') + '</p>';
        drawPath(root.querySelector('[data-path]'), session, d);
        root.onclick = function (e) {
          var act = e.target.getAttribute && e.target.getAttribute('data-act');
          if (act === 'json-one') store.download('thing000-' + session.id + '.json', JSON.stringify(session), 'application/json');
          if (act === 'csv-one') store.download('thing000-' + session.id + '.csv', TR.toCSV([session]), 'text/csv');
          if (act === 'delete') opts.onDelete(session);
          if (act === 'save-note') {
            var st = root.querySelector('[data-note-status]');
            st.textContent = 'Saving…';
            opts.onNote(session, root.querySelector('[data-note]').value, function (ok) { st.textContent = ok ? 'Saved.' : 'Not saved. Try again.'; });
          }
        };
        return;
      }
      root.innerHTML = '' +
        '<header class="r-head"><p class="mono">Thing_000 · Stage 1 · researcher view</p>' +
        '<p class="hint">Descriptive only. Single-session differences are not statistical evidence.</p></header>' +
        '<h2>Tester</h2>' + testerForm(session) +
        '<h2>Summary</h2>' + summary(session, d) +
        '<h2>E against the seven controls</h2>' + convergence(d) +
        '<h2>Fragments, by total dwell</h2><div class="scroll">' + fragments(d) + '</div>' +
        '<h2>Path</h2><canvas class="path" data-path></canvas><p class="hint">Beam centre over time: blue = early, amber = late. E is dashed.</p>' +
        '<h2>Checks</h2>' + checks(session) +
        '<h2>Data</h2>' +
        '<p class="actions">' +
          '<button type="button" data-act="json-one">Export this session (JSON)</button> ' +
          '<button type="button" data-act="json-all">Export all sessions (JSON)</button> ' +
          '<button type="button" data-act="csv-all">Export all sessions (CSV, one row per fragment)</button>' +
        '</p>' +
        '<p class="hint" data-count></p>' +
        '<p class="actions"><button type="button" data-act="again">Run again</button> ' +
        '<button type="button" class="danger" data-act="clear">Delete all stored sessions…</button></p>';

      drawPath(root.querySelector('[data-path]'), session, d);
      root.querySelector('[data-count]').textContent = store.all().length + ' session(s) stored in this browser only. Nothing is sent anywhere.';

      root.querySelector('[data-tester]').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target;
        session.tester = Object.assign({}, session.tester, { code: f.code.value.trim(), psych: f.psych.value, input: f.input.value, note: f.note.value.trim() });
        var ok = store.save(session);
        root.querySelector('[data-saved]').textContent = ok ? 'Saved.' : 'Could not save to this browser’s storage: export the JSON now.';
      });

      root.querySelector('.r-head').scrollIntoView();
      root.onclick = function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        if (act === 'json-one') store.download('thing000-' + session.id + '.json', JSON.stringify(session), 'application/json');
        if (act === 'json-all') store.download('thing000-sessions-' + stamp + '.json', JSON.stringify(store.all()), 'application/json');
        if (act === 'csv-all') store.download('thing000-fragments-' + stamp + '.csv', TR.toCSV(store.all()), 'text/csv');
        if (act === 'again') window.location.reload();
        if (act === 'clear' && window.confirm('Delete every stored Thing_000 session in this browser? Export first if you need them. This cannot be undone.')) {
          store.clear();
          root.querySelector('[data-count]').textContent = '0 session(s) stored.';
        }
      };
    }
  };
})();
