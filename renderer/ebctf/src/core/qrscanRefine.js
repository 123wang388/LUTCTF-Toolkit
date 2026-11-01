/*
 * qrscanRefine.js — 二维码「图片态」网格校正：单点/多点对齐图案误差场 + 单应（透视）
 *
 * 纯函数、零 UI 依赖、零第三方依赖（对齐图案位置表由调用方注入，避免依赖解码实现）。
 *
 * 三条校正路径，互补保留（实测互不包含，不能只留一条）：
 *   A) 单点对齐图案误差场（最早实现，最稳）；
 *   B) 单应（8 参数，最小二乘 DLT）：三点仿射只有 6 个自由度，加上一个对齐图案即可解单应，
 *      表达透视/梯形畸变；
 *   C) 多点 IDW 误差场：高版本对齐图案多（最多 34 个），反距离加权更贴合**局部**畸变。
 *
 * 权威依据：
 * - ISO/IEC 18004 附录 E：每个版本的**对齐图案中心坐标表**（由调用方注入现成 40 版本表）。
 * - ISO/IEC 18004 §6.3.3：对齐图案为 5×5 —— 外圈暗、次圈亮、中心暗（即「靶心」）。
 */
import { sampleAffine } from "./qrscanFind.js";

/** 仿射点映射：模块坐标 (u,v)（单位=模块，原点在符号左上角）→ 像素 */
export function affinePoint(TL, TR, BL, n, u, v) {
  const span = n - 7;
  const Xx = (TR.x - TL.x) / span, Xy = (TR.y - TL.y) / span;
  const Yx = (BL.x - TL.x) / span, Yy = (BL.y - TL.y) / span;
  return { x: TL.x + (u - 3.5) * Xx + (v - 3.5) * Yx,
           y: TL.y + (u - 3.5) * Xy + (v - 3.5) * Yy };
}

/** 5×5 对齐图案期望值：offset 相对中心，(dr,dc)，max(|dr|,|dc|)==2 暗、==1 亮、==0 暗 */
export function alignTemplate(dr, dc) {
  const m = Math.max(Math.abs(dr), Math.abs(dc));
  return (m === 2 || m === 0) ? 1 : 0;
}

/**
 * 在 Ppred 邻域搜索真实对齐图案圆心。
 * 返回 { x, y, score } 或 null（score 满分为 25，需 ≥ opt.minScore，默认 21）。
 */
export function detectAlignment(bits, w, h, Ppred, pitchX, pitchY, opt = {}) {
  const minScore = opt.minScore == null ? 20 : opt.minScore;   // 25 分制；20 容忍 5 个采样偏差
  const rad = Math.max(3, Math.round(opt.searchRad == null ? 2.5 * Math.max(pitchX, pitchY) : opt.searchRad));
  const at = (x, y) => (x >= 0 && x < w && y >= 0 && y < h) ? bits[y * w + x] : -1;
  let best = null;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const cx = Math.round(Ppred.x) + dx, cy = Math.round(Ppred.y) + dy;
      let score = 0, valid = 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const px = Math.round(cx + dc * pitchX), py = Math.round(cy + dr * pitchY);
          const v = at(px, py);
          if (v < 0) { valid--; continue; }               // 越界：记无效并轻微扣分
          valid++;
          if (v === alignTemplate(dr, dc)) score++;
        }
      }
      if (valid < 20 && valid < 25) score -= (20 - Math.max(0, valid));
      if (!best || score > best.score) best = { x: cx, y: cy, score };
    }
  }
  return best && best.score >= minScore ? best : null;
}

/**
 * 生成「对齐图案校正后」的矩阵。
 * alignCenters: 该版本的模块中心索引数组（如 [6,18] / [6,22,38]）；version 1 传 null/[] 即退出。
 * 返回 { matrix, detected, err, score } 或 null。
 */
