/* ============================================================
   codec.js — 编码 / 解码 / 字符集转换核心引擎
   纯 Web API 实现，零外部依赖，完全离线
   ============================================================ */
const Codec = (function () {
  'use strict';

  const TE = new TextEncoder();
  const TD = new TextDecoder();
  const toBytes = s => TE.encode(s);
  const fromBytes = b => TD.decode(b);

  function hexToBytes(h) {
    h = h.replace(/[^0-9a-fA-F]/g, '');
    if (h.length % 2) h = '0' + h;
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
    return a;
  }
  function bytesToHex(b) {
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  function bytesToB64(b) {
    let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b64ToBytes(s) {
    const t = atob(s.replace(/\s/g, ''));
    const a = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i);
    return a;
  }

  /* ---------------- Base16 / Hex ---------------- */
  const Base16 = {
    enc: s => bytesToHex(toBytes(s)),
    dec: s => fromBytes(hexToBytes(s))
  };

  /* ---------------- Base32 (RFC 4648 + Crockford) ---------------- */
  const B32_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const B32_EXT = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function b32enc(bytes, alpha) {
    let bits = 0, value = 0, out = '';
    for (const b of bytes) {
      value = (value << 8) | b; bits += 8;
      while (bits >= 5) { out += alpha[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += alpha[(value << (5 - bits)) & 31];
    while (out.length % 8) out += '=';
    return out;
  }
  function b32dec(str, alpha) {
    str = String(str).toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
    let bits = 0, value = 0; const out = [];
    for (const ch of str) {
      if (ch === '=') break;
      const i = alpha.indexOf(ch);
      if (i < 0) throw new Error('非法字符 "' + ch + '" 位置 ' + out.length);
      value = (value << 5) | i; bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Uint8Array.from(out);
  }
  const Base32 = {
    enc: s => b32enc(toBytes(s), B32_STD),
    dec: s => fromBytes(b32dec(s, B32_STD)),
    encExt: s => b32enc(toBytes(s), B32_EXT),
    decExt: s => fromBytes(b32dec(s, B32_EXT))
  };

  /* ---------------- Base58 (Bitcoin) ---------------- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58enc(bytes) {
    if (!bytes.length) return '';
    let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    let num = BigInt('0x' + (bytesToHex(bytes) || '0'));
    let out = '';
    while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
    for (let i = 0; i < zeros; i++) out = '1' + out;
    return out;
  }
  function b58dec(str) {
    str = str.replace(/\s/g, '');
    let num = 0n;
    for (const ch of str) {
      const i = B58.indexOf(ch);
      if (i < 0) throw new Error('非法字符 "' + ch + '"');
      num = num * 58n + BigInt(i);
    }
    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    let zeros = 0; while (zeros < str.length && str[zeros] === '1') zeros++;
    return hexToBytes('0'.repeat(zeros * 2) + hex);
  }
  const Base58 = { enc: s => b58enc(toBytes(s)), dec: s => fromBytes(b58dec(s)) };

  /* ---------------- Base85 (Ascii85 / Z85) ---------------- */
  const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
  function a85enc(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 4) {
      const remain = Math.min(4, bytes.length - i);   // 本组实际字节数 1..4
      const chunk = [0, 1, 2, 3].map(k => (i + k < bytes.length ? bytes[i + k] : 0));
      /* 整组全零可压缩为 'z' */
      if (remain === 4 && chunk[0] === 0 && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0) {
        out += 'z'; continue;
      }
      let n = (BigInt(chunk[0]) << 24n) | (BigInt(chunk[1]) << 16n) | (BigInt(chunk[2]) << 8n) | BigInt(chunk[3]);
      const c = [];
      for (let k = 0; k < 5; k++) { c.unshift(Number(n % 85n)); n /= 85n; }
      /* remain 字节 → 输出 remain+1 个字符 */
      out += c.slice(0, remain + 1).map(v => String.fromCharCode(v + 33)).join('');
    }
    return out;
  }
  function a85dec(str) {
    str = String(str).replace(/\s/g, '').replace(/^<~/, '').replace(/~>$/, '');
    const out = [];
    let i = 0;
    while (i < str.length) {
      /* 'z' 是 4 个零字节的压缩写法，必须单独处理，否则后续会整体错位 */
      if (str[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
      let seg = '', j = i;
      while (j < str.length && seg.length < 5) {
        const ch = str[j++];
        const v = ch.charCodeAt(0) - 33;
        if (v < 0 || v > 84) throw new Error('非法字符 "' + ch + '"');
        seg += ch;
      }
      if (seg.length < 2) break;
      let n = 0n;
      for (const ch of seg) n = n * 85n + BigInt(ch.charCodeAt(0) - 33);
      /* 不足 5 位时补 'u'(84)，等价于补 0 字节 */
      for (let k = seg.length; k < 5; k++) n = n * 85n + 84n;
      const hex = n.toString(16).padStart(8, '0');
      const four = [];
      for (let k = 0; k < 8; k += 2) four.push(parseInt(hex.substr(k, 2), 16));
      out.push(...four.slice(0, seg.length - 1));
      i = j;
    }
    return Uint8Array.from(out);
  }
  function z85enc(bytes) {
    if (bytes.length % 4) throw new Error('Z85 要求长度为 4 的倍数');
    let out = '';
    for (let i = 0; i < bytes.length; i += 4) {
      let n = (BigInt(bytes[i]) << 24n) | (BigInt(bytes[i + 1]) << 16n) | (BigInt(bytes[i + 2]) << 8n) | BigInt(bytes[i + 3]);
      let s = '';
      for (let k = 0; k < 5; k++) { s = Z85[Number(n % 85n)] + s; n /= 85n; }
      out += s;
    }
    return out;
  }
  function z85dec(str) {
    str = str.replace(/\s/g, '');
    if (str.length % 5) throw new Error('Z85 要求长度为 5 的倍数');
    const out = [];
    for (let i = 0; i < str.length; i += 5) {
      let n = 0n;
      for (const ch of str.substr(i, 5)) {
        const idx = Z85.indexOf(ch);
        if (idx < 0) throw new Error('非法字符 "' + ch + '"');
        n = n * 85n + BigInt(idx);
      }
      const h = n.toString(16).padStart(8, '0');
      for (let k = 0; k < 8; k += 2) out.push(parseInt(h.substr(k, 2), 16));
    }
    return Uint8Array.from(out);
  }

  /* ---------------- Base91 (basE91) ---------------- */
  const B91 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
  function b91enc(bytes) {
    let b = 0, n = 0, out = '';
    for (const byte of bytes) {
      b |= byte << n; n += 8;
      if (n > 13) {
        let v = b & 8191;
        if (v > 88) { b >>= 13; n -= 13; } else { v = b & 16383; b >>= 14; n -= 14; }
        out += B91[v % 91] + B91[(v / 91) | 0];
      }
    }
    if (n) out += B91[b % 91] + (b > 90 || n > 7 ? B91[(b / 91) | 0] : '');
    return out;
  }
  function b91dec(str) {
    str = str.replace(/\s/g, '');
    let b = 0, n = 0, v = -1, out = [];
    for (const ch of str) {
      const idx = B91.indexOf(ch);
      if (idx < 0) continue;
      if (v < 0) v = idx;
      else {
        v += idx * 91; b |= v << n;
        n += (v & 8191) > 88 ? 13 : 14;
        do { out.push(b & 255); b >>= 8; n -= 8; } while (n > 7);
        v = -1;
      }
    }
    if (v > -1) { b |= v << n; out.push(b & 255); }
    return Uint8Array.from(out);
  }

  /* ---------------- Base92 / Base100 / Base2048 简化 ---------------- */
  const Base100 = {
    enc: s => Array.from(s).map(c => {
      const code = c.codePointAt(0);
      return code < 128 ? c : String.fromCodePoint(code + 0xEE00);
    }).join('').replace(/[\u{EE80}-\u{EF00}]/gu, c =>
      String.fromCodePoint(0xFEE0 + 1 + (c.codePointAt(0) - 0xEE80) * 2) +
      String.fromCodePoint(0xFEE0 + 2 + (c.codePointAt(0) - 0xEE80) * 2)),
    dec: s => Array.from(s).map(c => {
      const code = c.codePointAt(0);
      return (code >= 0xFEE1 && code <= 0xFF00) ? String.fromCodePoint(0xEE00 + Math.floor((code - 0xFEE0 - 1) / 2)) : c;
    }).join('')
  };

  /* ---------------- URL / HTML / Unicode ---------------- */
  const Url = {
    enc: s => encodeURIComponent(s),
    dec: s => decodeURIComponent(s.replace(/\+/g, ' ')),
    encAll: s => Array.from(s).map(c => '%' + TE.encode(c).reduce((a, b) => a + b.toString(16).padStart(2, '0').toUpperCase(), '')).join('').toUpperCase()
      .replace(/%([0-9A-F]{2})/g, m => m.length > 3 ? m : m.toLowerCase()),
    doubleEnc: s => encodeURIComponent(encodeURIComponent(s))
  };
  const Html = {
    enc: s => s.replace(/[&<>"'\/]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' }[c])),
    encNum: s => Array.from(s).map(c => '&#' + c.codePointAt(0) + ';').join(''),
    encHex: s => Array.from(s).map(c => '&#x' + c.codePointAt(0).toString(16) + ';').join(''),
    dec: s => {
      const el = document.createElement('textarea'); el.innerHTML = s; return el.value;
    }
  };
  const Uni = {
    esc(s, lead) {
      return Array.from(s).map(c => {
        const cp = c.codePointAt(0);
        let h = cp.toString(16);
        if (lead && lead !== 'auto') h = h.padStart(parseInt(lead) * 4, '0');
        else h = h.length <= 2 ? h.padStart(4, '0') : h;
        return h.length > 4 ? '\\u{' + h + '}' : '\\u' + h.padStart(4, '0');
      }).join('');
    },
    unesc: s => {
      if (/\\u\{[0-9a-fA-F]+\}/.test(s))
        return s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
      if (/\\x[0-9a-fA-F]{2}/.test(s) && !/\\u/.test(s))
        return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    },
    toXmlDec: s => Array.from(s).map(c => '&#' + c.codePointAt(0) + ';').join(''),
    toXmlHex: s => Array.from(s).map(c => '&#x' + c.codePointAt(0).toString(16) + ';').join('')
  };

  /* ---------------- ROT / Atbash ---------------- */
  function rot(s, n, alpha, startCode, len) {
    return s.replace(new RegExp('[' + alpha + ']', 'gi'), c => {
      const up = c === c.toUpperCase();
      const base = up ? startCode : startCode + 32;
      return String.fromCharCode((c.charCodeAt(0) - base + n) % len + base);
    });
  }
  const Rot = {
    rot13: s => rot(s, 13, 'A-Z', 65, 26),
    rot5: s => rot(s, 5, '0-9', 48, 10),
    rot18: s => Rot.rot5(Rot.rot13(s)),
    rot47: s => s.replace(/[!-~]/g, c => String.fromCharCode(33 + (c.charCodeAt(0) - 33 + 47) % 94)),
    rotN(s, n) { return rot(s, ((n % 26) + 26) % 26, 'A-Z', 65, 26); },
    caesarAll(s) {
      const out = [];
      for (let i = 1; i < 26; i++) out.push({ k: i, r: Rot.rotN(s, i) });
      return out;
    }
  };

  /* ---------------- Morse ---------------- */
  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
    J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....',
    7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
    '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
    '$': '...-..-', '@': '.--.-.'
  };
  const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
  const Morse = {
    enc: s => s.toUpperCase().split('').map(c => MORSE[c] || (c === ' ' ? '/' : '?')).join(' '),
    dec: s => s.trim().split(/\s*[|\/]\s*|\s{2,}/).map(w =>
      w.split(' ').map(c => MORSE_REV[c] || (c ? '?' : '')).join('')).join(' '),
    decRaw: s => s.trim().split(/\s+/).map(c => MORSE_REV[c] || '?').join('')
  };

  /* ---------------- Bacon 培根密码 ---------------- */
  const Bacon = {
    enc(s, a = 'A', b = 'B') {
      /* 逐字母映射为 5 位二进制并替换成 A/B（或其它两种字符） */
      return s.toUpperCase().replace(/[A-Z]/g, c =>
        (c.charCodeAt(0) - 65).toString(2).padStart(5, '0')
          .replace(/0/g, a).replace(/1/g, b));
    },
    dec(s, a = 'A', b = 'B') {
      const clean = s.toUpperCase().replace(new RegExp('[^' + a + b + ']', 'g'), '');
      let out = '';
      for (let i = 0; i + 4 < clean.length; i += 5) {
        const seg = clean.substr(i, 5).replace(new RegExp(a, 'g'), '0').replace(new RegExp(b, 'g'), '1');
        if (seg.length === 5) out += String.fromCharCode(65 + parseInt(seg, 2) % 26);
      }
      return out;
    },
    dec24(s, a = 'A', b = 'B') {
      const clean = s.toUpperCase().replace(new RegExp('[^' + a + b + ']', 'g'), '');
      let out = '';
      for (let i = 0; i + 4 < clean.length; i += 5) {
        const seg = clean.substr(i, 5).replace(new RegExp(a, 'g'), '0').replace(new RegExp(b, 'g'), '1');
        const v = parseInt(seg, 2);
        out += v < 9 ? String.fromCharCode(65 + v) : (v === 9 ? 'J' : String.fromCharCode(64 + v));
      }
      return out;
    }
  };

  /* ---------------- 猪圈密码 / 银河字母 ---------------- */
  const PIGPEN_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const PIGPEN_MAP = {
    A: '⌐', B: '⌐̵', C: '⌐̶', D: '⌐̷', E: '⌐̸', F: '⌐̹', G: '⌐̺', H: '⌐̻', I: '¬', J: '¬̵',
    K: '¬̶', L: '¬̷', M: '¬̸', N: '¬̹', O: '¬̺', P: '¬̻', Q: '⌐.', R: '⌐.̵', S: '⌐.̶', T: '⌐.̷',
    U: '⌐.̸', V: '¬.', W: '¬.̵', X: '¬.̶', Y: '¬.̷', Z: '¬.̸'
  };

  /* 银河字母 Standard Galactic Alphabet */
  const GALACTIC = {
    A: 'ᔑ', B: 'ʖ', C: 'ᓵ', D: '↸', E: 'ᒷ', F: '⎓', G: '⊣', H: '⍑', I: '╎', J: '⋮',
    K: 'ꖌ', L: 'ꖎ', M: 'ᒲ', N: 'リ', O: '𝙹', P: '!¡', Q: 'ᑑ', R: '∷', S: 'ᓭ', T: 'ℸ ̣',
    U: '̣', V: '⍊', W: '̣ᒲ', X: '⚍', Y: '⍾', Z: '⨅'
  };

  /* ---------------- Brainfuck 解释器 ---------------- */
  function brainfuck(code, input = '', maxSteps = 5e7) {
    code = code.replace(/[^><+\-.,\[\]]/g, '');
    const tape = new Uint8Array(30000); let p = 0, i = 0, steps = 0;
    const jump = {}; const stack = [];
    for (let k = 0; k < code.length; k++) {
      if (code[k] === '[') stack.push(k);
      else if (code[k] === ']') { const j = stack.pop(); if (j === undefined) throw new Error('括号不匹配'); jump[k] = j; jump[j] = k; }
    }
    if (stack.length) throw new Error('括号不匹配');
    let out = '', inp = 0;
    while (i < code.length && steps++ < maxSteps) {
      switch (code[i]) {
        case '>': p++; break;
        case '<': p--; break;
        case '+': tape[p] = (tape[p] + 1) & 255; break;
        case '-': tape[p] = (tape[p] - 1) & 255; break;
        case '.': out += String.fromCharCode(tape[p]); break;
        case ',': tape[p] = inp < input.length ? input.charCodeAt(inp++) : 0; break;
        case '[': if (tape[p] === 0) i = jump[i]; break;
        case ']': if (tape[p] !== 0) i = jump[i]; break;
      }
      i++;
    }
    if (steps >= maxSteps) throw new Error('超出最大步数限制（疑似死循环）');
    return out;
  }
  /* Ook! -> Brainfuck */
  function ookToBf(s) {
    const toks = s.trim().split(/[\s.,]+/).filter(Boolean);
    if (toks.length % 2) throw new Error('Ook! token 数必须为偶数');
    let out = '';
    for (let i = 0; i < toks.length; i += 2) {
      const a = toks[i].toLowerCase(), b = toks[i + 1].toLowerCase();
      if (a !== 'ook' || b !== 'ook') { /* ok */ }
      const key = a + b;
      out += { 'ook.ook?': '>', 'ook?ook.': '<', 'ook.ook.': '+', 'ook!ook!': '-',
        'ook!ook.': '.', 'ook.ook!': ',', 'ook!ook?': '[', 'ook?ook!': ']' }[key] || '';
    }
    return out;
  }

  /* ---------------- UUEncode / Quoted-Printable ---------------- */
  function uuenc(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 45) {
      const chunk = bytes.subarray(i, i + 45);
      out += String.fromCharCode(32 + chunk.length);
      for (let j = 0; j < chunk.length; j += 3) {
        const b0 = chunk[j] | 0, b1 = chunk[j + 1] | 0, b2 = chunk[j + 2] | 0;
        out += [b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63]
          .map(v => String.fromCharCode(v ? v + 32 : 96)).join('');
      }
      out += '\n';
    }
    return out;
  }
  function uudec(s) {
    const lines = s.replace(/\r/g, '').split('\n').filter(l => l.length && l !== 'end');
    const out = [];
    for (const line of lines.slice(1)) {
      const len = line.charCodeAt(0) - 32;
      if (len < 0 || len > 45) continue;
      const body = line.slice(1).replace(/`/g, ' ');
      const chars = body.split('').map(c => (c.charCodeAt(0) - 32) & 63);
      for (let i = 0; i < chars.length; i += 4) {
        const [c0, c1, c2, c3] = [chars[i], chars[i + 1] | 0, chars[i + 2] | 0, chars[i + 3] | 0];
        if (out.length < len) out.push(((c0 << 2) | (c1 >> 4)) & 255);
        if (out.length < len) out.push(((c1 << 4) | (c2 >> 2)) & 255);
        if (out.length < len) out.push(((c2 << 6) | c3) & 255);
      }
    }
    return Uint8Array.from(out);
  }
  const QP = {
    enc(s, line = 76) {
      let out = '', cnt = 0;
      for (const ch of toBytes(s)) {
        const need = ch > 126 || ch === 61 || ch === 32 || ch === 9 || (ch < 32 && ch !== 10 && ch !== 13);
        const piece = need ? '=' + ch.toString(16).padStart(2, '0').toUpperCase() : String.fromCharCode(ch);
        if (cnt + piece.length > line) { out += '=\r\n'; cnt = 0; }
        out += piece; cnt += piece.length;
      }
      return out;
    },
    dec: s => {
      const clean = s.replace(/=(?:\r?\n)/g, '');
      const out = [];
      for (let i = 0; i < clean.length; i++) {
        if (clean[i] === '=' && /[0-9A-Fa-f]{2}/.test(clean.substr(i + 1, 2))) {
          out.push(parseInt(clean.substr(i + 1, 2), 16)); i += 2;
        } else out.push(clean.charCodeAt(i) & 255);
      }
      return fromBytes(Uint8Array.from(out));
    }
  };

  /* ---------------- 进制 / 数值转换 ---------------- */
  const Num = {
    bin: n => BigInt(n).toString(2),
    oct: n => BigInt(n).toString(8),
    dec: n => BigInt(n).toString(10),
    hex: n => BigInt(n).toString(16).toUpperCase(),
    from(src, v) { return BigInt(parseInt(src) ? v : v).toString(10); }
  };
  /* 文本 ↔ 二进制串 */
  const Bits = {
    enc: s => Array.from(toBytes(s)).map(b => b.toString(2).padStart(8, '0')).join(''),
    dec(s, pad = 8) {
      s = s.replace(/[^01]/g, '');
      if (pad === 'off') pad = null;
      const width = pad ? parseInt(pad) : null;
      const groups = width ? s.match(new RegExp('.{1,' + width + '}', 'g')) || [] : [];
      if (!width) {
        const out = [];
        for (let i = 0; i + 7 < s.length; i += 8) out.push(parseInt(s.substr(i, 8), 2));
        return fromBytes(Uint8Array.from(out));
      }
      return fromBytes(Uint8Array.from(groups.map(g => parseInt(g.padEnd(width, '0'), 2))));
    }
  };

  /* ---------------- 全角半角 / 大小写 ---------------- */
  const Wide = {
    toFull: s => s.replace(/[\x20-\x7E]/g, c => {
      const code = c.charCodeAt(0);
      return code === 32 ? '\u3000' : String.fromCharCode(code + 0xFEE0);
    }),
    toHalf: s => s.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ')
  };

  return {
    toBytes, fromBytes, hexToBytes, bytesToHex, bytesToB64, b64ToBytes,
    Base16, Base32, Base58, Base85: { enc: s => a85enc(toBytes(s)), dec: s => fromBytes(a85dec(s)), z85enc: s => z85enc(toBytes(s)), z85dec: s => fromBytes(z85dec(s)) },
    Base91: { enc: s => b91enc(toBytes(s)), dec: s => fromBytes(b91dec(s)) },
    Base100, Url, Html, Uni, Rot, Morse, Bacon, PIGPEN_MAP, GALACTIC,
    Brainfuck: { run: brainfuck, ookToBf },
    UU: { enc: s => uuenc(toBytes(s)), dec: s => fromBytes(uudec(s)) },
    QP, Num, Bits, Wide,
    /* 常用 Base64 变体 */
    B64: {
      enc: s => bytesToB64(toBytes(s)),
      encUrl: s => bytesToB64(toBytes(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      dec: s => {
        let t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
        while (t.length % 4) t += '=';
        return fromBytes(b64ToBytes(t));
      },
      encImg: s => bytesToB64(toBytes(s))
    }
  };
})();
