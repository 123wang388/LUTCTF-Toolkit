/* ============================================================
   ctf.js — 二进制定位 / 深奥编码 / 核心价值观 / 数字转换
   ============================================================ */
const CTF = (function () {
  'use strict';

  function toU8(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength || input.buffer.byteLength);
    return new Uint8Array(input);
  }
  function u16(b, o, le) { return le ? (b[o] | (b[o + 1] << 8)) : ((b[o] << 8) | b[o + 1]); }
  function u32(b, o, le) {
    return le
      ? ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0)
      : (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
  }
  function u64(b, o, le) {
    let n = 0n;
    for (let i = 0; i < 8; i++) n |= BigInt(b[o + (le ? i : 7 - i)]) << BigInt(8 * i);
    return Number(n);
  }
  function cstr(b, o, max) {
    let s = '';
    for (let i = o; i < Math.min(b.length, o + (max || 256)); i++) {
      if (!b[i]) break;
      s += String.fromCharCode(b[i]);
    }
    return s;
  }
  function hex(n, w) { return Number(n).toString(16).padStart(w || 2, '0'); }

  /* ===================== Brainfuck / Ook ===================== */
  function brainfuck(code, input) {
    const prog = String(code).replace(/[^><+\-.,\[\]]/g, '');
    const stack = [], map = {};
    for (let i = 0; i < prog.length; i++) {
      if (prog[i] === '[') stack.push(i);
      else if (prog[i] === ']') { const j = stack.pop(); if (j == null) throw new Error('括号不匹配'); map[i] = j; map[j] = i; }
    }
    if (stack.length) throw new Error('括号不匹配');
    const tape = new Uint8Array(30000);
    let ptr = 0, pc = 0, out = '', steps = 0;
    const inputQ = Array.from(String(input || '')).map(c => c.charCodeAt(0) & 255);
    let ip = 0;
    while (pc < prog.length) {
      if (++steps > 20000000) throw new Error('执行步数过多（可能死循环）');
      switch (prog[pc]) {
        case '>': ptr = (ptr + 1) % tape.length; break;
        case '<': ptr = (ptr - 1 + tape.length) % tape.length; break;
        case '+': tape[ptr] = (tape[ptr] + 1) & 255; break;
        case '-': tape[ptr] = (tape[ptr] - 1) & 255; break;
        case '.': out += String.fromCharCode(tape[ptr]); break;
        case ',': tape[ptr] = ip < inputQ.length ? inputQ[ip++] : 0; break;
        case '[': if (!tape[ptr]) pc = map[pc]; break;
        case ']': if (tape[ptr]) pc = map[pc]; break;
      }
      pc++;
    }
    return { output: out, steps, inputUsed: ip };
  }

  function ookToBf(code) {
    const tokens = String(code).match(/Ook[.!?]\s*Ook[.!?]/g) || [];
    const map = {
      'Ook. Ook?': '>', 'Ook? Ook.': '<', 'Ook. Ook.': '+', 'Ook! Ook!': '-',
      'Ook! Ook.': '.', 'Ook. Ook!': ',', 'Ook! Ook?': '[', 'Ook? Ook!': ']'
    };
    return tokens.map(t => {
      const k = t.replace(/\s+/g, ' ');
      if (!map[k]) throw new Error('未知 Ook 指令: ' + k);
      return map[k];
    }).join('');
  }

  /* ===================== 核心价值观编码 ===================== */
  const VALUES = '富强民主文明和谐自由平等公正法治爱国敬业诚信友善';
  function assert(ok, msg) { if (!ok) throw new Error(msg || 'Assert Error'); }
  function str2utf8(str) {
    const notEncoded = /[A-Za-z0-9\-\_\.\!\~\*\'\(\)]/g;
    const str1 = String(str).replace(notEncoded, c => c.codePointAt(0).toString(16));
    let str2 = encodeURIComponent(str1);
    return str2.replace(/%/g, '').toUpperCase();
  }
  function utf82str(utfs) {
    assert(typeof utfs === 'string', 'utfs Error');
    assert((utfs.length & 1) === 0, 'hex 长度必须为偶数');
    const parts = [];
    for (let i = 0; i < utfs.length; i++) {
      if ((i & 1) === 0) parts.push('%');
      parts.push(utfs[i]);
    }
    return decodeURIComponent(parts.join(''));
  }
  function hex2duo(hexs) {
    const duo = [];
    for (const c of hexs) {
      const n = parseInt(c, 16);
      if (isNaN(n)) throw new Error('非法十六进制字符: ' + c);
      if (n < 10) duo.push(n);
      else if (Math.random() >= 0.5) { duo.push(10); duo.push(n - 10); }
      else { duo.push(11); duo.push(n - 6); }
    }
    return duo;
  }
  function duo2hex(duo) {
    const hex = [];
    for (let i = 0; i < duo.length; i++) {
      if (duo[i] < 10) hex.push(duo[i]);
      else if (duo[i] === 10) { i++; hex.push(duo[i] + 10); }
      else { i++; hex.push(duo[i] + 6); }
    }
    return hex.map(v => v.toString(16).toUpperCase()).join('');
  }
  function valuesEncode(str) {
    const duo = hex2duo(str2utf8(str));
    return duo.map(d => VALUES[2 * d] + VALUES[2 * d + 1]).join('');
  }
  function valuesDecode(encoded) {
    const duo = [];
    for (const c of String(encoded)) {
      const i = VALUES.indexOf(c);
      if (i < 0 || (i & 1)) continue;
      duo.push(i >> 1);
    }
    return utf82str(duo2hex(duo));
  }

  /* ===================== 中文数字 / 罗马数字 ===================== */
  const CN_DIGITS = '零一二三四五六七八九';
  function cnToNumber(s) {
    s = String(s).replace(/[两俩]/g, '二').replace(/[〇○]/g, '零');
    const units = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };
    let total = 0, section = 0, num = 0;
    for (const ch of s) {
      if (/[零一二三四五六七八九]/.test(ch)) num = CN_DIGITS.indexOf(ch);
      else if (ch === '万' || ch === '亿') { total = (total + section + num) * units[ch]; section = 0; num = 0; }
      else if (units[ch]) { section += (num || 1) * units[ch]; num = 0; }
      else if (/[0-9]/.test(ch)) num = num * 10 + Number(ch);
      else if (/\s/.test(ch)) continue;
      else throw new Error('无法识别的中文数字: ' + ch);
    }
    return total + section + num;
  }
  function numberToCn(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (n === 0) return '零';
    const units = ['', '十', '百', '千'];
    const big = ['', '万', '亿', '兆'];
    let out = '', group = 0;
    while (n > 0) {
      let part = n % 10000, str = '';
      for (let i = 0; i < 4 && part > 0; i++) {
        const d = part % 10;
        if (d) str = CN_DIGITS[d] + units[i] + str;
        else if (str && !str.startsWith('零')) str = '零' + str;
        part = Math.floor(part / 10);
      }
      if (str) out = str + big[group] + out;
      n = Math.floor(n / 10000); group++;
    }
    return out.replace(/零+/g, '零').replace(/零$/, '');
  }
  function romanToNumber(s) {
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0, prev = 0;
    for (let i = String(s).length - 1; i >= 0; i--) {
      const v = map[String(s)[i].toUpperCase()];
      if (!v) throw new Error('非法罗马数字: ' + s[i]);
      total += v < prev ? -v : v;
      prev = Math.max(prev, v);
    }
    return total;
  }
  function numberToRoman(num) {
    num = Math.floor(Number(num));
    if (num <= 0 || num >= 4000) throw new Error('仅支持 1~3999');
    const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of table) while (num >= v) { out += s; num -= v; }
    return out;
  }

  /* ===================== ELF / PE ===================== */
  const MACH = { 3: 'x86', 8: 'MIPS', 20: 'PowerPC', 21: 'PowerPC64', 40: 'ARM', 62: 'x86-64', 183: 'AArch64', 243: 'RISC-V' };
  function elfInfo(input) {
    const b = toU8(input);
    if (b.length < 52 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) throw new Error('不是 ELF 文件');
    const cls = b[4], le = b[5] === 1;
    const bits = cls === 2 ? 64 : 32;
    if (cls !== 1 && cls !== 2) throw new Error('未知 ELF class');
    const e_type = u16(b, 16, le), e_machine = u16(b, 18, le);
    let e_entry, e_phoff, e_shoff, e_phentsize, e_phnum, e_shentsize, e_shnum, e_shstrndx;
    if (bits === 64) {
      e_entry = u64(b, 24, le); e_phoff = u64(b, 32, le); e_shoff = u64(b, 40, le);
      e_phentsize = u16(b, 54, le); e_phnum = u16(b, 56, le);
      e_shentsize = u16(b, 58, le); e_shnum = u16(b, 60, le); e_shstrndx = u16(b, 62, le);
    } else {
      e_entry = u32(b, 24, le); e_phoff = u32(b, 28, le); e_shoff = u32(b, 32, le);
      e_phentsize = u16(b, 42, le); e_phnum = u16(b, 44, le);
      e_shentsize = u16(b, 46, le); e_shnum = u16(b, 48, le); e_shstrndx = u16(b, 50, le);
    }
    const ph = [], sh = [];
    for (let i = 0; i < e_phnum && e_phoff + i * e_phentsize + e_phentsize <= b.length; i++) {
      const o = e_phoff + i * e_phentsize;
      const p = { type: u32(b, o, le), flags: bits === 64 ? u32(b, o + 4, le) : u32(b, o + 24, le) };
      if (bits === 64) { p.offset = u64(b, o + 8, le); p.vaddr = u64(b, o + 16, le); p.filesz = u64(b, o + 32, le); p.memsz = u64(b, o + 40, le); }
      else { p.offset = u32(b, o + 4, le); p.vaddr = u32(b, o + 8, le); p.filesz = u32(b, o + 16, le); p.memsz = u32(b, o + 20, le); }
      ph.push(p);
    }
    // section headers
    for (let i = 0; i < e_shnum && e_shoff + i * e_shentsize + e_shentsize <= b.length; i++) {
      const o = e_shoff + i * e_shentsize;
      const s = { nameOff: u32(b, o, le), type: u32(b, o + 4, le) };
      if (bits === 64) { s.flags = u64(b, o + 8, le); s.addr = u64(b, o + 16, le); s.offset = u64(b, o + 24, le); s.size = u64(b, o + 32, le); }
      else { s.flags = u32(b, o + 8, le); s.addr = u32(b, o + 12, le); s.offset = u32(b, o + 16, le); s.size = u32(b, o + 20, le); }
      sh.push(s);
    }
    if (sh.length && e_shstrndx < sh.length) {
      const st = sh[e_shstrndx];
      for (const s of sh) s.name = cstr(b, st.offset + s.nameOff, 128);
    }
    const interp = ph.find(p => p.type === 3);
    const interpreter = interp ? cstr(b, interp.offset, interp.filesz) : '';
    const gnuStack = ph.find(p => p.type === 0x6474e551);
    const gnuRelro = ph.find(p => p.type === 0x6474e552);
    const dynamic = ph.find(p => p.type === 2);
    let bindNow = false, rpath = '';
    if (dynamic) {
      const entsize = bits === 64 ? 16 : 8;
      for (let o = dynamic.offset; o + entsize <= dynamic.offset + dynamic.filesz; o += entsize) {
        const tag = bits === 64 ? u64(b, o, le) : u32(b, o, le);
        const val = bits === 64 ? u64(b, o + 8, le) : u32(b, o + 4, le);
        if (tag === 0) break;
        if (tag === 24) bindNow = true;
        if (tag === 30 && (val & 8)) bindNow = true;
        if (tag === 15 || tag === 29) {
          const base = sh.reduce((a, s) => s.addr && s.addr <= val ? s : a, null);
          if (base) rpath = cstr(b, base.offset + (val - base.addr), 256);
        }
      }
    }
    const strings = [];
    for (let i = 0; i + 5 < b.length; i++) {
      if (b[i] === 95 && b[i + 1] === 95) {
        let s = ''; for (let j = i; j < Math.min(b.length, i + 64) && b[j]; j++) s += String.fromCharCode(b[j]);
        if (s.length > 4) strings.push(s);
      }
    }
    const canary = strings.some(s => s.includes('__stack_chk_fail'));
    const fortify = strings.some(s => /__(memcpy|memmove|memset|sprintf|snprintf|strcpy|strcat)_chk/.test(s));
    return {
      format: 'ELF', bits, endian: le ? 'little' : 'big', machine: MACH[e_machine] || ('EM_' + e_machine),
      type: e_type === 1 ? 'REL' : e_type === 2 ? 'EXEC' : e_type === 3 ? 'DYN (PIE/共享库)' : '0x' + e_type.toString(16),
      entry: e_entry, interpreter, stripped: !sh.some(s => s.name === '.symtab'),
      pie: e_type === 3, nx: gnuStack ? !(gnuStack.flags & 1) : true,
      relro: gnuRelro ? (bindNow ? 'Full' : 'Partial') : 'No',
      canary, fortify, rpath,
      sections: sh.filter(s => s.name).map(s => ({ name: s.name, type: s.type, addr: s.addr, size: s.size })),
      segments: ph.map(p => ({ type: p.type, flags: p.flags, offset: p.offset, vaddr: p.vaddr, filesz: p.filesz, memsz: p.memsz }))
    };
  }

  function peInfo(input) {
    const b = toU8(input);
    if (b.length < 0x40 || b[0] !== 0x4d || b[1] !== 0x5a) throw new Error('不是 PE 文件');
    const peOff = u32(b, 0x3c, true);
    if (b[peOff] !== 0x50 || b[peOff + 1] !== 0x45) throw new Error('PE 签名无效');
    const machine = u16(b, peOff + 4, true), sections = u16(b, peOff + 6, true), optSize = u16(b, peOff + 20, true);
    const opt = peOff + 24, magic = u16(b, opt, true);
    const bits = magic === 0x20b ? 64 : 32;
    const entry = u32(b, opt + 16, true), imageBase = bits === 64 ? u64(b, opt + 24, true) : u32(b, opt + 28, true);
    const dllChar = u16(b, opt + (bits === 64 ? 70 : 70), true);
    const subsystem = u16(b, opt + (bits === 64 ? 68 : 68), true);
    const secOff = opt + optSize;
    const secs = [];
    for (let i = 0; i < sections; i++) {
      const o = secOff + i * 40;
      if (o + 40 > b.length) break;
      secs.push({
        name: cstr(b, o, 8), vsize: u32(b, o + 8, true), vaddr: u32(b, o + 12, true),
        rawSize: u32(b, o + 16, true), rawPtr: u32(b, o + 20, true), chars: u32(b, o + 36, true)
      });
    }
    const str = latin1Decode(b);
    return {
      format: 'PE', bits, machine: machine === 0x8664 ? 'x86-64' : machine === 0x14c ? 'x86' : '0x' + machine.toString(16),
      type: (u16(b, peOff + 22, true) & 0x2000) ? 'DLL' : 'EXE',
      entry, imageBase, subsystem: subsystem === 3 ? 'Console' : subsystem === 2 ? 'GUI' : String(subsystem),
      aslr: !!(dllChar & 0x40), dep: !!(dllChar & 0x100), cfg: !!(dllChar & 0x4000), highEntropy: !!(dllChar & 0x20),
      sections: secs, strings: str.slice(0, 3).map(x => x)
    };
  }

  function latin1Decode(b) {
    const out = [];
    let cur = '';
    for (let i = 0; i < b.length; i++) {
      if (b[i] >= 32 && b[i] < 127) cur += String.fromCharCode(b[i]);
      else { if (cur.length >= 5) out.push(cur); cur = ''; }
    }
    if (cur.length >= 5) out.push(cur);
    return out;
  }

  function detect(input) {
    const b = toU8(input);
    if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return elfInfo(b);
    if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return peInfo(b);
    throw new Error('仅支持 ELF / PE 文件');
  }

  return {
    brainfuck, ookToBf, valuesEncode, valuesDecode,
    cnToNumber, numberToCn, romanToNumber, numberToRoman,
    elfInfo, peInfo, detect, VALUES
  };
})();
