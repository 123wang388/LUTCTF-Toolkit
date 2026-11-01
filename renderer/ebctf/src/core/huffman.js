/*
 * huffman.js — 通用 Huffman 编解码（cat:'data'，encode/decode 双向）。
 *
 * 两档：
 * 1) freq 频率档：从输入字节统计频率（或用权重表），构建码表后编码；
 *    解码需提供与编码一致的权重表（同规则重建同一张码表）。
 * 2) table 码表档：用户直接给「符号 码字」表，编/解码都按该表（校验前缀无关性）。
 *
 * 确定性规则（显式钉死，保证两端同表）：
 * - 符号域 = 输入文本的 UTF-8 字节。
 * - 树构建：节点键 (freq, minByte)，每次弹出键最小的两节点合并（minByte 取两子最小）；
 *   (freq, minByte) 是全序（各节点符号集互斥 ⇒ minByte 互异），结果唯一。
 * - 码字分配：canonical（RFC 1951 §3.2.2 风格）——按 (码长升序, 字节值升序) 排序，
 *   code 从 0 起递增，码长变长时左移差值。
 * - 单符号：码长 1、码字 "0"（显式规则）。
 * - 位流打包：MSB-first（第 i 位 → 第 i/8 字节的 7-(i%8) 位），末尾零填充，bitLen 记真实位数。
 *
 * 拒绝：非前缀码表 / 重复符号 / 重复码字 / 码字非 01 / 未知符号 / 位流截断 /
 * bitLen 超出字节容量 / 权重行格式错 / 负频率。
 * 边界：不定义「统一 Huffman 文件格式」，不把 DEFLATE framing 当通用标准；
 * 位流以 hex + bitLen 两个独立产物交付。
 */
import { register } from "./registry.js";
import { decodeUtf8Lossless } from "./bytesIo.js";

// BOM 保真的严格 UTF-8 解码（bytesIo 单一源）：非法序列抛 TypeError（同旧 fatal TextDecoder 语义），
// 唯一行为差异是合法 BOM（U+FEFF 开头）不再被静默吞掉。
function _decodeUtf8Fatal(bytes) {
  const r = decodeUtf8Lossless(bytes);
  if (!r.ok) throw new TypeError(r.reason);
  return r.text;
}

// ---------- 符号显示 ----------
function symLabel(b) {
  return (b >= 0x21 && b <= 0x7e) ? String.fromCharCode(b) : "\\x" + b.toString(16).padStart(2, "0");
}

// ---------- 输入 → 字节 ----------
function textToBytes(text) {
  return new TextEncoder().encode(String(text == null ? "" : text));
}

// ---------- 权重表解析：每行 "sym freq|sym:freq|sym,freq"；sym=单字符|\xNN|0xNN|"c" ----------
function parseWeights(raw) {
  const freq = new Map();
  if (!raw || !String(raw).trim()) return freq;
  const lines = String(raw).split(/\r?\n/);
  lines.forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith("#")) return;
    const m = /^(\S+|"[^"]*"|'[^']*')\s*[\s:,=]\s*(-?\d+(?:\.\d+)?)$/.exec(s);
    if (!m) throw new Error(`权重表第 ${i + 1} 行格式错：「${s}」（应为 符号 频率，符号可写单字符或 \\xNN/0xNN）`);
    const f = Number(m[2]);
    if (f < 0) throw new Error(`权重表第 ${i + 1} 行频率为负：${f}`);
    let tok = m[1];
    if (tok.length >= 2 && ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'")))) tok = tok.slice(1, -1);
    freq.set(parseSymToken(tok), f);
  });
  return freq;
}

function parseSymToken(tok) {
  if (/^\\x[0-9a-fA-F]{2}$/.test(tok) || /^0x[0-9a-fA-F]{2}$/.test(tok)) return parseInt(tok.slice(2), 16);
  if (tok.length === 1) return tok.charCodeAt(0);
  if (/^\\x[0-9a-fA-F]{1}$/.test(tok)) return parseInt(tok.slice(2), 16); // \xN 宽容
  throw new Error(`无法解析符号「${tok}」（单字符或 \\xNN/0xNN）`);
}

