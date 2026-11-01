/*
 * symboldetect.mjs — 图像 → 符号的「检测 / 采样」共用层（零依赖纯 JS）
 *
 * 解决什么：把「扫描线 → 游程 → 宽度比序列 → 符号」这条链抽成一个共用层，
 * 二维码与该层的关系是「**用 2D 网格实例化**」，一维条码是「**用宽度比实例化**」；
 * 从而不再让每个 op（扫码 / 识别条码 / 图像取证）各写一份「找起始符 + 切模块 + 查表」。
 *
 * 本层**不重复造**既有构件，只做「编排 + 归一化」：
 *   - 定位符检测 / 三点排序 / 仿射采样：直接委派 `qrscanFind.js`
 *     （`findFinderCentersScaled` / `orderThree` / `sampleAffine` /
 *      `refineTrioByFinderScore` / `finderScore`）
 *   - 二值化与合法版本表：直接委派 `qrscanSample.js`（`binarize` / `LEGAL_SIZES`）
 *   - 二维码的**完整解码**（去掩码 / RS / 数据段）不在本层，走既有 `qrscan.scanGray`
 *     与 `qrErasureDecode.decodeBruteWithErasures`；本层只负责「给它们一张可用的模块矩阵」。
 *
 * 权威依据（写入本文件常量的 spec 字段）：
 *   - 二维码：ISO/IEC 18004（定位符 1:1:3:1:1、模块网格、版本 21+4i、静默区 4 模块）
 *   - Code 39：ISO/IEC 16388（每字符 9 元素 / 3 宽，宽窄比 3:1，字符间 1 窄间隙，起止符 `*`）
 *   - EAN-13 / UPC-A：ISO/IEC 15420（95 模块，左 6 位 L/G 混合、中分隔 01010、右 6 位 R）
 *
 * 说明（重要，避免被误读为「自动推断」）：宽窄比、扫描序、静默区长度**全部显式声明**，
 * 不做「看情况猜」；声明之外的形态一律返回 null，不猜、不兜底。
 */

import {
  rleLine, matchWindowScaled, findFinderCentersScaled, orderThree, sampleAffine,
  refineTrioByFinderScore, finderScore,
} from "./qrscanFind.js";
import { binarize, LEGAL_SIZES } from "./qrscanSample.js";

// ============================================================
// 0. 扫描序（与层③ 的 SCANS 语义一致：行主序 / 列主序）
// ============================================================
export const SCANS = ["row", "col"];

/**
 * 按声明的扫描序抽扫描线。
 * @param {ArrayLike<number>} bits 0/1 平面（行主序平铺，长度 w*h）
 * @param {object} [opt] {scan:"row"|"col", stride, from, to}
 * @returns {Array<{index:number, values:number[]}>} index = 行号或列号
 */
export function scanlines(bits, w, h, opt = {}) {
  const scan = opt.scan || "row";
  if (!SCANS.includes(scan)) throw new Error(`未知扫描序 "${scan}"（只支持 row/col，必须显式声明）`);
  const stride = Math.max(1, opt.stride | 0 || 1);
  const from = opt.from == null ? 0 : opt.from;
  const to = opt.to == null ? (scan === "row" ? h : w) : opt.to;
  const out = [];
  if (scan === "row") {
    for (let y = from; y < to; y += stride) {
      const v = new Array(w);
      for (let x = 0; x < w; x++) v[x] = bits[y * w + x] ? 1 : 0;
      out.push({ index: y, values: v });
    }
  } else {
    for (let x = from; x < to; x += stride) {
      const v = new Array(h);
      for (let y = 0; y < h; y++) v[y] = bits[y * w + x] ? 1 : 0;
      out.push({ index: x, values: v });
    }
  }
  return out;
}

// ============================================================
// 1. 扫描线 → 游程（run-length）→ 宽度比
// ============================================================
/**
 * 游程编码。value 为 1 表示「暗」（条 / 暗模块），0 表示「亮」。
 * @returns {Array<{value:0|1, width:number, start:number}>}
 */
