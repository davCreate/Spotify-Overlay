'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { DEFAULT_SETTINGS, mergeWithDefaults, OPEN_KEYS } = require('../src/shared/defaults');
const themes = require('../src/shared/themes');
const { SettingsStore } = require('../src/main/store');
const { normalizePlayback, pickImage } = require('../src/main/spotify-client');
const { createPkcePair, redirectUri } = require('../src/main/spotify-auth');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'so-test-'));
}

test('mergeWithDefaults ignores unknown keys and wrong types', () => {
  const merged = mergeWithDefaults(DEFAULT_SETTINGS, { layout: { width: 500, bogus: 1, scale: 'big' }, nope: true }, OPEN_KEYS);
  assert.equal(merged.layout.width, 500);
  assert.equal(merged.layout.scale, DEFAULT_SETTINGS.layout.scale);
  assert.equal(merged.layout.bogus, undefined);
  assert.equal(merged.nope, undefined);
});

test('every preset theme only contains valid values', () => {
  const ids = new Set();
  for (const t of themes.PRESETS) {
    assert.ok(!ids.has(t.id), `duplicate theme id ${t.id}`);
    ids.add(t.id);
    for (const key of Object.keys(themes.THEME_FIELDS)) {
      assert.ok(themes.isValidThemeValue(key, t.values[key]), `${t.id}.${key} = ${t.values[key]}`);
    }
  }
  assert.ok(themes.PRESETS.length >= 15);
  assert.ok(themes.findTheme(DEFAULT_SETTINGS.themeId), 'default theme exists');
});

test('effective theme applies overrides and drops invalid ones', () => {
  const s = Object.assign({}, DEFAULT_SETTINGS, { themeOverrides: { accent: '#ff0000', bg: 'red', shadow: 999 } });
  const t = themes.getEffectiveTheme(s);
  assert.equal(t.accent, '#ff0000');
  assert.equal(t.bg, themes.PRESETS[0].values.bg);
  assert.equal(t.shadow, themes.PRESETS[0].values.shadow);
});

test('settings store validates, clamps and persists', () => {
  const dir = tmpDir();
  const store = new SettingsStore(dir);
  assert.equal(store.set('layout.width', 5000), 900);
  assert.throws(() => store.set('layout.width', 'wide'));
  assert.throws(() => store.set('layout.style', 'diagonal'));
  assert.throws(() => store.set('does.not.exist', 1));
  assert.throws(() => store.set('layout', {}));
  assert.throws(() => store.set('themeOverrides', {}));
  store.set('window.x', 120);
  store.setThemeValue('accent', '#123456');
  assert.throws(() => store.setThemeValue('accent', 'blue'));
  store.saveNow();
  const again = new SettingsStore(dir);
  assert.equal(again.get().layout.width, 900);
  assert.equal(again.get().window.x, 120);
  assert.equal(again.get().themeOverrides.accent, '#123456');
});

test('custom themes can be saved, applied and deleted', () => {
  const store = new SettingsStore(tmpDir());
  store.setThemeValue('accent', '#abcdef');
  const id = store.saveCustomTheme('Mine', themes.getEffectiveTheme(store.get()));
  let s = store.get();
  assert.equal(s.themeId, id);
  assert.deepEqual(s.themeOverrides, {});
  assert.equal(themes.getEffectiveTheme(s).accent, '#abcdef');
  store.deleteCustomTheme(id);
  s = store.get();
  assert.equal(s.customThemes.length, 0);
  assert.equal(s.themeId, DEFAULT_SETTINGS.themeId);
});

test('corrupt settings file falls back to defaults and is backed up', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ not json');
  const store = new SettingsStore(dir);
  assert.equal(store.get().layout.width, DEFAULT_SETTINGS.layout.width);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('settings.json.corrupt-')));
});

test('reset keeps account and window position', () => {
  const store = new SettingsStore(tmpDir());
  store.set('account.clientId', 'abcdef0123456789abcdef0123456789');
  store.set('window.x', 50);
  store.set('layout.width', 600);
  store.reset();
  const s = store.get();
  assert.equal(s.account.clientId, 'abcdef0123456789abcdef0123456789');
  assert.equal(s.window.x, 50);
  assert.equal(s.layout.width, DEFAULT_SETTINGS.layout.width);
});

test('normalizePlayback handles tracks, episodes and empty responses', () => {
  const empty = normalizePlayback(null);
  assert.equal(empty.active, false);

  const track = normalizePlayback({
    is_playing: true,
    progress_ms: 1234,
    device: { name: 'PC' },
    item: {
      type: 'track', id: 't1', name: 'Song', duration_ms: 200000,
      artists: [{ name: 'A' }, { name: 'B' }],
      album: { name: 'Alb', images: [{ url: 'https://i/640', width: 640 }, { url: 'https://i/300', width: 300 }, { url: 'https://i/64', width: 64 }] },
      external_urls: { spotify: 'https://open.spotify.com/track/t1' }
    }
  });
  assert.equal(track.active, true);
  assert.equal(track.track.artists, 'A, B');
  assert.equal(track.track.artUrl, 'https://i/300');
  assert.equal(track.device, 'PC');

  const ep = normalizePlayback({
    is_playing: false,
    item: { type: 'episode', id: 'e1', name: 'Ep', duration_ms: 1000, images: [], show: { name: 'Show', publisher: 'Pub', images: [{ url: 'https://s/1', width: 600 }] } }
  });
  assert.equal(ep.track.artists, 'Show');
  assert.equal(ep.track.artUrl, 'https://s/1');
});

test('pickImage falls back to the largest image', () => {
  assert.equal(pickImage([{ url: 'a', width: 64 }, { url: 'b', width: 128 }]), 'b');
  assert.equal(pickImage([]), null);
});

test('PKCE challenge is the base64url SHA-256 of the verifier', () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const expected = crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(challenge, expected);
  assert.equal(redirectUri(8888), 'http://127.0.0.1:8888/callback');
});
