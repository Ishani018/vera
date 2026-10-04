import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import {
  SmartError, checkHelper, explain, readLines, runSmartRedraw, smartOrFallback, smartRedrawEnabled,
} from '../lib/lab/smart.ts';

const PICTURE = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
const SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><path d='M0 0L5 5'/></svg>";
const STATS = { mode: 'standard', style: 'minimal', subject: 'cup', strokes: 3, nodes: 120, passed: true, iou: 0.97,
  coverage: 1, reasons: [], sizes: [{ size: 64, iou: 0.9, passed: true }], retried: false, timings: { total: 91 } };
const line = (o) => JSON.stringify(o) + '\n';

/** A ReadableStream that delivers each chunk in turn, optionally after a delay, and errors if the request is aborted. */
function stream(chunks, { gap = 0, signal, failAt } = {}) {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (gap) await new Promise((r) => setTimeout(r, gap));
      if (signal?.aborted) return controller.error(new DOMException('aborted', 'AbortError'));
      if (failAt === i) return controller.error(new Error('connection reset'));
      if (i >= chunks.length) return controller.close();
      controller.enqueue(new TextEncoder().encode(chunks[i++]));
    },
  });
}

/** A fetch that never answers until the request is aborted, like a helper that has hung. */
const hung = (record = {}) => (url, init) =>
  new Promise((_, reject) => {
    record.signal = init.signal;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const ok = (chunks, extra = {}) => (url, init) =>
  Promise.resolve(new Response(stream(chunks, { signal: init.signal, ...extra }), { status: 200 }));

const finished = [line({ stage: 'queued', state: 'done', pct: 0 }), line({ done: true, svg: SVG, stats: STATS })];

// ------------------------------------------------------------------ the flag

test('Smart redraw is off in a production build unless the flag turns it on', () => {
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_SMART_REDRAW: '1' }), true);
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_SMART_REDRAW: 'true' }), true);
});

test('it is on while developing, and the flag can turn it off there too', () => {
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'development', NEXT_PUBLIC_SMART_REDRAW: '0' }), false);
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'development', NEXT_PUBLIC_SMART_REDRAW: ' Off ' }), false);
});

test('an unset flag in production is off, and nonsense does not turn it on', () => {
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_SMART_REDRAW: 'maybe' }), false);
  assert.equal(smartRedrawEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_SMART_REDRAW: '' }), false);
});

// ------------------------------------------------------------------- health

const HEALTH = { ok: true, version: '1', ready: true, models: {}, busy: false, styles: ['minimal'], modes: ['standard'], maxUploadMB: 25 };

test('a helper that answers /health is found', async () => {
  const h = await checkHelper({ base: 'http://x', fetchImpl: async (u) => (assert.equal(u, 'http://x/health'), Response.json(HEALTH)) });
  assert.equal(h.ok, true);
  assert.deepEqual(h.styles, ['minimal']);
});

test('nothing listening, a wrong answer, or a hung helper all read as "not running"', async () => {
  assert.equal(await checkHelper({ fetchImpl: async () => { throw new TypeError('fetch failed'); } }), null);
  assert.equal(await checkHelper({ fetchImpl: async () => new Response('nope', { status: 500 }) }), null);
  assert.equal(await checkHelper({ fetchImpl: async () => Response.json({ ok: false }) }), null);
  assert.equal(await checkHelper({ fetchImpl: async () => Response.json({ hello: 'some other server' }) }), null);
  assert.equal(await checkHelper({ fetchImpl: hung(), timeoutMs: 30 }), null);
});

// ------------------------------------------------------------------- success

test('success: progress arrives as the helper reports it, then the drawing', async () => {
  const seen = [];
  const chunks = [
    line({ stage: 'queued', state: 'done', pct: 0 }),
    line({ stage: 'cutout', state: 'start', pct: 0 }),
    line({ heartbeat: true }),
    line({ stage: 'analyse', state: 'done', pct: 0.26, subject: 'a coffee cup' }),
    line({ stage: 'redraw', state: 'progress', step: 2, of: 4, pct: 0.59 }),
    line({ done: true, svg: SVG, stats: STATS }),
  ];
  let t = 1000;
  const result = await runSmartRedraw(PICTURE, { fetchImpl: ok(chunks), onProgress: (p) => seen.push(p), now: () => (t += 5000) });
  assert.equal(result.svg, SVG);
  assert.equal(result.stats.nodes, 120);
  assert.deepEqual(seen.map((p) => p.stage), ['queued', 'cutout', 'analyse', 'redraw']);   // the heartbeat is not progress
  assert.equal(seen[2].subject, 'a coffee cup');
  assert.equal(seen[3].step, 2);
  assert.equal(seen[3].of, 4);
  assert.ok(seen[3].pct > seen[0].pct);
  assert.ok(seen[3].elapsed > seen[0].elapsed);                                              // counted here, from the injected clock
});

