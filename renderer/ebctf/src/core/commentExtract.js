/*
 * commentExtract.js — 注释域提取（HTML 注释 + ZIP 注释），cat:'filefmt'，两个单向 run op。
 *
 * 一、htmlCommentExtract —— HTML 注释 <!-- --> 提取。
 * 语义依据 HTML Living Standard（WHATWG）：
 *   - 语法 §13.2.4 Comments：注释以 <!-- 开头，文本不得以 > 或 -> 开头，
 *     不得含 <!-- / --> / --!> 串，不得以 <! 或 <- 结尾（违反是解析错误，
 *     但分词器有容错路径，见下）。
 *   - 分词器 §13.2.5：comment state 遇 < 进 comment less-than-sign 系状态——
 *     注释内的 <!-- 是 nested-comment 解析错误，但【不】开新注释，注释继续，
 *     仍由其后的第一个 --> 收口（即 HTML 无嵌套注释）。
 *   - 收口路径：comment end state 的 > （即 -->）；comment end bang state 的 >
 *     （即 --!>，incorrectly-escaped-comment 解析错误但同样收口）。
 *   - 空注释急收：<!-->（comment start state 遇 >）与 <!--->（comment start
 *     dash state 遇 >），abrupt-closing-of-empty-comment 解析错误，注释为空并立即结束。
 *   - EOF 未收口：eof-in-comment 解析错误，但注释【仍会】被发出（发出到文件尾）。
 *
 * 两档模式：
 *   - standard（默认）：按 Living Standard 分词器语义——第一个 --> / --!> 收口，
 *     <!--> / <!---> 急收为空注释，EOF 未闭合仍算一条（标 [未闭合:EOF]）。
 *   - nested（容错）：把 <!-- 当可嵌套开括号做深度计数，深度归零才收口。
 *     这是【非标准】约定（标准明确无嵌套注释），服务两类取证场景：
 *     a) 出题人手写「嵌套」注释 <!-- a <!-- b --> c -->，标准模式只能拿到前半，
 *        nested 模式拿整段；b) 注释内含 <!-- 字面量（如教程代码）时对照两档差异定位。
 *
 * 二、zipCommentExtract —— ZIP 注释域提取（EOCD 档案注释 + 每条目注释）。
 * 语义依据 PKWARE APPNOTE.TXT「.ZIP File Format Specification」6.3.x：
 *   - §4.3.16 End of Central Directory Record：偏移 20 注释长度(2 LE)，
 *     偏移 22 起为档案注释（最长 65535）。
 *   - §4.3.7 Central Directory File Header：偏移 28/30/32 = 名长/扩展长/注释长
 *     (2 LE)，注释域紧随名与扩展域之后（本地文件头 LFH 无注释字段）。
 *   - §4.4.0.4 通用位标志 bit11=1（EFS）时文件名/注释按 UTF-8 解码；
 *     未置位传统为 CP437，本工具先试 UTF-8、失败回退 latin1 并标注（CP437
 *     高区位字节按 latin1 近似展示，同时给出 hex 原值可复核）。
 * 定位口径与 ZIP 伪加密修复 op 同思路（独立实现，不共用代码）：从尾部找 EOCD，
 * 沿 EOCD→中央目录逐条走；声明 CD 偏移验不出签名而「EOCD 前 cdSize 字节」
 * 验得出时按拼接文件（前缀垃圾）修正偏移；ZIP64 顶格值显式拒绝。
 *
 * 输入：htmlCommentExtract 为文本（HTML 源码）；zipCommentExtract 为 base64
 * （可带 dataURL 前缀）或 p.rawBytes 直传字节（acceptsBytes）。
 * 输出：报告文本（逐条注释 + 偏移 + 摘要）。
 *
 * 回归断言：加载期自检 IIFE（HTML：标准嵌套语义/急收/--!>/未闭合/偏移/空输入；
 * ZIP：自搓 Stored ZIP 构造器带条目注释+档案注释逐字节断言、无注释明示、
 * 非 ZIP / 截断中央目录 / RAR 报错、base64 文本输入路径）。
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

// ============ HTML 注释提取 ============

/**
 * 提取 HTML 注释。
 * @param {string} src HTML 源码
 * @param {"standard"|"nested"} mode standard=Living Standard 分词器语义；nested=深度计数容错
 * @returns {Array<{offset:number, content:string, closed:boolean, closeLen:number}>}
 */