// ---------- 码表解析：每行 "sym code|sym=code|sym code" ----------
function parseCodeTable(raw) {
  if (!raw || !String(raw).trim()) throw new Error("码表档需要提供码表（每行：符号 码字）");
  const map = new Map();       // byte -> code string
  const byCode = new Map();    // code string -> byte
  const lines = String(raw).split(/\r?\n/);
  lines.forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith("#")) return;
    const m = /^(\S+|"[^"]*"|'[^']*')\s*[\s=]\s*([01]+)$/.exec(s);
    if (!m) throw new Error(`码表第 ${i + 1} 行格式错：「${s}」（应为 符号 码字，码字只含 0/1）`);
    let tok = m[1];
    if (tok.length >= 2 && ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'")))) tok = tok.slice(1, -1);
    const b = parseSymToken(tok);
    const code = m[2];
    if (map.has(b)) throw new Error(`码表符号重复：${symLabel(b)}（第 ${i + 1} 行）`);
    if (byCode.has(code)) throw new Error(`码表码字重复：${code}（${symLabel(byCode.get(code))} 与 ${symLabel(b)}）`);
    map.set(b, code);
    byCode.set(code, b);
  });
  if (map.size === 0) throw new Error("码表为空");
 // 前缀无关性校验（排序后相邻比较即可）
  const codes = [...map.values()].sort();
  for (let i = 1; i < codes.length; i++) {
    if (codes[i].startsWith(codes[i - 1])) {
      throw new Error(`码表非前缀码：「${codes[i - 1]}」是「${codes[i]}」的前缀，无法唯一解码`);
    }
  }
  return map;
}

// ---------- 频率 → 码长（确定性堆：键 (freq, minByte)）→ canonical 码 ----------
function buildCanonicalCodes(freqMap) {
  const syms = [...freqMap.keys()].sort((a, b) => a - b);
  if (syms.length === 0) throw new Error("符号集为空");
  const bitlen = new Map();
  if (syms.length === 1) {
    bitlen.set(syms[0], 1); // 显式规则：单符号码长 1
  } else {
   // 数组当堆：节点 {f, min, kids}，键 (f, min)（min 互异 ⇒ 全序）
    const nodes = syms.map((b) => ({ f: freqMap.get(b), min: b, kids: null }));
    const cmp = (a, b) => (a.f - b.f) || (a.min - b.min);
    const heap = [];
    const hpush = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (cmp(heap[p], heap[i]) <= 0) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    for (const n of nodes) hpush(n); // 初始建堆（勿直接当数组用）
    const hpop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          let l = i * 2 + 1, r = l + 1, s = i;
          if (l < heap.length && cmp(heap[l], heap[s]) < 0) s = l;
          if (r < heap.length && cmp(heap[r], heap[s]) < 0) s = r;
          if (s === i) break;
          [heap[s], heap[i]] = [heap[i], heap[s]];
          i = s;
        }
      }
      return top;
    };
    const all = [...nodes];
    while (heap.length > 1) {
      const a = hpop(), b = hpop();
      const merged = { f: a.f + b.f, min: Math.min(a.min, b.min), kids: [a, b] };
      all.push(merged);
      hpush(merged);
    }
    const root = hpop();
   // 深度统计（迭代防深树爆栈）
    const stack = [[root, 0]];
    while (stack.length) {
      const [n, d] = stack.pop();
      if (!n.kids) { bitlen.set(n.min, d); continue; }
      stack.push([n.kids[0], d + 1], [n.kids[1], d + 1]);
    }
  }
 // canonical 分配：按 (码长, 字节) 升序，code 递增
  const order = [...bitlen.entries()].map(([b, l]) => ({ b, l })).sort((x, y) => x.l - y.l || x.b - y.b);
  const codes = new Map();
  let code = 0, prevLen = order[0].l;
  for (let i = 0; i < order.length; i++) {
    if (i > 0) { code = (code + 1) * (1 << (order[i].l - prevLen)); prevLen = order[i].l; }
    codes.set(order[i].b, code.toString(2).padStart(order[i].l, "0"));
  }
  return { codes, bitlen };
}

