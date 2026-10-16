/* Thing_000: dwell analysis. Pure functions only, no DOM.
   Everything is derived from the raw session record (pointer samples, breaks, layout, thresholds),
   so any metric can be recalculated later with different thresholds.
   Tested in tests/index.html. */
(function (root) {
  'use strict';

  var T = {};

  /* ---------- Geometry ---------- */
  function inBox(b, x, y, pad) {
    return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
  }
  function regionAt(frags, x, y, pad) {
    for (var i = 0; i < frags.length; i++) if (inBox(frags[i].box, x, y, pad)) return frags[i].id;
    return null;
  }
  T.regionAt = regionAt;

  /* ---------- Timed segments ----------
     Each pair of consecutive samples becomes one segment, credited to wherever the beam centre was at its start.
     Segments that span a break (tab hidden, pointer left the window) or a long gap are dropped. */
  function segments(session, th, pad) {
    var s = session.samples || [], br = session.breaks || [], frags = session.layout.fragments;
    var out = [], lost = 0, lastMoveT = s.length ? s[0][0] : 0, lastX = s.length ? s[0][1] : 0, lastY = s.length ? s[0][2] : 0;
    var bi = 0;
    for (var i = 0; i < s.length - 1; i++) {
      var a = s[i], b = s[i + 1], dt = b[0] - a[0];
      if (Math.hypot(a[1] - lastX, a[2] - lastY) > th.idleMoveUnits) { lastMoveT = a[0]; lastX = a[1]; lastY = a[2]; }
      if (dt <= 0) continue;
      while (bi < br.length && br[bi][0] < a[0]) bi++;
      if (bi < br.length && br[bi][0] >= a[0] && br[bi][0] < b[0]) {
        // pointer position is unknown across a break: treat the return as fresh movement
        lastMoveT = b[0]; lastX = b[1]; lastY = b[2];
        continue;
      }
      if (dt > th.maxSampleGapMs) { lost += dt; continue; }
      out.push({ t0: a[0], t1: b[0], dt: dt, id: regionAt(frags, a[1], a[2], pad), idle: a[0] - lastMoveT >= th.idleMs });
    }
    return { list: out, lostMs: lost };
  }
  T.segments = segments;

  /* ---------- Visits ----------
     Per fragment: runs of consecutive segments, merged when the time away was shorter than mergeGapMs.
     A visit shorter than minVisitMs is a brush-past: its time still counts towards total dwell. */
  function pausedBetween(breaks, a, b) {
    var sum = 0;
    (breaks || []).forEach(function (br) {
      var e = br[1] == null ? br[0] : br[1];
      sum += Math.max(0, Math.min(b, e) - Math.max(a, br[0]));
    });
    return sum;
  }

  // Leaving and coming back across a pause is not a return: paused time doesn't count as time away.
  function visitsFor(id, segs, th, breaks) {
    var runs = [], cur = null;
    segs.forEach(function (g) {
      if (g.id !== id) { cur = null; return; }
      if (cur && g.t0 === cur.t1) { cur.t1 = g.t1; cur.dwell += g.dt; cur.idle += g.idle ? g.dt : 0; }
      else { cur = { id: id, t0: g.t0, t1: g.t1, dwell: g.dt, idle: g.idle ? g.dt : 0 }; runs.push(cur); }
    });
    var merged = [];
    runs.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r.t0 - last.t1 - pausedBetween(breaks, last.t1, r.t0) < th.mergeGapMs) { last.t1 = r.t1; last.dwell += r.dwell; last.idle += r.idle; }
      else merged.push({ id: r.id, t0: r.t0, t1: r.t1, dwell: r.dwell, idle: r.idle });
    });
    return merged;
  }

  // Time at which cumulative dwell on `id` first reaches `need` ms (or null).
  function reachAt(id, segs, need) {
    var acc = 0;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (g.id !== id) continue;
      if (acc + g.dt >= need) return g.t0 + (need - acc);
      acc += g.dt;
    }
    return null;
  }

  // Active (non-idle) dwell on `id` after time `from` (splits the segment that crosses it).
  // Idle time is left out: a mouse parked on a fragment after reading everything isn't a choice to linger.
  function dwellAfter(id, segs, from) {
    var sum = 0;
    segs.forEach(function (g) {
      if (g.id !== id || g.idle || g.t1 <= from) return;
      sum += g.t1 - Math.max(g.t0, from);
    });
    return sum;
  }

  /* ---------- Statistics helpers (descriptive only) ---------- */
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1));
  }
  // Rank 1 = highest. Ties share the average rank. Null values get a null rank.
  function ranksDesc(values) {
    var idx = [];
    values.forEach(function (v, i) { if (v != null) idx.push(i); });
    idx.sort(function (a, b) { return values[b] - values[a]; });
    var ranks = values.map(function () { return null; });
    for (var i = 0; i < idx.length;) {
      var j = i;
      while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
      var r = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) ranks[idx[k]] = r;
      i = j + 1;
    }
    return ranks;
  }
  T.stats = { mean: mean, median: median, sd: sd, ranksDesc: ranksDesc };

  /* ---------- Main derivation ---------- */
  T.derive = function (session, override) {
    var cfg = session.config || {};
    var th = Object.assign({}, cfg.thresholds, override && override.thresholds);
    var pad = override && override.hitPad != null ? override.hitPad : cfg.hitPad;
    var frags = session.layout.fragments;
    var seg = segments(session, th, pad), segs = seg.list;

    var trackedMs = segs.reduce(function (s, g) { return s + g.dt; }, 0);
    var idleMs = segs.reduce(function (s, g) { return s + (g.idle ? g.dt : 0); }, 0);
    var pausedMs = (session.breaks || []).reduce(function (s, b) { return s + Math.max(0, (b[1] == null ? b[0] : b[1]) - b[0]); }, 0);

    var rows = frags.map(function (f) {
      var total = 0, idle = 0;
      segs.forEach(function (g) { if (g.id === f.id) { total += g.dt; if (g.idle) idle += g.dt; } });
      var all = visitsFor(f.id, segs, th, session.breaks);
      var q = all.filter(function (v) { return v.dwell >= th.minVisitMs; });
      var first = q.length ? q[0].dwell : 0;
      var ret = q.slice(1).reduce(function (s, v) { return s + v.dwell; }, 0);
      return {
        id: f.id, engineered: !!f.engineered, concept: f.concept || null,
        slot: f.slot, angleDeg: f.angleDeg, dist: f.dist == null ? null : f.dist, words: f.words, chars: f.chars, lines: f.lines,
        estReadMs: f.estReadMs, fre: f.fre,
        totalMs: total, idleMs: idle,
        firstMs: first, firstAt: q.length ? q[0].t0 : null,
        returnMs: ret, returns: Math.max(0, q.length - 1),
        returnTimes: q.slice(1).map(function (v) { return Math.round(v.t0); }),
        brushMs: total - first - ret,
        touchedAt: reachAt(f.id, segs, th.touchMs),
        readAt: reachAt(f.id, segs, th.readMs),
        visits: q
      };
    });

    function allAt(key) {
      var m = 0;
      for (var i = 0; i < rows.length; i++) { if (rows[i][key] == null) return null; m = Math.max(m, rows[i][key]); }
      return m;
    }
    var coverageTouchedAt = allAt('touchedAt'), coverageReadAt = allAt('readAt');

    var fragMs = rows.reduce(function (s, r) { return s + r.totalMs; }, 0);
    rows.forEach(function (r) {
      r.shareTracked = trackedMs ? r.totalMs / trackedMs : 0;
      r.shareFragment = fragMs ? r.totalMs / fragMs : 0;
      r.postMs = coverageReadAt == null ? null : dwellAfter(r.id, segs, coverageReadAt);
    });
    var postSum = coverageReadAt == null ? null : rows.reduce(function (s, r) { return s + r.postMs; }, 0);
    var postIdleMs = coverageReadAt == null ? null : segs.reduce(function (s, g) {
      return s + (g.idle && g.t1 > coverageReadAt ? g.t1 - Math.max(g.t0, coverageReadAt) : 0);
    }, 0);
    rows.forEach(function (r) { r.postShare = postSum ? r.postMs / postSum : null; });

    // first-visit order (1 = first fragment properly visited)
    var order = rows.filter(function (r) { return r.firstAt != null; })
      .sort(function (a, b) { return a.firstAt - b.firstAt; });
    rows.forEach(function (r) { r.firstOrder = null; });
    order.forEach(function (r, i) { r.firstOrder = i + 1; });

    var metrics = ['firstMs', 'returnMs', 'returns', 'postMs', 'totalMs'];
    metrics.forEach(function (m) {
      var rk = ranksDesc(rows.map(function (r) { return r[m]; }));
      rows.forEach(function (r, i) { r['rank_' + m] = rk[i]; });
    });

    // E against the seven controls, per metric. Descriptive only.
    var compare = {};
    metrics.forEach(function (m) {
      var e = rows.filter(function (r) { return r.engineered; })[0];
      var c = rows.filter(function (r) { return !r.engineered && r[m] != null; }).map(function (r) { return r[m]; });
      if (!e || e[m] == null || !c.length) { compare[m] = null; return; }
      var s = sd(c);
      compare[m] = {
        e: e[m], mean: mean(c), median: median(c), sd: s,
        diffMean: e[m] - mean(c), diffMedian: e[m] - median(c),
        rank: e['rank_' + m], of: rows.length,
        z: s > 0 ? (e[m] - mean(c)) / s : null      // unstable with seven controls: display as descriptive only
      };
    });

    var path = [];
    rows.forEach(function (r) { r.visits.forEach(function (v) { path.push({ id: r.id, t0: v.t0, t1: v.t1, dwell: v.dwell }); }); });
    path.sort(function (a, b) { return a.t0 - b.t0; });

    return {
      thresholds: th, hitPad: pad,
      trackedMs: trackedMs, idleMs: idleMs, pausedMs: pausedMs, lostMs: seg.lostMs,
      idleShare: trackedMs ? idleMs / trackedMs : 0, postIdleMs: postIdleMs,
      coverageTouchedAt: coverageTouchedAt, coverageReadAt: coverageReadAt,
      unvisited: rows.filter(function (r) { return r.touchedAt == null; }).map(function (r) { return r.id; }),
      unread: rows.filter(function (r) { return r.readAt == null; }).map(function (r) { return r.id; }),
      rows: rows, compare: compare, path: path
    };
  };

  /* ---------- Long-format CSV: one row per fragment per session ---------- */
  T.csvHeader = [
    'session_id', 'app_version', 'copy_version', 'copy_hash', 'started_at', 'duration_s', 'debug_mode',
    'tester_name', 'tester_code', 'psych_background', 'input_device',
    'min_visit_ms', 'merge_gap_ms', 'touch_ms', 'read_ms', 'idle_ms_threshold', 'hit_pad',
    'rotation_deg', 'tracked_ms', 'paused_ms', 'idle_ms_session', 'coverage_touched_ms', 'coverage_read_ms',
    'fragment_id', 'is_E', 'concept', 'slot', 'angle_deg', 'dist_from_centre', 'words', 'chars', 'lines', 'est_read_ms', 'flesch',
    'first_visit_order', 'first_ms', 'return_ms', 'returns', 'return_times_ms', 'brush_ms', 'total_ms', 'idle_ms',
    'share_tracked', 'share_fragment', 'post_ms', 'post_share', 'touched_at_ms', 'read_at_ms',
    'rank_first', 'rank_return', 'rank_returns', 'rank_post', 'rank_total'
  ];

  function cell(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  T.csvRows = function (session, d) {
    d = d || T.derive(session);
    var t = session.tester || {}, th = d.thresholds;
    return d.rows.map(function (r) {
      return [
        session.id, session.app, session.copy, session.copyHash, session.startedAt, session.config.durationSec, session.debugMode ? 1 : 0,
        t.name, t.code, t.psych, t.input,
        th.minVisitMs, th.mergeGapMs, th.touchMs, th.readMs, th.idleMs, d.hitPad,
        session.layout.rotationDeg, d.trackedMs, d.pausedMs, d.idleMs, d.coverageTouchedAt, d.coverageReadAt,
        r.id, r.engineered ? 1 : 0, r.concept, r.slot, r.angleDeg, r.dist, r.words, r.chars, r.lines, r.estReadMs, r.fre,
        r.firstOrder, r.firstMs, r.returnMs, r.returns, r.returnTimes.join(';'), r.brushMs, r.totalMs, r.idleMs,
        r.shareTracked, r.shareFragment, r.postMs, r.postShare, r.touchedAt, r.readAt,
        r.rank_firstMs, r.rank_returnMs, r.rank_returns, r.rank_postMs, r.rank_totalMs
      ].map(cell).join(',');
    });
  };

  T.toCSV = function (sessions) {
    var lines = [T.csvHeader.join(',')];
    sessions.forEach(function (s) { lines = lines.concat(T.csvRows(s)); });
    return lines.join('\n') + '\n';
  };

  /* ---------- Text metadata ---------- */
  function syllables(word) {
    var w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    var m = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }
  // Approximate Flesch Reading Ease (heuristic syllable count). For comparing fragments, not absolute claims.
  T.textStats = function (text, wpm) {
    var words = text.split(/\s+/).filter(function (w) { return /\w/.test(w); });
    var sentences = (text.match(/[.!?](\s|$)/g) || []).length || 1;
    var syl = words.reduce(function (s, w) { return s + syllables(w); }, 0);
    return {
      words: words.length,
      chars: text.length,
      sentences: sentences,
      estReadMs: Math.round(words.length / wpm * 60000),
      fre: Math.round((206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length)) * 10) / 10
    };
  };

  T.hash = function (str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  };

  root.T0Tracker = T;
})(typeof window !== 'undefined' ? window : this);
