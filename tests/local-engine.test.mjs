import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * The Line Art Lab runs on the computer it is opened on.
 *
 * That is the product promise the screen itself makes — "Made with algorithms,
 * no AI model" — and the reason this feature costs nothing to host: there is no
 * server doing the drawing, so there is no server to scale. It is easy to lose
 * by accident, one convenient `fetch` at a time, so it is asserted here rather
 * than remembered.
 *
 * The one deliberate exception is `lib/lab/smart.ts`, the optional hand-off to
 * a helper the user runs on their own machine. It is not a hosted service and
 * it is off in production builds; `smart.test.mjs` covers what it does. Every
 * other file in the engine must be able to run with the network unplugged.
 */

const ENGINE = ['lib/lineart', 'lib/lab'];

/** Files allowed to talk to anything, and why. */
const ALLOWED = new Set([
  // The optional local helper. Opt-in, 127.0.0.1, off in production.
  'lib/lab/smart.ts',
  // Reads back a blob: URL the app itself just made. No origin, no network.
  'lib/lab/rasterise.ts',
]);

function sourceFiles() {
  const found = [];
  for (const folder of ENGINE) {
    for (const name of readdirSync(join(ROOT, folder))) {
      if (!name.endsWith('.ts')) continue;
      const path = `${folder}/${name}`;
      if (ALLOWED.has(path)) continue;
      found.push([path, readFileSync(join(ROOT, path), 'utf8')]);
    }
  }
  return found;
}

/**
 * Comments stripped, so that prose ABOUT the network does not read as network.
 *
 * Learned the hard way elsewhere in this repo: a check that greps the raw file
 * fails on its own explanatory comment, and the fix people reach for is to
 * delete the comment.
 */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('nothing in the line art engine fetches anything', () => {
  const offenders = [];
  for (const [path, source] of sourceFiles()) {
    const body = code(source);
    for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /\bEventSource\b/, /new WebSocket/]) {
      if (pattern.test(body)) offenders.push(`${path} uses ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], 'the engine must run with the network unplugged');
});

test('nothing in the engine names a remote host', () => {
  const offenders = [];
  for (const [path, source] of sourceFiles()) {
    const body = code(source);
    // An SVG namespace is a name, not an address: nothing is fetched from it.
    const urls = [...body.matchAll(/https?:\/\/[^\s'"`)]+/g)]
      .map((m) => m[0])
      .filter((u) => !u.startsWith('http://www.w3.org/'));
    for (const url of urls) offenders.push(`${path} names ${url}`);
  }
  assert.deepEqual(offenders, []);
});

test('no model file, and no model runtime, is pulled into the engine', () => {
  const offenders = [];
  for (const [path, source] of sourceFiles()) {
    const body = code(source);
    for (const pattern of [/onnxruntime/i, /@tensorflow/i, /\.onnx\b/, /\.safetensors\b/, /\bWebGPU\b/]) {
      if (pattern.test(body)) offenders.push(`${path} mentions ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], 'the looks are our own code, not a downloaded model');
});

test('the engine declares no runtime dependency the browser does not already have', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const runtime = Object.keys(manifest.dependencies ?? {});
  const imports = new Set();
  for (const [, source] of sourceFiles()) {
    for (const m of code(source).matchAll(/from\s+'([^']+)'/g)) {
      const name = m[1];
      if (name.startsWith('.') || name.startsWith('@/')) continue;
      imports.add(name);
    }
  }
  const outside = [...imports].filter((name) => runtime.includes(name.split('/')[0]));
  assert.deepEqual(outside, [], `the engine should need nothing installed, found ${outside.join(', ')}`);
});

test('the worker is the only thing that touches a canvas, so the main thread stays free', () => {
  // `OffscreenCanvas` is the whole point: the heavy pass must not be able to
  // reach a DOM canvas, because that would mean it was running on the main
  // thread. `rasterise.ts` is the exception and says so in its own first line.
  const offenders = [];
  for (const [path, source] of sourceFiles()) {
    const body = code(source);
    if (/document\.createElement\(\s*'canvas'/.test(body)) offenders.push(path);
    if (/\bnew Image\s*\(/.test(body)) offenders.push(path);
  }
  assert.deepEqual(offenders, []);
});
