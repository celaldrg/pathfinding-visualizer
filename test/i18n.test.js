import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ALGORITHMS } from '../src/algorithms.js';
import { SPEEDS } from '../src/game.js';
import { LANGUAGES, STRINGS, isLanguage, otherLanguage, translate } from '../src/i18n.js';
import { MAZES } from '../src/mazes.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('string tables', () => {
  test('English is the default and both languages define the same keys', () => {
    assert.deepEqual(LANGUAGES, ['en', 'tr']);
    assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
  });

  test('no string is empty and both languages use the same placeholders', () => {
    for (const [key, english] of Object.entries(STRINGS.en)) {
      const turkish = STRINGS.tr[key];
      assert.ok(english.trim() && turkish.trim(), `${key} is empty`);
      assert.deepEqual(placeholders(turkish), placeholders(english), `${key} placeholders`);
    }
  });

  test('the Turkish table is a translation, not a copy', () => {
    const same = Object.keys(STRINGS.en).filter((key) => STRINGS.en[key] === STRINGS.tr[key]);
    // Only names and symbols read the same in both languages.
    assert.ok(same.length <= 10, `identical strings: ${same.join(', ')}`);
    assert.notEqual(STRINGS.tr['app.title'], STRINGS.en['app.title']);
  });

  test('every algorithm, maze, speed and guarantee level has its strings', () => {
    const keys = [
      ...Object.keys(ALGORITHMS).flatMap((id) => [`algo.${id}`, `short.${id}`, `about.${id}`]),
      ...Object.keys(MAZES).map((id) => `maze.${id}`),
      ...Object.keys(SPEEDS).map((id) => `speed.${id}`),
      ...Object.values(ALGORITHMS).map(({ shortest }) => `guarantees.${shortest}`),
    ];
    for (const key of keys) assert.ok(Object.hasOwn(STRINGS.en, key), `missing ${key}`);
  });

  test('every key the page refers to exists', () => {
    const keys = [...html.matchAll(/data-i18n(?:-aria-label|-title)?="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(keys.length > 50, 'the page is translated through data-i18n attributes');
    for (const key of keys) assert.ok(Object.hasOwn(STRINGS.en, key), `missing ${key}`);
  });

  test('every key written out in the scripts exists', () => {
    const groups = new Set(Object.keys(STRINGS.en).map((key) => key.split('.')[0]));
    const literal = /'([a-z]+)\.([A-Za-z]+)'/g;
    let checked = 0;
    for (const name of readdirSync(new URL('../src/', import.meta.url))) {
      const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
      for (const [, group, rest] of source.matchAll(literal)) {
        if (!groups.has(group)) continue;
        assert.ok(Object.hasOwn(STRINGS.en, `${group}.${rest}`), `${name} uses missing key ${group}.${rest}`);
        checked++;
      }
    }
    assert.ok(checked >= 10, `only ${checked} keys found`);
  });
});

describe('translate', () => {
  test('fills placeholders in either language', () => {
    assert.equal(translate('en', 'status.running', { algo: 'A*' }), 'A* is exploring…');
    assert.equal(translate('tr', 'status.running', { algo: 'A*' }), 'A* keşfediyor…');
    assert.equal(
      translate('en', 'status.found', { algo: 'BFS', length: 12, cost: 16 }),
      'BFS found a path: 12 steps, cost 16.',
    );
  });

  test('keeps placeholders it has no value for', () => {
    assert.equal(translate('en', 'status.running', {}), '{algo} is exploring…');
    assert.equal(translate('en', 'status.running'), '{algo} is exploring…');
  });

  test('falls back to English, then to the key itself', () => {
    assert.equal(translate('de', 'actions.visualize'), 'Visualize');
    assert.equal(translate('tr', 'no.such.key'), 'no.such.key');
    assert.equal(translate('tr', 'toString'), 'toString');
  });

  test('recognises the supported languages and toggles between them', () => {
    assert.ok(isLanguage('en') && isLanguage('tr'));
    for (const value of ['de', '', null, undefined, 1, ['en']]) assert.equal(isLanguage(value), false);
    assert.equal(otherLanguage('en'), 'tr');
    assert.equal(otherLanguage('tr'), 'en');
  });
});
