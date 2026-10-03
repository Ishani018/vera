/* Enough PNG to read one and write one, with no dependency. */
const fs = require('node:fs');
const zlib = require('node:zlib');

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

/** An 8-bit RGBA PNG, read back as {width, height, data}. */
function readPng(path) {
  const buf = fs.readFileSync(path);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const type = buf[25];
  if (depth !== 8 || (type !== 6 && type !== 2)) {
    throw new Error(`only 8-bit RGB/RGBA here, got depth ${depth} type ${type}`);
  }
  const bpp = type === 6 ? 4 : 3;
  let at = 8;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const tag = buf.toString('ascii', at + 4, at + 8);
    if (tag === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    if (tag === 'IEND') break;
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const flat = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? flat[y * stride + x - bpp] : 0;
      const b = y > 0 ? flat[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? flat[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      flat[y * stride + x] = v & 255;
    }
  }
  // Always hand back RGBA.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++) {
    data[i * 4] = flat[j];
    data[i * 4 + 1] = flat[j + 1];
    data[i * 4 + 2] = flat[j + 2];
    data[i * 4 + 3] = bpp === 4 ? flat[j + 3] : 255;
    j += bpp;
  }
  return { width, height, data };
}

/** Writes RGB (colour type 2): no alpha channel at all, so it cannot be transparent. */
function writeOpaquePng(path, { width, height, data }) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter, so what is written is what is meant
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = y * (stride + 1) + 1 + x * 3;
      raw[to] = data[from];
      raw[to + 1] = data[from + 1];
      raw[to + 2] = data[from + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

module.exports = { readPng, writeOpaquePng };
