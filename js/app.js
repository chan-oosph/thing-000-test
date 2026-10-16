/* Thing_000: scene flow, local session storage and (online) the pilot.
   Local:  intro → Part 1 → exploration → handover → researcher results (this browser only).
   Pilot:  consent + first name → intro → Part 1 → exploration → last question → sent to Chan's private sheet.
   URL options for testing: ?debug (hit regions; press D to toggle), ?duration=20 (seconds), ?pilot (pilot flow locally). */
(function () {
  'use strict';

  var C = T0.config, TR = T0Tracker, P = T0.pilot;
  var params = new URLSearchParams(window.location.search);
  var debug = params.has('debug');
  var duration = parseInt(params.get('duration'), 10) || C.durationSec;
  var host = window.location.hostname;
  var local = !host || host === 'localhost' || host === '127.0.0.1';
  var pilot = params.has('pilot') || (!local && !!P.submitUrl);
  var session = null, tester = {};

  /* ---------- Local storage (this browser only) ---------- */
  function readList(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }
  function writeList(key, list) {
    try { window.localStorage.setItem(key, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  var store = {
    all: function () { return readList(C.storageKey); },
    save: function (s) {
      return writeList(C.storageKey, store.all().filter(function (x) { return x.id !== s.id; }).concat([s]));
    },
    clear: function () { try { window.localStorage.removeItem(C.storageKey); } catch (e) { /* nothing stored */ } },
    download: function (name, text, type) {
      var url = URL.createObjectURL(new Blob([text], { type: type }));
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  };

  /* ---------- Pilot: sending ----------
     A finished session waits in this browser's "unsent" list until the sheet confirms it, so a dropped
     connection never loses a run. The sheet ignores a session id it already has, so retries are safe. */
  var queue = {
    all: function () { return readList(C.queueKey); },
    add: function (s) { writeList(C.queueKey, queue.all().filter(function (x) { return x.id !== s.id; }).concat([s])); },
    remove: function (id) { writeList(C.queueKey, queue.all().filter(function (x) { return x.id !== id; })); }
  };

  function send(s) {
    if (!P.submitUrl) return Promise.reject(new Error('no submit address'));
    // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script accepts
    return fetch(P.submitUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(s) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'not saved');
        queue.remove(s.id);
        return true;
      });
  }

  /* ---------- Scenes ---------- */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fade the current scene out, then show the next one. `after` runs once the new scene is visible.
  function show(name, after) {
    var current = document.querySelector('[data-scene]:not([hidden])');
    function swap() {
      document.querySelectorAll('[data-scene]').forEach(function (s) { s.hidden = s.getAttribute('data-scene') !== name; });
      document.body.setAttribute('data-at', name);
      var focus = document.querySelector('[data-scene="' + name + '"] input, [data-scene="' + name + '"] button');
      if (focus && name !== 'explore') focus.focus({ preventScroll: true });
      if (after) after();
    }
    if (!current || reduceMotion || name === 'handover' || name === 'finish') { if (current) current.classList.remove('is-leaving'); swap(); return; }
    current.classList.add('is-leaving');
    setTimeout(function () { current.classList.remove('is-leaving'); swap(); }, 450);
  }

  function text(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function set(key, html) { document.querySelectorAll('[data-copy="' + key + '"]').forEach(function (n) { n.innerHTML = html; }); }
  function lines(arr) { return arr.map(function (l) { return '<p class="line">' + text(l) + '</p>'; }).join(''); }

  function fillCopy() {
    var I = T0.intro, K = P.consent, X = P.end;
    set('title', text(I.title));
    set('lines', lines(pilot ? P.introLines : I.lines));
    set('part', text(I.part));
    set('partNote', text(I.partNote.replace('{n}', duration)));
    set('handover', lines(I.handover));
    set('consentLabel', text(K.label));
    set('consentTitle', text(K.title));
    set('consentLines', lines(K.lines));
    set('nameLabel', text(K.nameLabel));
    set('deviceLabel', text(K.deviceLabel));
    set('agree', text(K.agree));
    set('endTitle', text(X.title));
    set('endQuestion', text(X.question));
    set('endOptions', X.options.map(function (o) {
      return '<label class="choice"><input type="radio" name="psych" value="' + text(o) + '" required> ' + text(o) + '</label>';
    }).join(''));
    set('finish', text(X.finish));
    set('endAsk', text(X.ask));
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 2500); })]);
  }

  function startExplore() {
    fontsReady().then(function () { show('explore', begin); });
    function begin() {
      var copyText = T0.fragments.map(function (f) { return f.id + ':' + f.text; }).join('|');
      var texts = {};
      T0.fragments.forEach(function (f) { texts[f.id] = f.text; });
      session = {
        schema: 1,
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        app: T0.version.app,
        copy: T0.version.copy,
        copyHash: TR.hash(copyText),
        texts: texts,
        mode: pilot ? 'pilot' : 'local',
        startedAt: new Date().toISOString(),
        config: JSON.parse(JSON.stringify(Object.assign({}, C, { durationSec: duration }))),
        debugMode: debug,
        tester: Object.assign({}, tester)
      };
      T0Explore.start({
        durationSec: duration,
        debug: debug,
        onEnd: function (raw) {
          Object.assign(session, raw);
          if (pilot) { queue.add(session); show('finish'); }
          else { store.save(session); show('handover'); }
        }
      });
    }
  }

  /* ---------- Boot ---------- */
  fillCopy();
  document.body.classList.toggle('is-pilot', pilot);
  var fine = window.matchMedia('(any-pointer: fine)').matches;
  if (!fine && !debug) { show('gate'); return; }
  show(pilot ? 'consent' : 'intro');

  // A session that didn't get through last time (same browser): try again quietly.
  if (pilot) queue.all().forEach(function (s) { send(s).catch(function () { /* stays queued */ }); });

  // Sound: on by default, remembered per browser. Starts with the room tone on "Begin" (browsers only
  // allow audio after a click).
  var soundBtn = document.querySelector('[data-sound]');
  function soundLabel() {
    var on = T0Audio.enabled();
    soundBtn.textContent = on ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(on));
  }
  soundLabel();
  soundBtn.addEventListener('click', function () { T0Audio.toggle(); soundLabel(); });

  document.querySelector('[data-consent]').addEventListener('submit', function (e) {
    e.preventDefault();
    var el = e.target.elements, name = el.namedItem('firstname').value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) { el.namedItem('firstname').focus(); return; }
    tester = { name: name, input: el.namedItem('input').value };
    show('intro');
  });

  var finishForm = document.querySelector('[data-finish]'), status = document.querySelector('[data-status]');
  var finishBtn = document.querySelector('[data-finish-btn]'), sent = false;
  finishForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sent || !session) return;
    session.tester.psych = finishForm.elements.namedItem('psych').value;
    queue.add(session);
    finishBtn.disabled = true;
    status.textContent = P.end.saving;
    send(session).then(function () {
      sent = true;
      status.textContent = P.end.saved;
      finishBtn.hidden = true;
      finishForm.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
    }).catch(function () {
      status.textContent = P.end.failed;
      finishBtn.textContent = P.end.retry;
      finishBtn.disabled = false;
    });
  });

  document.addEventListener('click', function (e) {
    var next = e.target.closest && e.target.closest('[data-next]');
    if (!next) return;
    var to = next.getAttribute('data-next');
    if (to === 'part') T0Audio.room();
    if (to === 'explore') startExplore();
    else if (to === 'results') { if (!pilot) show('results', function () { T0Results.render(document.querySelector('[data-results]'), session, store); }); }
    else show(to);
  });
})();