export function rleRuns(values) {
  // 不另写一遍游程算法：委派既有 qrscanFind.rleLine，只把字段名译成本层契约
  // {value,width,start}（既有内核用 {color,len,start}）。
  return rleLine(values).map((r) => ({ value: r.color ? 1 : 0, width: r.len, start: r.start }));
}

/**
 * 宽度归一化：把每个游程宽度折算成「最窄单位」的倍数。
 * 单位 U 取**稳健最小值**（分位而非纯最小），避免单个抗锯齿像素把整条归一化带偏。
 * @param {Array} runs rleRuns 的产物
 * @param {number} [q] 分位（默认 0.15）
 * @returns {{unit:number, ratios:number[]}}
 */
export function normalizeWidths(runs, q = 0.15) {
  if (!runs.length) return { unit: 0, ratios: [] };
  const ws = runs.map((r) => r.width).sort((a, b) => a - b);
  const unit = Math.max(1, ws[Math.min(ws.length - 1, Math.floor(ws.length * q))] || ws[0]);
  return { unit, ratios: runs.map((r) => r.width / unit) };
}

/** 把已归一化的宽度量化成「窄 / 宽」两类（阈值由调用方声明） */
export function quantizeWidths(ratios, wideAt = 2.0) {
  return ratios.map((r) => (r >= wideAt ? "W" : "N"));
}

// ============================================================
// 2. 二维码实例化（2D 网格）——定位符判据 + 委派既有采样
// ============================================================
export const QR_SPEC = {
  name: "QR Code",
  spec: "ISO/IEC 18004",
  finderRatio: [1, 1, 3, 1, 1], // 定位符宽度比：暗亮暗亮暗
  quietZone: 4,                 // 静默区模块数
  versionBase: 21, versionStep: 4,
};

/**
 * 在游程序列里按声明的 1:1:3:1:1 找定位符中心（扫描线坐标）。
 *
 * 几何闸门**委派既有 `qrscanFind.matchWindowScaled`**（尺度无关：5 段之和 / 7 = 单位，
 * 外四段 ∈[0.5,1.6]×单位、中央段 ∈[2,4]×单位且为最长）；本层只在其上补两道**更严**的声明：
 *   ① 逐段与声明宽度比 `ratio` 的偏差 ≤ `tol`（默认 0.5 模块）——这是「按声明判、不按近似判」；
 *   ② 中心取**中央段的中点**（定位图案圆心，ISO/IEC 18004 §6.3.2）。
 * 说明：既有闸门较宽（会收下 1:1:2:1:1 这类近邻），故 ① 不能省，否则等价于放弃声明。
 * @returns {Array<{center:number, unit:number, err:number}>} center 为扫描线坐标
 */
export function finderPatternRuns(runs, opt = {}) {
  const tol = opt.tol == null ? 0.5 : opt.tol;
  const fc = opt.finderColor == null ? 1 : opt.finderColor;   // 定位符实心段的颜色（反色图传 0）
  const ratio = opt.ratio || QR_SPEC.finderRatio;      // [1,1,3,1,1]
  const total = ratio.reduce((a, b) => a + b, 0);       // 7
  // 字段名译到既有内核的 {color,len,start}
  const line = runs.map((r) => ({ color: r.value, len: r.width, start: r.start }));
  const out = [];
  for (let s = 0; s + 5 <= line.length; s++) {
    const m = matchWindowScaled(line, s, fc, opt);
    if (!m) continue;
    const seg = m.lens;                                  // 5 段像素宽
    const u = seg.reduce((a, b) => a + b, 0) / total;    // 单位 = 总宽 / 7
    let ok = true, err = 0;
    for (let i = 0; i < 5; i++) {
      const d = Math.abs(seg[i] / u - ratio[i]);
      err += d;
      if (d > tol) { ok = false; break; }
    }
    if (!ok) continue;
    const center = runs[s + 2].start + runs[s + 2].width / 2;   // 中央段（3 模块）中点 = 圆心
    out.push({ center, unit: u, err });
  }
  return out;
}