export function sampleAligned(bits, w, h, TL, TR, BL, n, alignCenters, opt = {}) {
  if (!alignCenters || !alignCenters.length) return null;
  const a = alignCenters[alignCenters.length - 1];          // 最右下那个（离三 finder 最远）
  const span = n - 7;
  const pitchX = Math.abs((TR.x - TL.x) / span);
  const pitchY = Math.abs((BL.y - TL.y) / span);
  if (!(pitchX >= 1) || !(pitchY >= 1)) return null;

  const Ppred = affinePoint(TL, TR, BL, n, a + 0.5, a + 0.5);
  const Pdet = detectAlignment(bits, w, h, Ppred, pitchX, pitchY, opt);
  if (!Pdet) return null;
  const err = { dx: Pdet.x - Ppred.x, dy: Pdet.y - Ppred.y };
  if (Math.abs(err.dx) > 4 * pitchX || Math.abs(err.dy) > 4 * pitchY) return null; // 离谱即弃

  const spanA = Math.max(1e-6, a - 3.5);
  const wgt = (t) => Math.min(1, Math.max(0, t));
  const nbx = opt.nb == null ? (Math.max(pitchX, pitchY) >= 6 ? 1 : 0) : opt.nb;
  const nby = nbx;
  const mat = [];
  for (let r = 0; r < n; r++) {
    const row = new Array(n);
    for (let c = 0; c < n; c++) {
      const base = affinePoint(TL, TR, BL, n, c + 0.5, r + 0.5);
      const ww = wgt(((c + 0.5) - 3.5) / spanA) * wgt(((r + 0.5) - 3.5) / spanA);
      const px = base.x + ww * err.dx;
      const py = base.y + ww * err.dy;
      if (nbx <= 0) {
        const x = Math.round(px), y = Math.round(py);
        row[c] = (x >= 0 && x < w && y >= 0 && y < h) ? bits[y * w + x] : 0;
      } else {
        let dark = 0, tot = 0;
        for (let sy = -nby; sy <= nby; sy++) {
          for (let sx = -nbx; sx <= nbx; sx++) {
            const x = Math.round(px) + sx, y = Math.round(py) + sy;
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            tot++; dark += bits[y * w + x] ? 1 : 0;
          }
        }
        row[c] = (tot && dark * 2 >= tot) ? 1 : 0;
      }
    }
    mat.push(row);
  }
  return { matrix: mat, detected: Pdet, predicted: Ppred, err, score: Pdet.score };
}

/**
 * 在迭代 2 的候选基础上追加「对齐图案校正」版本。
 * alignedFirst=true 时把校正版排在前（默认），便于短路。
 */
export function withAlignedCandidates(base, bits, w, h, TL, TR, BL, n, alignCenters, opt = {}) {
  const out = [];
  const al = sampleAligned(bits, w, h, TL, TR, BL, n, alignCenters, opt);
  if (al && opt.alignedFirst !== false) {
    out.push({ n, matrix: al.matrix, align: al, kind: "aligned" });
  }
  out.push({ n, matrix: base, kind: "affine" });
  if (al && opt.alignedFirst === false) {
    out.push({ n, matrix: al.matrix, align: al, kind: "aligned" });
  }
  return out;
}

export { sampleAffine };

/* ------------------------------------------------------------------ *
 * 迭代 8：透视（单应）校正 + 多点对齐图案 IDW 误差场
 *
 * 为什么需要（迭代 6–7 的实测结论）：
 *   几何修好后仍有一批「采样一致率上不去」的图。以 demo3.jpg 为例（v2、n=25）：
 *   一致率上限只有 0.844，且把 TL/TR/BL 中任何一点沿任意方向平移，评分都**变差**
 *   ⇒ 不是三点位置不准，而是**三点仿射这个模型表达不了**——图存在非刚性/透视形变。
 *
 * 两条新路：
 *   A) 单应（8 参数）：三点仿射只有 6 个自由度。v2 的对齐图案（ISO 附录 E 表 [6,18]）
 *      除三处 finder 角外还剩 1 个点，加上三个 finder 正好 **4 个控制点** —— 够解单应，
 *      从而表达透视/梯形畸变。用最小二乘 DLT（>4 点时自动退化为最小二乘，抗单点误差）。
 *   B) 多点 IDW 误差场：高版本（v7 起位置表 [6,22,38]，对齐图案最多 34 个）有大量控制点，
 *      用反距离加权把每个点的实测误差插值到全网格 —— 比迭代 3 的「单点全局插值」更贴合
 *      **局部**畸变。
 *   两者都做，由调用方按一致率取优（互不包含，同迭代 7 的教训）。
 * ------------------------------------------------------------------ */