test('the request is a POST of the picture itself, with the style and mode in the address', async () => {
  let call;
  await runSmartRedraw(PICTURE, {
    base: 'http://127.0.0.1:9', style: 'bold logo', mode: 'artist',
    fetchImpl: (url, init) => { call = { url, init }; return ok(finished)(url, init); },
  });
  assert.equal(call.url, 'http://127.0.0.1:9/redraw?style=bold%20logo&mode=artist');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['Content-Type'], 'image/png');
  assert.equal(call.init.body, PICTURE);
});

test('a line split across two chunks is held until it is whole', async () => {
  const text = finished.join('');
  const half = Math.floor(text.length / 2);
  const result = await runSmartRedraw(PICTURE, { fetchImpl: ok([text.slice(0, half), text.slice(half)]) });
  assert.equal(result.svg, SVG);
});

test('readLines skips blank lines and anything that is not JSON', async () => {
  const got = [];
  await readLines(stream(['\n', 'not json\n', '{"a":1}\n', '   \n', '{"b":2}']), (o) => got.push(o));
  assert.deepEqual(got, [{ a: 1 }, { b: 2 }]);
});

// ------------------------------------------------------------------- failure

async function kindOf(promise) {
  try { await promise; } catch (e) { assert.ok(e instanceof SmartError, `expected a SmartError, got ${e}`); return e; }
  assert.fail('expected a failure');
}

test('failure: nothing is listening', async () => {
  const e = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: async () => { throw new TypeError('fetch failed'); } }));
  assert.equal(e.kind, 'unavailable');
  assert.match(explain(e), /isn't running/);
});

test('failure: the helper says it is busy, the picture is too big, or the request is refused', async () => {
  const answer = (status, error) => async () => Response.json({ error }, { status });
  assert.equal((await kindOf(runSmartRedraw(PICTURE, { fetchImpl: answer(429, 'busy') }))).kind, 'busy');
  const big = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: answer(413, 'That picture is over 25 MB.') }));
  assert.equal(big.kind, 'too-big');
  assert.match(explain(big), /over 25 MB/);
  assert.equal((await kindOf(runSmartRedraw(PICTURE, { fetchImpl: answer(403, 'That origin is not allowed') }))).kind, 'rejected');
  assert.equal((await kindOf(runSmartRedraw(PICTURE, { fetchImpl: answer(400, 'not a picture') }))).kind, 'rejected');
  assert.equal((await kindOf(runSmartRedraw(PICTURE, { fetchImpl: answer(500, 'boom') }))).kind, 'failed');
});

test('failure: the worker reports an error part-way through, and its words reach the person', async () => {
  const e = await kindOf(runSmartRedraw(PICTURE, {
    fetchImpl: ok([line({ stage: 'redraw', state: 'start', pct: 0.3 }), line({ error: 'worker-failed', message: 'The redraw stopped unexpectedly (exit 1). out of memory' })]),
  }));
  assert.equal(e.kind, 'failed');
  assert.match(e.message, /out of memory/);
  assert.match(explain(e), /didn't finish/);
});

test('failure: the helper reports its own timeout', async () => {
  const e = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: ok([line({ error: 'timeout', message: 'It took longer than 900 s.' })]) }));
  assert.equal(e.kind, 'timeout');
});

test('failure: the stream ends with no drawing, or with something that is not one', async () => {
  const empty = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: ok([line({ stage: 'cutout', state: 'start', pct: 0 })]) }));
  assert.equal(empty.kind, 'failed');
  assert.match(empty.message, /closed the connection before it finished/);
  const junk = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: ok([line({ done: true, svg: '<html>not a drawing</html>', stats: STATS })]) }));
  assert.equal(junk.kind, 'failed');
});

test('failure: the connection breaks part-way through', async () => {
  const e = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: ok([line({ stage: 'cutout', state: 'start', pct: 0 }), 'x'], { failAt: 1 }) }));
  assert.equal(e.kind, 'failed');
  assert.match(e.message, /broke/);
});

// ------------------------------------------------------------------- timeout

test('timeout: a helper that never answers is given up on, and told to stop', async () => {
  const record = {};
  const started = Date.now();
  const e = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: hung(record), timeoutMs: 60 }));
  assert.equal(e.kind, 'timeout');
  assert.match(explain(e), /too long/);
  assert.ok(Date.now() - started < 2000);
  assert.equal(record.signal.aborted, true);          // the request was closed, which is what makes the helper stop
});

test('timeout: a helper that starts and then goes quiet is also given up on', async () => {
  const record = {};
  const slow = (url, init) => { record.signal = init.signal; return Promise.resolve(new Response(stream([line({ stage: 'redraw', state: 'start', pct: 0.3 }), 'late'], { gap: 400, signal: init.signal }), { status: 200 })); };
  const e = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: slow, timeoutMs: 80 }));
  assert.equal(e.kind, 'timeout');
  assert.equal(record.signal.aborted, true);
});