/** 定位符检测：直接委派既有实现（行扫 + 列确认 + 外环确认 + 去重） */
export function detectFinders(bits, w, h, finderColor = 1, opt = {}) {
  return findFinderCentersScaled(bits, w, h, finderColor, opt);
}

/** 三点 → 模块网格（2D 实例化）：委派 sampleAffine，并保留既有 refine 可选 */
export function sampleModuleGrid(bits, w, h, trio, n, opt = {}) {
  const TL = opt.TL || trio.TL, P1 = opt.TR || trio.TR || trio.P1, P2 = opt.BL || trio.BL || trio.P2;
  return sampleAffine(bits, w, h, TL, P1, P2, n, opt.nx || 0, opt.ny || 0);
}

/**
 * 标准 7×7 定位图案（1=暗）：ISO/IEC 18004 §6.3.2 —— 中心 3×3 与外圈为暗，中间一圈为亮。
 * 这是**规范常量**（与 Code 39 / EAN 码表同性质的数据），不是算法。
 */
const FINDER7 = (() => {
  const m = [];
  for (let r = 0; r < 7; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) {
      const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      row.push(d <= 1 || d === 3 ? 1 : 0);
    }
    m.push(row);
  }
  return m;
})();

/**
 * 三个定位符区域**各自**的一致率（不取总平均）。
 *
 * 为什么不能用总平均：实测量化 —— 大尺寸密集折线图（鼠标轨迹成图 4470×2920）上，
 * 平均一致率能被「两个区域随机崩掉、一个区域凑高分」拉过 0.6 阈值，产出假候选。
 * 定位符是 QR 的**前提条件**：三个都必须成立，故逐个把关（min ≥ 阈值）。
 * @returns {number[]} [TL, TR, BL] 三区一致率，各 0..1
 */
export function finderScoresByRegion(mat, n) {
  if (!mat || n < 7) return [-1, -1, -1];
  const out = [];
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    let s = 0;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (mat[r0 + r][c0 + c] === FINDER7[r][c]) s++;
    out.push(s / 49);
  }
  return out;
}

/**
 * 时序图案一致度（ISO/IEC 18004 §6.3.3）：第 6 行 / 第 6 列的时序图案在三个定位符之间
 * **逐模块交替** 暗-亮-暗…，起止均为暗（偶数坐标处为暗）。
 *
 * 为什么必须有这道判据：finderScore 只比对 3 个 7×7 定位符区域（147 个模块），
 * 纯噪点图上随机命中 60% 的概率并不低 —— 实测噪点图能产出 8 个「版本看着合理」的
 * 假候选。时序图案横跨整个符号（约 2n 个模块）且要求严格交替，是与定位符**独立**
 * 的第二证据，噪点几乎不可能同时满足。二者同时成立才算「像二维码」。
 * @returns {number} 一致率 0..1；网格非法返回 -1
 */
export function timingScore(mat, n) {
  if (!mat || n < 21) return -1;
  let s = 0, tot = 0;
  for (let c = 8; c <= n - 9; c++) { tot++; if (mat[6][c] === (c % 2 === 0 ? 1 : 0)) s++; }
  for (let r = 8; r <= n - 9; r++) { tot++; if (mat[r][6] === (r % 2 === 0 ? 1 : 0)) s++; }
  return tot ? s / tot : -1;
}

/**
 * 二维码「检测 + 采样」编排（不含解码）。
 * 流程：定位符 → 三点排序 → 版本枚举（LEGAL_SIZES）→ 采样 → finderScore 把关 →
 *       refineTrioByFinderScore 微调。返回可交给既有 qrdecode 的模块矩阵候选。
 *
 * @returns {{finders:Array, candidates:Array<{n:number,trio:object,grid:number[][],score:number}>}}
 */
