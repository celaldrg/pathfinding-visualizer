import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MinHeap } from '../src/heap.js';
import { createRng } from '../src/rng.js';

const byNumber = (a, b) => a < b;

test('pops numbers in ascending order', () => {
  const rng = createRng(3);
  const values = Array.from({ length: 500 }, () => rng.int(100));
  const heap = new MinHeap(byNumber);
  for (const value of values) heap.push(value);
  assert.equal(heap.size, values.length);
  const popped = [];
  while (heap.size > 0) popped.push(heap.pop());
  assert.deepEqual(
    popped,
    [...values].sort((a, b) => a - b),
  );
});

test('pop on an empty heap returns undefined', () => {
  const heap = new MinHeap(byNumber);
  assert.equal(heap.pop(), undefined);
  heap.push(1);
  assert.equal(heap.pop(), 1);
  assert.equal(heap.pop(), undefined);
  assert.equal(heap.size, 0);
});

test('stays ordered under interleaved pushes and pops', () => {
  const rng = createRng(11);
  const heap = new MinHeap(byNumber);
  const model = [];
  for (let i = 0; i < 2000; i++) {
    if (model.length > 0 && rng.next() < 0.4) {
      model.sort((a, b) => a - b);
      assert.equal(heap.pop(), model.shift());
    } else {
      const value = rng.int(50);
      heap.push(value);
      model.push(value);
    }
    assert.equal(heap.size, model.length);
  }
});

test('a comparator with an insertion counter breaks ties first-in, first-out', () => {
  const heap = new MinHeap((a, b) => (a.key !== b.key ? a.key < b.key : a.order < b.order));
  const keys = [2, 1, 2, 1, 2, 1];
  keys.forEach((key, order) => heap.push({ key, order }));
  const orders = [];
  while (heap.size > 0) orders.push(heap.pop().order);
  assert.deepEqual(orders, [1, 3, 5, 0, 2, 4]);
});
