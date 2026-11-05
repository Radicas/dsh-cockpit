#!/usr/bin/env node
/**
 * ethercheck — drives the ether particle system without a browser.
 *
 * Verifies four things the DOM-less selfcheck cannot:
 *   1. the canvas mounts on document.body and is removed on dispose
 *   2. a launch schedules exactly one rAF and draws on the next frames
 *   3. particles are consumed, arrival flashes expire, and the loop STOPS
 *      (a decorative effect that keeps a rAF running forever is a battery bug)
 *   4. nothing throws when the send ring or the input field is missing
 *
 * Usage: node ethercheck.cjs
 */

'use strict';

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

// ── DOM / canvas / rAF mocks ───────────────────────────────────────────────
const drawCalls = [];
let rafQueue = [];
let rafNext = 1;
const appended = [];

const ctx2d = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === 'setTransform') return () => drawCalls.push('setTransform');
      if (key === 'clearRect') return () => drawCalls.push('clearRect');
      if (key === 'beginPath') return () => drawCalls.push('beginPath');
      if (key === 'arc') return () => drawCalls.push('arc');
      if (key === 'fill') return () => drawCalls.push('fill');
      if (key === 'stroke') return () => drawCalls.push('stroke');
      if (key === 'moveTo') return () => drawCalls.push('moveTo');
      if (key === 'lineTo') return () => drawCalls.push('lineTo');
      if (typeof key === 'string' && /Style$|^lineWidth$|^globalCompositeOperation$/.test(key)) return undefined;
      return undefined;
    },
    set() {
      return true;
    },
  },
);

function makeCanvas() {
  const node = {
    tagName: 'CANVAS',
    style: {},
    width: 0,
    height: 0,
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getContext() {
      return ctx2d;
    },
    parentNode: null,
  };
  return node;
}

// Two rects: the input field and the send ring.
const RECTS = {
  '.uV2eYG_input': { left: 400, top: 700, right: 1200, bottom: 760, width: 800, height: 60 },
  '.uV2eYG_card': { left: 400, top: 700, right: 1200, bottom: 760, width: 800, height: 60 },
  '.uV2eYG_primary': { left: 1206, top: 706, right: 1244, bottom: 744, width: 38, height: 38 },
};

let domPresent = true;

global.document = {
  hidden: false,
  body: {
    appendChild(node) {
      node.parentNode = this;
      appended.push(node);
      if (node.tagName === 'CANVAS') document.__canvas = node;
      return node;
    },
    removeChild(node) {
      node.parentNode = null;
      const i = appended.indexOf(node);
      if (i >= 0) appended.splice(i, 1);
      return node;
    },
  },
  createElement(tag) {
    return makeCanvas();
  },
  querySelector(sel) {
    if (!domPresent) return null;
    if (RECTS[sel] == null) return null;
    // Only hand back a node while the canvas is mounted, i.e. while "the page" exists.
    return { getBoundingClientRect: () => RECTS[sel] };
  },
  documentElement: { style: { setProperty() {} } },
  head: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  removeEventListener() {},
  visibilityState: 'visible',
  querySelectorAll() {
    return [];
  },
};

global.window = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame(cb) {
    const id = rafNext++;
    rafQueue.push({ id, cb });
    return id;
  },
  cancelAnimationFrame(id) {
    rafQueue = rafQueue.filter((r) => r.id !== id);
  },
};

// ── React stub ─────────────────────────────────────────────────────────────
const passthrough = (tag) => (props, ...kids) => ({ tag, props, kids });
const React = {
  createElement: passthrough('el'),
  Fragment: 'fragment',
  Component: class {},
  useEffect() {},
  useRef(v) {
    return { current: v };
  },
  useState(v) {
    return [typeof v === 'function' ? v() : v, () => {}];
  },
  useMemo(fn) {
    return fn();
  },
  useCallback(fn) {
    return fn;
  },
  memo: (c) => c,
};

// ── Cordis context stub: capture effects by label ──────────────────────────
const effects = [];
const registrations = [];
const warnings = [];
const ctx = {
  effect(fn, label) {
    let dispose = null;
    try {
      dispose = fn();
    } catch (e) {
      fail('effect threw (' + label + '): ' + e.message);
    }
    effects.push({ label: label, dispose: dispose });
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  },
  slots: {
    inject: (name, fn) => {
      if (typeof fn === 'function') fn();
      return fn;
    },
    register: (spec, comp) => {
      registrations.push(spec.id);
      return () => {};
    },
  },
  locale: {
    bind: () => (k) => k,
    register: () => () => {},
    subscribe: () => () => {},
  },
  theme: { overrideTokens: () => () => {}, tokens: () => ({}) },
  logger: { warn: (...a) => warnings.push(a.join(' ')), info() {}, debug() {}, error(...a) { warnings.push(a.join(' ')); } },
  on: () => () => {},
  store: { get: () => undefined, subscribe: () => () => {} },
};

