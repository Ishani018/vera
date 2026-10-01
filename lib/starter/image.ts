import { crc32 } from '../stickers/zip';

/**
 * Is this file really the picture it claims to be?
 *
 * Not a decoder. What it does is read the header, say what format and what size,
 * and check the file is not truncated — which is what actually goes wrong with
 * a hand-downloaded image: a half-finished save, an HTML error page saved with
 * a .png on the end, a file that opens on the machine it was downloaded on and
 * nowhere else.
 *
 * For PNG it goes further and checks every chunk's CRC, which PNG carries for
 * exactly this purpose. That is a stronger guarantee than "a decoder did not
 * complain", and it needs no decoder and no dependency.
 *
 * What it does **not** check, said plainly because the difference matters: that
 * every pixel of a JPEG's entropy-coded data is valid. A JPEG whose header and
 * end marker are intact but whose middle is corrupt will pass here and show as
 * a half-grey picture in a browser. The build prints the dimensions so an
 * absurd one is visible, and the honest backstop is looking at the pack.
 */

export type Probe =
  | { ok: true; format: 'png' | 'jpeg' | 'webp'; width: number; height: number }
  | { ok: false; why: string };

const be32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const be16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const le32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

export function probeImage(bytes: Uint8Array): Probe {
  if (bytes.length < 16) return { ok: false, why: 'the file is too short to be an image' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return png(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return webp(bytes);
  }
  // The commonest wrong file by a mile: a page saved instead of a picture.
  const head = new TextDecoder().decode(bytes.slice(0, 64)).trim().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{')) {
    return { ok: false, why: 'this is a web page or some JSON, not a picture' };
  }
  return { ok: false, why: 'not a PNG, JPEG or WebP' };
}

/** Walks every chunk, checks its checksum, and insists the file ends at IEND. */
function png(bytes: Uint8Array): Probe {
  let at = 8;
  let width = 0;
  let height = 0;
  let sawEnd = false;
  while (at + 8 <= bytes.length) {
    const length = be32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const end = at + 12 + length;
    if (end > bytes.length) return { ok: false, why: `the ${type} chunk runs off the end of the file` };

    const stated = be32(bytes, at + 8 + length);
    const worked = crc32(bytes.subarray(at + 4, at + 8 + length));
    if (stated !== worked) return { ok: false, why: `the ${type} chunk's checksum is wrong` };

    if (type === 'IHDR') {
      width = be32(bytes, at + 8);
      height = be32(bytes, at + 12);
    }
    if (type === 'IEND') {
      sawEnd = true;
      if (end !== bytes.length) return { ok: false, why: 'there is rubbish after the end of the PNG' };
    }
    at = end;
  }
  if (!sawEnd) return { ok: false, why: 'the PNG stops before its end marker — a truncated download' };
  if (!width || !height) return { ok: false, why: 'the PNG never says how big it is' };
  return { ok: true, format: 'png', width, height };
}

/** Finds the frame header for the size, and insists the file ends at EOI. */
function jpeg(bytes: Uint8Array): Probe {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return { ok: false, why: 'the JPEG markers do not line up' };
    const marker = bytes[at + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = be16(bytes, at + 2);
    if (length < 2 || at + 2 + length > bytes.length) {
      return { ok: false, why: 'a JPEG segment runs off the end of the file' };
    }
    // Any of the frame-start markers, which carry the dimensions. Not DHT, DAC
    // or the restart ones, which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = be16(bytes, at + 5);
      const width = be16(bytes, at + 7);
      if (!width || !height) return { ok: false, why: 'the JPEG gives a size of nothing' };
      if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
        return { ok: false, why: 'the JPEG stops before its end marker — a truncated download' };
      }
      return { ok: true, format: 'jpeg', width, height };
    }
    at += 2 + length;
  }
  return { ok: false, why: 'the JPEG never says how big it is' };
}

/** The three WebP shapes, and a RIFF length that must match the file. */
function webp(bytes: Uint8Array): Probe {
  const stated = le32(bytes, 4) + 8;
  if (stated !== bytes.length) {
    return { ok: false, why: `the WebP says it is ${stated} bytes and is ${bytes.length}` };
  }
  const kind = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (kind === 'VP8 ') {
    return { ok: true, format: 'webp', width: le32(bytes, 26) & 0x3fff, height: le32(bytes, 28) & 0x3fff };
  }
  if (kind === 'VP8L') {
    const bits = le32(bytes, 21);
    return { ok: true, format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { ok: true, format: 'webp', width, height };
  }
  return { ok: false, why: `an unknown kind of WebP (${kind})` };
}
