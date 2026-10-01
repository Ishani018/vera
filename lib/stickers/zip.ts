/**
 * A zip file, written by hand.
 *
 * No dependency, because the whole of what is needed here is one of the two
 * shapes a zip can take: entries stored rather than compressed. PNG is already
 * compressed — deflating it again would cost time and save nothing, sometimes
 * less than nothing — so "stored" is not a shortcut, it is the right answer.
 *
 * The timestamps are fixed rather than taken from the clock, so the same
 * stickers zipped twice give the same bytes. That is worth more than a modified
 * date nobody reads: it means a pack can be compared with the one before it.
 */

/** 1 January 2024, in the two-byte DOS fields a zip uses. */
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

export type ZipEntry = { name: string; bytes: Uint8Array };

/**
 * The parts of a zip, as plain arrays.
 *
 * Separated from making the Blob so it can be checked in Node, where there is
 * no Blob worth having — and so the one awkward thing about `Uint8Array` in a
 * browser (its buffer may in principle be shared, which `Blob` will not take)
 * is handled in one place.
 */
export function zipParts(entries: ZipEntry[]): Uint8Array[] {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    locals.push(local, entry.bytes);

    const middle = new Uint8Array(46 + name.length);
    const cv = new DataView(middle.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // stored
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); // where its local header is
    middle.set(name, 46);
    central.push(middle);

    offset += local.length + size;
  }

  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return [...locals, ...central, end];
}

export function makeZip(entries: ZipEntry[]): Blob {
  const parts = zipParts(entries).map((part) => {
    const copy = new Uint8Array(part.length);
    copy.set(part);
    return copy.buffer;
  });
  return new Blob(parts, { type: 'application/zip' });
}

/** The whole file as one array, for anything that wants bytes rather than a Blob. */
export function zipBytes(entries: ZipEntry[]): Uint8Array {
  const parts = zipParts(entries);
  const total = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}
