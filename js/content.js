/* Thing_000: all copy, the concept matrix and every tunable setting.
   Edit wording and thresholds here, not in the other scripts.
   Copy marked LOCKED was agreed with Chan on 2026-10-10. Everything else is provisional. */
(function () {
  'use strict';

  window.T0 = window.T0 || {};

  T0.version = {
    app: '0.1.0-stage1',
    copy: 'copy-2026-10-16d'   // bump by hand whenever fragment wording OR the instructions change
                               // (c → d: Part 1 instruction reframed; fragments unchanged)
  };

  /* ---------- Settings (all easy to change after pilots) ---------- */
  T0.config = {
    durationSec: 75,             // exploration window, counted only while tracking is active

    fragment: {
      width: 240,                // target, in stage units; the stage is scaled to fit the window
      widthSearch: 30,           // if the fragments wrap to different line counts at the target, the closest width
                                 // within ±30 where all eight match is used instead (and recorded)
      fontSize: 21,
      lineHeight: 1.45
    },
    ring: {
      count: 8,
      // 'fixed': slots at fixedDeg + 45° steps, fragments shuffled across them (counterbalances position).
      // 'random': a random rotation per session too. Fixed lets the text be ~35% larger, because the
      // ring never has to allow for the tightest rotation.
      rotation: 'fixed',
      fixedDeg: 22.5,
      minRadius: 300,            // the real radius grows until no two hit regions can touch
      gap: 4,                    // minimum clear space between neighbouring hit regions
      margin: 8,                 // stage edge clearance
      // A scattered look without giving up near-equal distance: each slot has a fixed nudge
      // (distance ×0.90–1.10, angle ±6°). Fragments are shuffled across slots, so no fragment
      // gets the nearer or more prominent spots more often. Each fragment's distance is recorded.
      // Chosen by search so the scatter costs almost no text size (≈21.9 px vs 22.5 px at 1440 × 900);
      // a careless pattern forces the ring wider and shrinks the text to ≈16 px.
      jitter: {
        radius: [1.06, 1.04, 0.97, 1.00, 1.10, 0.90, 1.09, 1.06],
        angle:  [1, -3, -5, -5, 5, 5, -6, -5]
      }
    },
    hitPad: 12,                  // beam centre counts as "over" a fragment within this padding

    beam: {
      radius: 145,               // stage units, to the edge of the soft falloff
      lagMs: 70,                 // the light follows the hand with a little weight (time constant).
                                 // The tracker records the light's centre, i.e. what was actually lit.
      wander: 0.12,              // the hotspot drifts slowly off-centre by up to this fraction of the radius
      dust: 320,                 // motes in the air, visible only inside the beam (0 to switch off)
      fadeMs: 4000,              // the lamp falters and dims over the last few seconds, so the end isn't a surprise
      fadeTo: 0.55               // brightness at the very end (text stays readable)
    },
    sound: {
      room: 0.05,                // room tone level (0–1)
      hum: 0.035,                // the lamp's hum
      buzz: 0.25,                // the lamp's buzzing edge, relative to the hum
      spark: 0.22,               // the tick each time the lamp catches during the blink, and the odd crackle
      click: 0.5
    },
    dim: {
      // Concealment by darkness: cut letters catching the faintest ambient light, under grain.
      alpha: 0.042,              // text brightness before the light. Check by eye on the pilot screen: present, not readable.
                                 // Screens vary a lot here: raise if the fragments vanish, lower if words can be made out
      blurPx: 2.4                // stage units
    },

    thresholds: {
      minVisitMs: 150,           // shorter passes are brush-pasts, not visits
      mergeGapMs: 150,           // leaving a fragment for less than this does not start a new visit
      touchMs: 150,              // cumulative dwell for a fragment to count as "touched"
      readMs: 3000,              // PROVISIONAL cumulative dwell for "plausibly read". Not a hard truth.
      idleMs: 8000,              // pointer still for longer than this = idle (reading one fragment takes ~5–6 s)
      idleMoveUnits: 2,          // movement smaller than this counts as still
      maxSampleGapMs: 5000       // a gap this long with no recorded pause is treated as lost time, not dwell
    },

    readingWpm: 238,             // silent reading of non-fiction (Brysbaert 2019); used only for metadata

    randomise: { shuffle: true },

    storageKey: 't3-thing000-sessions',
    soundKey: 't3-thing000-sound',
    queueKey: 't3-thing000-unsent'
  };

  /* ---------- Pilot (the shareable online test) ----------
     When the page is served online and submitUrl is set, it runs as the pilot: consent and first name first,
     results sent to Chan's private Google Sheet at the end, no researcher view for testers.
     Opened locally (file:// or localhost) it stays as before, with the researcher view; add ?pilot to test
     the pilot flow locally. */
  T0.pilot = {
    // the Apps Script "Receive" web-app URL (not a secret: it can only accept well-formed sessions)
    submitUrl: 'https://script.google.com/macros/s/AKfycbzcQSTz5GdromchoAxSm6ScN3M21mcvdJK3nr4Z_lB-fXIjsBWMQytsugqqRBhUCiA3CA/exec',
    consent: {
      label: 'Test version',
      title: 'Before you start',
      lines: [
        'This is an early test of an interactive piece by Chan at Thing 3. It takes about two minutes, on a laptop or desktop, ideally with sound on.',
        'What’s recorded: your first name, whether you use a mouse or trackpad, how you move a light around the screen and for how long, and one question at the end. No email, location or cookies.',
        'Only Chan can see it. It’s deleted when testing finishes. Nothing is saved unless you reach the end, and you can ask Chan to delete your data at any time.'
      ],
      nameLabel: 'Your first name',
      deviceLabel: 'You’re using a',
      agree: 'I’m happy to take part'
    },
    // the intro is honest about the test's length
    introLines: [
      'A short piece in a few parts. This test is about two minutes.',
      'You start in the dark.'
    ],
    end: {
      title: 'That’s the end of the test.',
      question: 'One last question: have you studied psychology?',
      options: ['No', 'A little (A level, a module or two)', 'Yes, a degree or more'],
      finish: 'Finish',
      saving: 'Saving…',
      saved: 'Saved. Thank you. You can close this page now.',
      failed: 'That didn’t save. Please check your connection and try again; your answers are kept until it works.',
      retry: 'Try again',
      ask: 'Please don’t describe what you saw to anyone who might take part.'
    }
  };

  /* ---------- Opening (provisional, approved for Stage 1) ---------- */
  T0.intro = {
    title: 'Thing_000',
    lines: [
      'A short piece in a few parts. About 10 minutes.',
      'You start in the dark.'
    ],
    part: 'Part 1: Explore.',
    // 2026-10-16 (d): no deadline framing. The first pilot tester rushed to "finish" against "You'll have 75
    // seconds", then asked "what do I do now?" in the free time that matters most (after seeing all eight).
    partNote: 'Once your light is on, look around until it goes out (a little over a minute). There’s nothing to finish.',
    // 2026-10-16 (Chan): the centre "Explore" word and the "You have N seconds" line after the switch
    // were dropped as repetition. The Part screen says it once; the corner timer does the rest.
    handover: [
      'That’s the end of Part 1 for now.',
      'Thank you. Please hand back to the person running the session.'
    ]
  };

  /* ---------- Fragments ----------
     All eight share one typography and one reveal behaviour; nothing here can make one look different.
     Matched on form: two sentences, 19–23 words, 113–124 characters.
     Copy c (2026-10-16): each control is one everyday example plus one plain claim, so it reads in one pass
     the way E does. Readability formulas only count word and sentence length; conceptual ease was judged by reading. */
  T0.fragments = [
    { id: 'E', engineered: true, concept: null,      // LOCKED 2026-10-10
      text: 'Your attention may linger here longer than elsewhere. If it does, there is a reason — but it isn’t said outright.' },
    { id: 'gap', concept: 'information-gap',          // Loewenstein 1994: a specific, known gap drives curiosity
      text: 'One missing answer can nag at people more than a total mystery. That itch to fill the hole is an information gap.' },
    { id: 'relevance', concept: 'personal-relevance', // own-name detection (Moray 1959; Wood & Cowan 1995); self-reference and memory
      text: 'People can pick out their own name across a noisy room. Things with personal relevance stand out and are easier to remember.' },
    { id: 'meta', concept: 'metacognition',           // confidence and accuracy can come apart
      text: 'Feeling sure of an answer is not the same as being right. Metacognition is the inner sense of how much is really known.' },
    { id: 'expect', concept: 'expectation',
      text: 'A plot twist only works because something else was expected. Predictions shape what people notice, and surprises stand out.' },
    { id: 'gen', concept: 'generation',
      text: 'Answers people work out for themselves tend to stick better than answers they are handed. That is the generation effect.' },
    { id: 'social', concept: 'social-proof',
      text: 'A busy restaurant often seems better than an empty one. When unsure, people use social proof and follow what others do.' },
    { id: 'framing', concept: 'framing',              // cash discount vs card surcharge (Thaler 1980); no digits, so no glyph stands out
      text: 'The same price feels better as a discount than as an extra charge. Framing changes how a choice feels, not what it is.' }
  ];

  /* ---------- Concept matrix (used from Stage 4 onwards; recorded now so it stays one source of truth) ----------
     inSentence / elsewhere: 'yes' | 'partial' | 'no'. */
  T0.concepts = [
    { id: 'information-gap', label: 'Information gap', inSentence: 'yes', elsewhere: 'partial',
      note: 'Sentence: "there is a reason — but it isn’t said outright" (a mild hint that it can be worked out). Elsewhere: every blurred fragment, and the questions that hold back answers.' },
    { id: 'personal-relevance', label: 'Personal relevance', inSentence: 'yes', elsewhere: 'no',
      note: 'Direct address ("your attention"). Related to, not a reproduction of, the classic self-reference effect.' },
    { id: 'metacognition', label: 'Metacognition', inSentence: 'partial', elsewhere: 'yes',
      note: 'Sentence only invites noticing one’s own attention. Elsewhere: "Which fragment did you inspect longest?"' },
    { id: 'expectation', label: 'Expectation / prediction', inSentence: 'yes', elsewhere: 'yes',
      note: 'Sentence: "may linger here longer". Elsewhere: committing to hypotheses before the evidence.' },
    { id: 'generation', label: 'Generation', inSentence: 'no', elsewhere: 'yes',
      note: 'Explaining in one’s own words: a form of generation, closer to self-explanation.' },
    { id: 'social-proof', label: 'Social proof', inSentence: 'no', elsewhere: 'no',
      guard: 'Never show aggregate visitor statistics, "most people…" copy or testimonials while this stays unused.' },
    { id: 'framing', label: 'Framing', inSentence: 'no', elsewhere: 'no',
      guard: 'Never use gain/loss contrasts or equivalent framing manipulations in copy while this stays unused.' }
  ];

  // Named only in the reveal, never on the opening screen.
  T0.revealOnly = [
    { id: 'distinctiveness', label: 'Distinctiveness', inSentence: 'partial',
      note: 'It was the only fragment speaking to the visitor. Contextual, not a separate device; minimised structurally, acknowledged honestly.' }
  ];
})();
