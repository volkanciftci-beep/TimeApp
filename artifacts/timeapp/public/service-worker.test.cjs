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