export function qrInstantiate(bits, w, h, opt = {}) {
  const finders = detectFinders(bits, w, h, opt.finderColor == null ? 1 : opt.finderColor, opt);
  const trio = orderThree(finders);
  const candidates = [];
  if (!trio) return { finders, candidates };
  const pitch = trio.pitch || 0;
  const sizes = opt.sizes || LEGAL_SIZES;
  for (const n of sizes) {
    if (pitch > 0) {
      // 版本枚举护栏：符号必须**装得进这张图** —— n 个模块 × 模块像素尺寸
      // 不得显著超过图像尺度（静默区另放宽）。防的是「噪点图上靠随机命中
      // finderScore 阈值而产出 n=100+ 的离谱版本」这类假候选。
      const need = n * pitch;
      const avail = Math.max(w, h) * (opt.fitTol == null ? 1.2 : opt.fitTol);
      if (need > avail) continue;
    }
    const grid = sampleModuleGrid(bits, w, h, trio, n, opt);
    if (!grid) continue;
    const score = finderScore(grid, n);
    if (score < (opt.minScore == null ? 0.6 : opt.minScore)) continue;
    // 三个定位符**逐个**达标（前提条件，不可用平均分凑）
    const reg = finderScoresByRegion(grid, n);
    const regMin = Math.min(...reg);
    if (regMin < (opt.minFinderRegion == null ? 0.6 : opt.minFinderRegion)) continue;
    const tScore = timingScore(grid, n);
    if (tScore < (opt.minTiming == null ? 0.7 : opt.minTiming)) continue;
    candidates.push({ n, trio, grid, score, regionScores: reg, timingScore: tScore });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { finders, trio, candidates: candidates.slice(0, opt.maxCandidates || 8) };
}

// ============================================================
// 3. 一维条码实例化（宽度比 → 符号表）
// ============================================================
// 元素序在 Code 39 里是「条、空、条、空…」共 9 元素；1 = 宽（3 模块），0 = 窄（1 模块）。
const CODE39_PATTERNS = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001",
  "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000", F: "001011000",
  G: "000001101", H: "100001100", I: "001001100", J: "000011100", K: "100000011", L: "001000011",
  M: "101000010", N: "000010011", O: "100010010", P: "001010010", Q: "000000111", R: "100000110",
  S: "001000110", T: "000010110", U: "110000001", V: "011000001", W: "111000000", X: "010010001",
  Y: "110010000", Z: "011010000", "-": "010000101", ".": "110000100", " ": "011000100",
  $: "010101000", "/": "010100010", "+": "010001010", "%": "000101010", "*": "010010100",
};

// EAN-13 / UPC-A：L 码（左奇）、R 码（左偶/右侧）、G 码（右侧镜像）；ISO/IEC 15420
const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const rev7 = (s) => s.split("").reverse().join("");
const EAN_R = EAN_L.map((s) => s.split("").map((c) => (c === "0" ? "1" : "0")).join(""));
const EAN_G = EAN_R.map(rev7);
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export const SYMBOLOGY = {
  code39: {
    id: "code39", name: "Code 39", spec: "ISO/IEC 16388",
    kind: "elements", elements: 9, wideRatio: 3, gapElements: 1,
    startStop: "*", patterns: CODE39_PATTERNS,
    reverse: Object.fromEntries(Object.entries(CODE39_PATTERNS).map(([k, v]) => [v, k])),
    charModules: 15, // 3 宽 × 3 + 6 窄 × 1
  },
  ean13: {
    id: "ean13", name: "EAN-13 (UPC-A 同族)", spec: "ISO/IEC 15420",
    kind: "modules", totalModules: 95,
    guardStart: "101", guardCenter: "01010", guardEnd: "101",
    L: EAN_L, R: EAN_R, G: EAN_G, parity: EAN_PARITY,
  },
};

/** Code 39 单字符：9 元素宽度 → 字符 */
export function matchCode39ElementWidths(nineWidths, opt = {}) {
  const wideAt = opt.wideAt == null ? 2.0 : opt.wideAt;
  const { ratios } = normalizeWidths(nineWidths.map((w) => ({ width: w })), opt.q == null ? 0.2 : opt.q);
  const bits = quantizeWidths(ratios, wideAt).map((c) => (c === "W" ? "1" : "0")).join("");
  return { char: SYMBOLOGY.code39.reverse[bits] || null, bits };
}