export function extractHtmlComments(src, mode = "standard") {
  const s = String(src ?? "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("<!--", i);
    if (open < 0) break;
    if (mode === "nested") {
      let depth = 1;
      let j = open + 4;
      let closed = false;
      while (j < s.length) {
        if (s.startsWith("<!--", j)) { depth++; j += 4; }
        else if (s.startsWith("--!>", j)) { if (--depth === 0) { closed = true; break; } j += 4; }
        else if (s.startsWith("-->", j)) { if (--depth === 0) { closed = true; break; } j += 3; }
        else { j++; }
      }
      // j = 收口 closer 起始（内容不含 closer）；深度未归零到 EOF = 未闭合
      const closerLen = closed ? (s.startsWith("--!>", j) ? 4 : 3) : 0;
      out.push({ offset: open, content: s.slice(open + 4, j), closed, closeLen: closerLen });
      i = closed ? j + closerLen : s.length;
    } else {
      const dataStart = open + 4;
      let closeStart = -1;
      let closeLen = 0;
      // 空注释急收（abrupt-closing-of-empty-comment）：<!--> 与 <!--->
      if (s[dataStart] === ">") { closeStart = dataStart; closeLen = 1; }
      else if (s[dataStart] === "-" && s[dataStart + 1] === ">") { closeStart = dataStart; closeLen = 2; }
      else {
        // 分词器语义：第一个 --> 或 --!> 收口；其间一切（含 <!--）都是注释文本
        for (let j = dataStart; j < s.length; j++) {
          if (s.startsWith("--!>", j)) { closeStart = j; closeLen = 4; break; }
          if (s.startsWith("-->", j)) { closeStart = j; closeLen = 3; break; }
        }
      }
      const closed = closeStart >= 0;
      const stop = closed ? closeStart : s.length;
      out.push({ offset: open, content: s.slice(dataStart, stop), closed, closeLen });
      i = closed ? closeStart + closeLen : stop;
    }
  }
  return out;
}

const HTML_MAX_LIST = 2000;   // 最多列出 2000 条（计数仍全量）
const HTML_MAX_SHOW = 4000;   // 单条内容最多展示 4000 字符（超长截断标注）

function htmlCommentRun(text, p = {}) {
  const src = String(text ?? "");
  if (!src.trim()) return "（空输入）请粘贴 HTML 源码（或包含 <!-- --> 注释的任意文本）。";
  const mode = p.mode === "nested" ? "nested" : "standard";
  let minLen = parseInt(p.minLen, 10);
  if (!Number.isFinite(minLen) || minLen < 1) minLen = 1;
  const showOff = !!p.showOffset;

  const all = extractHtmlComments(src, mode);
  const hits = all.filter((c) => c.content.length >= minLen);
  const unclosed = all.filter((c) => !c.closed).length;

  const lines = [];
  lines.push(`HTML 注释提取（模式 ${mode === "standard" ? "标准（HTML Living Standard 分词语义，第一个 -->/--!> 收口）" : "嵌套容错（<!-- 深度计数，非标准约定）"}，命中 ${hits.length} 条${unclosed ? `，其中 ${unclosed} 条未闭合` : ""}）`);
  lines.push("");
  if (!hits.length) {
    lines.push("未找到 <!-- --> 注释。建议：换嵌套容错模式（出题人手写嵌套注释时标准模式可能取不全）、或降低最小长度。");
    return lines.join("\n");
  }
  const cap = Math.min(hits.length, HTML_MAX_LIST);
  for (let i = 0; i < cap; i++) {
    const c = hits[i];
    let body = c.content;
    if (body.length > HTML_MAX_SHOW) body = body.slice(0, HTML_MAX_SHOW) + `…（截断，全长 ${c.content.length} 字符）`;
    lines.push(`${showOff ? `@${c.offset} ` : ""}#${i + 1}${c.closed ? "" : " [未闭合:EOF]"}: ${body}`);
  }
  if (hits.length > cap) lines.push(`…（其余 ${hits.length - cap} 条仅计数，不列出）`);
  return lines.join("\n");
}

