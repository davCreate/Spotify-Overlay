'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLrc } = require('../src/main/lyrics');

test('LRC lines are parsed, sorted and timed in milliseconds', () => {
  const lines = parseLrc('[00:12.50] Second\n[00:01.20]First\n[bad line]\n[01:02.00]   \n[00:20.00]Third');
  assert.deepEqual(lines, [
    { t: 1200, text: 'First' },
    { t: 12500, text: 'Second' },
    { t: 20000, text: 'Third' }
  ]);
});

test('empty or missing lyrics give no lines', () => {
  assert.deepEqual(parseLrc(null), []);
  assert.deepEqual(parseLrc(''), []);
});