/**
 * 一维条码解码（宽度比实例化）。逐扫描线尝试，返回首个成功结果。
 * @param {Array<{values:number[]}>} lines scanlines 的产物
 * @param {object} [opt] {symbology:"code39"|"ean13", minBars, wideAt}
 * @returns {{ok:boolean, text?:string, symbology?:string, line?:number, lineIndex?:number, len?:number, reason?:string}}
 */
export function decode1D(lines, opt = {}) {
  const which = opt.symbology || "code39";
  const dec = which === "ean13" ? decodeEan13Runs : decodeCode39Runs;
  for (const L of lines) {
    const runs = rleRuns(L.values);
    if (runs.length < (opt.minBars == null ? 12 : opt.minBars)) continue;
    const r = dec(runs, opt);
    if (r.ok) return { ...r, symbology: which, lineIndex: L.index, lineLength: L.values.length };
  }
  return { ok: false, symbology: which, reason: "所有扫描线上均未解出（宽度比 / 起止符 / 校验任一项不满足）" };
}

/** Code 39：在游程里找起始 `*` → 连续读字符（每字符 9 元素 + 1 间隙） */
function decodeCode39Runs(runs, opt) {
  const S = SYMBOLOGY.code39;
  const wideAt = opt.wideAt == null ? 2.0 : opt.wideAt;
  const step = S.elements + S.gapElements; // 10
  for (let s = 0; s + step <= runs.length; s++) {
    const cand = readCode39From(runs, s, wideAt);
    if (cand && cand.text.length >= 1 && cand.started) return cand;
  }
  return { ok: false, reason: "未找到 Code 39 起始符 `*`" };
}
function readCode39From(runs, s, wideAt) {
  const S = SYMBOLOGY.code39;
  const widthOf = (i) => (runs[i] ? runs[i].width : null);
  // 起止符
  const readChar = (i) => {
    const ws = [];
    for (let k = 0; k < S.elements; k++) {
      const w = widthOf(i + k);
      if (w == null) return null;
      // 元素极性必须交替：0=条（暗），1=空（亮）
      if ((runs[i + k].value ? 1 : 0) !== (k % 2 === 0 ? 1 : 0)) return null;
      ws.push(w);
    }
    return matchCode39ElementWidths(ws, { wideAt }).char;
  };
  let i = s;
  const first = readChar(i);
  if (first !== S.startStop) return null;
  const chars = [];
  i += S.elements;
  const gap = () => { const w = widthOf(i); return w != null && (runs[i].value ? 1 : 0) === 0 ? i + 1 : i; };
  while (i + S.elements <= runs.length) {
    const j = gap();
    const ch = readChar(j);
    if (!ch) break;
    if (ch === S.startStop) {
      return { ok: chars.length > 0, started: true, text: chars.join(""), chars: chars.length, modules: 0 };
    }
    chars.push(ch);
    i = j + S.elements;
    if (chars.length > 64) break; // 护栏：防止在噪声里无限读
  }
  return null;
}

