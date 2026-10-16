/* Thing_000 Part 1: the dark room, the switch, the light and the 75-second exploration.
   Builds the fragment ring, then records raw pointer samples. All analysis lives in tracker.js. */
(function () {
  'use strict';

  var C = T0.config, TR = T0Tracker;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var el = {};
  var W = 0, H = 0, scale = 1, offX = 0, offY = 0;
  var layout = null, fragEls = {};
  var state = 'idle';             // idle | ready | on | paused | ended
  var t0 = 0, pausedTotal = 0, pauseStart = 0;
  var samples = [], breaks = [], events = [];
  var px = 0, py = 0, clientX = 0, clientY = 0;
  var stageShownAt = 0, lightOnAt = null, lastShownSec = null;
  var opts = {};

  function q(sel) { return document.querySelector(sel); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- Build and lay out the ring ---------- */
  function build() {
    var F = C.fragment;
    ['dim', 'lit'].forEach(function (layer) {
      el[layer].innerHTML = '';
      T0.fragments.forEach(function (f) {
        var p = document.createElement('p');
        p.className = 'frag';
        p.textContent = f.text;
        p.style.width = F.width + 'px';
        p.style.fontSize = F.fontSize + 'px';
        p.style.lineHeight = String(F.lineHeight);
        el[layer].appendChild(p);
        fragEls[f.id] = fragEls[f.id] || {};
        fragEls[f.id][layer] = p;
      });
    });
    el.dim.style.color = 'rgba(228, 230, 232, ' + C.dim.alpha + ')';
    el.dim.style.filter = 'blur(' + C.dim.blurPx + 'px)';
  }

  // Slot centres for a rotation, relative to the ring centre (clockwise from 12 o'clock),
  // with each slot's fixed nudge in distance and angle applied. Returns [x, y, angleDeg, distance].
  function slots(R, rot, n) {
    var J = C.ring.jitter || { radius: [], angle: [] }, out = [];
    for (var i = 0; i < n; i++) {
      var deg = rot + i * 360 / n + (J.angle[i] || 0), d = R * (J.radius[i] || 1), a = deg * Math.PI / 180;
      out.push([d * Math.sin(a), -d * Math.cos(a), (deg + 360) % 360, d]);
    }
    return out;
  }

  // Smallest radius at which no two padded hit regions touch, for every rotation that can occur.
  function ringRadius(w, h, rots, n) {
    var bw = w + 2 * C.hitPad + C.ring.gap, bh = h + 2 * C.hitPad + C.ring.gap;
    function clear(R) {
      return rots.every(function (r) {
        var p = slots(R, r, n);
        for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
          if (Math.abs(p[i][0] - p[j][0]) < bw && Math.abs(p[i][1] - p[j][1]) < bh) return false;
        }
        return true;
      });
    }
    var lo = C.ring.minRadius, hi = 4000;
    if (clear(lo)) return lo;
    for (var k = 0; k < 40; k++) { var mid = (lo + hi) / 2; if (clear(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  // Equal line counts matter more than an exact width: fonts wrap slightly differently across browsers,
  // so try widths near the target and use the closest one at which all eight fragments match.
  function fitWidth() {
    var F = C.fragment, lineH = F.fontSize * F.lineHeight, all = [];
    T0.fragments.forEach(function (f) { all.push(fragEls[f.id].dim, fragEls[f.id].lit); });
    function counts(w) {
      all.forEach(function (p) { p.style.width = w + 'px'; });
      return T0.fragments.map(function (f) { return Math.round(fragEls[f.id].dim.offsetHeight / lineH); });
    }
    for (var d = 0; d <= F.widthSearch; d += 2) {
      var tries = d ? [F.width - d, F.width + d] : [F.width];
      for (var i = 0; i < tries.length; i++) {
        var c = counts(tries[i]);
        if (c.every(function (x) { return x === c[0]; })) return tries[i];
      }
    }
    counts(F.width);
    return F.width;
  }

  function place() {
    var F = C.fragment, n = C.ring.count, pad = C.hitPad, m = C.ring.margin;
    var fw = fitWidth();
    var ids = T0.fragments.map(function (f) { return f.id; });
    var order = C.randomise.shuffle ? shuffle(ids.slice()) : ids.slice();
    var step = 360 / n, rots, rotation;
    if (C.ring.rotation === 'random') {
      rots = []; for (var d = 0; d < step; d += 0.5) rots.push(d);
      rotation = Math.random() * step;
    } else {
      rotation = C.ring.fixedDeg % step;
      rots = [rotation];
    }

    var heights = {}, hMax = 0;
    // measured on the dim layer: the lit layer isn't displayed until the switch (blur doesn't change layout)
    ids.forEach(function (id) { heights[id] = fragEls[id].dim.offsetHeight; hMax = Math.max(hMax, heights[id]); });

    var R = ringRadius(fw, hMax, rots, n);
    var ex = 0, ey = 0;
    rots.forEach(function (r) { slots(R, r, n).forEach(function (p) { ex = Math.max(ex, Math.abs(p[0])); ey = Math.max(ey, Math.abs(p[1])); }); });
    W = Math.ceil(2 * (ex + fw / 2 + pad + m));
    H = Math.ceil(2 * (ey + hMax / 2 + pad + m));
    [el.stageDim, el.stageLit, el.stageTop].forEach(function (s) { s.style.width = W + 'px'; s.style.height = H + 'px'; });

    var lineH = F.fontSize * F.lineHeight, pos = slots(R, rotation, n);
    var frags = order.map(function (id, slot) {
      var f = T0.fragments.filter(function (x) { return x.id === id; })[0];
      var angle = pos[slot][2], dist = pos[slot][3];          // clockwise from 12 o'clock
      var cx = W / 2 + pos[slot][0], cy = H / 2 + pos[slot][1];
      var h = heights[id];
      var box = { x: r1(cx - fw / 2), y: r1(cy - h / 2), w: fw, h: h };
      ['dim', 'lit'].forEach(function (layer) {
        fragEls[id][layer].style.left = box.x + 'px';
        fragEls[id][layer].style.top = box.y + 'px';
      });
      var st = TR.textStats(f.text, C.readingWpm);
      return {
        id: id, engineered: !!f.engineered, concept: f.concept, slot: slot,
        angleDeg: r1(angle), dist: r1(dist), cx: r1(cx), cy: r1(cy), box: box,
        lines: Math.round(h / lineH), words: st.words, chars: st.chars, estReadMs: st.estReadMs, fre: st.fre
      };
    });

    var lines = frags.map(function (f) { return f.lines; });
    layout = {
      stage: { w: W, h: H }, radius: r1(R), rotationDeg: r1(rotation), rotationMode: C.ring.rotation,
      fragmentWidth: fw,
      order: order, fragments: frags,
      linesEqual: lines.every(function (l) { return l === lines[0]; }),
      lineCounts: lines
    };
    if (opts.debug) drawDebug();
  }

  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    offX = (vw - W * scale) / 2;
    offY = (vh - H * scale) / 2;
    var tf = 'translate(' + offX + 'px,' + offY + 'px) scale(' + scale + ')';
    [el.stageDim, el.stageLit, el.stageTop].forEach(function (s) { s.style.transform = tf; });
  }

  function drawDebug() {
    var d = el.debug;
    d.hidden = false;
    d.innerHTML = '';
    layout.fragments.forEach(function (f) {
      var b = document.createElement('div');
      b.className = 'dbg-box' + (f.engineered ? ' is-e' : '');
      b.style.left = (f.box.x - C.hitPad) + 'px';
      b.style.top = (f.box.y - C.hitPad) + 'px';
      b.style.width = (f.box.w + 2 * C.hitPad) + 'px';
      b.style.height = (f.box.h + 2 * C.hitPad) + 'px';
      b.innerHTML = '<span>' + f.id + ' · slot ' + f.slot + ' · ' + f.angleDeg + '° · ' + f.lines + ' lines</span>';
      d.appendChild(b);
    });
  }

  /* ---------- Light ----------
     A torch, not a cursor. The light (px, py) follows the pointer (tx, ty) with a little weight; its
     hotspot wanders slightly off-centre, so the pool is never a perfect disc; reflector rings and a thin
     spectral fringe sit in the falloff; dust drifts through it. All of it is identical wherever the
     light points, so no fragment is lit differently from another. */
  function toStage(x, y) { return [(x - offX) / scale, (y - offY) / scale]; }
  var tx = 0, ty = 0, level = 0, lastT = 0, motes = [], ctx = null, dpr = 1;
  var hot = { x: 0, y: 0 };                   // hotspot offset, stage units

  // The warm-up: a few uneven blinks before the lamp holds (≈1 s). Also drives the hum and the
  // ticks in audio.js, so sound and light blink together. [seconds after the click, brightness]
  var WARM = [[0, 0], [0.06, 0.75], [0.11, 0.05], [0.3, 0], [0.34, 0.9], [0.39, 0.2], [0.44, 0.65], [0.5, 0],
              [0.68, 0], [0.72, 0.55], [0.8, 0.95], [0.86, 0.6], [0.92, 1]];
  function warmLevel(s) {
    if (reduceMotion) return 1;
    var v = 0;
    for (var i = 0; i < WARM.length; i++) if (s >= WARM[i][0]) v = WARM[i][1];
    return v;
  }

  function sizeCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    el.canvas.width = Math.round(window.innerWidth * dpr);
    el.canvas.height = Math.round(window.innerHeight * dpr);
    ctx = el.canvas.getContext('2d');
  }

  // Dust as it looks in a real beam: mostly tiny specks at different depths, carried by slow, swirling
  // air (nearer motes cross faster: parallax), each with its own small wander, catching the light in
  // brief glints as they turn. A handful very near the eye are soft, out-of-focus discs.
  function makeMotes() {
    motes = [];
    var n = C.beam.dust, vw = window.innerWidth, vh = window.innerHeight;
    for (var i = 0; i < n; i++) {
      var z = Math.pow(Math.random(), 1.6);    // depth: most motes are far away
      var bokeh = i < Math.round(n * 0.04);
      if (bokeh) z = 0.94 + Math.random() * 0.06;
      motes.push({
        x: Math.random() * vw, y: Math.random() * vh, z: z, bokeh: bokeh,
        speed: 0.3 + 2.2 * z * z,              // apparent speed grows as the mote gets nearer
        wx: 0, wy: 0,                          // its own wander, on top of the air current
        r: bokeh ? 3 + Math.random() * 5 : 0.3 + 0.95 * z * z + Math.random() * 0.25,
        a: bokeh ? 0.05 + Math.random() * 0.06 : 0.25 + 0.6 * z + Math.random() * 0.15,
        ph: Math.random() * 6.28, rate: 0.6 + Math.random() * 2.4
      });
    }
  }

  // Slow convection: a smooth flow field, so neighbouring motes move together, as in still indoor air.
  function airAt(x, y, s) {
    return [
      5 * Math.sin(0.0031 * y + 0.21 * s) + 2.5 * Math.sin(0.0057 * (x + y) - 0.13 * s),
      -2.2 + 3.5 * Math.sin(0.0043 * x - 0.17 * s) + 1.8 * Math.sin(0.0071 * y + 0.11 * s)
    ];
  }

  function setMask(node, v) { node.style.webkitMaskImage = v; node.style.maskImage = v; }

  function paintLight(time, dt) {
    var r = C.beam.radius, s = time / 1000;
    // the hotspot drifts in a slow, irregular loop, and leans a little towards the direction of travel
    var wan = C.beam.wander * r;
    hot.x = wan * (Math.sin(s * 0.53) * 0.7 + Math.sin(s * 1.31 + 1.7) * 0.3) + (tx - px) * 0.35;
    hot.y = wan * (Math.cos(s * 0.47 + 0.6) * 0.7 + Math.sin(s * 1.07) * 0.3) + (ty - py) * 0.35;
    var hx = px + hot.x, hy = py + hot.y, ex = 1 + 0.07 * Math.sin(s * 0.37), ey = 2 - ex;

    // What the light reveals (stage units): a slightly oval main pool plus the brighter hotspot lobe.
    var lit = 'radial-gradient(' + r1(r * ex) + 'px ' + r1(r * ey) + 'px at ' + r1(px) + 'px ' + r1(py) + 'px, #000 38%, rgba(0,0,0,.55) 66%, transparent 100%), ' +
              'radial-gradient(' + r1(r * 0.72) + 'px ' + r1(r * 0.72) + 'px at ' + r1(hx) + 'px ' + r1(hy) + 'px, #000 30%, transparent 100%)';
    setMask(el.lit, lit);

    // The surface the light falls on (screen pixels), a touch wider than the text reveal.
    var k = scale, cx = offX + px * k, cy = offY + py * k, hcx = offX + hx * k, hcy = offY + hy * k, rs = r * k;
    var mat = 'radial-gradient(' + r1(rs * 1.35 * ex) + 'px ' + r1(rs * 1.35 * ey) + 'px at ' + r1(cx) + 'px ' + r1(cy) + 'px, #000 16%, rgba(0,0,0,.6) 38%, rgba(0,0,0,.25) 62%, rgba(0,0,0,.07) 84%, transparent 100%), ' +
              'radial-gradient(' + r1(rs * 0.8) + 'px ' + r1(rs * 0.8) + 'px at ' + r1(hcx) + 'px ' + r1(hcy) + 'px, #000 20%, transparent 100%)';
    setMask(el.material, mat);
    el.lit.style.opacity = el.material.style.opacity = String(level);

    // Air and optics, drawn on the canvas (screen blend).
    var g = ctx, W2 = el.canvas.width, H2 = el.canvas.height;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W2, H2);
    if (level <= 0) return;
    g.globalAlpha = level;

    // the throw: light scattered in the air around the pool
    var grd = g.createRadialGradient(hcx, hcy, 0, cx, cy, rs * 2.3);
    grd.addColorStop(0, 'rgba(255,252,246,.20)'); grd.addColorStop(0.3, 'rgba(250,248,242,.08)'); grd.addColorStop(1, 'rgba(250,248,242,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W2, H2);

    // reflector rings: faint, uneven bands in the falloff
    var rings = g.createRadialGradient(cx, cy, rs * 0.35, cx + hot.x * k * 0.3, cy + hot.y * k * 0.3, rs * 1.05);
    [[0, 0], [0.30, 0.045], [0.38, 0], [0.62, 0.035], [0.68, 0], [0.86, 0.03], [0.9, 0]].forEach(function (c) { rings.addColorStop(c[0], 'rgba(255,255,255,' + c[1] + ')'); });
    g.fillStyle = rings; g.beginPath(); g.arc(cx, cy, rs * 1.1, 0, 6.2832); g.fill();

    // dispersion in the falloff: violet inside, red outside (shorter wavelengths bend more). Two passes from
    // slightly different centres make it uneven, stronger on one side, never a clean ring.
    [[-0.9, 0.62], [0.6, 0.38]].forEach(function (p) {
      var ox = hot.x * k * p[0], oy = hot.y * k * p[0];
      var fr = g.createRadialGradient(cx + ox, cy + oy, rs * 0.7, cx, cy, rs * 1.12);
      [[0, 'rgba(79,70,229,0)'], [0.2, 'rgba(79,70,229,.075)'], [0.36, 'rgba(28,143,224,.07)'], [0.52, 'rgba(31,181,154,.06)'],
       [0.68, 'rgba(232,201,62,.06)'], [0.82, 'rgba(238,138,52,.055)'], [0.93, 'rgba(226,67,63,.045)'], [1, 'rgba(226,67,63,0)']].forEach(function (c) { fr.addColorStop(c[0], c[1]); });
      g.globalAlpha = level * p[1] * 1.6;
      g.fillStyle = fr; g.beginPath(); g.arc(cx, cy, rs * 1.2, 0, 6.2832); g.fill();
    });
    g.globalAlpha = level;

    // dust: only visible where the light is
    var step = Math.min(dt, 64) / 1000, vw = window.innerWidth, vh = window.innerHeight;
    motes.forEach(function (m) {
      if (!reduceMotion) {
        var air = airAt(m.x, m.y, s);
        m.wx += ((Math.random() - 0.5) * 14 - m.wx * 0.8) * step;      // small, decaying wander
        m.wy += ((Math.random() - 0.5) * 14 - m.wy * 0.8) * step;
        m.x += (air[0] + m.wx) * m.speed * step;
        m.y += (air[1] + m.wy) * m.speed * step;
        if (m.x < -12) m.x = vw + 12; if (m.x > vw + 12) m.x = -12;
        if (m.y < -12) m.y = vh + 12; if (m.y > vh + 12) m.y = -12;
      }
      var d = Math.hypot(m.x - cx, m.y - cy) / rs;
      if (d > 1.1) return;
      var lit2 = d < 0.3 ? 1 : Math.max(0, 1 - (d - 0.3) / 0.8);
      if (m.bokeh) {
        var bg = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        bg.addColorStop(0, 'rgba(255,253,248,' + (m.a * lit2).toFixed(3) + ')');
        bg.addColorStop(0.7, 'rgba(255,253,248,' + (m.a * lit2 * 0.6).toFixed(3) + ')');
        bg.addColorStop(1, 'rgba(255,253,248,0)');
        g.fillStyle = bg; g.beginPath(); g.arc(m.x, m.y, m.r, 0, 6.2832); g.fill();
        return;
      }
      // a speck turning in the light: mostly faint, with brief sharp glints
      var glint = Math.pow(0.5 + 0.5 * Math.sin(s * m.rate + m.ph), 10);
      var a = m.a * lit2 * (0.35 + 0.65 * glint);
      if (a < 0.01) return;
      g.fillStyle = 'rgba(255,253,248,' + a.toFixed(3) + ')';
      if (m.r < 0.8) g.fillRect(m.x, m.y, m.r * 1.3, m.r * 1.3);
      else { g.beginPath(); g.arc(m.x, m.y, m.r, 0, 6.2832); g.fill(); }
    });
    g.globalAlpha = 1;
  }

  /* ---------- Tracking ---------- */
  function now() { return performance.now(); }

  // One sample: [ms since the light came on, x, y] in whole stage units (1 unit ≈ 1 screen pixel or less).
  // Moving: at most every 8 ms. Still: a heartbeat every 50 ms. Keeps a 75 s session around 60–90 KB.
  function record(t, force) {
    var last = samples[samples.length - 1], ti = Math.round(t), x = Math.round(px), y = Math.round(py);
    if (!force && last && (ti - last[0] < 8 || (last[1] === x && last[2] === y && ti - last[0] < 50))) return;
    samples.push([ti, x, y]);
  }

  function frame() {
    if (state === 'ended') return;
    var n = now(), t = n - t0, dt = lastT ? n - lastT : 16;
    lastT = n;
    // the light catches up with the hand
    var follow = 1 - Math.exp(-dt / Math.max(1, C.beam.lagMs));
    px += (tx - px) * follow; py += (ty - py) * follow;
    level = warmLevel(t / 1000);
    if (state === 'on') {
      var active = t - pausedTotal, dur = opts.durationSec * 1000;
      if (active >= dur) {
        record(pausedTotal + dur, true);
        end();
        return;
      }
      record(t);
      var left = Math.ceil((dur - active) / 1000);
      if (left !== lastShownSec) { el.timer.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2); lastShownSec = left; }
      el.meter.style.transform = 'scaleX(' + Math.max(0, 1 - active / dur) + ')';
    }
    if (state === 'on' || state === 'paused') paintLight(n, dt);
    requestAnimationFrame(frame);
  }

  function pause(reason) {
    if (state !== 'on') return;
    var t = now() - t0;
    record(t, true);
    breaks.push([Math.round(t), null, reason]);
    pauseStart = now();
    state = 'paused';
    el.paused.hidden = false;
  }

  function resume() {
    if (state !== 'paused' || document.hidden) return;
    var n = now(), t = n - t0;
    breaks[breaks.length - 1][1] = Math.round(t);
    pausedTotal += n - pauseStart;
    record(t, true);
    state = 'on';
    el.paused.hidden = true;
  }

  // The pointer only sets where the light is heading; the light itself moves in frame().
  // Samples record the light's centre, because that is what was actually lit.
  function onMove(e) {
    clientX = e.clientX; clientY = e.clientY;
    var s = toStage(clientX, clientY);
    tx = s[0]; ty = s[1];
    if (state === 'paused') resume();
  }

  function lightOn(e) {
    if (state !== 'ready') return;
    if (e && e.detail === 0) {
      // keyboard activation: start the light at the exact centre
      clientX = offX + W / 2 * scale; clientY = offY + H / 2 * scale;
    } else if (e) { clientX = e.clientX; clientY = e.clientY; }
    var s = toStage(clientX, clientY);
    px = tx = s[0]; py = ty = s[1];

    el.sw.classList.add('is-on');
    el.sw.setAttribute('aria-pressed', 'true');
    el.sw.disabled = true;
    el.scene.classList.add('is-lit');
    document.body.classList.add('t0-lit');
    T0Audio.click();
    T0Audio.humOn(reduceMotion ? null : WARM);

    t0 = now();
    lastT = 0;
    lightOnAt = new Date().toISOString();
    state = 'on';
    record(0, true);
    requestAnimationFrame(frame);
  }

  function end() {
    state = 'ended';
    var open = breaks[breaks.length - 1];
    if (open && open[1] == null) open[1] = open[0];
    el.timer.textContent = '0:00';
    el.meter.style.transform = 'scaleX(0)';
    el.scene.classList.add('is-ending');
    document.body.classList.remove('t0-lit');
    T0Audio.stop();
    var raw = {
      samples: samples, breaks: breaks, events: events, layout: layout,
      timeline: {
        lightOnAt: lightOnAt,
        preSwitchMs: Math.round(t0 - stageShownAt),
        endedAt: new Date().toISOString()
      },
      env: {
        viewport: [window.innerWidth, window.innerHeight],
        dpr: window.devicePixelRatio || 1,
        stageScale: Math.round(scale * 10000) / 10000,
        sound: T0Audio.enabled()
      }
    };
    setTimeout(function () { opts.onEnd(raw); }, reduceMotion ? 300 : 1600);
  }

  /* ---------- Public ---------- */
  window.T0Explore = {
    // Call with the explore scene already visible, so text can be measured.
    start: function (o) {
      opts = o;
      el.scene = q('[data-scene="explore"]');
      el.stageDim = q('[data-stage-dim]');
      el.stageLit = q('[data-stage-lit]');
      el.stageTop = q('[data-stage-top]');
      el.dim = q('[data-dim]');
      el.lit = q('[data-lit]');
      el.material = q('[data-material]');
      el.canvas = q('[data-air]');
      el.sw = q('[data-switch]');
      el.timer = q('[data-timer]');
      el.meter = q('[data-meter]');
      el.paused = q('[data-paused]');
      el.debug = q('[data-debug-layer]');

      build();
      place();
      fit();
      sizeCanvas();
      makeMotes();
      stageShownAt = now();
      state = 'ready';

      el.sw.addEventListener('click', lightOn);
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('resize', function () {
        fit();
        sizeCanvas();
        if (state === 'on' || state === 'paused') events.push([r1(now() - t0), 'resize', [window.innerWidth, window.innerHeight, Math.round(scale * 10000) / 10000]]);
      });
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause('hidden'); });
      // Losing focus alone (a notification, the address bar) doesn't stop someone exploring: log it, don't pause.
      ['blur', 'focus'].forEach(function (type) {
        window.addEventListener(type, function () { if (state === 'on' || state === 'paused') events.push([r1(now() - t0), type]); });
      });
      document.documentElement.addEventListener('mouseleave', function () { pause('leave'); });
      if (opts.debug) {
        window.addEventListener('keydown', function (e) { if (e.key === 'd' || e.key === 'D') el.debug.hidden = !el.debug.hidden; });
      }
      return layout;
    }
  };
})();
