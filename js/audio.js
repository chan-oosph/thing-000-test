/* Thing_000: sound. Everything is synthesised with Web Audio, so there are no files to load.
   Room tone from "Begin", a real-feeling switch click, and the lamp's hum while the light is on.
   Constant throughout exploration and never tied to any fragment. Muted by the corner toggle (remembered). */
(function () {
  'use strict';

  var S = T0.config.sound, KEY = T0.config.soundKey;
  var ctx = null, master = null, roomGain = null, humGain = null, humNodes = [];
  var enabled = true;
  try { enabled = window.localStorage.getItem(KEY) !== 'off'; } catch (e) { /* default on */ }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // Brown noise: a low, soft rumble rather than hiss.
  function brown(seconds) {
    var n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return buf;
  }
  function white(seconds) {
    var n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function room() {
    if (!ensure() || roomGain) return;
    var src = ctx.createBufferSource(); src.buffer = brown(6); src.loop = true;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    roomGain = ctx.createGain(); roomGain.gain.value = 0;
    src.connect(lp); lp.connect(roomGain); roomGain.connect(master);
    src.start();
    roomGain.gain.linearRampToValueAtTime(S.room, ctx.currentTime + 2.5);
  }

  // A mechanical switch: a sharp plastic tick, a tiny bounce, and a low body thump.
  function click() {
    if (!ensure()) return;
    var t = ctx.currentTime;
    [[0, 1], [0.012, 0.35]].forEach(function (p) {
      var src = ctx.createBufferSource(); src.buffer = white(0.03);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
      var g = ctx.createGain();
      g.gain.setValueAtTime(S.click * p[1], t + p[0]);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p[0] + 0.025);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t + p[0]);
    });
    var o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.05);
    og.gain.setValueAtTime(S.click * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.08);
  }

  // An electrical tick as the lamp catches: a bright snap with a short, gritty tail.
  function spark(at, strength) {
    var src = ctx.createBufferSource(); src.buffer = white(0.06);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(S.spark * strength, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    src.connect(hp); hp.connect(g); g.connect(master); src.start(at);
  }

  var crackleTimer = null;

  // The lamp itself: mains hum (50 Hz and harmonics), a thin buzzing edge from the filament/ballast, and
  // the odd faint crackle. `flicker` is the light's warm-up, so the hum blinks with it and each blink ticks.
  function humOn(flicker) {
    if (!ensure() || humGain) return;
    var t = ctx.currentTime;
    humGain = ctx.createGain(); humGain.gain.value = 0;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(humGain); humGain.connect(master);
    [[50, 1], [100, 0.55], [150, 0.25], [200, 0.12]].forEach(function (h) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = h[0]; g.gain.value = h[1];
      o.connect(g); g.connect(lp); o.start(); humNodes.push(o);
    });
    // buzz: a raspy 100 Hz sawtooth, only its upper harmonics, very quiet
    var saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 100;
    var sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 2600; sbp.Q.value = 1.4;
    var sg = ctx.createGain(); sg.gain.value = S.buzz;
    saw.connect(sbp); sbp.connect(sg); sg.connect(humGain); saw.start(); humNodes.push(saw);
    // air: a faint hiss
    var src = ctx.createBufferSource(); src.buffer = white(2); src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 7000; bp.Q.value = 3;
    var bg = ctx.createGain(); bg.gain.value = 0.04;
    src.connect(bp); bp.connect(bg); bg.connect(humGain); src.start(); humNodes.push(src);

    var prev = 0;
    (flicker || [[0, 1]]).forEach(function (k) {
      humGain.gain.setValueAtTime(S.hum * k[1], t + k[0]);
      if (k[1] - prev > 0.3) spark(t + k[0], Math.min(1, k[1]));     // a tick each time it catches
      prev = k[1];
    });

    // the odd crackle while it burns
    (function next() {
      crackleTimer = setTimeout(function () {
        if (!ctx || !humGain) return;
        spark(ctx.currentTime, 0.12 + Math.random() * 0.18);
        next();
      }, 1400 + Math.random() * 4200);
    })();
  }

  // The last few seconds: the hum sags and stutters, with a couple of ticks, as the lamp gives out.
  function dying(seconds) {
    if (!ctx || !humGain) return;
    var t = ctx.currentTime, g = humGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(S.hum, t);
    var dips = [0.18, 0.41, 0.62, 0.8];
    dips.forEach(function (p, i) {
      var at = t + seconds * p;
      g.setValueAtTime(S.hum * (0.85 - i * 0.12), at);
      g.setValueAtTime(S.hum * 0.25, at + 0.05);
      g.setValueAtTime(S.hum * (0.8 - i * 0.12), at + 0.11);
      if (i % 2) spark(at + 0.05, 0.3);
    });
  }

  function stopAll() {
    if (!ctx) return;
    clearTimeout(crackleTimer);
    var t = ctx.currentTime;
    [roomGain, humGain].forEach(function (g) {
      if (!g) return;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 1.4);
    });
    setTimeout(function () { humNodes.forEach(function (n) { try { n.stop(); } catch (e) { /* already stopped */ } }); }, 1600);
  }

  function setEnabled(on) {
    enabled = on;
    try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
    if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.08);
  }

  window.T0Audio = {
    room: room, click: click, humOn: humOn, dying: dying, stop: stopAll,
    enabled: function () { return enabled; },
    toggle: function () { setEnabled(!enabled); return enabled; }
  };
})();
