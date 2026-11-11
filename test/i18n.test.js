'use strict';

/*
 * Checks that every UI string has a Spanish, French and Russian translation.
 * Strings are collected from tr()/translate()/rich() calls in the source, from the
 * settings schema and from the theme catalog. Run `node test/i18n.test.js --list`
 * to print the keys that are missing in each locale.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const i18n = require('../src/shared/i18n');
const themes = require('../src/shared/themes');
const pets = require('../src/shared/pets');

const SRC = path.join(__dirname, '..', 'src');
const SOURCE_FILES = [
  'renderer/settings/settings.js',
  'renderer/overlay/overlay.js',
  'main/main.js',
  'main/spotify-auth.js'
];

/** Strings that reach tr() through variables instead of literals. */
const DYNAMIC = [
  // Theme card tags (BG_LABELS in settings.js)
  'Solid', 'Gradient', 'Glass', 'Album art', 'Transparent',
  // Errors shown through tr(auth.error) / tr(u.error)
  'Could not reach GitHub. Check your internet connection and try again.',
  'No update information was found for this release yet. Try again later.',
  'GitHub is limiting requests right now. Try again in a few minutes.',
  'Your Spotify session expired. Please connect again.',
  'Enter a valid Spotify Client ID in Settings → Account first.',
  'Login was cancelled.',
  // Browser login result page titles (translate(title) in spotify-auth.js)
  'Already handled', 'Login failed', 'Login cancelled', 'Connected!',
  // Toasts passed to run() as okMessage
  'Overlay moved', 'Client ID saved', 'Port saved — update the Redirect URI in your Spotify app too', 'Disconnected',
  'Theme deleted', 'Theme reset to preset', 'Theme saved', 'Theme imported', 'Theme exported',
  'Settings reset (your Spotify connection was kept)', 'Settings exported', 'Settings imported',
  // Demo track album line
  'Preview track · nothing is playing'
];

/** Returns the text between `(` at `start` and its matching `)`, skipping string contents. */
function callSpan(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(start + 1, i);
  }
  return '';
}

function literals(code) {
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1].replace(/\\'/g, "'"));
  return out;
}

function collectKeys() {
  const keys = new Set(DYNAMIC);
  const add = (s) => { if (typeof s === 'string' && s.trim()) keys.add(s); };

  for (const rel of SOURCE_FILES) {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const re = /\b(tr|translate|rich|btn)\(/g;
    let m;
    while ((m = re.exec(src))) {
      const span = callSpan(src, m.index + m[1].length);
      const lits = literals(span);
      // rich() and btn(): only the first argument is translated.
      const picked = m[1] === 'rich' || m[1] === 'btn' ? lits.slice(0, 1) : lits;
      // Skip identifier-like literals used in conditions (e.g. 'ok', 'in-use').
      picked.filter((s) => /[A-Za-z]/.test(s) && !/^[a-z][a-z-]*$/.test(s)).forEach(add);
    }
  }

  // Settings schema
  const window = { SO_THEMES: themes, SO_I18N: i18n };
  vm.runInNewContext(fs.readFileSync(path.join(SRC, 'renderer/settings/schema.js'), 'utf8'), { window });
  for (const section of window.SO_SCHEMA.SECTIONS) {
    add(section.title);
    add(section.description);
    for (const g of section.groups || []) {
      add(g.title);
      (g.actions || []).forEach((a) => add(a.label));
      for (const f of g.fields) {
        add(f.label);
        add(f.help);
        const opts = typeof f.options === 'function' ? f.options() : f.options || [];
        opts.forEach((o) => add(o.label));
      }
    }
  }

  // Theme catalog
  themes.PRESETS.forEach((t) => add(t.description));
  pets.PETS.forEach((p) => add(p.description));
  themes.CATEGORIES.forEach((c) => { add(c.name); add(c.description); });
  Object.values(themes.EFFECTS).forEach((e) => add(e.label));
  Object.values(themes.FONTS).forEach((f) => add(f.label));

  // Language names are shown in their own language and are never translated.
  i18n.LANGUAGES.forEach((l) => keys.delete(l.name));
  return [...keys].sort();
}

const KEYS = collectKeys();

test('the key collector finds the UI strings', () => {
  assert.ok(KEYS.length > 250, `only ${KEYS.length} keys found`);
  assert.ok(KEYS.includes('Show overlay'));
  assert.ok(KEYS.includes('Overall size'));
  assert.ok(KEYS.includes('Check for updates…'));
});

for (const lang of ['es', 'fr', 'ru']) {
  test(`every UI string has a ${lang} translation`, () => {
    const dict = i18n.LOCALES[lang];
    const missing = KEYS.filter((k) => typeof dict[k] !== 'string' || !dict[k].trim());
    assert.deepEqual(missing, [], `${missing.length} missing in ${lang}`);
  });

  test(`${lang} translations keep every {placeholder}`, () => {
    const dict = i18n.LOCALES[lang];
    for (const k of KEYS) {
      if (typeof dict[k] !== 'string') continue;
      const want = (k.match(/\{\w+\}/g) || []).sort().join();
      const got = (dict[k].match(/\{\w+\}/g) || []).sort().join();
      assert.equal(got, want, `${lang}: "${k}"`);
    }
  });
}

test('language resolution and fallback', () => {
  assert.equal(i18n.resolveLanguage('auto', 'es-ES'), 'es');
  assert.equal(i18n.resolveLanguage('auto', 'de-DE'), 'en');
  assert.equal(i18n.resolveLanguage('ru', 'en-US'), 'ru');
  assert.equal(i18n.translate('fr', 'This text does not exist'), 'This text does not exist');
  assert.equal(i18n.translate('en', 'Version {version}', { version: '1.0.2' }), 'Version 1.0.2');
});

if (process.argv.includes('--list')) {
  for (const lang of ['es', 'fr', 'ru']) {
    const dict = i18n.LOCALES[lang] || {};
    const missing = KEYS.filter((k) => !dict[k]);
    console.log(`\n# ${lang}: ${missing.length} missing`);
    if (lang === 'es') missing.forEach((k) => console.log(JSON.stringify(k)));
  }
}
