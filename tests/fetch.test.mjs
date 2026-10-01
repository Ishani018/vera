import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIMITS,
  acceptedLicence,
  extensionFor,
  fileNameFor,
  manifestFor,
  packNameFor,
  paceFor,
  parseAsk,
  plain,
  readCommons,
  readSmithsonian,
  refusedByName,
} from '../lib/starter/fetch.ts';
import { checkManifest } from '../lib/starter/manifest.ts';

/**
 * The fetch helper, with the network taken out.
 *
 * Nothing here opens a socket, and nothing in the helper's pure half can. The
 * sample responses in tests/fixtures are hand-written in the shape each API
 * documents — they were not captured from the live services, because the
 * sandbox this was built in has no network, and each file says so in its own
 * first field.
 */

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/* --------------------------------------------------------------- the ask */

test('the command line is read, or refused with a reason', () => {
  assert.deepEqual(parseAsk(['commons', 'ferns', '10']), {
    ask: { source: 'commons', query: 'ferns', count: 10 },
  });
  assert.deepEqual(parseAsk(['commons', 'ferns']).ask.count, 20, 'a sensible default');
  assert.match(parseAsk([]).problem, /Usage/);
  assert.match(parseAsk(['flickr', 'ferns']).problem, /Unknown source/);
  assert.match(parseAsk(['commons', 'ferns', 'lots']).problem, /not a number/);
  assert.match(parseAsk(['commons', 'ferns', '0']).problem, /not a number/);
});

test('one run cannot ask for a thousand things', () => {
  assert.equal(LIMITS.perRun, 100);
  const refused = parseAsk(['commons', 'ferns', '500']);
  assert.match(refused.problem, /more than one run may take/);
  assert.ok(parseAsk(['commons', 'ferns', '100']).ask);
});

test('five requests a second, counted from the start of the run', () => {
  assert.equal(LIMITS.perSecond, 5);
  assert.equal(paceFor(0), 0);
  assert.equal(paceFor(5), 1000);
  assert.equal(paceFor(10), 2000);
  // Never negative, however the caller counts.
  assert.equal(paceFor(-3), 0);
});

/* ----------------------------------------------------------- the licence */

test('only CC0 and public domain are accepted', () => {
  for (const good of ['CC0', 'CC0 1.0', 'Public domain', 'PD-US-expired', 'PD-old-100', 'Public Domain Mark 1.0', 'No known copyright restrictions']) {
    assert.equal(acceptedLicence(good), true, good);
  }
  for (const bad of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC BY-NC', 'GFDL', 'Fair use', 'All rights reserved', '', null, undefined]) {
    assert.equal(acceptedLicence(bad), false, String(bad));
  }
});

test('a licence that merely starts with the letters of one we accept is not accepted', () => {
  // "PDM" is fine; "PDQ-something" is not a public-domain tag.
  assert.equal(acceptedLicence('PDM 1.0'), true);
  assert.equal(acceptedLicence('PDQ special terms'), false);
  assert.equal(acceptedLicence('Public domain-ish'), false);
});

/* ------------------------------------------------------ what we refuse */

test('a trademarked name in the title is refused', () => {
  assert.match(refusedByName('Mickey Mouse topiary'), /mickey mouse/);
  assert.match(refusedByName('A photograph of a Nike shoe'), /nike/);
  assert.match(refusedByName('Pikachu plush toy'), /pikachu/);
});

test('a logo or an emblem is refused, by title or by tag', () => {
  assert.match(refusedByName('Logo of the city gardens society'), /logo/);
  assert.match(refusedByName('A seal', ['Emblems', 'Heraldry']), /emblem/);
  assert.match(refusedByName('Arms of a county', ['Coats of arms']), /coats? of arms/);
});

test('a ® or ™ anywhere in the words is refused', () => {
  assert.match(refusedByName('Something®'), /® or ™/);
  assert.match(refusedByName('Plain title', ['Brand™ items']), /® or ™/);
});

test('an ordinary picture is not refused', () => {
  assert.equal(refusedByName('Botanical plate of a fern', ['Ferns', 'Botanical illustrations']), null);
  assert.equal(refusedByName('Pressed specimen of wild carrot', ['Herbarium specimen']), null);
});

test('the net catches whole words only, so it does not refuse half the collection', () => {
  // "emblematic" is a word about pictures, not a claim on one.
  assert.equal(refusedByName('An emblematic view of the harbour'), null);
  assert.equal(refusedByName('Mouse, field (Apodemus)'), null);
});

/* --------------------------------------------------- reading the APIs */

test('Commons: only the public-domain ones are kept, and why is recorded', () => {
  const { kept, skipped } = readCommons(read('commons-search.json'));
  assert.deepEqual(
    kept.map((one) => one.title).sort(),
    ['Botanical plate of a fern.jpg', 'Herbarium sheet, pressed ivy.jpg', 'Old engraving of a thistle.jpg'],
  );
  const why = Object.fromEntries(skipped.map((one) => [one.title, one.why]));
  assert.match(why['Modern photograph of a leaf.jpg'], /CC BY-SA 4\.0/);
  assert.match(why['Logo of the city gardens society.svg'], /logo/);
  assert.match(why['Mickey Mouse topiary in a public garden.jpg'], /mickey mouse/);
  assert.match(why['A page with no file.jpg'], /no file/);
});

test('Commons: the author comes out of the HTML the API wraps it in', () => {
  const { kept } = readCommons(read('commons-search.json'));
  const fern = kept.find((one) => one.title.startsWith('Botanical'));
  assert.equal(fern.author, 'Jane Illustrator');
  assert.equal(fern.licence, 'Public domain');
  assert.equal(fern.pageUrl, 'https://commons.wikimedia.org/wiki/File:Botanical_plate_of_a_fern.jpg');
  assert.ok(fern.fileUrl.startsWith('https://upload.wikimedia.org/'));
  assert.ok(fern.tags.includes('Ferns'));
});