// ============ ZIP 注释提取 ============

const LFH_SIG = [0x50, 0x4b, 0x03, 0x04];
const CDH_SIG = [0x50, 0x4b, 0x01, 0x02];
const EOCD_SIG = [0x50, 0x4b, 0x05, 0x06];

const u16le = (b, o) => (b[o] | (b[o + 1] << 8)) >>> 0;
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0;
function isSig(b, o, sig) {
  return b[o] === sig[0] && b[o + 1] === sig[1] && b[o + 2] === sig[2] && b[o + 3] === sig[3];
}

/** 定位 EOCD：从尾部往前找（EOCD 定长 22 + 注释最长 65535，APPNOTE §4.3.16）。 */
function findEocd(b) {
  if (b.length < 22) return -1;
  const start = Math.max(0, b.length - 22 - 65535);
  for (let i = b.length - 22; i >= start; i--) {
    if (isSig(b, i, EOCD_SIG)) return i;
  }
  return -1;
}

/** 字节 → 可显示文本：先试严格 UTF-8，失败回退 latin1；不可显示字节多时给 hex 摘要。 */
function decodeMaybeUtf8(bytes) {
  try {
    return { text: _decodeUtf8Fatal(bytes), fallback: false };
  } catch { /* 非 UTF-8 */ }
  let latin = "";
  for (const x of bytes) latin += String.fromCharCode(x);
  return { text: latin, fallback: true };
}

function bytesToHex(b) {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa === "function") return btoa(bin);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  throw new Error("无 btoa/Buffer，无法编码 base64");
}

