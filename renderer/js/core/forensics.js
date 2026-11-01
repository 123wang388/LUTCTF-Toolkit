/* ============================================================
   forensics.js — 离线取证：PCAP/PCAPNG 解析 + PNG 结构修复
   ============================================================ */
const Forensics = (function () {
  'use strict';

  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8', { fatal: false });

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
  function hex(n, w) { return (n >>> 0).toString(16).padStart(w || 2, '0'); }
  function ipv4(b, o) { return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`; }
  function ipv6(b, o) {
    const parts = [];
    for (let i = 0; i < 16; i += 2) parts.push(u16(b, o + i, false).toString(16));
    return parts.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
  }
  function mac(b, o) { return Array.from(b.subarray(o, o + 6)).map(x => hex(x)).join(':'); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function concatBytes(list) {
    let total = 0; for (const x of list) total += x.length;
    const out = new Uint8Array(total); let o = 0;
    for (const x of list) { out.set(x, o); o += x.length; }
    return out;
  }

  /* ===================== PCAP / PCAPNG ===================== */

  function parsePcap(buf) {
    const b = toU8(buf);
    if (b.length < 24) throw new Error('PCAP 文件过短');
    const magicBE = u32(b, 0, false);
    let le, nano = false;
    if (magicBE === 0xa1b2c3d4) { le = false; }
    else if (magicBE === 0xd4c3b2a1) { le = true; }
    else if (magicBE === 0xa1b23c4d) { le = false; nano = true; }
    else if (magicBE === 0x4d3cb2a1) { le = true; nano = true; }
    else throw new Error('不是有效的 PCAP 文件（magic ' + hex(magicBE, 8) + '）');
    const linktype = u32(b, 20, le);
    const packets = [];
    let off = 24;
    while (off + 16 <= b.length) {
      const tsSec = u32(b, off, le), tsFrac = u32(b, off + 4, le);
      const incl = u32(b, off + 8, le), orig = u32(b, off + 12, le);
      off += 16;
      if (incl > b.length - off || incl > 0x2000000) break;
      const data = b.subarray(off, off + incl);
      off += incl;
      packets.push(parseLink(linktype, data, tsSec * 1000 + (nano ? tsFrac / 1e6 : tsFrac / 1e3), packets.length + 1));
    }
    return finish(packets, 'pcap', [linktype]);
  }

  function parsePcapng(buf) {
    const b = toU8(buf);
    if (b.length < 28) throw new Error('PCAPNG 文件过短');
    let off = 0, le = true, interfaces = [];
    const packets = [];
    while (off + 12 <= b.length) {
      let type = u32(b, off, le), len = u32(b, off + 4, le);
      if (type === 0x0a0d0d0a) {
        const bom = u32(b, off + 8, true);
        le = bom === 0x1a2b3c4d;
        if (!le && u32(b, off + 8, false) === 0x1a2b3c4d) le = false;
        type = 0x0a0d0d0a; len = u32(b, off + 4, le);
      }
      if (len < 12 || len > b.length - off || off + len > b.length) break;
      const body = b.subarray(off + 8, off + len - 4);
      if (type === 1 && body.length >= 8) {
        interfaces.push({ linktype: u16(body, 0, le), snaplen: u32(body, 4, le) });
      } else if (type === 6 && body.length >= 20) {
        const ifId = u32(body, 0, le);
        const tsHigh = u32(body, 4, le), tsLow = u32(body, 8, le);
        const cap = u32(body, 12, le);
        const data = body.subarray(20, 20 + cap);
        const lt = interfaces[ifId] ? interfaces[ifId].linktype : 1;
        const ts = ((tsHigh * 4294967296) + tsLow) / 1000;
        packets.push(parseLink(lt, data, ts, packets.length + 1));
      } else if (type === 3 && body.length >= 4) {
        const cap = u32(body, 0, le);
        const data = body.subarray(4, 4 + cap);
        packets.push(parseLink(interfaces[0] ? interfaces[0].linktype : 1, data, 0, packets.length + 1));
      } else if (type === 2 && body.length >= 20) {
        const ifId = u16(body, 0, le);
        const cap = u32(body, 12, le);
        const data = body.subarray(20, 20 + cap);
        const lt = interfaces[ifId] ? interfaces[ifId].linktype : 1;
        packets.push(parseLink(lt, data, 0, packets.length + 1));
      }
      off += len;
    }
    return finish(packets, 'pcapng', interfaces.map(i => i.linktype));
  }

  function parseLink(linktype, data, ts, no) {
    const p = { no, ts: ts || 0, len: data.length, linktype, src: '', dst: '', sport: 0, dport: 0, proto: '', payload: new Uint8Array(0), tcpSeq: 0, tcpFlags: 0, ethertype: 0 };
    try {
      let off = 0, et = 0;
      if (linktype === 1) {
        if (data.length < 14) return p;
        p.srcMac = mac(data, 6); p.dstMac = mac(data, 0);
        et = u16(data, 12, false); off = 14;
        while ((et === 0x8100 || et === 0x88a8) && off + 4 <= data.length) { et = u16(data, off + 2, false); off += 4; }
      } else if (linktype === 113) {
        if (data.length < 16) return p;
        et = u16(data, 14, false); off = 16;
      } else if (linktype === 101 || linktype === 228 || linktype === 12) {
        et = 0x0800; off = 0;
      } else if (linktype === 0) {
        et = 0x0800; off = 4;
      } else {
        et = u16(data, 12, false); off = 14;
      }
      p.ethertype = et;
      if (et === 0x0800) parseIPv4(data, off, p);
      else if (et === 0x86dd) parseIPv6(data, off, p);
    } catch (e) { p.error = e.message; }
    return p;
  }

  function parseIPv4(b, off, p) {
    if (off + 20 > b.length) return;
    const ihl = (b[off] & 0x0f) * 4;
    const total = u16(b, off + 2, false);
    const proto = b[off + 9];
    p.src = ipv4(b, off + 12); p.dst = ipv4(b, off + 16); p.proto = proto === 6 ? 'TCP' : proto === 17 ? 'UDP' : proto === 1 ? 'ICMP' : 'IP/' + proto;
    let q = off + ihl;
    const end = Math.min(b.length, off + (total || (b.length - off)));
    if (proto === 6) parseTCP(b, q, end, p);
    else if (proto === 17) parseUDP(b, q, end, p);
    else p.payload = b.subarray(q, end);
  }

  function parseIPv6(b, off, p) {
    if (off + 40 > b.length) return;
    const plen = u16(b, off + 4, false);
    let next = b[off + 6];
    p.src = ipv6(b, off + 8); p.dst = ipv6(b, off + 24);
    p.proto = next === 6 ? 'TCP' : next === 17 ? 'UDP' : 'IPv6/' + next;
    let q = off + 40;
    const end = Math.min(b.length, off + 40 + plen);
    // 跳过常见扩展头
    let guard = 0;
    while ((next === 0 || next === 43 || next === 60) && q + 8 <= end && guard++ < 8) {
      const nh = b[q]; const hlen = (b[q + 1] + 1) * 8;
      next = nh; q += hlen;
    }
    p.proto = next === 6 ? 'TCP' : next === 17 ? 'UDP' : 'IPv6/' + next;
    if (next === 6) parseTCP(b, q, end, p);
    else if (next === 17) parseUDP(b, q, end, p);
  }

  function parseTCP(b, q, end, p) {
    if (q + 20 > end) return;
    p.sport = u16(b, q, false); p.dport = u16(b, q + 2, false);
    p.tcpSeq = u32(b, q + 4, false);
    p.tcpFlags = b[q + 13];
    const doff = ((b[q + 12] >> 4) & 0x0f) * 4;
    p.payload = b.subarray(Math.min(end, q + doff), end);
    p.proto = 'TCP';
  }
  function parseUDP(b, q, end, p) {
    if (q + 8 > end) return;
    p.sport = u16(b, q, false); p.dport = u16(b, q + 2, false);
    const len = u16(b, q + 4, false);
    p.payload = b.subarray(q + 8, Math.min(end, len ? q + len : end));
    p.proto = 'UDP';
  }

  /* ===================== 流重组 / HTTP ===================== */
  function flowKey(p) { return `${p.src}:${p.sport}->${p.dst}:${p.dport}`; }

  function buildFlows(packets) {
    const map = new Map();
    for (const p of packets) {
      if (!p.payload || !p.payload.length) continue;
      if (!p.src || !p.dst) continue;
      const k = flowKey(p);
      if (!map.has(k)) map.set(k, { key: k, src: p.src, dst: p.dst, sport: p.sport, dport: p.dport, proto: p.proto, segs: [], packets: 0, bytes: 0 });
      const f = map.get(k);
      f.segs.push({ seq: p.tcpSeq || 0, data: p.payload, ts: p.ts });
      f.packets++; f.bytes += p.payload.length;
    }
    const flows = [];
    for (const f of map.values()) {
      let data;
      if (f.proto === 'TCP' && f.segs.some(s => s.seq)) {
        const segs = f.segs.slice().sort((a, b) => (a.seq >>> 0) - (b.seq >>> 0));
        const base = segs[0].seq >>> 0;
        let max = 0;
        for (const s of segs) { const o = ((s.seq >>> 0) - base) >>> 0; max = Math.max(max, o + s.data.length); }
        const buf = new Uint8Array(max); let end = 0;
        for (const s of segs) {
          const o = ((s.seq >>> 0) - base) >>> 0;
          if (o > max) continue;
          buf.set(s.data, o); end = Math.max(end, o + s.data.length);
        }
        data = buf.subarray(0, end);
      } else {
        data = concatBytes(f.segs.map(s => s.data));
      }
      if (!data.length) continue;
      const flow = { key: f.key, src: f.src, dst: f.dst, sport: f.sport, dport: f.dport, proto: f.proto, packets: f.packets, bytes: data.length, data };
      flow.http = extractHttp(flow);
      flows.push(flow);
    }
    return flows;
  }

  function headerEnd(bytes, from) {
    for (let i = from || 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i;
    }
    return -1;
  }

  function parseHeaders(text) {
    const out = {};
    for (const line of text.split('\r\n').slice(1)) {
      const i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    return out;
  }

  function dechunk(bytes) {
    const out = []; let off = 0;
    while (off < bytes.length) {
      let e = off; while (e + 1 < bytes.length && !(bytes[e] === 13 && bytes[e + 1] === 10)) e++;
      const line = latin1.decode(bytes.subarray(off, e)).trim();
      const n = parseInt(line.split(';')[0], 16);
      if (!n || isNaN(n)) break;
      const start = e + 2, end = Math.min(bytes.length, start + n);
      out.push(bytes.subarray(start, end));
      off = end + 2;
      if (bytes[end] === 13 && bytes[end + 1] === 10) off = end + 2;
      if (n === 0) break;
    }
    return concatBytes(out);
  }

  function parseMultipart(body, boundary) {
    const parts = [];
    if (!boundary) return parts;
    const text = latin1.decode(body);
    const sep = '--' + boundary;
    let pos = 0;
    while (true) {
      const start = text.indexOf(sep, pos);
      if (start < 0) break;
      const headStart = start + sep.length;
      if (text.startsWith('--', headStart)) break;
      const hEnd = text.indexOf('\r\n\r\n', headStart);
      if (hEnd < 0) break;
      const next = text.indexOf(sep, hEnd + 4);
      if (next < 0) break;
      const head = text.slice(headStart, hEnd);
      const bodyStart = hEnd + 4;
      const bodyEnd = next;
      const name = (head.match(/name="([^"]*)"/i) || [])[1] || '';
      const filename = (head.match(/filename="([^"]*)"/i) || [])[1] || '';
      const ct = (head.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || '';
      parts.push({ name, filename, contentType: ct.trim(), data: body.subarray(bodyStart, bodyEnd), text: utf8.decode(body.subarray(bodyStart, bodyEnd)) });
      pos = next + sep.length;
    }
    return parts;
  }

  function extractHttp(flow) {
    const objects = [];
    const data = flow.data;
    if (!data || !data.length) return objects;
    let off = 0, guard = 0;
    while (off < data.length && guard++ < 50) {
      const he = headerEnd(data, off);
      if (he < 0) break;
      const head = latin1.decode(data.subarray(off, he));
      const first = head.split('\r\n')[0];
      const isReq = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|TRACE|CONNECT)\s/.test(first);
      const isRes = /^HTTP\/\d/.test(first);
      if (!isReq && !isRes) { off = he + 4; continue; }
      const hdrs = parseHeaders(head);
      let bodyStart = he + 4, bodyEnd = data.length, consumed = 0;
      let body = new Uint8Array(0);
      if ((hdrs['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
        body = dechunk(data.subarray(bodyStart));
        // 找到 chunked 结束位置：粗略用 0\r\n\r\n
        const rest = latin1.decode(data.subarray(bodyStart));
        const m = rest.indexOf('\r\n0\r\n\r\n');
        consumed = m >= 0 ? m + 7 : data.length - bodyStart;
        bodyEnd = bodyStart + consumed;
      } else {
        const cl = parseInt(hdrs['content-length'] || '0', 10);
        if (cl > 0) { bodyEnd = Math.min(data.length, bodyStart + cl); consumed = bodyEnd - bodyStart; }
        body = data.subarray(bodyStart, bodyEnd);
      }
      const obj = {
        direction: isReq ? 'request' : 'response',
        method: isReq ? first.split(/\s+/)[0] : '',
        url: isReq ? (first.split(/\s+/)[1] || '') : '',
        status: isRes ? (first.split(/\s+/)[1] || '') : '',
        version: isReq ? first.split(/\s+/)[2] : first.split(/\s+/)[0],
        headers: hdrs,
        contentType: (hdrs['content-type'] || '').split(';')[0].trim(),
        body,
        bodyLen: body.length,
        preview: '',
        parts: [],
        flow: flow.key,
        ts: flow.ts || 0
      };
      const cd = hdrs['content-disposition'] || '';
      obj.filename = (cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i) || [])[1] || '';
      if (!obj.filename && obj.url) {
        try { const u = new URL(obj.url, 'http://x'); obj.filename = decodeURIComponent((u.pathname.split('/').pop() || '')); } catch (e) { }
      }
      const ct = (hdrs['content-type'] || '');
      const bm = ct.match(/boundary=([^;]+)/i);
      if (bm && /multipart/i.test(ct)) obj.parts = parseMultipart(body, bm[1].replace(/^"|"$/g, ''));
      if (/text|json|xml|javascript|x-www-form-urlencoded/i.test(ct) || /^[\x09\x0a\x0d\x20-\x7e]*$/.test(latin1.decode(body.subarray(0, Math.min(200, body.length))))) {
        obj.preview = utf8.decode(body.subarray(0, Math.min(4000, body.length)));
      } else {
        obj.preview = '[二进制 ' + body.length + ' bytes] ' + Array.from(body.subarray(0, 32)).map(x => hex(x)).join(' ');
      }
      objects.push(obj);
      if (!consumed) consumed = body.length;
      off = bodyStart + consumed;
      while (off < data.length && (data[off] === 13 || data[off] === 10)) off++;
    }
    return objects;
  }

  /* ===================== DNS / Telnet / 字符串 ===================== */
  function extractDns(packets) {
    const out = [];
    for (const p of packets) {
      if (p.proto !== 'UDP' || (p.sport !== 53 && p.dport !== 53)) continue;
      const b = p.payload;
      if (b.length < 12) continue;
      try {
        let off = 12, labels = [];
        while (off < b.length) {
          const n = b[off++];
          if (!n) break;
          if (n & 0xc0) { off++; break; }
          labels.push(latin1.decode(b.subarray(off, off + n))); off += n;
        }
        const qtype = off + 2 <= b.length ? u16(b, off, false) : 0;
        out.push({ name: labels.join('.'), type: qtype === 1 ? 'A' : qtype === 28 ? 'AAAA' : qtype === 5 ? 'CNAME' : String(qtype), src: p.src, no: p.no });
      } catch (e) { }
    }
    return out;
  }

  function stripIac(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 255 && i + 1 < bytes.length) {
        const cmd = bytes[i + 1];
        if (cmd >= 251 && cmd <= 254) i += 2; else i += 1;
        continue;
      }
      out.push(bytes[i]);
    }
    return Uint8Array.from(out);
  }

  function extractTelnet(flows) {
    return flows.filter(f => f.proto === 'TCP' && (f.sport === 23 || f.dport === 23)).map(f => {
      const data = stripIac(f.data);
      const text = latin1.decode(data).replace(/\r/g, '\n');
      return { key: f.key, src: f.src, dst: f.dst, text: text.replace(/[^\x09\x0a\x0d\x20-\x7e\u4e00-\u9fa5]/g, '.').slice(0, 20000), bytes: data.length };
    });
  }

  function extractStrings(packets) {
    const set = new Set(); const flags = new Set(); const texts = [];
    for (const p of packets) {
      const b = p.payload; if (!b || !b.length) continue;
      let cur = '';
      for (let i = 0; i < b.length; i++) {
        const c = b[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= 5) { set.add(cur); texts.push(cur); } cur = ''; }
        if (set.size > 600) break;
      }
      if (cur.length >= 5) { set.add(cur); texts.push(cur); }
      // UTF-16LE 可打印串
      let u = '';
      for (let i = 0; i + 1 < b.length; i += 2) {
        const c = b[i] | (b[i + 1] << 8);
        if (c >= 32 && c < 127) u += String.fromCharCode(c);
        else { if (u.length >= 4) texts.push(u); u = ''; }
      }
      if (u.length >= 4) texts.push(u);
    }
    const all = texts.join('\n');
    const re = /(flag\{[^}\r\n]{1,200}\}|ctf\{[^}\r\n]{1,200}\}|[A-Za-z0-9_]{20,64}\{[^}\r\n]{1,200}\})/gi;
    let m; while ((m = re.exec(all))) flags.add(m[1]);
    return { strings: Array.from(set).slice(0, 600), flags: Array.from(flags) };
  }

  function finish(packets, format, linktypes) {
    const flows = buildFlows(packets);
    const http = [];
    for (const f of flows) for (const o of (f.http || [])) http.push(o);
    const dns = extractDns(packets);
    const telnet = extractTelnet(flows);
    const strings = extractStrings(packets);
    const tls = packets.filter(p => p.proto === 'TCP' && (p.dport === 443 || p.sport === 443) && p.payload && p.payload[0] === 0x16).length;
    return {
      format, packets, flows, http, dns, telnet,
      strings: strings.strings, flags: strings.flags,
      linktypes: linktypes || [],
      stats: {
        packets: packets.length,
        bytes: packets.reduce((a, p) => a + (p.len || 0), 0),
        flows: flows.length,
        http: http.length,
        dns: dns.length,
        tls
      }
    };
  }

  function parse(input) {
    const b = toU8(input);
    if (b.length >= 4 && u32(b, 0, false) === 0x0a0d0d0a) return parsePcapng(b);
    return parsePcap(b);
  }

  /* ===================== PNG ===================== */

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function parsePng(input) {
    const b = toU8(input);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (b[i] !== sig[i]) throw new Error('不是 PNG 文件');
    let off = 8; const chunks = [];
    while (off + 12 <= b.length) {
      const len = u32(b, off, false);
      const type = latin1.decode(b.subarray(off + 4, off + 8));
      const data = b.subarray(off + 8, off + 8 + len);
      const crc = u32(b, off + 8 + len, false);
      chunks.push({ type, length: len, data, crc, offset: off });
      off += 12 + len;
      if (type === 'IEND') break;
    }
    const ihdr = chunks.find(c => c.type === 'IHDR');
    const width = ihdr ? u32(ihdr.data, 0, false) : 0;
    const height = ihdr ? u32(ihdr.data, 4, false) : 0;
    return { width, height, chunks, trailing: b.subarray(off), bitDepth: ihdr ? ihdr.data[8] : 0, colorType: ihdr ? ihdr.data[9] : 0 };
  }

  function buildPng(parsed, width, height) {
    const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])];
    for (const c of parsed.chunks) {
      let data = c.data;
      if (c.type === 'IHDR') {
        data = new Uint8Array(c.data);
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        dv.setUint32(0, width || parsed.width, false);
        dv.setUint32(4, height || parsed.height, false);
      }
      const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, data.length, false);
      const type = new TextEncoder().encode(c.type);
      const crcData = new Uint8Array(type.length + data.length); crcData.set(type, 0); crcData.set(data, type.length);
      const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, crc32(crcData), false);
      parts.push(len, type, data, crc);
    }
    if (parsed.trailing && parsed.trailing.length) parts.push(parsed.trailing);
    return concatBytes(parts);
  }

  return {
    parsePcap, parsePcapng, parse, crc32, parsePng, buildPng,
    _internal: { buildFlows, extractHttp, dechunk, parseMultipart }
  };
})();
