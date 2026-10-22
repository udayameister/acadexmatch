/**
 * Pure-JavaScript PBKDF2-HMAC-SHA256, used when the browser's Web Crypto API is unavailable.
 * Browsers only expose `crypto.subtle` on secure origins (https:// or localhost), so opening the
 * app over plain http on a network address (e.g. http://192.168.1.10:3000) needs this fallback.
 * Output is byte-for-byte identical to Web Crypto's PBKDF2 / SHA-256.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** Processes one 64-byte block (as 16 big-endian words in w[0..15]) into state h. */
function compress(h: Uint32Array, w: Uint32Array): void {
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15], b = w[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

/** Full SHA-256 of a byte array. */
function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array(IV);
  const w = new Uint32Array(64);
  const len = data.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bitLen = len * 8;
  buf[total - 4] = (bitLen >>> 24) & 0xff; buf[total - 3] = (bitLen >>> 16) & 0xff;
  buf[total - 2] = (bitLen >>> 8) & 0xff; buf[total - 1] = bitLen & 0xff;
  buf[total - 5] = Math.floor(len / 0x20000000) & 0xff;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
    }
    compress(h, w);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i * 4] = h[i] >>> 24; out[i * 4 + 1] = h[i] >>> 16; out[i * 4 + 2] = h[i] >>> 8; out[i * 4 + 3] = h[i]; }
  return out;
}

/** HMAC-SHA256 key schedule: the states after absorbing (key ^ ipad) and (key ^ opad). */
function hmacStates(key: Uint8Array): { inner: Uint32Array; outer: Uint32Array } {
  let k = key.length > 64 ? sha256(key) : key;
  const block = new Uint8Array(64);
  block.set(k);
  k = block;
  const w = new Uint32Array(64);
  const mk = (pad: number) => {
    const st = new Uint32Array(IV);
    for (let i = 0; i < 16; i++) {
      const j = i * 4;
      w[i] = ((k[j] ^ pad) << 24) | ((k[j + 1] ^ pad) << 16) | ((k[j + 2] ^ pad) << 8) | (k[j + 3] ^ pad);
    }
    compress(st, w);
    return st;
  };
  return { inner: mk(0x36), outer: mk(0x5c) };
}

/** HMAC of a 32-byte message given as 8 words, using precomputed states; result written to out (8 words). */
function hmac32(inner: Uint32Array, outer: Uint32Array, msg: Uint32Array, out: Uint32Array, w: Uint32Array, st: Uint32Array): void {
  // inner: state(inner) + msg(32 bytes) + padding; total length = 64 + 32 bytes = 768 bits
  st.set(inner);
  for (let i = 0; i < 8; i++) w[i] = msg[i];
  w[8] = 0x80000000; w[9] = 0; w[10] = 0; w[11] = 0; w[12] = 0; w[13] = 0; w[14] = 0; w[15] = 768;
  compress(st, w);
  const innerHash = st.slice(0, 8);
  st.set(outer);
  for (let i = 0; i < 8; i++) w[i] = innerHash[i];
  w[8] = 0x80000000; w[9] = 0; w[10] = 0; w[11] = 0; w[12] = 0; w[13] = 0; w[14] = 0; w[15] = 768;
  compress(st, w);
  for (let i = 0; i < 8; i++) out[i] = st[i];
}

/** PBKDF2-HMAC-SHA256 producing 32 bytes (one block). */
export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  const { inner, outer } = hmacStates(password);
  // U1 = HMAC(P, salt || INT(1)) computed with the generic path
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[salt.length + 3] = 1;
  const innerBytes = new Uint8Array(64 + first.length);
  // generic HMAC for U1
  const keyBlock = new Uint8Array(64);
  keyBlock.set(password.length > 64 ? sha256(password) : password);
  for (let i = 0; i < 64; i++) innerBytes[i] = keyBlock[i] ^ 0x36;
  innerBytes.set(first, 64);
  const ih = sha256(innerBytes);
  const outerBytes = new Uint8Array(96);
  for (let i = 0; i < 64; i++) outerBytes[i] = keyBlock[i] ^ 0x5c;
  outerBytes.set(ih, 64);
  const u1 = sha256(outerBytes);

  const u = new Uint32Array(8);
  for (let i = 0; i < 8; i++) u[i] = (u1[i * 4] << 24) | (u1[i * 4 + 1] << 16) | (u1[i * 4 + 2] << 8) | u1[i * 4 + 3];
  const t = u.slice();
  const w = new Uint32Array(64);
  const st = new Uint32Array(8);
  for (let n = 1; n < iterations; n++) {
    hmac32(inner, outer, u, u, w, st);
    for (let i = 0; i < 8; i++) t[i] ^= u[i];
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i * 4] = t[i] >>> 24; out[i * 4 + 1] = t[i] >>> 16; out[i * 4 + 2] = t[i] >>> 8; out[i * 4 + 3] = t[i]; }
  return out;
}
