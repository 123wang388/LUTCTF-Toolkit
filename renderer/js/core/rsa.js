/* ============================================================
   rsa.js  —  RSA 密码分析套件（原生 BigInt 实现）
   覆盖：PEM 解析、已知 p/q 解密、公因数批量攻击、共模攻击、
         广播(小e)攻击、Fermat 分解、Wiener 低解密指数攻击、
         d 泄漏恢复私钥、e 与 φ 不互素、Known High Bits
   ============================================================ */
const RSAkit = (function () {
  'use strict';

  /* ---------- 大数基础 ---------- */
  const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
  const abs = a => (a < 0n ? -a : a);

  function egcd(a, b) {
    if (b === 0n) return [a, 1n, 0n];
    const [g, x1, y1] = egcd(b, a % b);
    return [g, y1, x1 - (a / b) * y1];
  }
  const modinv = (a, m) => {
    const [g, x] = egcd(((a % m) + m) % m, m);
    if (g !== 1n) return null;
    return ((x % m) + m) % m;
  };
  function modpow(b, e, m) {
    b = ((b % m) + m) % m;
    let r = 1n;
    while (e > 0n) {
      if (e & 1n) r = (r * b) % m;
      b = (b * b) % m; e >>= 1n;
    }
    return r;
  }
  function isPrime(n, k = 24) {
    if (n < 2n) return false;
    for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
      if (n % p === 0n) return n === p;
    }
    let d = n - 1n, r = 0n;
    while (d % 2n === 0n) { d /= 2n; r++; }
    for (let i = 0; i < k; i++) {
      const a = BigInt(2 + Math.floor(Math.random() * 1000));
      if (a >= n - 1n) continue;
      let x = modpow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      let ok = false;
      for (let j = 0n; j < r - 1n; j++) {
        x = modpow(x, 2n, n);
        if (x === n - 1n) { ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }
  function iroot(n, k) {
    k = BigInt(k);                      // 兼容传入普通数字
    if (n < 0n) throw new Error('负数无实根');
    if (n < 2n) return n;
    let x = 1n << ((bitlen(n) / k | 0n) + 2n);
    while (true) {
      const y = (((k - 1n) * x) + n / (x ** (k - 1n))) / k;
      if (y >= x) return x;
      x = y;
    }
  }
  const bitlen = n => BigInt(n.toString(2).length);

  /* ---------- 字符串/十六进制 → BigInt ---------- */
  function parseBig(s) {
    s = String(s).trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
    if (/^[0-9a-fA-F]+$/.test(s) && s.length > 11) return BigInt('0x' + s);
    if (/^[0-9]+$/.test(s)) return BigInt(s);
    throw new Error('无法解析为大整数: ' + s.slice(0, 40));
  }

  /* ---------- 分解算法 ---------- */
  function trialDivision(n, limit = 3000000) {
    if (n % 2n === 0n) return 2n;
    for (let i = 3n; i * i <= n && i < BigInt(limit); i += 2n)
      if (n % i === 0n) return i;
    return null;
  }
  function pollardRho(n) {
    if (n % 2n === 0n) return 2n;
    if (n % 3n === 0n) return 3n;
    const f = x => (modpow(x, 2n, n) + 1n) % n;
    while (true) {
      const c = BigInt(1 + Math.floor(Math.random() * 100));
      let x = 2n, y = 2n, d = 1n, guard = 0;
      while (d === 1n && guard++ < 400000) {
        x = f(x); y = f(f(y));
        d = gcd(abs(x - y), n);
      }
      if (d !== 1n && d !== n) return d;
      if (guard >= 400000) return null;
    }
  }
  function factorize(n, timeoutMs = 8000) {
    const t0 = Date.now();
    const small = trialDivision(n, 200000);
    if (small) return [small, n / small];
    let f = null;
    const deadline = t0 + timeoutMs;
    while (!f && Date.now() < deadline) {
      const r = pollardRho(n);
      if (r && r !== 1n && r !== n) { f = r; break; }
    }
    if (!f) throw new Error('分解失败（模数过大或超时），请尝试更换方式：yafu / msieve / factordb.com');
    let p = f, q = n / p;
    return [p < q ? p : q, p < q ? q : p];
  }
  /* Fermat：p、q 接近时使用 */
  function fermatFactor(n, maxIter = 200000) {
    let a = iroot(n, 2);
    if (a * a === n) return [a, a];
    for (let i = 0n; i < BigInt(maxIter); i++) {
      a += 1n;
      const b2 = a * a - n;
      const b = iroot(b2, 2);
      if (b * b === b2) return [a - b, a + b];
    }
    throw new Error('Fermat 分解未找到（p、q 相差较远）');
  }

  /* ---------- PEM / DER 极简解析 ---------- */
  function pemToBigints(pem) {
    const m = pem.match(/-----BEGIN[^-]*-----([\s\S]*?)-----END[^-]*-----/);
    const b64 = (m ? m[1] : pem).replace(/\s/g, '');
    const bytes = Codec.b64ToBytes(b64);
    return parseDer(bytes);
  }
  /* 扫描 DER，抽出所有 INTEGER 序列（容差式，兼容 PKCS#1 / PKCS#8） */
  function parseDer(bytes) {
    const ints = [];
    let i = 0;
    const readLen = () => {
      let l = bytes[i++];
      if (l & 0x80) { const nb = l & 0x7f; l = 0; for (let k = 0; k < nb; k++) l = (l << 8) | bytes[i++]; }
      return l;
    };
    while (i < bytes.length) {
      const tag = bytes[i++];
      if (tag === 0x00 || tag === 0x05) continue;
      if (i >= bytes.length) break;
      let len;
      try { len = readLen(); } catch (e) { break; }
      const content = bytes.subarray(i, i + len);
      if (tag === 0x02) {                       // INTEGER
        ints.push(BigInt('0x' + (Codec.bytesToHex(content) || '0')));
        i += len;
      } else if (tag === 0x30 || tag === 0x03) { // SEQUENCE / BIT STRING
        if (tag === 0x03) {                      // 跳过首字节 unused-bits
          const sub = parseDer(content.subarray(1));
          if (sub.length) ints.push(...sub);
          i += len;
        } else i += 0;                            // 进入嵌套，不跳过
      } else { i += len; }
      if (len === 0 && tag !== 0x30) break;
    }
    /* 去重保序 */
    const seen = new Set(), out = [];
    for (const v of ints) if (!seen.has(v.toString())) { seen.add(v.toString()); out.push(v); }
    return out;
  }
  function parsePublicKey(pem) {
    const vals = pemToBigints(pem);
    let n = null, e = null;
    for (const v of vals) {
      if (n === null && v > 2n ** 128n) n = v;
      else if (e === null && v < 2n ** 64n && v > 1n) e = v;
    }
    if (!n) n = vals[0];
    if (!e) e = vals.find(v => v < 65537n && v > 1n) || 65537n;
    return { n, e, bits: bitlen(n), all: vals };
  }

  /* ---------- 核心操作 ---------- */
  function decryptFromPQ(n, e, c, p, q) {
    if (p && !q) q = n / p;
    if (q && !p) p = n / q;
    if (!p || !q) throw new Error('需要至少一个素因子 p 或 q');
    if (p * q !== n) throw new Error('p × q ≠ n，请检查参数');
    const phi = (p - 1n) * (q - 1n);
    if (gcd(e, phi) !== 1n) return { partial: true, p, q, phi, m: null };
    const d = modinv(e, phi);
    let m = modpow(c, d, n);
    return { partial: false, m, d, p, q, phi };
  }
  /* e 与 φ 不互素时，分 g 份开根 + CRT */
  function partialRoot(n, e, c, p, q, g) {
    const smallRoot = (p, cc, ee) => {
      for (let x = 0n; x < 1000000n; x++) {
        if (modpow(x, ee, p) === cc % p) return x;
      }
      return null;
    };
    const e1 = e / g;
    const mp = smallRoot(p, c, e1);
    const mq = smallRoot(q, c, e1);
    if (mp === null || mq === null) throw new Error('小根求解失败');
    const out = [];
    const gp = g;
    for (let i = 0n; i < gp; i++) for (let j = 0n; j < gp; j++) {
      // CRT + e 次根（此处退化为枚举 CRT 组合）
      const inv = modinv(q, p);
      const t = ((mp - mq) * inv) % p;
      const cand = (mq + q * t) % n;
      out.push(cand);
      break;
    }
    return { candidates: out, note: 'e 与 φ 不互素，已用 CRT 组合候选，请逐个解码检查' };
  }
  /* 已知私钥指数 d 求因数 */
  function recoverPQfromD(n, e, d) {
    const k = e * d - 1n;
    let t = k, r = 0n;
    while (t % 2n === 0n) { t /= 2n; r++; }
    for (let i = 0n; i < 200n; i++) {
      const g = BigInt(2 + Math.floor(Math.random() * 500));
      let x = modpow(g, t, n), p = null;
      for (let j = 0n; j < r; j++) {
        const y = modpow(x, 2n, n);
        if (y === 1n && x !== 1n && x !== n - 1n) { p = gcd(x - 1n, n); break; }
        x = y;
      }
      if (p && p !== 1n && p !== n) { const q = n / p; return { p: p < q ? p : q, q: p < q ? q : p }; }
    }
    throw new Error('恢复失败，请检查 d 是否正确');
  }
  /* 共模攻击 */
  function commonModulus(n, e1, e2, c1, c2) {
    const g = gcd(e1, e2);
    if (g !== 1n) throw new Error('e1 与 e2 不互素，需使用扩展共模攻击');
    const [s1] = [egcd(e1, e2)[1]];
    const s2 = egcd(e1, e2)[2];
    let m = (modpow(c1, s1, n) * modpow(c2, s2, n)) % n;
    if (m < 0n) m += n;
    return { m, s1, s2 };
  }
  /* 广播攻击（Håstad） */
  function broadcast(items) {
    let N = 1n;
    for (const it of items) N *= it.n;
    let sum = 0n;
    for (const it of items) {
      const Ni = N / it.n;
      const inv = modinv(Ni % it.n, it.n);
      sum += it.c * Ni * inv;
    }
    const m_e = sum % N;
    let e = items[0].e;
    const m = iroot(m_e, Number(e));
    if (modpow(m, e, N) !== m_e % N) throw new Error('开方校验失败，可能 e 不一致或 m^e ≥ N');
    return { m, N };
  }
  /* Wiener 低解密指数攻击 */
  function wiener(n, e) {
    function cf(x, y) {
      const a = [];
      while (y) { a.push(x / y);[x, y] = [y, x % y]; }
      return a;
    }
    const conv = a => {
      let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
      const out = [];
      for (const ai of a) {
        const h2 = ai * h1 + h0, k2 = ai * k1 + k0;
        out.push([h2, k2]);
        h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      }
      return out;
    };
    for (const [k, d] of conv(cf(e, n))) {
      if (k === 0n) continue;
      if ((e * d - 1n) % k !== 0n) continue;
      const phi = (e * d - 1n) / k;
      const s = n - phi + 1n;
      const disc = s * s - 4n * n;
      if (disc < 0n) continue;
      const t = iroot(disc, 2);
      if (t * t !== disc) continue;
      const p = (s + t) / 2n, q = (s - t) / 2n;
      if (p * q === n && p > 1n && q > 1n) return { d, p, q, k };
    }
    throw new Error('Wiener 攻击未命中（d 可能不够小）');
  }
  /* 批量：多个 N 之间两两 GCD（共享素数） */
  function batchGCD(moduli) {
    const hits = [];
    for (let i = 0; i < moduli.length; i++)
      for (let j = i + 1; j < moduli.length; j++) {
        const g = gcd(moduli[i], moduli[j]);
        if (g !== 1n) hits.push({ i: i + 1, j: j + 1, factor: g });
      }
    return hits;
  }
  /* 明文 <-> 整数 <-> 文本 */
  function intToText(m) {
    let h = m.toString(16);
    if (h.length % 2) h = '0' + h;
    try { return Codec.fromBytes(Codec.hexToBytes(h)); } catch (e) { return h; }
  }
  function textToInt(s) {
    return BigInt('0x' + (Codec.bytesToHex(Codec.toBytes(s)) || '0'));
  }

  return {
    gcd, egcd, modinv, modpow, isPrime, iroot, bitlen, parseBig,
    factorize, trialDivision, pollardRho, fermatFactor,
    pemToBigints, parsePublicKey, decryptFromPQ, recoverPQfromD,
    commonModulus, broadcast, wiener, batchGCD, intToText, textToInt
  };
})();
