import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSetting, saveSetting } from '../src/storage.js';

function memoryStore() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const brokenStore = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

test('saves JSON under a prefixed key and reads it back', () => {
  const store = memoryStore();
  assert.equal(saveSetting('speed', 'fast', store), true);
  assert.equal(saveSetting('flags', { a: [1, 2] }, store), true);
  assert.deepEqual([...store.items.keys()], ['pathfinding-visualizer.speed', 'pathfinding-visualizer.flags']);
  assert.equal(loadSetting('speed', 'normal', undefined, store), 'fast');
  assert.deepEqual(loadSetting('flags', null, undefined, store), { a: [1, 2] });
});

test('returns the fallback for missing, malformed or rejected values', () => {
  const store = memoryStore();
  assert.equal(loadSetting('lang', 'en', undefined, store), 'en');
  store.items.set('pathfinding-visualizer.lang', '{not json');
  assert.equal(loadSetting('lang', 'en', undefined, store), 'en');
  store.items.set('pathfinding-visualizer.lang', '"de"');
  assert.equal(loadSetting('lang', 'en', (value) => value === 'en' || value === 'tr', store), 'en');
  store.items.set('pathfinding-visualizer.lang', '"tr"');
  assert.equal(loadSetting('lang', 'en', (value) => value === 'en' || value === 'tr', store), 'tr');
});

test('never throws when storage is blocked or full', () => {
  assert.equal(loadSetting('lang', 'en', undefined, brokenStore), 'en');
  assert.equal(saveSetting('lang', 'tr', brokenStore), false);
  assert.equal(saveSetting('cycle', { toJSON: () => 1n }, memoryStore()), false, 'unserialisable values are skipped');
});

test('uses globalThis.localStorage by default and copes without it', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
    assert.equal(loadSetting('lang', 'en'), 'en');
    assert.equal(saveSetting('lang', 'tr'), false);
    globalThis.localStorage = memoryStore();
    assert.equal(saveSetting('lang', 'tr'), true);
    assert.equal(loadSetting('lang', 'en'), 'tr');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