function b64ToBytes(b64) {
  if (typeof b64 !== "string") throw new Error("需 base64 字符串输入");
  const comma = b64.indexOf(",");
  if (comma >= 0 && b64.slice(0, 5).toLowerCase().startsWith("data:")) b64 = b64.slice(comma + 1);
  b64 = b64.replace(/\s+/g, "");
  let bin;
  if (typeof atob === "function") bin = atob(b64);
  else if (typeof Buffer !== "undefined") bin = Buffer.from(b64, "base64").toString("binary");
  else throw new Error("无 atob/Buffer，无法解码 base64");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 解析 ZIP 注释域。
 * @param {Uint8Array} bytes ZIP 字节
 * @returns {{eocd:number, delta:number, archive:{len:number, text:string, fallback:boolean, hex:string}|null,
 *   entries:Array<{name:string, comment:string, commentFallback:boolean, commentHex:string, commentOff:number}>,
 *   total:number, withComment:number, warnings:string[]}}
 * @throws {Error} 无 EOCD / RAR / ZIP64 / 中央目录走查失败
 */
export function parseZipComments(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21) {
    throw new Error("检测到 RAR。RAR 注释域结构与 ZIP 不同，本工具不处理；请用专门工具。");
  }
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error("找不到 ZIP 中央目录结尾（EOCD 签名 50 4B 05 06）——文件可能截断、损坏或不是 ZIP。");
  const count = u16le(bytes, eocd + 10);
  const cdSize = u32le(bytes, eocd + 12);
  const cdOff = u32le(bytes, eocd + 16);
  if (count === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) {
    throw new Error("疑似 ZIP64 大档（条目数/偏移/长度顶格 0xFFFF 或 0xFFFFFFFF），暂不支持。");
  }

  // 档案注释（EOCD 偏移 20 长度、22 起，APPNOTE §4.3.16）
  const warnings = [];
  const archLen = u16le(bytes, eocd + 20);
  const archBytes = bytes.subarray(eocd + 22, eocd + 22 + archLen);
  const tailGap = bytes.length - (eocd + 22 + archLen);
  if (tailGap !== 0) warnings.push(`EOCD 注释声明 ${archLen} 字节，但文件尾与注释结束差 ${tailGap} 字节（尾部${tailGap > 0 ? "多余" : "不足"}）——按声明长度截取。`);
  let archive = null;
  if (archLen > 0) {
    const d = decodeMaybeUtf8(archBytes);
    archive = { len: archLen, text: d.text, fallback: d.fallback, hex: bytesToHex(archBytes) };
  }

  // 中央目录定位（拼接文件前缀修正，与主流解压器思路一致）
  let delta = 0;
  let cur = cdOff;
  if (cdOff + 46 > bytes.length || !isSig(bytes, cdOff, CDH_SIG)) {
    const cdActual = eocd - cdSize;
    if (cdActual > 0 && cdActual + 46 <= bytes.length && isSig(bytes, cdActual, CDH_SIG)) {
      delta = cdActual - cdOff;
      cur = cdActual;
      warnings.push(`检测到 ZIP 前拼接数据 ${delta} 字节（EOCD 内偏移为 ZIP 相对值，已修正）。`);
    }
  }

  const entries = [];
  let withComment = 0;
  for (let idx = 0; idx < count; idx++) {
    if (cur + 46 > bytes.length || !isSig(bytes, cur, CDH_SIG)) {
      throw new Error(`中央目录第 ${idx + 1} 条解析失败（签名不匹配或数据截断）——文件可能损坏或为 ZIP64。`);
    }
    const flags = u16le(bytes, cur + 8);
    const nameLen = u16le(bytes, cur + 28);
    const extraLen = u16le(bytes, cur + 30);
    const commentLen = u16le(bytes, cur + 32);
    const nameStart = cur + 46;
    const commentOff = nameStart + nameLen + extraLen;
    if (commentOff + commentLen > bytes.length) {
      throw new Error(`第 ${idx + 1} 条的注释域越界（${commentOff + commentLen} > 文件长 ${bytes.length}）——文件截断。`);
    }
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLen);
    const nameUtf8 = (flags & 0x0800) !== 0; // EFS bit11，APPNOTE §4.4.0.4
    const name = nameUtf8 || nameLen === 0 ? new TextDecoder().decode(nameBytes) : decodeMaybeUtf8(nameBytes).text;
    const cBytes = bytes.subarray(commentOff, commentOff + commentLen);
    let comment = "", commentFallback = false;
    if (commentLen > 0) {
      const d = nameUtf8
        ? { text: new TextDecoder().decode(cBytes), fallback: false } // EFS：注释同为 UTF-8
        : decodeMaybeUtf8(cBytes);
      comment = d.text;
      commentFallback = d.fallback;
      withComment++;
    }
    entries.push({
      name: nameLen ? name : "(空名)",
      comment, commentFallback, commentHex: commentLen ? bytesToHex(cBytes) : "",
      commentOff, commentLen,
    });
    cur += 46 + nameLen + extraLen + commentLen;
  }

  return { eocd, delta, archive, entries, total: count, withComment, warnings };
}

