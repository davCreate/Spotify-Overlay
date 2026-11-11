'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pets = require('../src/shared/pets');
const themes = require('../src/shared/themes');
const { SettingsStore, ENUMS } = require('../src/main/store');

test('every pet has an id, a name and an SVG with the animated parts', () => {
  assert.ok(pets.PETS.length >= 1);
  for (const p of pets.PETS) {
    assert.match(p.id, /^[a-z-]+$/);
    assert.ok(p.name && p.description);
    assert.ok(p.armReach > 0 && p.armReach <= 1);
    const svg = p.svg();
    for (const part of ['pet-body', 'pet-eye', 'pet-leg-a', 'pet-leg-b', 'pet-arm-front', 'pet-arm-back', 'pet-mouth']) {
      assert.ok(svg.includes(part), `${p.id} is missing ${part}`);
    }
    assert.ok(!/<script|on\w+=/i.test(svg), 'pet SVG must not contain scripts or handlers');
    // Each call gets its own gradient ids so several pets can share a page.
    assert.notEqual(svg.match(/id="([^"]+)-body"/)[1], p.svg().match(/id="([^"]+)-body"/)[1]);
  }
  assert.equal(pets.findPet('nope').id, pets.PETS[0].id);
});

test('the pet type setting accepts exactly the pets in the catalog', () => {
  assert.deepEqual(ENUMS['pet.type'], pets.PETS.map((p) => p.id));
});

test('pet settings are validated and clamped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'so-pets-'));
  const store = new SettingsStore(dir);
  assert.equal(store.get().pet.enabled, false);
  store.set('pet.enabled', true);
  assert.equal(store.set('pet.size', 9), 2);
  assert.equal(store.set('pet.speed', 0), 0.5);
  assert.throws(() => store.set('pet.side', 'top'));
  assert.equal(store.get().pet.enabled, true);
});

test('every theme effect has overlay CSS', () => {
  const css = ['overlay.css', 'effects-3d.css']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'overlay', f), 'utf8'))
    .join('\n');
  for (const id of Object.keys(themes.EFFECTS)) {
    if (id === 'none') continue;
    assert.ok(css.includes(`.fx-${id}`), `no CSS for effect ${id}`);
  }
});

test('pet color and accessory settings match the catalog', () => {
  assert.deepEqual(ENUMS['pet.color'], Object.keys(pets.PALETTES));
  assert.deepEqual(ENUMS['pet.accessory'], pets.ACCESSORIES);
  const svg = pets.PETS[0].svg();
  for (const acc of ['tophat', 'headphones', 'bowtie', 'glasses']) {
    assert.ok(svg.includes(`pet-acc-${acc}`), `missing accessory ${acc}`);
  }
  assert.ok(svg.includes('pet-yawn'), 'missing yawn mouth');
});