/** 高斯消元（部分主元）解 A·x = b；奇异返回 null */
function solveLin(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    const t = M[i]; M[i] = M[p]; M[p] = t;
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      if (!f) continue;
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * 最小二乘 DLT 求单应：模块坐标 (u,v) → 像素 (x,y)。
 * 返回长度 8 的向量 [h0..h7]（h8 归一化为 1），或 null。
 */
export function solveHomography(src, dst) {
  const m = Math.min(src.length, dst.length);
  if (m < 4) return null;
  const A = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const b = new Array(8).fill(0);
  for (let i = 0; i < m; i++) {
    const { u, v } = src[i], { x, y } = dst[i];
    const r1 = [u, v, 1, 0, 0, 0, -x * u, -x * v];
    const r2 = [0, 0, 0, u, v, 1, -y * u, -y * v];
    for (let a = 0; a < 8; a++) {
      for (let c = 0; c < 8; c++) A[a][c] += r1[a] * r1[c] + r2[a] * r2[c];
      b[a] += r1[a] * x + r2[a] * y;
    }
  }
  const h = solveLin(A, b);
  return h && h.every((z) => isFinite(z)) ? h : null;
}

/** 单应正变换 */
export function applyHomography(h, u, v) {
  const den = h[6] * u + h[7] * v + 1;
  if (Math.abs(den) < 1e-9) return null;
  return { x: (h[0] * u + h[1] * v + h[2]) / den, y: (h[3] * u + h[4] * v + h[5]) / den };
}

/** 在预测的某个对齐图案位置搜索真实圆心；返回 {x,y,score,u,v} 或 null */
export function detectAlignmentAt(bits, w, h, TL, TR, BL, n, a, b, pitchX, pitchY, opt) {
  const Ppred = affinePoint(TL, TR, BL, n, a + 0.5, b + 0.5);
  const Pdet = detectAlignment(bits, w, h, Ppred, pitchX, pitchY, opt);
  if (!Pdet) return null;
  const dx = Pdet.x - Ppred.x, dy = Pdet.y - Ppred.y;
  if (Math.abs(dx) > 4 * pitchX || Math.abs(dy) > 4 * pitchY) return null;
  return { x: Pdet.x, y: Pdet.y, score: Pdet.score, u: a + 0.5, v: b + 0.5, px: Ppred.x, py: Ppred.y };
}

/**
 * 收集控制点：三个 finder（误差恒为 0，作为锚）+ 该版本所有可用对齐图案（实测误差）。
 * 返回 { ctrl: [{u,v,x,y,w,dx,dy}], detected: [...] }
 */
export function collectControlPoints(bits, w, h, TL, TR, BL, n, alignCenters, opt = {}) {
  const span = n - 7;
  const pitchX = Math.abs((TR.x - TL.x) / span);
  const pitchY = Math.abs((BL.y - TL.y) / span);
  if (!(pitchX >= 1) || !(pitchY >= 1)) return null;
  const ctrl = [
    { u: 3.5, v: 3.5, x: TL.x, y: TL.y, w: 1, dx: 0, dy: 0 },
    { u: n - 3.5, v: 3.5, x: TR.x, y: TR.y, w: 1, dx: 0, dy: 0 },
    { u: 3.5, v: n - 3.5, x: BL.x, y: BL.y, w: 1, dx: 0, dy: 0 },
  ];
  const detected = [];
  if (alignCenters && alignCenters.length > 1) {
    const first = alignCenters[0], last = alignCenters[alignCenters.length - 1];
    // 越界的坐标（如贴合模块尺寸的推算值）直接跳过
    for (const a of alignCenters) {
      for (const b of alignCenters) {
        if (!(a >= 0 && a < n && b >= 0 && b < n)) continue;
        const isCorner = (a === first && b === first)
                      || (a === first && b === last)
                      || (a === last && b === first);
        if (isCorner) continue;                       // 与三 finder 重叠，已有锚点
        const d = detectAlignmentAt(bits, w, h, TL, TR, BL, n, a, b, pitchX, pitchY, opt);
        if (!d) continue;
        detected.push(d);
        const q = Math.max(0.1, d.score / 25);
        ctrl.push({ u: d.u, v: d.v, x: d.x, y: d.y, w: q * q, dx: d.x - d.px, dy: d.y - d.py });
      }
    }
  }
  return { ctrl, detected, pitchX, pitchY };
}

/** 用单应采样出模块矩阵 */
export function sampleByHomography(bits, w, h, h_, n, opt = {}) {
  const nb = opt.nb == null ? (opt.pitch >= 6 ? 1 : 0) : opt.nb;
  const mat = [];
  for (let r = 0; r < n; r++) {
    const row = new Array(n);
    for (let c = 0; c < n; c++) {
      const p = applyHomography(h_, c + 0.5, r + 0.5);
      if (!p) { row[c] = 0; continue; }
      if (nb <= 0) {
        const x = Math.round(p.x), y = Math.round(p.y);
        row[c] = (x >= 0 && x < w && y >= 0 && y < h) ? bits[y * w + x] : 0;
      } else {
        let dark = 0, tot = 0;
        for (let sy = -nb; sy <= nb; sy++) {
          for (let sx = -nb; sx <= nb; sx++) {
            const x = Math.round(p.x) + sx, y = Math.round(p.y) + sy;
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            tot++; dark += bits[y * w + x] ? 1 : 0;
          }
        }
        row[c] = (tot && dark * 2 >= tot) ? 1 : 0;
      }
    }
    mat.push(row);
  }
  return mat;
}

/** 用 IDW 误差场采样出模块矩阵（多点对齐图案；单点时退化为迭代 3 的行为） */
export function sampleByIdw(bits, w, h, TL, TR, BL, n, ctrl, opt = {}) {
  const eps = opt.eps == null ? 4 : opt.eps;      // 单位：模块²
  const nb = opt.nb == null ? (opt.pitch >= 6 ? 1 : 0) : opt.nb;
  const mat = [];
  for (let r = 0; r < n; r++) {
    const row = new Array(n);
    for (let c = 0; c < n; c++) {
      const u = c + 0.5, v = r + 0.5;
      let sx = 0, sy = 0, sw = 0;
      for (const k of ctrl) {
        const d2 = (u - k.u) * (u - k.u) + (v - k.v) * (v - k.v);
        const wt = k.w / (d2 + eps);
        sx += wt * k.dx; sy += wt * k.dy; sw += wt;
      }
      const base = affinePoint(TL, TR, BL, n, u, v);
      const px = base.x + (sw ? sx / sw : 0), py = base.y + (sw ? sy / sw : 0);
      if (nb <= 0) {
        const x = Math.round(px), y = Math.round(py);
        row[c] = (x >= 0 && x < w && y >= 0 && y < h) ? bits[y * w + x] : 0;
      } else {
        let dark = 0, tot = 0;
        for (let sy2 = -nb; sy2 <= nb; sy2++) {
          for (let sx2 = -nb; sx2 <= nb; sx2++) {
            const x = Math.round(px) + sx2, y = Math.round(py) + sy2;
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            tot++; dark += bits[y * w + x] ? 1 : 0;
          }
        }
        row[c] = (tot && dark * 2 >= tot) ? 1 : 0;
      }
    }
    mat.push(row);
  }
  return mat;
}

/**
 * 迭代 8 主入口：给出「单应版」与「IDW 版」两个校正候选（都可能为 null）。
 * opt.pitch 供邻域表决阈值用；opt.nb 可强制。
 */
export function buildRefinedCandidates(bits, w, h, TL, TR, BL, n, alignCenters, opt = {}) {
  const out = [];
  const cc = collectControlPoints(bits, w, h, TL, TR, BL, n, alignCenters, opt);
  if (!cc) return out;
  const span = n - 7;
  const pitch = Math.max(Math.abs((TR.x - TL.x) / span), Math.abs((BL.y - TL.y) / span));
  const o = { ...opt, pitch };

  // A) 单应：需要 ≥4 个控制点（3 finder + ≥1 对齐图案）
  if (cc.ctrl.length >= 4) {
    const src = cc.ctrl.map((k) => ({ u: k.u, v: k.v }));
    const dst = cc.ctrl.map((k) => ({ x: k.x, y: k.y }));
    const h_ = solveHomography(src, dst);
    if (h_) {
      const mat = sampleByHomography(bits, w, h, h_, n, o);
      if (mat) out.push({ matrix: mat, kind: "homography", ctrl: cc.ctrl.length, detected: cc.detected.length });
    }
  }

  // B) IDW 误差场：至少要有 1 个对齐图案才有意义
  if (cc.detected.length >= 1) {
    const mat = sampleByIdw(bits, w, h, TL, TR, BL, n, cc.ctrl, o);
    if (mat) out.push({ matrix: mat, kind: "idw", ctrl: cc.ctrl.length, detected: cc.detected.length });
  }
  return out;
}
