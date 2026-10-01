import { crc32 } from './zip';

/**
 * Reading a zip, to match the one we write.
 *
 * Entries are read from the **central directory** rather than by walking local
 * headers from the front, because the central directory is the authoritative
 * index: it is what every real tool reads, and a zip whose local headers and
 * directory disagree is a zip that behaves differently depending on who opens
 * it. Reading the same part they read means what this sees is what they see.
 *
 * Stored entries only. That is what we write — a PNG is already compressed —
 * and a deflate decoder is a great deal of code to carry for a case that does
 * not arise. A compressed entry is refused by name rather than silently
 * producing rubbish.
 *
 * Every entry's checksum is verified. A pack is a file somebody moved between
 * machines, and a flipped byte should be found here rather than in a sticker.
 *
 * What that does and does not cover is worth being exact about: a zip's CRC
 * protects an entry's **data**, not its headers. A byte flipped inside a
 * picture is caught here. A byte flipped in a file *name* is not caught by any
 * checksum — it simply becomes a different name, which for a pack means a file
 * the manifest does not list, and the manifest check refuses that. A byte
 * flipped in an offset or a signature is caught structurally, below, because
 * nothing then lines up.
 */

export type ZipFile = { name: string; bytes: Uint8Array };

export class BadZip extends Error {}

const le32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const le16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(bytes: Uint8Array): ZipFile[] {
  // The end record is last, but may be followed by a comment, so it is hunted
  // backwards. The comment can be 64 KB; beyond that this is not a zip.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (le32(bytes, at) === END) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new BadZip('This is not a zip file.');

  const count = le16(bytes, end + 10);
  let at = le32(bytes, end + 16);
  const files: ZipFile[] = [];

  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || le32(bytes, at) !== CENTRAL) {
      throw new BadZip('This zip file is damaged — its index does not line up.');
    }
    const method = le16(bytes, at + 10);
    const stated = le32(bytes, at + 16);
    const size = le32(bytes, at + 24);
    const nameLength = le16(bytes, at + 28);
    const extraLength = le16(bytes, at + 30);
    const commentLength = le16(bytes, at + 32);
    const localAt = le32(bytes, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));

    if (method !== 0) {
      throw new BadZip(`"${name}" is compressed, and only stored entries can be read.`);
    }
    if (localAt + 30 > bytes.length || le32(bytes, localAt) !== LOCAL) {
      throw new BadZip(`"${name}" is not where the index says it is.`);
    }

    // The local header has its own name and extra lengths, which need not match
    // the directory's — the extra field in particular usually does not.
    const from = localAt + 30 + le16(bytes, localAt + 26) + le16(bytes, localAt + 28);
    if (from + size > bytes.length) throw new BadZip(`"${name}" runs off the end of the file.`);

    const data = bytes.subarray(from, from + size);
    if (crc32(data) !== stated) throw new BadZip(`"${name}" is corrupt — its checksum is wrong.`);

    files.push({ name, bytes: data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** One named file out of a zip, or null. Names are matched exactly. */
export const fileIn = (files: ZipFile[], name: string): ZipFile | null =>
  files.find((file) => file.name === name) ?? null;
