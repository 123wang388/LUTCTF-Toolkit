/* ============================================================
   stego.js — 隐写分析与数字取证引擎
   LSB 提取 / 位平面 / Stegsolve 式通道变换 / PNG·JPEG 结构解析
   文件头扫描 (mini binwalk) / strings / WAV 频谱图 (含 FFT)
   ============================================================ */
const Stego = (function () {
  'use strict';

  /* ---------------- 文件特征库 ---------------- */
  const MAGIC = [
    { ext: 'JPEG', sig: [0xFF, 0xD8, 0xFF], name: 'JPEG 图像' },
    { ext: 'PNG', sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], name: 'PNG 图像' },
    { ext: 'GIF', sig: [0x47, 0x49, 0x46, 0x38], name: 'GIF 图像' },
    { ext: 'BMP', sig: [0x42, 0x4D], name: 'BMP 图像' },
    { ext: 'WEBP', sig: [0x52, 0x49, 0x46, 0x46], name: 'WEBP/RIFF' },
    { ext: 'PDF', sig: [0x25, 0x50, 0x44, 0x46], name: 'PDF 文档' },
    { ext: 'ZIP', sig: [0x50, 0x4B, 0x03, 0x04], name: 'ZIP/OOXML' },
    { ext: 'ZIP_EOCD', sig: [0x50, 0x4B, 0x05, 0x06], name: 'ZIP 结束标记' },
    { ext: 'RAR', sig: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], name: 'RAR 归档' },
    { ext: 'RAR5', sig: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00], name: 'RAR5' },
    { ext: '7Z', sig: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], name: '7-Zip' },
    { ext: 'GZIP', sig: [0x1F, 0x8B], name: 'GZIP 压缩' },
    { ext: 'BZIP2', sig: [0x42, 0x5A, 0x68], name: 'BZIP2 压缩' },
    { ext: 'XZ', sig: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00], name: 'XZ 压缩' },
    { ext: 'TAR', sig: [0x75, 0x73, 0x74, 0x61, 0x72], name: 'TAR 归档' },
    { ext: 'ELF', sig: [0x7F, 0x45, 0x4C, 0x46], name: 'ELF 可执行' },
    { ext: 'PE', sig: [0x4D, 0x5A], name: 'PE/DOS 可执行' },
    { ext: 'CLASS', sig: [0xCA, 0xFE, 0xBA, 0xBE], name: 'Java Class / Mach-O FAT' },
    { ext: 'WAV', sig: [0x52, 0x49, 0x46, 0x46], name: 'WAV 音频' },
    { ext: 'MP3', sig: [0x49, 0x44, 0x33], name: 'MP3 (ID3)' },
    { ext: 'FLAC', sig: [0x66, 0x4C, 0x61, 0x43], name: 'FLAC 音频' },
    { ext: 'OGG', sig: [0x4F, 0x67, 0x67, 0x53], name: 'OGG 容器' },
    { ext: 'MP4', sig: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], name: 'MP4 视频' },
    { ext: 'AVI', sig: [0x52, 0x49, 0x46, 0x46], name: 'AVI 视频' },
    { ext: 'SQLITE', sig: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65], name: 'SQLite 数据库' },
    { ext: 'OLE2', sig: [0xD0, 0xCF, 0x11, 0xE0], name: 'OLE2/旧版Office' },
    { ext: 'Pyc27', sig: [0x03, 0xF3, 0x0D, 0x0A], name: '.pyc Python 2.7' },
    { ext: 'Pyc33', sig: [0x33, 0x0D, 0x0D, 0x0A], name: '.pyc Python 3.3+' },
    { ext: 'Base64_txt', str: 'data:image/', name: 'Base64 内联数据' },
    { ext: 'PEM', str: '-----BEGIN', name: 'PEM 密钥/证书' },
    { ext: 'FLAGISH', str: 'flag{', name: '疑似 Flag 文本' },
    { ext: 'RARBG', str: 'Rar!', name: 'RAR' },
    { ext: 'XML', str: '<?xml', name: 'XML 文档' },
    { ext: 'HTML', str: '<html', name: 'HTML 文档' },
    { ext: 'WSCRIPT', str: 'WScript', name: 'Windows Script' },
    { ext: 'PS1', str: '$ErrorActionPreference', name: 'PowerShell 脚本' }
  ];
  const TAIL = [
    { ext: 'JPEG', tail: [0xFF, 0xD9] },
    { ext: 'PNG', tail: [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82] },
    { ext: 'PDF', tail: [0x25, 0x25, 0x45, 0x4F, 0x46] },
    { ext: 'GIF', tail: [0x00, 0x3B] },
    { ext: 'ZIP_EOCD', tail: [0x50, 0x4B, 0x05, 0x06] }
  ];

  /* ---------------- 魔数扫描 (mini binwalk) ---------------- */
  function scanMagic(bytes) {
    const hits = [];
    for (const m of MAGIC) {
      const pat = m.sig || m.str.split('').map(c => c.charCodeAt(0));
      const first = pat[0];
      for (let i = 0; i + pat.length <= bytes.length; i++) {
        if (bytes[i] !== first) continue;
        let ok = true;
        for (let k = 1; k < pat.length; k++) if (bytes[i + k] !== pat[k]) { ok = false; break; }
        if (ok) {
          if (hits.length && hits[hits.length - 1].ext === m.ext && hits[hits.length - 1].offset === i) continue;
          hits.push({ ext: m.ext, name: m.name, offset: i, hex: '0x' + i.toString(16).toUpperCase() });
        }
      }
    }
    hits.sort((a, b) => a.offset - b.offset);
    return hits;
  }
  /* 按尾部标记推断文件边界 */
  function sliceBySignature(bytes, startOffset, extHint) {
    const start = startOffset || 0;
    let end = bytes.length;
    for (const t of TAIL) {
      const pat = t.tail, first = pat[0];
      for (let i = start + 4; i + pat.length <= bytes.length; i++) {
        if (bytes[i] !== first) continue;
        let ok = true;
        for (let k = 1; k < pat.length; k++) if (bytes[i + k] !== pat[k]) { ok = false; break; }
        if (ok && i + pat.length < end) end = i + pat.length;
      }
    }
    return bytes.subarray(start, end);
  }

  /* ---------------- PNG 分块解析 ---------------- */
  function parsePngChunks(bytes) {
    if (bytes[0] !== 0x89) throw new Error('不是 PNG 文件');
    const chunks = [];
    let off = 8;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (off + 8 <= bytes.length) {
      const len = dv.getUint32(off, false);
      const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
      const data = bytes.subarray(off + 8, off + 8 + len);
      chunks.push({ type, len, offset: off, data, crc: off + 8 + len <= bytes.length - 4 ? dv.getUint32(off + 8 + len, false) : null });
      off += 12 + len;
      if (type === 'IEND') break;
    }
    return chunks;
  }
  function chunkText(chunks) {
    return chunks.filter(c => ['tEXt', 'iTXt', 'zTXt', 'pHYs', 'tIME', 'eXIf'].includes(c.type))
      .map(c => ({ type: c.type, len: c.len, text: Codec.fromBytes(c.data).replace(/[^\x20-\x7E]/g, '.') }));
  }

  /* ---------------- JPEG 段解析 ---------------- */
  function parseJpegSegments(bytes) {
    const segs = [];
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('不是 JPEG 文件');
    let off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xFF) { off++; continue; }
      const marker = bytes[off + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { off += 2; continue; }
      if (marker === 0xDA) {
        segs.push({ marker: 'SOS', name: '图像数据开始', offset: off, len: 0 });
        break;
      }
      if (marker === 0xD9) { segs.push({ marker: 'EOI', name: '图像结束', offset: off, len: 0 }); break; }
      const len = (bytes[off + 2] << 8) | bytes[off + 3];
      segs.push({ marker: '0xFF' + marker.toString(16).toUpperCase(), name: JPEG_MARK[marker] || '未知段', offset: off, len });
      off += 2 + len;
    }
    return segs;
  }
  const JPEG_MARK = {
    0xE0: 'APP0/JFIF', 0xE1: 'APP1/EXIF', 0xE2: 'APP2', 0xE3: 'APP3', 0xEC: 'APP12',
    0xED: 'APP13', 0xEE: 'APP14', 0xDB: 'DQT', 0xC0: 'SOF0', 0xC1: 'SOF1', 0xC2: 'SOF2',
    0xC4: 'DHT', 0xFE: 'COM 注释'
  };
  /* 提取 EXIF 中的可读字符串 */
  function exifStrings(bytes) {
    const latin = Codec.fromBytes(bytes);
    const found = new Set();
    const re = /[\x20-\x7E]{6,}/g;
    let m;
    while ((m = re.exec(latin)) !== null) {
      const s = m[0].trim();
      if (s.length >= 6 && !/^\d+$/.test(s)) found.add(s);
    }
    return [...found];
  }

  /* ---------------- bits 提取（LSB 通用） ---------------- */
  function bitsToBytes(bits, order = 'msb') {
    const out = [];
    for (let i = 0; i + 7 < bits.length; i += 8) {
      const grp = bits.slice(i, i + 8);
      const b = order === 'msb' ? parseInt(grp.join(''), 2) : parseInt(grp.slice().reverse().join(''), 2);
      out.push(b);
    }
    return Uint8Array.from(out);
  }
  /* 从 ImageData 提取 LSB：channels=['R','G','B'] bitPlane=0 */
  function lsbExtractFromImage(imgData, opts = {}) {
    const chans = opts.channels || ['R', 'G', 'B'];
    const plane = opts.plane || 0;
    const direction = opts.direction || 'row';
    const { width, height, data } = imgData;
    const bits = [];
    const map = { R: 0, G: 1, B: 2, A: 3 };
    if (direction === 'row') {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          for (const c of chans) bits.push((data[p + map[c]] >> plane) & 1);
        }
    } else {
      for (let x = 0; x < width; x++)
        for (let y = 0; y < height; y++) {
          const p = (y * width + x) * 4;
          for (const c of chans) bits.push((data[p + map[c]] >> plane) & 1);
        }
    }
    return { bits, bytes: bitsToBytes(bits, opts.bitOrder || 'msb') };
  }
  /* 位平面可视化 → 返回新 ImageData */
  function bitPlaneImage(imgData, channel, plane) {
    const out = new ImageData(imgData.width, imgData.height);
    const map = { R: 0, G: 1, B: 2, A: 3 };
    const ch = map[channel];
    for (let i = 0; i < imgData.data.length; i += 4) {
      const v = ((imgData.data[i + ch] >> plane) & 1) ? 255 : 0;
      out.data[i] = v; out.data[i + 1] = v; out.data[i + 2] = v; out.data[i + 3] = 255;
    }
    return out;
  }
  /* Stegsolve 式通道运算 */
  const CHANNEL_OPS = {
    normal: v => v,
    invert: v => 255 - v,
    grayscale: (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000,
    red: (r, g, b) => r * 65536,
    green: (r, g, b) => g * 65536,
    blue: (r, g, b) => b * 65536,
    diffRG: (r, g, b) => Math.abs(r - g) * 65536,
    xorRG: (r, g, b) => (r ^ g) * 65536
  };
  function applyChannelOp(imgData, op) {
    const out = new ImageData(imgData.width, imgData.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const r = imgData.data[i], g = imgData.data[i + 1], b = imgData.data[i + 2];
      let v;
      if (op === 'normal') { out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255; continue; }
      if (op === 'invert') { out.data[i] = 255 - r; out.data[i + 1] = 255 - g; out.data[i + 2] = 255 - b; out.data[i + 3] = 255; continue; }
      if (op === 'grayscale') v = CHANNEL_OPS.grayscale(r, g, b);
      else v = CHANNEL_OPS[op](r, g, b);
      const c = op === 'grayscale' ? v : (v >> 16) & 255;
      out.data[i] = c; out.data[i + 1] = c; out.data[i + 2] = c; out.data[i + 3] = 255;
    }
    return out;
  }

  /* ---------------- strings 提取 ---------------- */
  function strings(bytes, minLen = 5, unicodeToo = true) {
    const out = [];
    /* ASCII */
    let cur = '';
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 0x20 && c <= 0x7E) cur += String.fromCharCode(c);
      else { if (cur.length >= minLen) out.push({ type: 'ascii', text: cur, offset: i - cur.length }); cur = ''; }
    }
    if (cur.length >= minLen) out.push({ type: 'ascii', text: cur, offset: bytes.length - cur.length });
    /* UTF-16LE */
    if (unicodeToo) {
      cur = ''; let start = 0;
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const c = bytes[i], hi = bytes[i + 1];
        if (hi === 0 && c >= 0x20 && c <= 0x7E) { if (!cur) start = i; cur += String.fromCharCode(c); }
        else { if (cur.length >= minLen) out.push({ type: 'utf16le', text: cur, offset: start }); cur = ''; }
      }
      if (cur.length >= minLen) out.push({ type: 'utf16le', text: cur, offset: start });
    }
    return out;
  }

  /* ---------------- Hex dump ---------------- */
  function hexDump(bytes, maxLen = 4096) {
    let out = '';
    const n = Math.min(bytes.length, maxLen);
    for (let i = 0; i < n; i += 16) {
      const seg = bytes.subarray(i, Math.min(i + 16, n));
      const hexPart = Array.from(seg, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(48);
      const asc = Array.from(seg, b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
      out += (i.toString(16).padStart(8, '0') + '  ' + hexPart + '  |' + asc + '|\n');
    }
    return out;
  }

  /* ---------------- WAV 频谱图 ---------------- */
  function fftReal(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  /* 从 WAV 字节 → Float32 单声道样本 */
  function wavToSamples(bytes) {
    if (Codec.fromBytes(bytes.subarray(0, 4)) !== 'RIFF') throw new Error('不是 WAV/RIFF 文件');
    let off = 12, channels = 1, rate = 44100, bits = 16, dataOff = 44, dataLen = 0;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (off + 8 <= bytes.length) {
      const id = String.fromCharCode(...bytes.subarray(off, off + 4));
      const len = dv.getUint32(off + 4, true);
      if (id === 'fmt ') {
        channels = dv.getUint16(off + 10, true);
        rate = dv.getUint32(off + 12, true);
        bits = dv.getUint16(off + 22, true);
      } else if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
      off += 8 + len + (len % 2);
    }
    const n = Math.min(dataLen || (bytes.length - dataOff), bytes.length - dataOff) / (bits / 8);
    const out = new Float32Array(Math.floor(n / channels));
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) {
        const p = dataOff + (i * channels + c) * (bits / 8);
        if (p + 1 >= bytes.length) break;
        s += bits === 16 ? dv.getInt16(p, true) / 32768 : (bits === 8 ? (bytes[p] - 128) / 128 : dv.getInt32(p, true) / 2147483648);
      }
      out[i] = s / channels;
    }
    return { samples: out, rate, channels, bits };
  }
  /* 绘制频谱图到 canvas */
  function drawSpectrogram(canvas, samples, rate, fftSize = 1024, maxFreq = 8000) {
    const W = canvas.width = 1000, H = canvas.height = 420;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const hop = Math.max(1, Math.floor((samples.length - fftSize) / W));
    for (let x = 0; x < W; x++) {
      const start = x * hop;
      if (start + fftSize > samples.length) break;
      const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1)); // hann
        re[i] = samples[start + i] * w;
      }
      fftReal(re, im);
      const bins = fftSize / 2;
      const maxBin = Math.min(bins, Math.floor(maxFreq * fftSize / rate));
      for (let y = 0; y < H; y++) {
        const binFrac = 1 - y / H;
        const bin = Math.floor(binFrac * maxBin);
        const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
        const db = 20 * Math.log10(mag + 1e-9);
        let v = Math.max(0, (db + 90) / 90 * 255);
        v = Math.min(255, v);
        const p = (y * W + x) * 4;
        img.data[p] = v; img.data[p + 1] = v * 0.75; img.data[p + 2] = 255 - v * 0.3; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  /* 简易摩斯/棘轮：抽样包络（用于音频摩尔斯译码提示） */
  function envelope(samples, win = 512) {
    const out = [];
    for (let i = 0; i < samples.length; i += win) {
      let s = 0; const n = Math.min(win, samples.length - i);
      for (let k = 0; k < n; k++) s += Math.abs(samples[i + k]);
      out.push(s / n);
    }
    return out;
  }

  /* ---------------- ZIP 结构（含伪加密检测） ---------------- */
  function parseZip(bytes, findEOCD) {
    /* 找 EOCD: 0x50 0x4B 0x05 0x06 */
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = [];
    let off = dv.getUint32(eocd + 16, true);
    const count = dv.getUint16(eocd + 10, true);
    for (let k = 0; k < count && off + 46 <= bytes.length; k++) {
      if (!(bytes[off] === 0x50 && bytes[off + 1] === 0x4B)) break;
      const flags = dv.getUint16(off + 8, true);
      const method = dv.getUint16(off + 10, true);
      const crc = dv.getUint32(off + 16, true);
      const csize = dv.getUint32(off + 20, true);
      const usize = dv.getUint32(off + 24, true);
      const nlen = dv.getUint16(off + 28, true);
      const extra = dv.getUint16(off + 30, true);
      const name = Codec.fromBytes(bytes.subarray(off + 46, off + 46 + nlen));
      entries.push({ name, flags, encrypted: !!(flags & 1), method, crc, csize, usize, compressedSizeKnown: csize !== 0 });
      off += 46 + nlen + extra;
    }
    return { eocdOffset: eocd, count, entries };
  }

  return {
    MAGIC, scanMagic, sliceBySignature,
    parsePngChunks, chunkText, parseJpegSegments, exifStrings, JPEG_MARK,
    lsbExtractFromImage, bitPlaneImage, applyChannelOp, bitsToBytes, CHANNEL_OPS,
    strings, hexDump,
    wavToSamples, drawSpectrogram, envelope, fftReal,
    parseZip
  };
})();