function zipCommentRun(text, p = {}) {
  let bytes;
  if (p && p.rawBytes && p.rawBytes.length) {
    bytes = p.rawBytes instanceof Uint8Array ? p.rawBytes : new Uint8Array(p.rawBytes);
  } else {
    if (!text || !String(text).trim()) throw new Error("（空输入）请拖入 ZIP 文件或粘贴其 base64。");
    bytes = b64ToBytes(String(text));
  }

  const info = parseZipComments(bytes);
  const lines = [];
  lines.push(`ZIP 注释域提取（APPNOTE 6.3.x：EOCD 档案注释 + 中央目录条目注释；输入 ${bytes.length} 字节）`);
  lines.push(`条目 ${info.total} 条，其中带注释 ${info.withComment} 条；EOCD @${info.eocd}${info.delta ? `（前缀修正 +${info.delta}）` : ""}`);
  for (const w of info.warnings) lines.push(`注意：${w}`);
  lines.push("");

  let found = 0;
  if (info.archive) {
    found++;
    lines.push(`[EOCD 档案注释]（${info.archive.len} 字节${info.archive.fallback ? "，非 UTF-8，按 latin1 近似展示" : ""}）`);
    lines.push(info.archive.text);
    lines.push(`hex: ${info.archive.hex}`);
    lines.push("");
  }
  for (const [i, e] of info.entries.entries()) {
    if (!e.commentLen) continue;
    found++;
    lines.push(`[条目 ${i + 1}] ${e.name}（注释 @${e.commentOff}，${e.commentLen} 字节${e.commentFallback ? "，非 UTF-8，按 latin1 近似展示" : ""}）`);
    lines.push(e.comment);
    lines.push(`hex: ${e.commentHex}`);
    lines.push("");
  }
  if (!found) {
    lines.push("未发现任何注释域（EOCD 档案注释与全部条目注释均为空）——结构完整的 ZIP 默认不带注释，属正常状态。");
  }
  return lines.join("\n").replace(/\n+$/, "");
}

// ============ 加载期自检（import 即跑） ============

