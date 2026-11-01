/* ============================================================
   classical.js — 古典密码 & 自动化破译引擎
   词频分析 / χ² 检验 / IC 重合指数 / 爬山法替换密码破解
   ============================================================ */
const Classical = (function () {
  'use strict';

  /* 英文字母频率（%） */
  const FREQ = {
    A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015, H: 6.094,
    I: 6.966, J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749, O: 7.507, P: 1.929,
    Q: 0.095, R: 5.987, S: 6.327, T: 9.056, U: 2.758, V: 0.978, W: 2.360, X: 0.150,
    Y: 1.974, Z: 0.074
  };
  /* 常见英文单词（用于评分） */
  const WORDS = ['THE', 'AND', 'ING', 'ENT', 'ION', 'HER', 'FOR', 'THA', 'NTH', 'INT',
    'ERE', 'TIO', 'TER', 'EST', 'ERS', 'ATI', 'HAT', 'ATE', 'ALL', 'ETH', 'HES', 'VER',
    'HIS', 'OFT', 'ITH', 'FTH', 'STH', 'OTH', 'RES', 'ONT', 'LAG', 'FLAG', 'FLAG{'];
  /* Top bigrams 部分权重 */
  const BIGRAM = ['TH', 'HE', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND', 'TI', 'ES',
    'OR', 'TE', 'OF', 'ED', 'IS', 'IT', 'AL', 'AR', 'ST', 'TO', 'NT', 'NG'];

  const A = 65, A_CNT = 26;
  const onlyAlpha = s => s.toUpperCase().replace(/[^A-Z]/g, '');
  const idx = c => c.charCodeAt(0) - A;
  const chr = i => String.fromCharCode(i + A);

  /* ---------- χ² 拟合度评分（越小越接近英文） ---------- */
  function chi2(text) {
    const t = onlyAlpha(text);
    if (!t.length) return 1e9;
    const cnt = {}; let tot = 0;
    for (const c of t) { cnt[c] = (cnt[c] || 0) + 1; tot++; }
    let s = 0;
    for (let i = 0; i < 26; i++) {
      const o = cnt[chr(i)] || 0, e = tot * FREQ[chr(i)] / 100;
      s += (o - e) * (o - e) / (e || 0.01);
    }
    return s;
  }
  /* ---------- IC 重合指数 ---------- */
  function ic(text) {
    const t = onlyAlpha(text);
    const n = t.length;
    if (n < 2) return 0;
    const cnt = {}; for (const c of t) cnt[c] = (cnt[c] || 0) + 1;
    let s = 0;
    for (const k in cnt) s += cnt[k] * (cnt[k] - 1);
    return s / (n * (n - 1));
  }
  /* ---------- 英文度评分（含单词加成） ---------- */
  function scoreEnglish(text) {
    let sc = -chi2(text);
    const up = text.toUpperCase();
    for (const w of WORDS) {
      const re = new RegExp(w, 'g');
      const m = up.match(re);
      if (m) sc += m.length * (w.length >= 4 ? 60 : 30);
    }
    for (const b of BIGRAM) {
      const m = up.match(new RegExp(b, 'g'));
      if (m) sc += m.length * 2;
    }
    return sc;
  }

  /* ================= 凯撒 ================= */
  const Caesar = {
    enc: (s, k) => onlyAlpha(s).replace(/[A-Z]/g, c => chr((idx(c) + k) % 26)),
    dec: (s, k) => Caesar.enc(s, (26 - (k % 26)) % 26),
    keepCase(s, k) {
      return s.replace(/[A-Za-z]/g, c => {
        const up = c === c.toUpperCase();
        const r = String.fromCharCode((c.toUpperCase().charCodeAt(0) - A + k) % 26 + A);
        return up ? r : r.toLowerCase();
      });
    },
    brute(s) {
      const out = [];
      for (let k = 0; k < 26; k++) out.push({ k, text: Caesar.dec(s, k), chi: +chi2(Caesar.dec(s, k)).toFixed(1) });
      out.sort((a, b) => a.chi - b.chi);
      return out;
    }
  };

  /* ================= Atbash 埃特巴什 ================= */
  const Atbash = s => s.replace(/[A-Za-z]/g, c => {
    const up = c === c.toUpperCase(), u = c.toUpperCase();
    const r = String.fromCharCode(90 - (u.charCodeAt(0) - A));
    return up ? r : r.toLowerCase();
  });

  /* ================= 维吉尼亚 ================= */
  const Vigenere = {
    enc(s, key) {
      key = onlyAlpha(key); let i = 0;
      return onlyAlpha(s).replace(/[A-Z]/g, c => chr((idx(c) + idx(key[i++ % key.length])) % 26));
    },
    dec(s, key) {
      key = onlyAlpha(key); let i = 0;
      return onlyAlpha(s).replace(/[A-Z]/g, c => chr((idx(c) - idx(key[i++ % key.length]) + 26) % 26));
    },
    /* IC 平均法推断密钥长度 */
    keyLens(s, max = 20) {
      const out = [];
      for (let k = 1; k <= max; k++) {
        let sum = 0;
        for (let i = 0; i < k; i++) {
          const col = [];
          for (let j = i; j < s.length; j += k) col.push(s[j]);
          if (col.length > 1) sum += ic(col.join(''));
        }
        out.push({ len: k, ic: +(sum / k).toFixed(4) });
      }
      out.sort((a, b) => Math.abs(b.ic - 0.0667) - Math.abs(a.ic - 0.0667));
      return out;
    },
    /* 自动破译：χ² 逐列求解 + 整体评分校验 */
    crack(s) {
      s = onlyAlpha(s);
      if (s.length < 12) throw new Error('文本过短，至少需要 12 个字母');
      const lens = Vigenere.keyLens(s, Math.min(20, Math.floor(s.length / 3)));
      let best = null;
      for (const cand of lens.slice(0, 5)) {
        const L = cand.len;
        let key = '';
        for (let i = 0; i < L; i++) {
          const col = [];
          for (let j = i; j < s.length; j += L) col.push(s[j]);
          const cj = col.join('');
          let bk = 0, bv = Infinity;
          for (let k = 0; k < 26; k++) {
            let v = 0;
            for (const c of cj) v += FREQ[chr((idx(c) - k + 26) % 26)] / 100;
            const observed = {};
            for (const c of cj) observed[c] = (observed[c] || 0) + 1;
            let x = 0;
            for (const c in observed) {
              const e = cj.length * FREQ[chr((idx(c) - k + 26) % 26)] / 100;
              x += Math.pow(observed[c] - e, 2) / (e || 0.01);
            }
            if (x < bv) { bv = x; bk = k; }
          }
          key += chr(bk);
        }
        const pt = Vigenere.dec(s, key);
        const sc = scoreEnglish(pt);
        if (!best || sc > best.score) best = { key, plain: pt, score: sc, len: L };
      }
      return best;
    }
  };

  /* ================= Beaufort / Autokey ================= */
  const Beaufort = {
    enc(s, key) { key = onlyAlpha(key); let i = 0; return onlyAlpha(s).replace(/[A-Z]/g, c => chr((idx(key[i++ % key.length]) - idx(c) + 26) % 26)); },
    dec: (s, key) => Beaufort.enc(s, key)
  };
  const Autokey = {
    enc(s, key) {
      const t = onlyAlpha(s); key = onlyAlpha(key);
      let stream = key, out = '';
      for (let i = 0; i < t.length; i++) { stream += t[i]; }
      for (let i = 0; i < t.length; i++) out += chr((idx(t[i]) + idx(stream[i])) % 26);
      return out;
    },
    dec(s, key) {
      const t = onlyAlpha(s); key = onlyAlpha(key);
      let out = '', stream = key;
      for (let i = 0; i < t.length; i++) {
        const p = chr((idx(t[i]) - idx(stream[i]) + 26) % 26);
        out += p; stream += p;
      }
      return out;
    }
  };

  /* ================= 仿射 ================= */
  const AFFINE_COPRIME = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
  const modinv = (a, m) => { for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x; return null; };
  const Affine = {
    enc(s, a, b) { return onlyAlpha(s).replace(/[A-Z]/g, c => chr((a * idx(c) + b) % 26)); },
    dec(s, a, b) {
      const ai = modinv(a, 26);
      if (ai === null) throw new Error('a=' + a + ' 与 26 不互素，无逆元');
      return onlyAlpha(s).replace(/[A-Z]/g, c => chr((ai * (idx(c) - b + 26) + 26) % 26));
    },
    brute(s) {
      const out = [];
      for (const a of AFFINE_COPRIME) for (let b = 0; b < 26; b++) {
        try { const p = Affine.dec(s, a, b); out.push({ a, b, text: p, chi: +chi2(p).toFixed(1) }); } catch (e) { }
      }
      out.sort((x, y) => x.chi - y.chi);
      return out.slice(0, 12);
    }
  };

  /* ================= 栅栏 Rail-Fence ================= */
  function railPattern(n, rails) {
    const rows = Array.from({ length: rails }, () => []);
    let r = 0, dir = 1;
    for (let i = 0; i < n; i++) {
      rows[r].push(i);
      if (r === rails - 1) dir = -1; else if (r === 0) dir = 1;
      r += dir;
    }
    return rows.flat();
  }
  const Railfence = {
    enc(s, rails) {
      const order = railPattern(s.length, rails);
      const rows = Array.from({ length: rails }, () => '');
      let k = 0;
      for (const target of order) { /* order[i] = 第i个字符属于第几行 */
      }
      /* 重新计算：直接按行列 */
      const rr = Array.from({ length: rails }, () => []);
      let r = 0, dir = 1;
      for (let i = 0; i < s.length; i++) { rr[r].push(s[i]); if (r === rails - 1) dir = -1; else if (r === 0) dir = 1; r += dir; }
      return rr.map(x => x.join('')).join('');
    },
    dec(s, rails) {
      const rows = Array.from({ length: rails }, () => 0);
      let r = 0, dir = 1;
      for (let i = 0; i < s.length; i++) { rows[r]++; if (r === rails - 1) dir = -1; else if (r === 0) dir = 1; r += dir; }
      const cut = []; let acc = 0;
      for (const len of rows) { cut.push([acc, acc + len]); acc += len; }
      const parts = cut.map(([a, b]) => s.slice(a, b));
      const pos = Array.from({ length: rails }, () => 0);
      let out = ''; r = 0; dir = 1;
      for (let i = 0; i < s.length; i++) {
        out += parts[r][pos[r]++];
        if (r === rails - 1) dir = -1; else if (r === 0) dir = 1; r += dir;
      }
      return out;
    },
    brute(s, max = 12) {
      const out = [];
      for (let k = 2; k <= Math.min(max, s.length - 1); k++) {
        try { const p = Railfence.dec(s, k); out.push({ rails: k, text: p, chi: +chi2(p).toFixed(1) }); } catch (e) { }
      }
      return out.sort((a, b) => a.chi - b.chi);
    },
    /* W 型（按行读的长栅栏） */
    wtype(s, rails) {
      const rr = Array.from({ length: rails }, () => []);
      for (let i = 0; i < s.length; i++) rr[i % rails].push(s[i]);
      return rr.map(x => x.join('')).join('');
    }
  };

  /* ================= 列移位 Columnar Transposition ================= */
  /* 按键词的字母顺序生成读取次序，重复字母按出现先后保持稳定排序 */
  function keyOrder(key) {
    return Array.from(key)
      .map((ch, i) => ({ ch, i }))
      .sort((x, y) => (x.ch < y.ch ? -1 : x.ch > y.ch ? 1 : x.i - y.i))
      .map(o => o.i);
  }
  const Columnar = {
    enc(s, key) {
      key = onlyAlpha(key); const cols = key.length;
      if (!cols) throw new Error('请提供密钥词');
      /* 补 'X' 使其成为完整矩形，保证加解密可逆 */
      const rows = Array.from({ length: Math.ceil(s.length / cols) }, () => Array(cols).fill('X'));
      let k = 0;
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) rows[r][c] = s[k++] || 'X';
      const gi = keyOrder(key);
      return gi.map(i => rows.map(r => r[i]).join('')).join('');
    },
    dec(s, key) {
      key = onlyAlpha(key); const cols = key.length;
      if (!cols) throw new Error('请提供密钥词');
      const gi = keyOrder(key);
      /* 计算每一列的长度（前 s.length % cols 列多一个字符，不足则下一轮次多一个） */
      const base = Math.floor(s.length / cols), extra = s.length % cols;
      const colLen = Array(cols).fill(base);
      for (let i = 0; i < extra; i++) colLen[i]++;
      const parts = Array(cols).fill('');
      let k = 0;
      for (const i of gi) { parts[i] = s.substr(k, colLen[i]); k += colLen[i]; }
      const rows = Math.ceil(s.length / cols);
      let out = '';
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out += parts[c][r] || '';
      return out;
    }
  };

  /* ================= Playfair ================= */
  function pfMatrix(key) {
    key = onlyAlpha(key).replace(/J/g, 'I');
    const seen = new Set(), sq = [];
    for (const c of key + 'ABCDEFGHIKLMNOPQRSTUVWXYZ')
      if (!seen.has(c)) { seen.add(c); sq.push(c); }
    return sq;
  }
  const Playfair = {
    enc(s, key) {
      const sq = pfMatrix(key);
      let t = onlyAlpha(s).replace(/J/g, 'I');
      const pairs = [];
      for (let i = 0; i < t.length; i += 2) {
        if (i + 1 >= t.length) pairs.push([t[i], 'X']);
        else if (t[i] === t[i + 1]) { pairs.push([t[i], 'X']); i--; }
        else pairs.push([t[i], t[i + 1]]);
      }
      return pairs.map(([a, b]) => {
        const pa = sq.indexOf(a), pb = sq.indexOf(b);
        const ra = Math.floor(pa / 5), ca = pa % 5, rb = Math.floor(pb / 5), cb = pb % 5;
        if (ra === rb) return sq[ra * 5 + (ca + 1) % 5] + sq[rb * 5 + (cb + 1) % 5];
        if (ca === cb) return sq[((ra + 1) % 5) * 5 + ca] + sq[((rb + 1) % 5) * 5 + cb];
        return sq[ra * 5 + cb] + sq[rb * 5 + ca];
      }).join('');
    },
    dec(s, key) {
      const sq = pfMatrix(key);
      let t = onlyAlpha(s);
      let out = '';
      for (let i = 0; i < t.length; i += 2) {
        const pa = sq.indexOf(t[i]), pb = sq.indexOf(t[i + 1]);
        const ra = Math.floor(pa / 5), ca = pa % 5, rb = Math.floor(pb / 5), cb = pb % 5;
        if (ra === rb) out += sq[ra * 5 + (ca + 4) % 5] + sq[rb * 5 + (cb + 4) % 5];
        else if (ca === cb) out += sq[((ra + 4) % 5) * 5 + ca] + sq[((rb + 4) % 5) * 5 + cb];
        else out += sq[ra * 5 + cb] + sq[rb * 5 + ca];
      }
      return out;
    }
  };

  /* ================= Polybius / Nihilist ================= */
  const Polybius = {
    enc(s, key) {
      const alpha = pfMatrix(key);
      return onlyAlpha(s).replace(/J/g, 'I').replace(/[A-Z]/g, c => {
        const i = alpha.indexOf(c);
        return String(Math.floor(i / 5) + 1) + String(i % 5 + 1);
      });
    },
    dec(s, key) {
      const alpha = pfMatrix(key);
      const d = s.replace(/[^1-5]/g, '');
      let out = '';
      for (let i = 0; i + 1 < d.length; i += 2)
        out += alpha[(parseInt(d[i]) - 1) * 5 + parseInt(d[i + 1]) - 1] || '?';
      return out;
    }
  };

  /* ================= ADFGX / ADFGVX ================= */
  function adfgvx(fn) { return fn; }
  const ADFGX = {
    table(alph = 'ABCDEFGHIKLMNOPQRSTUVWXYZ', isVx) {
      return Array.from(alph.length === 25 || !isVx ? alph : alph);
    },
    enc(s, key, fiveLetter) {
      const set = fiveLetter ? 'ABCDEFGHIKLMNOPQRSTUVWXYZ' : 'ABCDEFGHIKLMNOPQRSTUVWXYZ0123456789';
      const coords = fiveLetter ? 'ADFGX' : 'ADFGVX';
      const n = fiveLetter ? 5 : 6;
      let frac = '';
      for (const c of onlyAlpha(s).replace(/J/g, 'I')) {
        const i = set.indexOf(c);
        if (i < 0) continue;
        frac += coords[Math.floor(i / n)] + coords[i % n];
      }
      key = onlyAlpha(key);
      const cols = key.length;
      const rows = Array.from({ length: Math.ceil(frac.length / cols) }, () => Array(cols).fill(''));
      let k = 0;
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) rows[r][c] = frac[k++] || '';
      const order = Array.from(key).map((c, i) => [c, i]).sort((a, b) => a[0] < b[0] ? -1 : 1);
      const gi = order.map(x => x[1]);
      return gi.map(i => rows.map(r => r[i]).join('')).join('');
    }
  };

  /* ================= 简单替换 + 爬山法自动破译 ================= */
  const Substitution = {
    enc(s, map) { return s.toUpperCase().replace(/[A-Z]/g, c => map[c] || c); },
    /* map: plain -> cipher */
    dec(s, revmap) { return s.toUpperCase().replace(/[A-Z]/g, c => revmap[c] || c); },
    /* hill-climbing 自动求解 */
    crack(text, iters = 6000) {
      const t = onlyAlpha(text);
      if (t.length < 30) throw new Error('建议提供 ≥30 个字母以提高破译准确率');
      const letters = [...Array(26)].map((_, i) => chr(i));
      let key = letters.slice();
      const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
      let bestKey = key.slice(), bestScore = -Infinity;
      const dec = (s, k) => {
        const m = {}; for (let i = 0; i < 26; i++) m[k[i]] = chr(i);
        return s.replace(/[A-Z]/g, c => m[c] || c);
      };
      let curKey = shuffle(key.slice());
      let curScore = scoreEnglish(dec(t, curKey));
      for (let it = 0; it < iters; it++) {
        const a = Math.random() * 26 | 0, b = Math.random() * 26 | 0;
        if (a === b) continue;
        const trial = curKey.slice();
        [trial[a], trial[b]] = [trial[b], trial[a]];
        const sc = scoreEnglish(dec(t, trial));
        if (sc >= curScore) { curScore = sc; curKey = trial; }
        if (sc > bestScore) { bestScore = sc; bestKey = trial.slice(); }
      }
      const m = {}; for (let i = 0; i < 26; i++) m[bestKey[i]] = chr(i);
      return { plain: dec(t, bestKey), map: m, score: +bestScore.toFixed(1) };
    }
  };

  /* ================= XOR CTF 常用 ================= */
  const XorKits = {
    single(sstr, key) {
      return Array.from(sstr).map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join('');
    },
    /* 单字节爆破，按可打印度 & 英文度排序 */
    bruteSingle(hexOrStr, fromHex) {
      let bytes;
      if (fromHex) bytes = Codec.hexToBytes(hexOrStr);
      else bytes = Codec.toBytes(hexOrStr);
      const out = [];
      for (let k = 0; k < 256; k++) {
        const dec = Array.from(bytes, b => String.fromCharCode(b ^ k)).join('');
        const printable = /^[\x20-\x7E\r\n\t]*$/.test(dec);
        const sc = printable ? scoreEnglish(dec) : -1e6;
        out.push({ key: k, text: dec, printable, keys: printable ? (k <= 0x7f ? [k.toString(16).padStart(2, '0'), String.fromCharCode(k)] : [k.toString(16)]) : [] });
        out[out.length - 1].score = sc;
      }
      out.sort((a, b) => b.score - a.score);
      return out.filter(o => o.printable).slice(0, 16);
    },
    /* 重复密钥 XOR */
    repeat(text, key) {
      let out = '';
      for (let i = 0; i < text.length; i++) out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      return out;
    },
    repeatHex(input, key) {
      const bytes = typeof input === 'string' && /^[0-9a-fA-F\s]+$/.test(input.trim()) && input.replace(/\s/g, '').length % 2 === 0
        ? Codec.hexToBytes(input) : Codec.toBytes(input);
      const kb = Codec.toBytes(key);
      return Array.from(bytes, (b, i) => String.fromCharCode(b ^ kb[i % kb.length])).join('');
    },
    /* 已知明文头推断密钥（如 flag{ 开头） */
    guessKey(hexStr, known) {
      const bytes = Codec.hexToBytes(hexStr);
      const kb = Codec.toBytes(known);
      let k = '';
      for (let i = 0; i < kb.length; i++) k += String.fromCharCode(bytes[i] ^ kb[i]);
      return k;
    }
  };

  return {
    FREQ, chi2, ic, scoreEnglish, onlyAlpha,
    Caesar, Atbash, Vigenere, Beaufort, Autokey, Affine, Railfence, Columnar,
    Playfair, Polybius, ADFGX, Substitution, XorKits, modinv
  };
})();
