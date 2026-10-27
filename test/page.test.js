// Static checks of the page and the shipped files: metadata, element ids the
// scripts need, no external requests and no unsafe or debugging APIs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const css = read('style.css');
/** Drops comments, so JSDoc types such as {import('./grid.js').Grid} are not taken for code. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const modules = readdirSync(new URL('src/', root))
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const source = read(`src/${name}`);
    return { name, source, code: stripComments(source) };
  });

const SITE = 'https://celaldrg.github.io/pathfinding-visualizer/';

/** Value of the content attribute of a meta tag, by name or property. */
function meta(key) {
  const match = html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));
  return match ? match[1] : null;
}

describe('index.html', () => {
  test('declares the document, language, encoding and viewport', () => {
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<meta charset="utf-8">/i);
    assert.equal(meta('viewport'), 'width=device-width, initial-scale=1');
    assert.match(html, /<title>Pathfinding Visualizer<\/title>/);
    assert.ok(meta('description').length > 50);
  });

  test('has Open Graph tags for link previews and an inline favicon', () => {
    assert.equal(meta('og:title'), 'Pathfinding Visualizer');
    assert.ok(meta('og:description'));
    assert.equal(meta('og:url'), SITE);
    assert.equal(meta('og:image'), `${SITE}docs/screenshot.png`);
    assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,[^"]+">/);
  });

  test('loads the stylesheet and the entry module', () => {
    assert.match(html, /<link rel="stylesheet" href="style.css">/);
    assert.match(html, /<script type="module" src="src\/main.js"><\/script>/);
    assert.equal([...html.matchAll(/<script\b/g)].length, 1, 'no other scripts');
  });

  test('ids are unique and every id the scripts look up exists', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id');
    const wanted = modules.flatMap(({ source }) => [...source.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]));
    assert.ok(wanted.length >= 15);
    for (const id of wanted) assert.ok(ids.includes(id), `#${id} is missing`);
    for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(id), `#${id} is missing`);
  });

  test('every button is a plain button with a label', () => {
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.ok(buttons.length >= 5);
    for (const [, attributes, content] of buttons) {
      assert.match(attributes, /type="button"/);
      assert.ok(/data-i18n/.test(attributes + content) || /id="visualize"/.test(attributes), attributes);
    }
  });

  test('links to the source and the license in the footer', () => {
    assert.match(html, /<a href="https:\/\/github.com\/celaldrg\/pathfinding-visualizer" data-i18n="footer.source">/);
    assert.match(html, /data-i18n="footer.license">MIT</);
  });
});

describe('shipped files', () => {
  test('make no requests to other hosts', () => {
    for (const [, url] of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*(?:src|href)="([^"]+)"/g)) {
      assert.ok(!/^(?:https?:)?\/\//.test(url), url);
    }
    for (const [, url] of css.matchAll(/url\(\s*["']?([^"')]+)/g)) assert.ok(url.startsWith('data:'), url);
    assert.doesNotMatch(css, /@import/);
    for (const { name, code } of modules) {
      for (const [, path] of code.matchAll(/^import\b[^'"]*['"]([^'"]+)['"]/gm)) {
        assert.ok(path.startsWith('./'), `${name} imports ${path}`);
      }
      assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|WebSocket|\bimport\(/, name);
    }
  });

  test('avoid eval, HTML injection and debugging output', () => {
    for (const { name, code } of modules) {
      assert.doesNotMatch(code, /\beval\(|new Function\b|\bFunction\(/, name);
      assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, name);
      assert.doesNotMatch(code, /\bconsole\.|\bdebugger\b|\balert\(/, name);
    }
  });

  test('only storage.js touches localStorage', () => {
    for (const { name, code } of modules) {
      if (name !== 'storage.js') assert.doesNotMatch(code, /localStorage|sessionStorage/, name);
    }
  });

  test('every module but the entry point loads without a browser', async () => {
    for (const { name } of modules) {
      if (name !== 'main.js') await import(new URL(`src/${name}`, root));
    }
  });

  test('the repository has its docs, license, CI and screenshot', () => {
    for (const path of ['README.md', 'LICENSE', '.nojekyll', '.gitignore', '.github/workflows/test.yml']) {
      assert.ok(existsSync(new URL(path, root)), `${path} is missing`);
    }
    const png = readFileSync(new URL('docs/screenshot.png', root));
    assert.equal(png.toString('latin1', 1, 4), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 800], 'screenshot size');
  });
});
