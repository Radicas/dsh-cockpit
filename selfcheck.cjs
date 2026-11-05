/* Release self-check: evaluates client.js against a mock module loader and a
   mock Cordis context (stubs for React/DOM/canvas/slots/locale/theme/effect).
   Catches factory-time crashes that node --check cannot — missing constants,
   bad references, guard failures. Exit 0 = safe to install.

   Usage: node selfcheck.js
*/
let loadArg = null;
global.window = {
  __ModuleLoader__: { load: (a) => { loadArg = a; } },
  location: { hostname: '127.0.0.1' },
  matchMedia: () => ({ matches: false }),
};
const ctxStub = () => ({
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  fillRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
  beginPath: () => {}, arc: () => {}, fill: () => {},
});
global.document = {
  addEventListener: () => {},
  hidden: false,
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ctxStub(),
    toDataURL: () => 'data:image/png;base64,AA',
  }),
  documentElement: { style: { setProperty: () => {} } },
};

class Component { setState() {} forceUpdate() {} }
const React = {
  createElement: (t, p, ...k) => ({ t, p, k }),
  Component,
  Fragment: 'FRAG',
  useState: (v) => [v, () => {}],
  useEffect: () => () => {},
  useRef: (v) => ({ current: v }),
  useMemo: (f) => f(),
  useCallback: (f) => f,
};

let failures = [];
const origWarn = console.warn.bind(console);
console.warn = (...a) => { failures.push(a.join(' ')); origWarn(...a); };

try {
  require('./client.js');
  if (loadArg == null) throw new Error('module did not register with __ModuleLoader__');
  const api = loadArg.factory((name) => (name === 'react' ? React : function () {}));
  const registered = [];
  const ctx = {
    locale: { bind: () => (k) => k, register: () => {}, subscribe: () => () => {} },
    theme: { overrideTokens: () => () => {} },
    effect: (fn) => { try { fn(); } catch (e) { failures.push('effect threw: ' + e.message); } return () => {}; },
    slots: {
      inject: (n, fn) => fn(),
      register: (m) => { registered.push(String(m.id || m.name)); return () => {}; },
    },
    on: () => () => {},
    config: {},
  };
  api.apply(ctx);
  setTimeout(() => {
    console.log('registrations:', registered.length, '|', registered.join(', '));
    if (failures.length > 0) {
      console.log('SELF-CHECK FAILED — warnings:', failures.length);
      for (const f of failures) console.log('  -', f);
      process.exit(1);
    }
    if (registered.length < 8) {
      console.log('SELF-CHECK FAILED — expected >= 8 registrations, got', registered.length);
      process.exit(1);
    }
    console.log('SELF-CHECK PASSED');
    process.exit(0);
  }, 250);
} catch (e) {
  console.log('SELF-CHECK FAILED — runtime error:', e && e.message);
  console.log(e && e.stack ? e.stack.split('\n').slice(1, 5).join('\n') : '');
  process.exit(1);
}