// -------------------------------------------------------------------- cancel

test('cancel: pressing Cancel closes the request and reports "cancelled", not a failure', async () => {
  const controller = new AbortController();
  const record = {};
  const fetchImpl = (url, init) => { record.signal = init.signal; return Promise.resolve(new Response(stream([line({ stage: 'redraw', state: 'start', pct: 0.3 })], { gap: 300, signal: init.signal }), { status: 200 })); };
  const pending = runSmartRedraw(PICTURE, { fetchImpl, signal: controller.signal, onProgress: () => controller.abort() });
  const e = await kindOf(pending);
  assert.equal(e.kind, 'cancelled');
  assert.equal(record.signal.aborted, true);
});

test('cancel: a signal that is already cancelled never sends the picture at all', async () => {
  const controller = new AbortController();
  controller.abort();
  let sent = 0;
  const e = await kindOf(runSmartRedraw(PICTURE, { fetchImpl: async () => { sent++; return new Response(''); }, signal: controller.signal }));
  assert.equal(e.kind, 'cancelled');
  assert.equal(sent, 0);
});

test('a finished request does not leave its timer running', async () => {
  await runSmartRedraw(PICTURE, { fetchImpl: ok(finished), timeoutMs: 60_000 });   // the test would hang at exit if it did
});

// ------------------------------------------------------------------ fallback

test('fallback: when Smart redraw works the existing engine is not run', async () => {
  let ran = 0;
  const out = await smartOrFallback(PICTURE, async () => { ran++; return 'engine'; }, { fetchImpl: ok(finished) });
  assert.equal(out.source, 'smart');
  assert.equal(out.result.svg, SVG);
  assert.equal(ran, 0);
});

test('fallback: helper not running -> the existing engine runs and the reason is plain', async () => {
  let ran = 0;
  const out = await smartOrFallback(PICTURE, async () => { ran++; return 'engine result'; }, { fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(out.source, 'fallback');
  assert.equal(out.result, 'engine result');
  assert.equal(ran, 1);
  assert.equal(out.reason.kind, 'unavailable');
  assert.equal(out.message, "The Smart redraw helper isn't running.");
});

test('fallback: a failure part-way through falls back and carries what went wrong', async () => {
  const out = await smartOrFallback(PICTURE, async () => 'engine', {
    fetchImpl: ok([line({ error: 'worker-failed', message: 'out of memory' })]),
  });
  assert.equal(out.source, 'fallback');
  assert.match(out.message, /out of memory/);
});

test('fallback: a timeout falls back, says so, and the helper was told to stop', async () => {
  const record = {};
  const out = await smartOrFallback(PICTURE, async () => 'engine', { fetchImpl: hung(record), timeoutMs: 50 });
  assert.equal(out.source, 'fallback');
  assert.equal(out.reason.kind, 'timeout');
  assert.match(out.message, /took too long/);
  assert.equal(record.signal.aborted, true);
});

test('fallback: busy and refused also fall back, so nobody is left with nothing', async () => {
  for (const status of [429, 413, 403, 500]) {
    const out = await smartOrFallback(PICTURE, async () => 'engine', { fetchImpl: async () => Response.json({ error: 'no' }, { status }) });
    assert.equal(out.source, 'fallback', String(status));
  }
});

test('fallback: pressing Cancel does NOT fall back; somebody who cancelled asked for nothing', async () => {
  let ran = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(smartOrFallback(PICTURE, async () => { ran++; return 'engine'; }, { fetchImpl: async () => new Response(''), signal: controller.signal }),
    (e) => e instanceof SmartError && e.kind === 'cancelled');
  assert.equal(ran, 0);
});

test('fallback: if the existing engine fails too, that error is not swallowed', async () => {
  await assert.rejects(smartOrFallback(PICTURE, async () => { throw new Error('engine broke'); }, { fetchImpl: async () => { throw new TypeError('x'); } }), /engine broke/);
});

// ----------------------------------------------------------- stays out of the bundle

test('the client imports nothing, so no model or pipeline code can ride along with it', () => {
  const src = readFileSync(new URL('../lib/lab/smart.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /require\(/);
});

test('no model weights are anywhere the app is built from', () => {
  const heavy = new Set(['.safetensors', '.gguf', '.onnx', '.pt', '.pth', '.ckpt', '.mlmodel']);
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) { if (name !== 'node_modules' && name !== '.next') walk(path); continue; }
      if (heavy.has(extname(name)) || info.size > 25 * 1024 * 1024) found.push(path);
    }
  };
  for (const dir of ['app', 'components', 'lib', 'public']) walk(new URL(`../${dir}`, import.meta.url).pathname);
  assert.deepEqual(found, []);
});