test('an author the API left blank says so rather than being empty', () => {
  const { kept } = readCommons(read('commons-search.json'));
  assert.equal(kept.find((one) => one.title.startsWith('Herbarium')).author, 'Unknown');
});

test('HTML in a field is stripped, entities and all', () => {
  assert.equal(plain('<a href="/wiki/x" title="y">Jane &amp; Co</a>'), 'Jane & Co');
  assert.equal(plain('<span>Anon.</span>'), 'Anon.');
  assert.equal(plain('line\n   two'), 'line two');
});

test('Smithsonian: an item is kept only when a CC0 picture is attached to it', () => {
  const { kept, skipped } = readSmithsonian(read('smithsonian-search.json'));
  assert.deepEqual(kept.map((one) => one.title), ['Pressed specimen of wild carrot']);
  const why = Object.fromEntries(skipped.map((one) => [one.title, one.why]));
  // Openly described, restricted picture — the trap the check exists for.
  assert.match(why['Portrait study in chalk'], /no CC0 picture \(Usage conditions apply/);
  assert.match(why['Beetle, dorsal view'], /no media at all/);
  assert.match(why['Advertising card with a brand mascot'], /mascot/);
});

test('Smithsonian: the record link, not the API row, is what a person is sent to', () => {
  const [one] = readSmithsonian(read('smithsonian-search.json')).kept;
  assert.equal(one.pageUrl, 'https://www.si.edu/object/pressed-specimen-wild-carrot:nmnhbotany_1234567');
  assert.equal(one.licence, 'CC0');
  assert.equal(one.author, 'Mary Botanist');
  assert.ok(one.fileUrl.includes('ids.si.edu'));
});

test('neither reader throws on a response that is nothing like one', () => {
  for (const rubbish of [null, {}, { query: {} }, { response: {} }, 'a string', 42]) {
    assert.deepEqual(readCommons(rubbish).kept, []);
    assert.deepEqual(readSmithsonian(rubbish).kept, []);
  }
});

/* ------------------------------------------------------- the manifest */

test('a filename is safe, lower case and never collides', () => {
  const taken = new Set();
  const one = { title: 'Botanical plate of a fern.jpg' };
  assert.equal(fileNameFor(one, '.jpg', taken), 'botanical-plate-of-a-fern.jpg');
  assert.equal(fileNameFor(one, '.jpg', taken), 'botanical-plate-of-a-fern-2.jpg');
  assert.equal(fileNameFor(one, '.jpg', taken), 'botanical-plate-of-a-fern-3.jpg');
  assert.equal(fileNameFor({ title: 'Ünïcødé · 漢字' }, 'png', new Set()), 'n-c-d.png');
  assert.equal(fileNameFor({ title: '' }, '.png', new Set()), 'item.png');
});

test('a pack name comes out of the query, as a folder name', () => {
  assert.equal(packNameFor('botanical illustration'), 'botanical-illustration');
  assert.equal(packNameFor('  Ferns & Mosses!  '), 'ferns-mosses');
  assert.equal(packNameFor('***'), 'fetched');
});

test('the manifest it writes is one the pack builder accepts', () => {
  const { kept } = readCommons(read('commons-search.json'));
  const taken = new Set();
  const rows = kept.map((found) => ({ found, file: fileNameFor(found, '.jpg', taken) }));
  const manifest = manifestFor(
    packNameFor('botanical illustration'),
    rows,
    'commons',
    'botanical illustration',
    new Date('2026-03-04T00:00:00Z'),
  );
  assert.equal(manifest.pack, 'botanical-illustration');
  assert.equal(manifest.items.length, 3);
  assert.equal(manifest.items[0].downloadedOn, '2026-03-04');
  assert.match(manifest.note, /own licence field/);
  // The real check: the builder would take this.
  assert.deepEqual(checkManifest(manifest, 'botanical-illustration'), []);
});

test('a manifest from a run that kept nothing is still a valid empty manifest', () => {
  const manifest = manifestFor('nothing', [], 'commons', 'nothing at all');
  assert.deepEqual(manifest.items, []);
  // An empty pack is refused by the builder, which is the right answer — but
  // for being empty, not for being malformed.
  const problems = checkManifest(manifest, 'nothing');
  assert.ok(problems.every((p) => /empty|no items|at least one/i.test(p.why)), JSON.stringify(problems));
});

test('what a file is comes from the server first and the URL second', () => {
  assert.equal(extensionFor('https://x/y', 'image/png'), '.png');
  assert.equal(extensionFor('https://x/y.jpg', 'image/webp'), '.webp');
  assert.equal(extensionFor('https://x/y.JPEG?width=800', null), '.jpg');
  assert.equal(extensionFor('https://x/y.png', 'text/html; charset=utf-8'), '.png');
  // Nothing recognisable: the caller must refuse it rather than guess.
  assert.equal(extensionFor('https://x/y', null), null);
  assert.equal(extensionFor('https://x/y.svg', 'image/svg+xml'), null);
});

test('a fourth argument names the pack, for the curated run', () => {
  assert.deepEqual(parseAsk(['commons', 'animal illustration engraving', '12', 'Animals']).ask, {
    source: 'commons',
    query: 'animal illustration engraving',
    count: 12,
    pack: 'animals',
  });
  // Left out, the folder is still named after the query.
  assert.equal(parseAsk(['commons', 'ferns', '5']).ask.pack, undefined);
  assert.match(parseAsk(['commons', 'ferns', '5', '***']).problem, /not a usable pack name/);
});