// ── Load the plugin ────────────────────────────────────────────────────────
let factory = null;
global.window.__ModuleLoader__ = {
  load(spec) {
    factory = spec.factory;
  },
};

try {
  require('./client.js');
} catch (e) {
  fail('client.js failed to load: ' + e.message);
}

if (factory == null) {
  fail('factory was not registered with __ModuleLoader__');
} else {
  try {
    const mod = factory((name) => {
      if (name === 'react') return React;
      throw new Error('unexpected require: ' + name);
    });
    if (mod == null || typeof mod.apply !== 'function') fail('plugin module has no apply()');
    else mod.apply(ctx);
  } catch (e) {
    fail('factory/apply threw: ' + e.message);
  }
}

// ── Assertions ─────────────────────────────────────────────────────────────
const ether = effects.find((e) => e.label != null && e.label.includes('ether'));
if (ether == null) {
  fail('ether effect was never registered');
} else if (typeof ether.dispose !== 'function') {
  fail('ether effect did not return a disposer (mountEther bailed out)');
} else if (typeof ether.dispose.__launch !== 'function') {
  fail('ether disposer has no __launch seam — mount did not reach the loop');
} else {
  const canvas = document.__canvas;
  if (canvas == null) fail('canvas was not appended to document.body');
  else {
    notes.push('canvas mounted ' + canvas.width + 'x' + canvas.height + ' (dpr 2 of 1440x900)');
    if (canvas.attributes['aria-hidden'] !== 'true') fail('canvas is not aria-hidden');
  }

  const launch = ether.dispose.__launch;

  // A launch with a missing ring must not throw.
  const realQuery = document.querySelector;
  document.querySelector = () => null;
  try {
    launch(3);
  } catch (e) {
    fail('launch threw when the ring was missing: ' + e.message);
  }
  document.querySelector = realQuery;

  // Real launch: expect one scheduled frame.
  rafQueue = [];
  launch(3);
  if (rafQueue.length !== 1) fail('launch scheduled ' + rafQueue.length + ' frames, expected 1');

  // Drive frames at 16ms until the loop stops or we exceed the budget.
  let ts = 0;
  let frames = 0;
  while (rafQueue.length > 0 && frames < 400) {
    const batch = rafQueue;
    rafQueue = [];
    ts += 16;
    frames += 1;
    for (const r of batch) {
      try {
        r.cb(ts);
      } catch (e) {
        fail('frame threw at tick ' + frames + ': ' + e.message);
        rafQueue = [];
        break;
      }
    }
  }

  const strokes = drawCalls.filter((d) => d === 'stroke').length;
  const fills = drawCalls.filter((d) => d === 'fill').length;
  if (strokes === 0) fail('no strokes were drawn — particles never rendered');
  if (fills === 0) fail('no particle heads were filled');
  if (rafQueue.length > 0) fail('rAF loop still running after ' + frames + ' frames — it must stop when idle');
  if (frames >= 400) fail('loop never terminated within 400 frames');
  notes.push(frames + ' frames, ' + strokes + ' strokes, ' + fills + ' fills, loop stopped cleanly');

  // Clearing must have happened at least once.
  if (!drawCalls.includes('clearRect')) fail('canvas was never cleared');

  // Dispose removes the canvas.
  ether.dispose();
  if (document.__canvas != null && document.__canvas.parentNode != null) {
    fail('dispose left the canvas attached');
  }
  if (appended.length !== 0) fail('dispose left ' + appended.length + ' node(s) attached');
  else notes.push('dispose removed the canvas');
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log('registrations: ' + registrations.length + ' | ' + registrations.join(', '));
for (const n of notes) console.log('  ok  ' + n);
if (warnings.length > 0) {
  console.log('warnings: ' + warnings.length);
  for (const w of warnings.slice(0, 5)) console.log('  !   ' + w);
}
if (failures.length > 0) {
  console.error('\nETHER-CHECK FAILED');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('\nETHER-CHECK PASSED');
