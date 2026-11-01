/* ============================================================
   digest.js — 摘要算法 / 对称加密 / 国密 SM3·SM4
   手写 MD5 / MD4 / SM3 / SM4 / RC4，WebCrypto 提供 AES/SHA/HMAC
   ============================================================ */
const Digest = (function () {
  'use strict';

  const U8 = x => new Uint8Array(x);
  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

  /* MD5 / MD4 为小端算法：摘要必须以「低字节在前」输出，
     直接 toString(16) 会得到每 4 字节整体反转的错误结果 */
  const hexLE = words => words.map(w =>
    [w & 255, (w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255]
      .map(b => b.toString(16).padStart(2, '0')).join('')).join('');

  /* ===================== MD5 ===================== */
  function md5(bytes) {
    const K = [];
    for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const len = bytes.length;
    const pad = (((len + 8) >> 6) + 1) << 6;
    const msg = new Uint8Array(pad);
    msg.set(bytes);
    msg[len] = 0x80;
    const bitLen = len * 8;
    const dv = new DataView(msg.buffer);
    dv.setUint32(pad - 8, bitLen >>> 0, true);
    dv.setUint32(pad - 4, Math.floor(bitLen / 4294967296), true);
    for (let off = 0; off < pad; off += 64) {
      const M = [];
      for (let i = 0; i < 16; i++) M.push(dv.getUint32(off + i * 4, true));
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, S[i])) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return hexLE([a0, b0, c0, d0]);
  }

  /* ===================== MD4 (NTLM 依赖) ===================== */
  function md4(bytes) {
    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
    const len = bytes.length;
    const pad = (((len + 8) >> 6) + 1) << 6;
    const msg = new Uint8Array(pad); msg.set(bytes); msg[len] = 0x80;
    const dv = new DataView(msg.buffer);
    dv.setUint32(pad - 8, (len * 8) >>> 0, true);
    const X = new Array(16);
    const F = (x, y, z) => (x & y) | (~x & z);
    const G = (x, y, z) => (x & y) | (x & z) | (y & z);
    const H = (x, y, z) => x ^ y ^ z;
    const rot = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
    for (let off = 0; off < pad; off += 64) {
      for (let i = 0; i < 16; i++) X[i] = dv.getUint32(off + i * 4, true);
      const aa = a, bb = b, cc = c, dd = d;
      for (let i = 0; i < 16; i++) {
        const k = i;
        a = rot((a + F(b, c, d) + X[k]) >>> 0, [3, 7, 11, 19][i % 4]);
        const t = d; d = c; c = b; b = a; a = t;
      }
      for (let i = 0; i < 16; i++) {
        const k = (i % 4) + (Math.floor(i / 4)) * 4;
        const idx = 4 * (i % 4) + Math.floor(i / 4);
        a = rot((a + G(b, c, d) + X[idx] + 0x5A827999) >>> 0, [3, 5, 9, 13][i % 4]);
        const t = d; d = c; c = b; b = a; a = t;
      }
      for (let i = 0; i < 16; i++) {
        const order = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
        a = rot((a + H(b, c, d) + X[order[i]] + 0x6ED9EBA1) >>> 0, [3, 9, 11, 15][i % 4]);
        const t = d; d = c; c = b; b = a; a = t;
      }
      a = (a + aa) >>> 0; b = (b + bb) >>> 0; c = (c + cc) >>> 0; d = (d + dd) >>> 0;
    }
    return hexLE([a, b, c, d]);
  }

  /* ===================== CRC 系列 ===================== */
  function crc(bytes, poly, init, xorout, refin, refout) {
    if (refin) {
      let c = init;
      for (const b of bytes) {
        c ^= b;
        for (let i = 0; i < 8; i++) c = (c & 1) ? ((c >>> 1) ^ poly) : (c >>> 1);
      }
      return (c ^ xorout) >>> 0;
    }
    let c = init;
    for (const b of bytes) {
      c ^= (b << 24) >>> 0;
      for (let i = 0; i < 8; i++) c = (c & 0x80000000) ? ((c << 1) >>> 0) ^ poly : (c << 1) >>> 0;
    }
    return (c ^ xorout) >>> 0;
  }
  const CRC32 = {
    std: b => crc(b, 0xEDB88320, 0xFFFFFFFF, 0xFFFFFFFF, true, true).toString(16).padStart(8, '0'),
    jam: b => crc(b, 0xEDB88320, 0xFFFFFFFF, 0x00000000, true, true).toString(16).padStart(8, '0'),
    xfer: b => crc(b, 0x000000AF, 0x00000000, 0x00000000, false, false).toString(16).padStart(8, '0')
  };

  /* ===================== 国密 SM3 ===================== */
  const SM3_IV = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e];
  function sm3T(j) { return j <= 15 ? 0x79cc4519 : 0x7a879d8a; }
  function sm3FF(x, y, z, j) { return j <= 15 ? (x ^ y ^ z) : ((x & y) | (x & z) | (y & z)); }
  function sm3GG(x, y, z, j) { return j <= 15 ? (x ^ y ^ z) : ((x & y) | (~x & z)); }
  function sm3P0(x) { return (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0; }
  function sm3P1(x) { return (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0; }
  function sm3CF(V, Bi) {
    const W = [], W1 = [];
    for (let i = 0; i < 16; i++) W.push(Bi[i]);
    for (let i = 16; i < 68; i++) {
      W.push((sm3P1(W[i - 16] ^ W[i - 9] ^ rotl(W[i - 3], 15)) ^ rotl(W[i - 13], 7) ^ W[i - 6]) >>> 0);
    }
    for (let i = 0; i < 64; i++) W1.push((W[i] ^ W[i + 4]) >>> 0);
    let [A, B, C, D, E, F, G, H] = V;
    for (let j = 0; j < 64; j++) {
      const T = sm3T(j);
      const A12 = rotl(A, 12);
      const SS1 = (rotl((A12 + E + rotl(T, j)) >>> 0, 7)) >>> 0;
      const SS2 = (SS1 ^ A12) >>> 0;
      const TT1 = (sm3FF(A, B, C, j) + D + SS2 + W1[j]) >>> 0;
      const TT2 = (sm3GG(E, F, G, j) + H + SS1 + W[j]) >>> 0;
      D = C; C = rotl(B, 9); B = A; A = TT1;
      H = G; G = rotl(F, 19); F = E;
      E = (sm3P0(TT2)) >>> 0;
    }
    return [(A ^ V[0]) >>> 0, (B ^ V[1]) >>> 0, (C ^ V[2]) >>> 0, (D ^ V[3]) >>> 0,
    (E ^ V[4]) >>> 0, (F ^ V[5]) >>> 0, (G ^ V[6]) >>> 0, (H ^ V[7]) >>> 0];
  }
  function sm3(bytes) {
    const len = bytes.length;
    const pad = (((len + 8) >> 6) + 1) << 6;
    const msg = new Uint8Array(pad); msg.set(bytes); msg[len] = 0x80;
    const dv = new DataView(msg.buffer);
    const bits = len * 8;
    dv.setUint32(pad - 8, Math.floor(bits / 4294967296), false);
    dv.setUint32(pad - 4, bits >>> 0, false);
    let V = SM3_IV.slice();
    for (let off = 0; off < pad; off += 64) {
      const Bi = [];
      for (let i = 0; i < 16; i++) Bi.push(dv.getUint32(off + i * 4, false));
      V = sm3CF(V, Bi);
    }
    return V.map(x => x.toString(16).padStart(8, '0')).join('');
  }
  /* SM3 HMAC */
  function sm3hmac(key, msg) {
    const B = 64;
    if (key.length > B) key = Codec.hexToBytes(sm3(key));
    const pad = new Uint8Array(B); pad.set(key);
    const ikey = new Uint8Array(B), okey = new Uint8Array(B);
    for (let i = 0; i < B; i++) { ikey[i] = pad[i] ^ 0x36; okey[i] = pad[i] ^ 0x5c; }
    const inner = new Uint8Array(B + msg.length);
    inner.set(ikey); inner.set(msg, B);
    const h = Codec.hexToBytes(sm3(inner));
    const outer = new Uint8Array(B + 32);
    outer.set(okey); outer.set(h, B);
    return sm3(outer);
  }

  /* ===================== 国密 SM4 ===================== */
  const S4 = [
    0xd6, 0x90, 0xe9, 0xfe, 0xcc, 0xe1, 0x3d, 0xb7, 0x16, 0xb6, 0x14, 0xc2, 0x28, 0xfb, 0x2c, 0x05,
    0x2b, 0x67, 0x9a, 0x76, 0x2a, 0xbe, 0x04, 0xc3, 0xaa, 0x44, 0x13, 0x26, 0x49, 0x86, 0x06, 0x99,
    0x9c, 0x42, 0x50, 0xf4, 0x91, 0xef, 0x98, 0x7a, 0x33, 0x54, 0x0b, 0x43, 0xed, 0xcf, 0xac, 0x62,
    0xe4, 0xb3, 0x1c, 0xa9, 0xc9, 0x08, 0xe8, 0x95, 0x80, 0xdf, 0x94, 0xfa, 0x75, 0x8f, 0x3f, 0xa6,
    0x47, 0x07, 0xa7, 0xfc, 0xf3, 0x73, 0x17, 0xba, 0x83, 0x59, 0x3c, 0x19, 0xe6, 0x85, 0x4f, 0xa8,
    0x68, 0x6b, 0x81, 0xb2, 0x71, 0x64, 0xda, 0x8b, 0xf8, 0xeb, 0x0f, 0x4b, 0x70, 0x56, 0x9d, 0x35,
    0x1e, 0x24, 0x0e, 0x5e, 0x63, 0x58, 0xd1, 0xa2, 0x25, 0x22, 0x7c, 0x3b, 0x01, 0x21, 0x78, 0x87,
    0xd4, 0x00, 0x46, 0x57, 0x9f, 0xd3, 0x27, 0x52, 0x4c, 0x36, 0x02, 0xe7, 0xa0, 0xc4, 0xc8, 0x9e,
    0xea, 0xbf, 0x8a, 0xd2, 0x40, 0xc7, 0x38, 0xb5, 0xa3, 0xf7, 0xf2, 0xce, 0xf9, 0x61, 0x15, 0xa1,
    0xe0, 0xae, 0x5d, 0xa4, 0x9b, 0x34, 0x1a, 0x55, 0xad, 0x93, 0x32, 0x30, 0xf5, 0x8c, 0xb1, 0xe3,
    0x1d, 0xf6, 0xe2, 0x2e, 0x82, 0x66, 0xca, 0x60, 0xc0, 0x29, 0x23, 0xab, 0x0d, 0x53, 0x4e, 0x6f,
    0xd5, 0xdb, 0x37, 0x45, 0xde, 0xfd, 0x8e, 0x2f, 0x03, 0xff, 0x6a, 0x72, 0x6d, 0x6c, 0x5b, 0x51,
    0x8d, 0x1b, 0xaf, 0x92, 0xbb, 0xdd, 0xbc, 0x7f, 0x11, 0xd9, 0x5c, 0x41, 0x1f, 0x10, 0x5a, 0xd8,
    0x0a, 0xc1, 0x31, 0x88, 0xa5, 0xcd, 0x7b, 0xbd, 0x2d, 0x74, 0xd0, 0x12, 0xb8, 0xe5, 0xb4, 0xb0,
    0x89, 0x69, 0x97, 0x4a, 0x0c, 0x96, 0x77, 0x7e, 0x65, 0xb9, 0xf1, 0x09, 0xc5, 0x6e, 0xc6, 0x84,
    0x18, 0xf0, 0x7d, 0xec, 0x3a, 0xdc, 0x4d, 0x20, 0x79, 0xee, 0x5f, 0x3e, 0xd7, 0xcb, 0x39, 0x48
  ];
  const FK = [0xa3b1bac6, 0x56aa3350, 0x677d9197, 0xb27022dc];
  function sm4CK() {
    const ck = [];
    for (let i = 0; i < 32; i++) ck.push(((4 * i + 0) * 7 % 256) << 24 | ((4 * i + 1) * 7 % 256) << 16 | ((4 * i + 2) * 7 % 256) << 8 | ((4 * i + 3) * 7 % 256));
    return ck;
  }
  const CK = sm4CK();
  function sm4Rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
  function sm4Sbox(x) {
    return (S4[(x >>> 24) & 255] << 24 | S4[(x >>> 16) & 255] << 16 | S4[(x >>> 8) & 255] << 8 | S4[x & 255]) >>> 0;
  }
  function sm4KeyExt(mk) {
    const dv = new DataView(mk.buffer, mk.byteOffset, 16);
    const K = [];
    for (let i = 0; i < 4; i++) K.push(dv.getUint32(i * 4, false) ^ FK[i]);
    const rk = [];
    for (let i = 0; i < 32; i++) {
      const t = (K[i + 1] ^ K[i + 2] ^ K[i + 3] ^ CK[i]) >>> 0;
      const x = sm4Sbox(t);
      const tb = (x ^ sm4Rotl(x, 13) ^ sm4Rotl(x, 23)) >>> 0;
      K.push((K[i] ^ tb) >>> 0);
      rk.push(K[i + 4]);
    }
    return rk;
  }
  function sm4Block(block, rk) {
    const dv = new DataView(block.buffer, block.byteOffset, 16);
    let X = [];
    for (let i = 0; i < 4; i++) X.push(dv.getUint32(i * 4, false));
    for (let i = 0; i < 32; i++) {
      const t = (X[1] ^ X[2] ^ X[3] ^ rk[i]) >>> 0;
      const sb = sm4Sbox(t);
      const tb = (sb ^ sm4Rotl(sb, 2) ^ sm4Rotl(sb, 10) ^ sm4Rotl(sb, 18) ^ sm4Rotl(sb, 24)) >>> 0;
      X.push((X[0] ^ tb) >>> 0);
      X.shift();
    }
    const out = new Uint8Array(16), odv = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) odv.setUint32(i * 4, X[3 - i], false);
    return out;
  }
  function pkcs7(b) {
    const n = 16 - (b.length % 16), o = new Uint8Array(b.length + n);
    o.set(b); o.fill(n, b.length); return o;
  }
  function unpkcs7(b) {
    const n = b[b.length - 1];
    if (n < 1 || n > 16 || n > b.length) throw new Error('PKCS#7 填充无效，请检查密钥/模式');
    for (let i = b.length - n; i < b.length; i++) if (b[i] !== n) throw new Error('PKCS#7 填充无效，请检查密钥/模式');
    return b.subarray(0, b.length - n);
  }
  const xorBytes = (a, b) => Uint8Array.from(a, (v, i) => v ^ (b[i % b.length]));

  const SM4 = {
    ecbEnc(key, plain) {
      const rk = sm4KeyExt(key), p = pkcs7(plain), out = new Uint8Array(p.length);
      for (let i = 0; i < p.length; i += 16) out.set(sm4Block(p.subarray(i, i + 16), rk), i);
      return out;
    },
    ecbDec(key, cipher) {
      if (cipher.length % 16) throw new Error('密文长度必须是 16 的倍数');
      const rk = sm4KeyExt(key).slice().reverse(), out = new Uint8Array(cipher.length);
      for (let i = 0; i < cipher.length; i += 16) out.set(sm4Block(cipher.subarray(i, i + 16), rk), i);
      return unpkcs7(out);
    },
    cbcEnc(key, plain, iv) {
      const rk = sm4KeyExt(key), p = pkcs7(plain), out = new Uint8Array(p.length);
      let prev = iv.slice(0, 16);
      for (let i = 0; i < p.length; i += 16) {
        const blk = xorBytes(p.subarray(i, i + 16), prev);
        const c = sm4Block(blk, rk);
        out.set(c, i); prev = c;
      }
      return out;
    },
    cbcDec(key, cipher, iv) {
      if (cipher.length % 16) throw new Error('密文长度必须是 16 的倍数');
      const rk = sm4KeyExt(key).slice().reverse(), out = new Uint8Array(cipher.length);
      let prev = iv.slice(0, 16);
      for (let i = 0; i < cipher.length; i += 16) {
        const blk = cipher.subarray(i, i + 16);
        out.set(xorBytes(sm4Block(blk, rk), prev), i);
        prev = blk;
      }
      return unpkcs7(out);
    }
  };

  /* ===================== RC4 ===================== */
  function rc4(key, bytes) {
    const S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + key[i % key.length]) & 255;
      [S[i], S[j]] = [S[j], S[i]];
    }
    let i = 0; j = 0; const out = new Uint8Array(bytes.length);
    for (let k = 0; k < bytes.length; k++) {
      i = (i + 1) & 255; j = (j + S[i]) & 255;
      [S[i], S[j]] = [S[j], S[i]];
      out[k] = bytes[k] ^ S[(S[i] + S[j]) & 255];
    }
    return out;
  }

  /* ===================== WebCrypto 异步层 ===================== */
  async function subtleDigest(algo, bytes) {
    const buf = await crypto.subtle.digest(algo, bytes);
    return Codec.bytesToHex(new Uint8Array(buf));
  }
  async function subtleHmac(algo, keyBytes, bytes) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: algo }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, bytes);
    return Codec.bytesToHex(new Uint8Array(sig));
  }
  async function aesOp(mode, keyBytes, data, iv, encrypt) {
    const algoMap = { CBC: 'AES-CBC', CTR: 'AES-CTR', GCM: 'AES-GCM' };
    if (!algoMap[mode]) throw new Error('WebCrypto 不支持该模式，请使用 SM4/RC4 或命令行 OpenSSL');
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: algoMap[mode] }, false, [encrypt ? 'encrypt' : 'decrypt']);
    const params = mode === 'GCM' ? { name: 'AES-GCM', iv, tagLength: 128 } : { name: algoMap[mode], iv };
    const res = await crypto.subtle[encrypt ? 'encrypt' : 'decrypt'](params, key, data);
    return new Uint8Array(res);
  }

  return {
    md5, md4, sm3, sm3hmac, crc, CRC32, SM4, rc4,
    subtleDigest, subtleHmac, aesOp, pkcs7, unpkcs7, xorBytes
  };
})();
