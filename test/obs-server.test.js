'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { ObsServer } = require('../src/main/obs-server');

function get(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      if (res.headers['content-type'] === 'text/event-stream') {
        res.once('data', (chunk) => {
          resolve({ status: res.statusCode, body: chunk.toString() });
          req.destroy();
        });
        return;
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

test('OBS server serves the overlay, events and blocks traversal', async () => {
  const server = new ObsServer({ getSnapshot: () => ({ settings: { a: 1 }, playback: { active: false }, auth: { connected: false } }) });
  const port = 47000 + Math.floor(Math.random() * 1000);
  await server.start(port);
  try {
    const root = await get(port, '/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, '/overlay/index.html');

    const page = await get(port, '/overlay/index.html');
    assert.equal(page.status, 200);
    assert.match(page.body, /overlay\.js/);

    const shared = await get(port, '/shared/themes.js');
    assert.equal(shared.status, 200);

    const traversal = await get(port, '/overlay/..%2f..%2fmain%2fmain.js');
    assert.equal(traversal.status, 404);

    const badEncoding = await get(port, '/overlay/%E0%A4%A');
    assert.equal(badEncoding.status, 404);

    const events = await get(port, '/events');
    assert.equal(events.status, 200);
  } finally {
    await server.stop();
  }
  assert.equal(server.isRunning(), false);
});
