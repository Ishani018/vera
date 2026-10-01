import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ADD_ALL_LIMIT,
  ALLOWED_HOSTS,
  CACHE_MS,
  MAX_BYTES,
  PACE,
  PAGE_SIZE,
  USER_AGENT,
  allowedSource,
  allowedType,
  cacheKey,
  commonsSearchUrl,
  nextSlot,
  packFor,
  retryAfter,
  smithsonianSearchUrl,
  stillFresh,
  withinCap,
} from '../lib/graphics/policy.ts';
import { readCommons, readSmithsonian } from '../lib/starter/fetch.ts';
import { probeImage } from '../lib/starter/image.ts';

/**
 * The browser's rules, with no network anywhere near them.
 *
 * The sample responses are the same hand-written fixtures the fetch helper
 * uses — written in the shape each API documents, not captured from the live
 * services, because this sandbox has no outbound network.
 */

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/* ------------------------------------------------- what may be fetched */

test('only https, only two hosts', () => {
  assert.deepEqual([...ALLOWED_HOSTS], ['upload.wikimedia.org', 'ids.si.edu']);
  assert.equal(allowedSource('https://upload.wikimedia.org/a/b.jpg').ok, true);
  assert.equal(allowedSource('https://ids.si.edu/ids/deliveryService?id=x').ok, true);
  assert.equal(allowedSource('http://upload.wikimedia.org/a/b.jpg').ok, false);
});

test('a host that merely ends with an allowed one is refused', () => {
  // Anybody can register this, and a suffix test would have opened it.
  const verdict = allowedSource('https://upload.wikimedia.org.example.com/a.jpg');
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /not a host this fetches from/);
  assert.equal(allowedSource('https://evil.com/upload.wikimedia.org/a.jpg').ok, false);
});

test('the inside of our own network is refused', () => {
  for (const url of [
    'http://169.254.169.254/latest/meta-data/',
    'https://169.254.169.254/latest/meta-data/',
    'http://localhost:5432/',
    'https://127.0.0.1/',
    'http://[::1]/',
    'file:///etc/passwd',
    'https://10.0.0.5/admin',
  ]) {
    assert.equal(allowedSource(url).ok, false, url);
  }
});

test('credentials, ports and rubbish are refused with a reason', () => {
  assert.match(allowedSource('https://u:p@upload.wikimedia.org/a.jpg').why, /credentials/);
  assert.match(allowedSource('https://upload.wikimedia.org:8080/a.jpg').why, /port/);
  assert.match(allowedSource('not a url at all').why, /not a URL/);
  assert.match(allowedSource('').why, /not a URL/);
});