// ---------- 位流打包/解包（MSB-first）----------
function packBits(bitStr) {
  const nBytes = Math.ceil(bitStr.length / 8);
  const out = new Uint8Array(nBytes);
  for (let i = 0; i < bitStr.length; i++) {
    if (bitStr[i] === "1") out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}
function unpackBits(bytes, bitLen) {
  if (bitLen > bytes.length * 8) throw new Error(`bitLen=${bitLen} 超出输入 ${bytes.length} 字节容量（${bytes.length * 8} 位）`);
  let s = "";
  for (let i = 0; i < bitLen; i++) s += ((bytes[i >> 3] >> (7 - (i & 7))) & 1) ? "1" : "0";
  return s;
}

function bytesToHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function hexToBytes(s) {
  const t = String(s).replace(/[^0-9a-fA-F]/g, "");
  if (t.length % 2) throw new Error("hex 输入长度须为偶数");
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function renderTable(codes) {
  const order = [...codes.entries()].sort((a, b) => a[1].length - b[1].length || a[0] - b[0]);
  const lines = order.map(([b, c]) => `${symLabel(b).padEnd(4)} → ${c}  (${c.length} bit)`);
  return { lines: lines.slice(0, 300), hidden: Math.max(0, lines.length - 300) };
}

// ---------- encode ----------
function huffmanEncode(text, p = {}) {
  const mode = (p && p.mode) || "freq";
  const bytes = textToBytes(text);
  if (bytes.length === 0) throw new Error("输入为空");
  let codes, bitlen = null;
  if (mode === "table") {
    codes = parseCodeTable(p.table);
  } else {
    const weights = parseWeights(p.weights);
    const freq = new Map();
    if (weights.size > 0) {
      for (const [b, f] of weights) freq.set(b, f);
      for (const b of bytes) {
        if (!freq.has(b)) throw new Error(`输入含权重表未列符号 ${symLabel(b)}（频率档编码需符号全列入权重表，或不填权重表由输入统计）`);
      }
    } else {
      for (const b of bytes) freq.set(b, (freq.get(b) || 0) + 1);
    }
    const r = buildCanonicalCodes(freq);
    codes = r.codes; bitlen = r.bitlen;
  }
  let bitStr = "";
  for (const b of bytes) {
    const c = codes.get(b);
    if (!c) throw new Error(`码表缺符号 ${symLabel(b)}`);
    bitStr += c;
  }
  const packed = packBits(bitStr);
  const tbl = renderTable(codes);
  const lines = [];
  lines.push(`符号数: ${codes.size}，输入 ${bytes.length} 字节 → ${bitStr.length} bit（${packed.length} 字节 + ${(-bitStr.length) % 8 & 7} bit 填充）`);
  lines.push("");
  lines.push("--- 码表（" + (mode === "table" ? "用户码表" : "canonical（频率档确定性规则）") + "）---");
  lines.push(...tbl.lines);
  if (tbl.hidden) lines.push(`…（其余 ${tbl.hidden} 项省略）`);
  lines.push("");
  lines.push(`bitLen: ${bitStr.length}`);
  lines.push(`hex: ${bytesToHex(packed).length > 4096 ? bytesToHex(packed).slice(0, 4096) + "…(截断)" : bytesToHex(packed)}`);
  if (bitStr.length <= 256) lines.push(`bits: ${bitStr}`);
  if (mode === "freq") {
    lines.push("");
    lines.push("解码：同 op 切 decode，粘贴 hex + 填 bitLen=" + bitStr.length + " + 提供「与编码一致」的权重表（或输入统计口径相同的原文符号集）即可重建同一张码表。");
  }
  return lines.join("\n");
}

// ---------- decode ----------
function huffmanDecode(text, p = {}) {
  const mode = (p && p.mode) || "freq";
  const bytes = hexToBytes(text);
  if (bytes.length === 0) throw new Error("解码输入为空（hex）");
  const bitLen = (p && Number(p.bitLen)) || 0;
  const bits = unpackBits(bytes, bitLen > 0 ? bitLen : bytes.length * 8);
  let codes;
  if (mode === "table") {
    codes = parseCodeTable(p.table);
  } else {
    const weights = parseWeights(p.weights);
    if (weights.size === 0) throw new Error("频率档解码需要提供与编码一致的权重表（freq 档无法从位流自建码表）");
    codes = buildCanonicalCodes(weights).codes;
  }
  const byCode = new Map();
  for (const [b, c] of codes) byCode.set(c, b);
  const out = [];
  let cur = "";
  for (const ch of bits) {
    cur += ch;
    const b = byCode.get(cur);
    if (b !== undefined) { out.push(b); cur = ""; }
  }
  if (cur !== "") {
    throw new Error(`位流在第 ${out.length} 个符号后截断：剩余「${cur}」不是任何码字（检查 bitLen/码表一致性）`);
  }
  const outBytes = new Uint8Array(out);
 // 二进制判定：非法 UTF-8（fatal 解码抛错）或控制字符占比高 → 输出 hex
  let isText = true;
  let dec = "";
  try {
    dec = _decodeUtf8Fatal(outBytes);
    const ctrl = dec.split("").filter((c) => c.codePointAt(0) < 0x20 && c !== "\n" && c !== "\r" && c !== "\t").length;
    if (outBytes.length > 0 && ctrl / Math.max(1, dec.length) >= 0.1) isText = false;
  } catch { isText = false; }
  const lines = [];
  lines.push(`解码: ${outBytes.length} 字节（${bits.length} bit）`);
  if (isText) lines.push(dec);
  else lines.push(`hex: ${bytesToHex(outBytes).length > 4096 ? bytesToHex(outBytes).slice(0, 4096) + "…" : bytesToHex(outBytes)}`);
  return lines.join("\n");
}

register({
  id: "huffmanCodec",
  cat: "data",
  name: "哈夫曼编解码（通用）",
  desc: "频率档（输入统计/权重表 → 确定性 canonical 码）与用户码表档双向编解码；MSB-first 位流（hex+bitLen）；拒绝非前缀码/截断/未知符号；不定义私有文件格式",
  params: [
    {
      key: "mode", label: "模式", type: "select", default: "freq",
      options: [
        { value: "freq", label: "频率档（统计或权重表 → canonical）" },
        { value: "table", label: "码表档（用户码表）" },
      ],
    },
    { key: "weights", label: "权重表（频率档；每行「符号 频率」，\\xNN/0xNN 可用；空=从编码输入统计；解码必填且与编码一致）", type: "textarea", rows: 4, default: "", placeholder: "a 5\nb 2\n\\x63 1\n（# 开头行为注释；符号 # 本身写 \"#\" 或 \\x23）" },
    { key: "table", label: "码表（码表档；每行「符号 码字」；符号 # 写 \"#\" 或 \\x23）", type: "textarea", rows: 4, default: "", placeholder: "a 0\nb 10\nc 11" },
    { key: "bitLen", label: "真实位数 bitLen（decode；0=按字节全量）", type: "number", default: 0, placeholder: "encode 输出里给出的 bitLen" },
  ],
  encode: huffmanEncode,
  decode: huffmanDecode,
});

export { huffmanEncode, huffmanDecode, buildCanonicalCodes, parseCodeTable, parseWeights, packBits, unpackBits, symLabel };
