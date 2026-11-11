'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { SpotifyClient } = require('../src/main/spotify-client');

class FakeSource extends EventEmitter {
  constructor() { super(); this.last = null; }
  current() { return this.last; }
  push(raw) { this.last = raw; this.emit('state', raw); }
}

function makeClient(source) {
  const client = new SpotifyClient({
    tokenStore: { load: () => null, save() {}, clear() {} },
    getClientId: () => '',
    getPollInterval: () => 3000,
    localSource: source
  });
  return client;
}

const SONG = { found: true, title: 'Song', artist: 'Artist', album: 'Album', playing: true, positionMs: 1000, durationMs: 180000 };

test('desktop source drives playback without a Spotify login', () => {
  const src = new FakeSource();
  const client = makeClient(src);
  const seen = [];
  client.on('playback', (s) => seen.push(s));
  src.push(Object.assign({ art: 'data:image/png;base64,AAAA' }, SONG));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].active, true);
  assert.equal(seen[0].track.title, 'Song');
  assert.equal(seen[0].track.artists, 'Artist');
  assert.equal(seen[0].track.artUrl, 'data:image/png;base64,AAAA');
  assert.equal(client.usingLocal(), true);
});

test('desktop source keeps art and skips updates when nothing changed', () => {
  const src = new FakeSource();
  const client = makeClient(src);
  const seen = [];
  client.on('playback', (s) => seen.push(s));
  src.push(Object.assign({ art: 'data:image/png;base64,AAAA' }, SONG));
  src.push(Object.assign({}, SONG, { positionMs: 1500 })); // no `art` key: same track
  assert.equal(seen.length, 1);
  src.push(Object.assign({}, SONG, { playing: false }));
  assert.equal(seen.length, 2);
  assert.equal(seen[1].isPlaying, false);
  assert.equal(seen[1].track.artUrl, 'data:image/png;base64,AAAA');
});

test('desktop source clears a Web API rate-limit error', () => {
  const src = new FakeSource();
  const client = makeClient(src);
  client.lastError = 'Rate limited by Spotify, retrying in 16h 1m';
  src.push(SONG);
  assert.equal(client.lastError, null);
});

test('losing the desktop app empties playback', () => {
  const src = new FakeSource();
  const client = makeClient(src);
  const seen = [];
  client.on('playback', (s) => seen.push(s));
  src.push(SONG);
  src.push({ found: false });
  assert.equal(seen.at(-1).active, false);
  assert.equal(client.usingLocal(), false);
});