test('the cap is ten megabytes, and an unknown length is caught later', () => {
  assert.equal(MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(withinCap(1024), true);
  assert.equal(withinCap(MAX_BYTES), true);
  assert.equal(withinCap(MAX_BYTES + 1), false);
  // A server need not send Content-Length; the read counts bytes as well.
  assert.equal(withinCap(null), true);
});

test('only three picture types, and never an SVG', () => {
  assert.equal(allowedType('image/png'), true);
  assert.equal(allowedType('image/jpeg; charset=binary'), true);
  assert.equal(allowedType('IMAGE/WEBP'), true);
  // An SVG is a document that can carry script, and this one is served back.
  assert.equal(allowedType('image/svg+xml'), false);
  assert.equal(allowedType('text/html'), false);
  assert.equal(allowedType(null), false);
});

test('the bytes are sniffed as well as trusted', () => {
  // A server can say "image/png" and send anything at all.
  const lie = new TextEncoder().encode('<html><body>not a picture</body></html>');
  assert.equal(probeImage(lie).ok, false);
});

/* ------------------------------------------------------- asking nicely */

test('the User-Agent is the shape Wikimedia asks for', () => {
  // name/version (contact) library/version — and never a browser string.
  assert.match(USER_AGENT, /^[\w.]+\/[\d.]+ \(.*https?:\/\/.*\) .+$/);
  assert.ok(!/Mozilla|Chrome|Safari/.test(USER_AGENT));
});

test('the pace is well inside both services’ limits', () => {
  // Wikimedia: 200 a minute with a compliant agent. One a second is 60.
  assert.ok(60_000 / PACE.commons <= 60);
  // Smithsonian: 1000 an hour with a key. One per four seconds is 900.
  assert.ok(3_600_000 / PACE.smithsonian <= 1000);
});

test('requests go in series, one pace apart', () => {
  assert.equal(nextSlot('commons', 1000, 1200), 2000);
  // Long idle: the next one may go at once rather than banking credit.
  assert.equal(nextSlot('commons', 1000, 99_000), 99_000);
});

test('a 429 is waited out, by the header when there is one', () => {
  assert.equal(retryAfter('3'), 3000);
  assert.equal(retryAfter(null), 5000, 'their floor when no header is sent');
  assert.equal(retryAfter('nonsense'), 5000);
  assert.equal(retryAfter('-1'), 5000);
  assert.equal(retryAfter('99999'), 60_000, 'capped, so a bad header cannot hang it');
});

/* ----------------------------------------------------------- caching */

test('a search is cached by what was asked, not by how it was typed', () => {
  assert.equal(cacheKey('commons', 'Ferns ', 0), cacheKey('commons', 'ferns', 0));
  assert.notEqual(cacheKey('commons', 'ferns', 0), cacheKey('commons', 'ferns', 1));
  assert.notEqual(cacheKey('commons', 'ferns', 0), cacheKey('smithsonian', 'ferns', 0));
});

test('a cached answer goes stale', () => {
  const entry = { at: 1_000_000, value: [] };
  assert.equal(stillFresh(entry, 1_000_000 + CACHE_MS - 1), true);
  assert.equal(stillFresh(entry, 1_000_000 + CACHE_MS + 1), false);
  assert.equal(stillFresh(undefined, 1), false);
});

/* ------------------------------------------------------ building the ask */

test('Commons is asked with one generator query, not one per file', () => {
  const url = new URL(commonsSearchUrl('ferns', 0));
  assert.equal(url.host, 'commons.wikimedia.org');
  assert.equal(url.searchParams.get('generator'), 'search');
  assert.equal(url.searchParams.get('gsrnamespace'), '6');
  assert.match(url.searchParams.get('gsrsearch'), /^filetype:bitmap ferns$/);
  assert.equal(url.searchParams.get('prop'), 'imageinfo');
  assert.match(url.searchParams.get('iiprop'), /extmetadata/);
  assert.equal(url.searchParams.get('gsrlimit'), String(PAGE_SIZE));
});

test('paging moves the offset rather than asking again for the same page', () => {
  assert.equal(new URL(commonsSearchUrl('ferns', 0)).searchParams.get('gsroffset'), '0');
  assert.equal(new URL(commonsSearchUrl('ferns', 2)).searchParams.get('gsroffset'), String(PAGE_SIZE * 2));
  assert.equal(new URL(commonsSearchUrl('ferns', -5)).searchParams.get('gsroffset'), '0');
});

test('a query with punctuation in it is escaped, not pasted', () => {
  const url = new URL(commonsSearchUrl('ferns & "mosses"', 0));
  assert.equal(url.searchParams.get('gsrsearch'), 'filetype:bitmap ferns & "mosses"');
  assert.ok(!url.search.includes('"'), 'raw quotes would end the parameter');
});

test('the Smithsonian key goes in the URL and nowhere else', () => {
  const url = new URL(smithsonianSearchUrl('herbarium', 1, 'SECRET'));
  assert.equal(url.host, 'api.si.edu');
  assert.equal(url.searchParams.get('api_key'), 'SECRET');
  assert.equal(url.searchParams.get('start'), String(PAGE_SIZE));
  assert.match(url.searchParams.get('q'), /online_media_type/);
});

/* ------------------------------------------- what comes back is filtered */

test('a search answer is filtered by the API’s own licence field', () => {
  const { kept, skipped } = readCommons(read('commons-search.json'));
  assert.deepEqual(kept.map((one) => one.licence).sort(), ['CC0', 'PD-old-100-expired', 'Public domain']);
  assert.ok(skipped.some((one) => /CC BY-SA/.test(one.why)));
});

test('and by the words that mean somebody owns it', () => {
  const { skipped } = readCommons(read('commons-search.json'));
  assert.ok(skipped.some((one) => /logo/.test(one.why)));
  assert.ok(skipped.some((one) => /mickey mouse/.test(one.why)));
});

test('the Smithsonian reader keeps only a CC0 picture', () => {
  const { kept } = readSmithsonian(read('smithsonian-search.json'));
  assert.deepEqual(kept.map((one) => one.licence), ['CC0']);
  for (const one of kept) assert.equal(allowedSource(one.fileUrl).ok, true, one.fileUrl);
});

test('every file URL a Commons search offers is one we are allowed to fetch', () => {
  for (const one of readCommons(read('commons-search.json')).kept) {
    assert.equal(allowedSource(one.fileUrl).ok, true, one.fileUrl);
  }
});

/* ------------------------------------------------------------- adding */

test('what is added is grouped under the search that found it', () => {
  assert.equal(packFor('botanical illustration'), 'botanical-illustration');
  assert.equal(packFor('  Ferns & Mosses!  '), 'ferns-mosses');
  assert.equal(packFor('***'), 'browsed');
});

test('Add all has a limit, so one press cannot start a hundred downloads', () => {
  assert.equal(ADD_ALL_LIMIT, 20);
  assert.ok(ADD_ALL_LIMIT <= PAGE_SIZE);
});
