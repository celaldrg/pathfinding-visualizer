import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ALGORITHMS } from '../src/algorithms.js';
import { resolveBoardKey, resolveShortcut } from '../src/shortcuts.js';

const press = (key, modifiers = {}) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers });

describe('resolveShortcut', () => {
  test('maps the documented keys to commands', () => {
    assert.deepEqual(resolveShortcut(press(' '), 'other'), { name: 'primary' });
    assert.deepEqual(resolveShortcut(press('c'), 'other'), { name: 'clear-path' });
    assert.deepEqual(resolveShortcut(press('C', { shiftKey: true }), 'other'), { name: 'clear-board' });
    assert.deepEqual(resolveShortcut(press('m'), 'other'), { name: 'maze' });
    assert.deepEqual(resolveShortcut(press('w'), 'other'), { name: 'brush' });
  });

  test('ignores Caps Lock and Shift where they make no difference', () => {
    assert.deepEqual(resolveShortcut(press('C'), 'other'), { name: 'clear-path' });
    assert.deepEqual(resolveShortcut(press('M', { shiftKey: true }), 'other'), { name: 'maze' });
    assert.deepEqual(resolveShortcut(press('W'), 'other'), { name: 'brush' });
  });

  test('digits 1-5 pick the algorithms in menu order and other digits do nothing', () => {
    const ids = Object.keys(ALGORITHMS);
    assert.equal(ids.length, 5);
    ids.forEach((id, index) => {
      assert.deepEqual(resolveShortcut(press(String(index + 1)), 'other'), { name: 'algorithm', algorithm: id });
    });
    for (const key of ['0', '6', '9']) assert.equal(resolveShortcut(press(key), 'other'), null);
  });

  test('leaves browser and system shortcuts alone', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      assert.equal(resolveShortcut(press('c', { [modifier]: true }), 'other'), null, modifier);
      assert.equal(resolveShortcut(press(' ', { [modifier]: true }), 'other'), null, modifier);
    }
    for (const key of ['x', 'Escape', 'Tab', 'F5', 'ArrowUp', 'Enter']) {
      assert.equal(resolveShortcut(press(key), 'other'), null, key);
    }
  });

  test('lets focused controls keep their own keys', () => {
    for (const key of [' ', 'c', '1', 'm']) assert.equal(resolveShortcut(press(key), 'text'), null, key);
    assert.equal(resolveShortcut(press(' '), 'button'), null, 'Space presses the focused button');
    assert.equal(resolveShortcut(press('Enter'), 'button'), null);
    assert.deepEqual(resolveShortcut(press('c'), 'button'), { name: 'clear-path' });
    assert.deepEqual(resolveShortcut(press('2'), 'button'), { name: 'algorithm', algorithm: 'dijkstra' });
  });
});

describe('resolveBoardKey', () => {
  test('arrow keys move the cursor one cell', () => {
    assert.deepEqual(resolveBoardKey(press('ArrowUp')), { name: 'move', dRow: -1, dCol: 0 });
    assert.deepEqual(resolveBoardKey(press('ArrowDown')), { name: 'move', dRow: 1, dCol: 0 });
    assert.deepEqual(resolveBoardKey(press('ArrowLeft')), { name: 'move', dRow: 0, dCol: -1 });
    assert.deepEqual(resolveBoardKey(press('ArrowRight')), { name: 'move', dRow: 0, dCol: 1 });
  });

  test('Enter paints with the brush and Shift+Enter places a weight', () => {
    assert.deepEqual(resolveBoardKey(press('Enter')), { name: 'paint', weight: false });
    assert.deepEqual(resolveBoardKey(press('Enter', { shiftKey: true })), { name: 'paint', weight: true });
  });

  test('S and E move the start and the end to the cursor', () => {
    assert.deepEqual(resolveBoardKey(press('s')), { name: 'place', endpoint: 'start' });
    assert.deepEqual(resolveBoardKey(press('S', { shiftKey: true })), { name: 'place', endpoint: 'start' });
    assert.deepEqual(resolveBoardKey(press('e')), { name: 'place', endpoint: 'end' });
    assert.deepEqual(resolveBoardKey(press('E')), { name: 'place', endpoint: 'end' });
  });

  test('passes every other key on to the page shortcuts', () => {
    for (const key of [' ', 'c', 'm', '1', 'Escape', 'Tab']) assert.equal(resolveBoardKey(press(key)), null, key);
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      assert.equal(resolveBoardKey(press('ArrowUp', { [modifier]: true })), null, modifier);
      assert.equal(resolveBoardKey(press('s', { [modifier]: true })), null, modifier);
    }
  });
});