(() => {
  const eq = (a, b, what) => { if (a !== b) throw new Error(`commentExtract 自检失败[${what}]：${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

  // ---- HTML ----
  // ① 标准：注释内 <!-- 不开新注释，第一个 --> 收口（Living Standard §13.2.5 nested-comment）
  const r1 = extractHtmlComments("<x><!-- a <!-- b --> c -->", "standard");
  eq(r1.length, 1, "html-std-nested-count");
  eq(r1[0].content, " a <!-- b ", "html-std-nested-content");
  eq(r1[0].closed, true, "html-std-nested-closed");

  // ② 嵌套容错：深度归零收口，取整段
  const r2 = extractHtmlComments("<!-- a <!-- b --> c -->", "nested");
  eq(r2.length, 1, "html-nested-count");
  eq(r2[0].content, " a <!-- b --> c ", "html-nested-content");

  // ③ 空注释急收：<!--> 与 <!--->（abrupt-closing-of-empty-comment）
  const r3 = extractHtmlComments("<!--><!--->real<!-- ok -->", "standard");
  eq(r3.length, 3, "html-abrupt-count");
  eq(r3[0].content, "", "html-abrupt-1");
  eq(r3[1].content, "", "html-abrupt-2");
  eq(r3[2].content, " ok ", "html-abrupt-3");

  // ④ --!> 收口（comment end bang state）
  const r4 = extractHtmlComments("<!-- flag{x} --!>tail", "standard");
  eq(r4.length, 1, "html-bang-count");
  eq(r4[0].content, " flag{x} ", "html-bang-content");

  // ⑤ EOF 未闭合仍算一条（eof-in-comment）
  const r5 = extractHtmlComments("a<!-- broken", "standard");
  eq(r5.length, 1, "html-eof-count");
  eq(r5[0].content, " broken", "html-eof-content");
  eq(r5[0].closed, false, "html-eof-closed");

  // ⑥ 偏移 + run 报告形态（<p>hi</p> 占 9 字符，首注释 @9）
  const out6 = htmlCommentRun('<p>hi</p><!-- first --><!-- flag{c} -->', { showOffset: true });
  if (!out6.includes("命中 2 条") || !out6.includes("@9") || !out6.includes("first") || !out6.includes("flag{c}")) {
    throw new Error(`commentExtract 自检失败[html-report]：\n${out6}`);
  }
  if (!htmlCommentRun("", {}).includes("空输入")) throw new Error("commentExtract 自检失败[html-empty]");
  if (!htmlCommentRun("no comments", {}).includes("未找到")) throw new Error("commentExtract 自检失败[html-none]");

  // ---- ZIP：自搓 Stored 构造器（LFH/CDH/EOCD + CRC32，字节几何照 APPNOTE） ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (d) => {
    let c = 0xFFFFFFFF;
    for (const b of d) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const w16 = (a, v) => { a.push(v & 0xFF, (v >>> 8) & 0xFF); };
  const w32 = (a, v) => { a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); };
  /** 单/多文件 Stored ZIP，每条目可带注释，档案可带注释 */
  const makeZip = (files, archComment) => {
    const enc = new TextEncoder();
    const ab = [], cd = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = enc.encode(f.data);
      const crc = crc32(data);
      const lfh = [0x50, 0x4b, 0x03, 0x04]; w16(lfh, 20); w16(lfh, 0); w16(lfh, 0);
      w16(lfh, 0); w16(lfh, 0); w32(lfh, crc); w32(lfh, data.length); w32(lfh, data.length);
      w16(lfh, name.length); w16(lfh, 0); lfh.push(...name);
      const cdh = [0x50, 0x4b, 0x01, 0x02]; w16(cdh, 20); w16(cdh, 20); w16(cdh, 0); w16(cdh, 0);
      w16(cdh, 0); w16(cdh, 0); w32(cdh, crc); w32(cdh, data.length); w32(cdh, data.length);
      w16(cdh, name.length); w16(cdh, 0);
      w16(cdh, f.comment ? f.comment.length : 0);
      w16(cdh, 0); w16(cdh, 0); w32(cdh, 0); w32(cdh, off); cdh.push(...name);
      if (f.comment) cdh.push(...f.comment);
      ab.push(...lfh, ...data);
      cd.push(...cdh);
      off += lfh.length + data.length;
    }
    const cdOff = off;
    const cdSize = cd.length;
    const eocd = [0x50, 0x4b, 0x05, 0x06]; w16(eocd, 0); w16(eocd, 0);
    w16(eocd, files.length); w16(eocd, files.length); w32(eocd, cdSize); w32(eocd, cdOff);
    const ac = archComment ? [...archComment] : [];
    w16(eocd, ac.length); eocd.push(...ac);
    return new Uint8Array([...ab, ...cd, ...eocd]);
  };

  // ⑦ 条目注释 + 档案注释逐字节断言
  const enc = new TextEncoder();
  const z7 = makeZip(
    [
      { name: "a.txt", data: "flag{zip_c}", comment: enc.encode("entry comment A") },
      { name: "b.txt", data: "second", comment: null },
    ],
    enc.encode("archive comment Z"),
  );
  const i7 = parseZipComments(z7);
  eq(i7.total, 2, "zip-total");
  eq(i7.withComment, 1, "zip-withcomment");
  eq(i7.entries[0].comment, "entry comment A", "zip-entry-comment");
  eq(i7.entries[1].comment, "", "zip-entry-nocomment");
  eq(i7.archive.text, "archive comment Z", "zip-archive-comment");
  // 注释长度字节与首字节逐字节复核（"archive comment Z" = 17 字节）
  eq(z7[i7.eocd + 20], 17, "zip-arch-len-byte");
  eq(z7[i7.eocd + 22], 0x61, "zip-arch-first-byte");
  eq(z7[i7.eocd + 22 + 17], undefined, "zip-arch-end");

  // ⑧ 无注释 → 明示
  const i8 = parseZipComments(makeZip([{ name: "a.txt", data: "x", comment: null }], null));
  eq(i8.archive, null, "zip-noarch");
  eq(i8.withComment, 0, "zip-noentry");
  const out8 = zipCommentRun("", { rawBytes: makeZip([{ name: "a.txt", data: "x", comment: null }], null) });
  if (!out8.includes("未发现任何注释域")) throw new Error("commentExtract 自检失败[zip-none-report]");

  // ⑨ run 报告 + base64 文本输入路径
  const out9 = zipCommentRun(bytesToB64(z7), {});
  if (!out9.includes("entry comment A") || !out9.includes("archive comment Z") || !out9.includes("a.txt")) {
    throw new Error(`commentExtract 自检失败[zip-report]：\n${out9}`);
  }

  // ⑩ 异常：非 ZIP / EOCD 被截断 / 条目数与目录不符 / RAR
  let threw = "";
  try { parseZipComments(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { threw = e.message; }
  if (!threw.includes("EOCD")) throw new Error("commentExtract 自检失败[zip-notzip]：" + threw);
  threw = "";
  const zCut = makeZip(
    [
      { name: "a.txt", data: "x", comment: enc.encode("c1") },
      { name: "b.txt", data: "yy", comment: enc.encode("c2") },
    ],
    null,
  );
  // EOCD 被截一半：文件尾砍 10 字节（EOCD 定长 22）→ 签名不完整
  try { parseZipComments(zCut.subarray(0, zCut.length - 10)); } catch (e) { threw = e.message; }
  if (!threw.includes("EOCD")) throw new Error("commentExtract 自检失败[zip-eocd-truncated]：" + threw);
  threw = "";
  // 目录走查越界：EOCD 声明条目数 2 改 3 → 第 3 条签名不匹配
  const bad3 = new Uint8Array(zCut);
  bad3[bad3.length - 22 + 10] = 3; // EOCD 起始在 length-22（无档案注释）
  try { parseZipComments(bad3); } catch (e) { threw = e.message; }
  if (!/中央目录第 \d+ 条/.test(threw)) throw new Error("commentExtract 自检失败[zip-count-mismatch]：" + threw);
  threw = "";
  try { parseZipComments(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])); } catch (e) { threw = e.message; }
  if (!threw.includes("RAR")) throw new Error("commentExtract 自检失败[zip-rar]：" + threw);

  // ⑪ 拼接前缀修正：JPEG 头 + ZIP
  const prefixed = new Uint8Array([...new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]), ...z7]);
  const i11 = parseZipComments(prefixed);
  eq(i11.entries[0].comment, "entry comment A", "zip-prefix-entry");
  if (!i11.warnings.some((w) => w.includes("拼接"))) throw new Error("commentExtract 自检失败[zip-prefix-warn]");
})();

// ============ register ============

register({
  id: "htmlCommentExtract", cat: "filefmt", name: "HTML 注释提取",
  desc: "提取 HTML 源码里 <!-- --> 注释域（HTML Living Standard 分词语义：第一个 -->/--!> 收口、<!--> 空注释急收、<!-- 不嵌套、EOF 未闭合仍取整段）。嵌套容错模式把 <!-- 按深度计数配对（非标准约定，应对出题人手写嵌套注释）。输出逐条注释+字符偏移+未闭合标记，可选最小长度过滤。取证排查被注释掉的 flag/隐藏表单/调试信息",
  params: [
    {
      key: "mode", label: "模式", type: "select", default: "standard",
      options: [
        { value: "standard", label: "标准（Living Standard 分词语义）" },
        { value: "nested", label: "嵌套容错（<!-- 深度计数）" },
      ],
    },
    { key: "minLen", label: "最小内容长度", type: "number", default: 1 },
    { key: "showOffset", label: "显示偏移", type: "bool", default: false },
  ],
  run: htmlCommentRun,
});

register({
  id: "zipCommentExtract", cat: "filefmt", name: "ZIP 注释提取",
  desc: "提取 ZIP 注释域（APPNOTE 6.3.x）：EOCD 档案注释（§4.3.16 偏移 20/22）+ 中央目录每条目注释（§4.3.7 偏移 32）。EOCD→CD 精确路径走查（不扫描压缩数据），支持拼接文件前缀修正（图片/垃圾字节+ZIP），UTF-8/EFS bit11 解码+latin1 回退+hex 原值。CTF 里 flag 藏 ZIP 注释、或注释提示后续步骤的直接取证点。无注释明示、非 ZIP/截断/RAR/ZIP64 中文报错",
  params: [],
  run: zipCommentRun,
  acceptsBytes: true,
});

export { htmlCommentRun, zipCommentRun };
