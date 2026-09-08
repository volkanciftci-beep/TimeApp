const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadFetchHandler() {
  const listeners = {};
  const context = {
    URL,
    fetch: () => {
      throw new Error('API request must not be handled by the service worker');
    },
    caches: {},
    self: {
      location: { origin: 'https://example.test' },
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8'),
    context,
  );
  return listeners.fetch;
}

test('same-origin /api/ GET requests bypass the service worker cache', () => {
  const fetchHandler = loadFetchHandler();
  let responded = false;

  fetchHandler({
    request: {
      method: 'GET',
      mode: 'cors',
      url: 'https://example.test/api/timeapp/me',
    },
    respondWith() {
      responded = true;
    },
  });

  assert.equal(responded, false);
});

test('static assets use the network before a cached fallback', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');

  assert.match(source, /fetch\(event\.request\)[\s\S]*\.catch\(\(\) => caches\.match\(event\.request\)\)/);
  assert.doesNotMatch(source, /cached \|\|[\s\S]*fetch\(event\.request\)/);
});

test('the app shell reloads once when a new service worker takes control', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.match(source, /updateViaCache: "none"/);
  assert.match(source, /controllerchange/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /registration\.update\(\)/);
});

test('an upgrade from the old cache refreshes already-open legacy clients', () => {
  const source = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');

  assert.match(source, /key\.startsWith\('zeitapp-pwa-'\)/);
  assert.match(source, /self\.clients\.matchAll\(\{ type: 'window' \}\)/);
  assert.match(source, /client\.navigate\(client\.url\)/);
});

test('production HTML and service worker files are never served from HTTP cache', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'serve.js'),
    'utf8',
  );

  assert.match(source, /fileName === 'service-worker\.js'/);
  assert.match(source, /'no-cache, no-store, must-revalidate'/);
});