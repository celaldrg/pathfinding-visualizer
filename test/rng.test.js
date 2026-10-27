import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

const sample = (rng, count) => Array.from({ length: count }, () => rng.next());

test('the same seed gives the same sequence', () => {
  assert.deepEqual(sample(createRng(42), 100), sample(createRng(42), 100));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(sample(createRng(1), 20), sample(createRng(2), 20));
});

test('seeds are reduced to unsigned 32-bit integers', () => {
  assert.deepEqual(sample(createRng(2 ** 32 + 5), 10), sample(createRng(5), 10));
});

test('next() stays in [0, 1)', () => {
  for (const value of sample(createRng(7), 5000)) assert.ok(value >= 0 && value < 1);
});

test('int(n) returns every integer in [0, n) and nothing else', () => {
  const rng = createRng(99);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 6000; i++) {
    const value = rng.int(6);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 6);
    counts[value]++;
  }
  for (const count of counts) assert.ok(count > 800, `uneven distribution: ${counts}`);
});