/** EAN-13 / UPC-A：游程 → 模块位串（宽度比实例化本体）→ 95 模块窗口 → 位模式解析 */
function decodeEan13Runs(runs, opt) {
  const S = SYMBOLOGY.ean13;
  const { unit } = normalizeWidths(runs, 0.15);
  if (!unit || unit <= 0) return { ok: false, reason: "单位宽估计失败" };
  // 每个游程按「宽度 / 最窄单位」四舍五入展开成等宽模块 —— 这就是「把宽度比序列变回模块」的一步
  let s = "";
  for (const r of runs) {
    const n = Math.max(1, Math.round(r.width / unit));
    s += (r.value ? "1" : "0").repeat(n);
  }
  for (let i = 0; i + S.totalModules <= s.length; i++) {
    if (s.slice(i, i + S.guardStart.length) !== S.guardStart) continue;
    const win = s.slice(i, i + S.totalModules);
    const r = parseEan13Bits(win);
    if (r.ok) return r;
  }
  return { ok: false, reason: "未找到可解出的 EAN-13（起始符 101 / 95 模块窗口 / 校验）" };
}
function parseEan13Bits(win) {
  const S = SYMBOLOGY.ean13;
  if (!win.startsWith(S.guardStart) || !win.endsWith(S.guardEnd)) return { ok: false, reason: "守护位不符" };
  if (win.slice(45, 50) !== S.guardCenter) return { ok: false, reason: "中央分隔符不符" };
  const seg = (i) => win.slice(i, i + 7);
  const left = [], parity = [];
  for (let k = 0; k < 6; k++) {
    const b = seg(3 + k * 7);
    const l = S.L.indexOf(b), g = S.G.indexOf(b);
    if (l >= 0) { left.push(l); parity.push("L"); }
    else if (g >= 0) { left.push(g); parity.push("G"); }
    else return { ok: false, reason: `左半第 ${k} 位不是合法 L/G 码` };
  }
  const pIdx = S.parity.indexOf(parity.join(""));
  if (pIdx < 0) return { ok: false, reason: "首位奇偶模式非法" };
  const right = [];
  for (let k = 0; k < 6; k++) {
    const b = seg(50 + k * 7);
    const r = S.R.indexOf(b);
    if (r < 0) return { ok: false, reason: `右半第 ${k} 位不是合法 R 码` };
    right.push(r);
  }
  const digits = [pIdx, ...left, ...right].join("");
  // 校验位（ISO/IEC 15420：奇数位 ×1、偶数位 ×3，从右往左计）
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  if (check !== Number(digits[12])) return { ok: false, reason: `校验位不符（算得 ${check}，实为 ${digits[12]}）` };
  return { ok: true, started: true, text: digits, chars: 13, check };
}

// ============================================================
// 4. 统一入口：任意图像 → 符号候选（检测 + 采样，不含语义解码）
// ============================================================
/**
 * @param {ArrayLike<number>} gray 灰度（0..255，行主序）
 * @returns {{width,height,bits,binMethod,qr,oneD,ecl}}
 */
export function detectAndSample(gray, w, h, opt = {}) {
  const bin = binarize(gray, w, h, opt.binarize || "otsu", opt.binarizeOpt || {});
  const bits = bin.bits;                       // binarize 返回 {bits,w,h,method,...}，此处只取位平面
  const out = { width: w, height: h, bits, binMethod: bin.method, binInfo: bin, qr: null, oneD: null };
  if (opt.qr !== false) {
    const inv = opt.invertFinders ? { ...opt, finderColor: 0 } : opt;
    out.qr = qrInstantiate(bits, w, h, inv);
    if ((!out.qr.candidates || out.qr.candidates.length === 0) && opt.tryInverted !== false) {
      // 反色图：对 0/1 取反后再试一次（声明式兜底，不是猜阈值）
      const inv2 = new Uint8Array(bits.length);
      for (let i = 0; i < bits.length; i++) inv2[i] = bits[i] ? 0 : 1;
      const alt = qrInstantiate(inv2, w, h, { ...opt, bitsAreInverted: true });
      if (alt.candidates && alt.candidates.length) { out.qr = alt; out.qr.inverted = true; }
    }
  }
  if (opt.oneD) {
    for (const sym of (Array.isArray(opt.oneD) ? opt.oneD : [opt.oneD])) {
      for (const scan of (opt.scans || SCANS)) {
        const r = decode1D(scanlines(bits, w, h, { scan, stride: opt.stride || 1 }), { symbology: sym, minBars: opt.minBars });
        if (r.ok) { out.oneD = { ...r, scan }; break; }
      }
      if (out.oneD) break;
    }
  }
  return out;
}

/** 便利：生成「宽度序列」对应的模块位串（供测试与出题侧共用，非解码路径） */
export function widthsToModules(widths) {
  let s = "";
  for (const w of widths) s += "1".repeat(Math.max(0, w | 0));
  return s;
}

export const _spec = { QR_SPEC, code39: SYMBOLOGY.code39.spec, ean13: SYMBOLOGY.ean13.spec };