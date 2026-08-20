// Test setup: register a fake 'electron' module in require.cache so that
// `require('electron')` in source code resolves to a Proxy that forwards
// to the live mock set via `globalThis.__cb_electron_mock__`.
//
// Why this is needed:
// - SettingTabTts.ts uses `require('electron')` (per brief) to lazily load
//   electron at click time (so the dependency doesn't run at module-load
//   in environments where electron isn't installed).
// - vitest's `vi.mock('electron', ...)` intercepts ESM `import` but not
//   Node's CJS `require`. Without this setup, the require call throws
//   "Cannot find module 'electron'" in test.
// - Solution: register a fake module in require.cache before any test runs.
//   The fake uses a Proxy so each test can swap the mock via
//   `globalThis.__cb_electron_mock__` without re-requiring.

const path = require('path');

const fakeElectronPath = path.join(__dirname, '__mocks__electron-shim.cjs');

// Build the shim factory once and cache it on a fixed id so it's reused.
function buildShim() {
  const g = globalThis;
  const defaultMock = { shell: { openPath: function () { return Promise.resolve(''); } } };
  const proxy = new Proxy({}, {
    get(_t, prop) {
      const m = g.__cb_electron_mock__ || defaultMock;
      return m[prop];
    },
    has(_t, prop) {
      const m = g.__cb_electron_mock__ || defaultMock;
      return prop in m;
    },
  });
  return proxy;
}

require.cache[fakeElectronPath] = {
  id: fakeElectronPath,
  filename: fakeElectronPath,
  loaded: true,
  exports: buildShim(),
  children: [],
  paths: [],
  path: path.dirname(fakeElectronPath),
};

// Patch Module._resolveFilename so 'electron' resolves to our shim path.
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'electron') return fakeElectronPath;
  return origResolve.call(this, request, ...args);
};