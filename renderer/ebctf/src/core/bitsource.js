/*
 * bitsource.mjs —— 「比特序列提取」通用原语（层③ 最小候选）
 *
 * ============================================================
 * 为什么需要这一层
 * ============================================================
 * 「从载体里按某个顺序取出一个比特序列」这件事，在任何隐写/载荷载体上都是同一个
 * 内核，差异只在四个正交旋钮：
 *   ① 遍历单元（像素 / DCT 系数 / 帧 / 字符 / 频域系数 …）—— 由调用方给「单元序列」
 *   ② 遍历顺序（行主序 / 列主序 / PRNG 序 …）—— 由 scan 声明
 *   ③ 每单元取几位、取哪个通道/位平面   —— 由 select 声明
 *   ④ 位序（比特先落到字节高位还是低位）  —— 由 bitOrder 声明
 * 此前这些旋钮散落在每个 op 自己的循环里（每个 op 各写一遍 `acc = (acc<<1)|(x&1)`），
 * 于是「加一种载体」= 「加一个 op」。本原语把 ②③④ 收敛成一份声明，
 * 单元序列由调用方提供，内核只做「位流 → 字节」。
 *
 * ============================================================
 * 权威依据（写进实现，不靠约定俗成）
 * ============================================================
 * - ISO/IEC 15948（PNG 1.2）§11.2.2「Image data」：
 *   图像数据由样本（sample）序列构成，每像素按色彩类型含 1/2/3/4 个样本，
 *   通道顺序固定为 R,G,B,A；样本按扫描线（scanline）自左向右、自上而下排列。
 *   ⇒ 本层的 layout{width,height,channels} 与 scan="row" 即该规范的直接表达；
 *     scan="col" 不是规范的默认，属「载体约定」，故必须显式声明、不许猜。
 * - ISO/IEC 15948 §11.3.3「Sample depth」+ §11.2.3「Filtering」：
 *   样本深度 1/2/4/8/16 位；本层的 plane 参数即「取样本的第几个有效位」（0=最低位）。
 * - ISO/IEC 18004（QR Code）§7.4「Data encodation」：
 *   位流按「最高有效位在前」逐字节组装（首比特进字节 bit7）。本层 bitOrder="msb"
 *   与此一致，是标准派生项。但**图像通道 LSB 载体并非 ISO 标准客体**，
 *   LSB-first 同样普遍存在（例如按模块字节低位优先写入的载体），
 *   故 bitOrder 的默认值只能声明、不能假定 —— 这正是原语必须显式声明位序的理由。
 * - RFC 4648 §3.1（Base16/Base64 比特打包）：编码字节的比特自 MSB 起填充，
 *   与本层 bitOrder="msb" 的打包语义同源，可互相印证。
 *
 * ============================================================
 * 契约
 * ============================================================
 * 输入源 src：{ width, height, channels, samples:Uint8Array }
 *   samples 为行主序交错样本（每像素 channels 个样本），即 PNG/BMP 解码后的自然形态。
 *
 * 计划 plan：{
 *   scan:     "row" | "col",            // 扫描序，缺省 "row"
 *   select:   [{channel, plane}],       // 取位序列；channel:null 表示「本像素第 0 通道」
 *   bitOrder: "msb" | "lsb",            // 位序：首比特落字节高位 / 低位，缺省 "msb"
 *   limit:    number | null,            // 最多输出字节数
 *   strict:   boolean,                  // 越界通道是否报错（缺省 false=跳过，与既有扫描工具同效）
 * }
 *
 * 输出：{ bytes:Uint8Array, bitsUsed:number, unitsUsed:number, totalUnits:number, note:string }
 *
 * 本模块零 UI 依赖、零外发、纯函数；不 import 任何其它模块（可独立摘取）。
 */

export const BIT_ORDERS = ["msb", "lsb"];
export const SCANS = ["row", "col"];

// ============================================================
// 计划校验（契约层）：非法计划必须当场报错，不许静默降级
// ============================================================
export function validatePlan(src, plan) {
  const p = plan || {};
  if (!src || typeof src !== "object") throw new Error("位源缺失：需要 {width,height,channels,samples}");
  const { width, height, channels, samples } = src;
  for (const [k, v] of [["width", width], ["height", height], ["channels", channels]]) {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`位源 layout 非法：${k}=${v}（须为正整数）`);
  }
  if (!(samples instanceof Uint8Array) && !(samples instanceof Uint8ClampedArray)) {
    throw new Error("位源 samples 须为 Uint8Array（行主序交错样本）");
  }
  const expect = width * height * channels;
  if (samples.length !== expect) {
    throw new Error(`位源与 layout 不一致：samples 长度 ${samples.length}，按 ${width}×${height}×${channels} 应为 ${expect}`);
  }
  const scan = p.scan == null ? "row" : String(p.scan);
  if (!SCANS.includes(scan)) throw new Error(`扫描序非法：${p.scan}（仅 row / col）`);
  const bitOrder = p.bitOrder == null ? "msb" : String(p.bitOrder);
  if (!BIT_ORDERS.includes(bitOrder)) throw new Error(`位序非法：${p.bitOrder}（仅 msb / lsb）`);
  const select = p.select;
  if (!Array.isArray(select) || select.length === 0) throw new Error("取位序列 select 不能为空");
  for (const s of select) {
    if (!s || typeof s !== "object") throw new Error("select 项须为 {channel, plane}");
    const plane = s.plane == null ? 0 : s.plane;
    if (!Number.isInteger(plane) || plane < 0 || plane > 7) {
      throw new Error(`位平面非法：plane=${s.plane}（须为 0..7 整数）`);
    }
    if (s.channel != null) {
      if (!Number.isInteger(s.channel) || s.channel < 0) throw new Error(`通道下标非法：channel=${s.channel}`);
      if (s.channel >= channels) {
        if (p.strict !== false) throw new Error(`通道越界：channel=${s.channel}，本图仅 ${channels} 个通道`);
      }
    }
  }
  if (p.limit != null && (!Number.isInteger(p.limit) || p.limit < 1)) {
    throw new Error(`输出上限非法：limit=${p.limit}（须为正整数）`);
  }
  return { scan, bitOrder, select, limit: p.limit == null ? null : p.limit, strict: p.strict !== false };
}

// ============================================================
// 单元遍历（扫描序在此落地）
// ============================================================
/** 遍历序索引：i=0..w*h-1 → 像素下标。行主序 i=y*w+x；列主序 i=x*h+y。 */
export function pixelOrder(width, height, scan) {
  const out = new Uint32Array(width * height);
  if (scan === "col") {
    let k = 0;
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) out[k++] = y * width + x;
  } else {
    for (let i = 0; i < out.length; i++) out[i] = i;
  }
  return out;
}

/**
 * 位流迭代器：按声明式计划逐位产出。
 * 单元 = 像素；每像素按 select 顺序取位数（默认 1 位）。
 */
export function* bitIterator(src, plan) {
  const q = validatePlan(src, plan);
  const { width, height, channels, samples } = src;
  const total = width * height;
  const col = q.scan === "col";
  for (let i = 0; i < total; i++) {
    // 扫描序就地反解（不预生成整张下标表：大图上扫描类 op 会反复调用本迭代器）
    const px = col ? ((i % height) * width + Math.floor(i / height)) : i;
    const base = px * channels;
    for (const s of q.select) {
      const ch = s.channel == null ? 0 : s.channel;
      if (ch >= channels) continue;              // 非 strict：越界通道跳过（与既有扫描工具同效）
      const plane = s.plane == null ? 0 : s.plane;
      yield (samples[base + ch] >> plane) & 1;
    }
  }
}

// ============================================================
// 位流 → 字节（位序在此落地）
// ============================================================
/**
 * 位序列 → 字节序列。bitOrder="msb"：首比特进 bit7；"lsb"：首比特进 bit0。
 * 不足 8 位的尾部丢弃（保留位不足一个字节，无法构成确定字节）。
 */
export function bitsToBytes(bits, bitOrder = "msb", limit = null) {
  if (!BIT_ORDERS.includes(bitOrder)) throw new Error(`位序非法：${bitOrder}`);
  const total = limit == null ? Infinity : limit;
  const out = [];
  let acc = 0, n = 0;
  for (const b of bits) {
    if (bitOrder === "msb") acc = ((acc << 1) | (b & 1)) & 0xff;
    else acc |= (b & 1) << n;
    if (++n === 8) {
      out.push(acc & 0xff); acc = 0; n = 0;
      if (out.length >= total) break;
    }
  }
  return { bytes: Uint8Array.from(out), bitsUsed: out.length * 8 };
}

/** 字节序列 → 位数组（供位平面视图 / 反向验证用；与 bitsToBytes 互为逆）。 */
export function bytesToBits(bytes, bitOrder = "msb") {
  if (!BIT_ORDERS.includes(bitOrder)) throw new Error(`位序非法：${bitOrder}`);
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    for (let k = 0; k < 8; k++) {
      bits[i * 8 + k] = bitOrder === "msb" ? (bytes[i] >> (7 - k)) & 1 : (bytes[i] >> k) & 1;
    }
  }
  return bits;
}

// ============================================================
// 主入口：源 + 声明 → 字节流
// ============================================================
export function extractBytes(src, plan) {
  const q = validatePlan(src, plan);
  const r = bitsToBytes(bitIterator(src, plan), q.bitOrder, q.limit);
  const perUnit = q.select.length;
  const units = Math.min(src.width * src.height, Math.ceil(r.bitsUsed / perUnit));
  return {
    bytes: r.bytes,
    bitsUsed: r.bitsUsed,
    unitsUsed: units,
    totalUnits: src.width * src.height,
    note: describePlan(q),
  };
}

// ============================================================
// 位平面拆分：第 k 平面 → 每样本 1 位的 0/1 图
// ============================================================
/**
 * 拆出单个位平面：输出与源同尺寸、同通道数的 0/1 样本数组（值即该位）。
 * @param {boolean} expand true=把 1 展开为 255（可直接当灰度图看）
 */
export function splitPlane(src, plane, { expand = false } = {}) {
  const { channels, samples } = src;
  if (!Number.isInteger(plane) || plane < 0 || plane > 7) throw new Error(`位平面非法：${plane}`);
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const b = (samples[i] >> plane) & 1;
    out[i] = expand ? (b ? 255 : 0) : b;
  }
  return out;
}

/** 拆出全部 8 个位平面 → [plane0..plane7]（plane0 为最低位）。 */
export function splitPlanes(src, opts = {}) {
  const planes = [];
  for (let k = 0; k <= 7; k++) planes.push(splitPlane(src, k, opts));
  return planes;
}

/** 位平面重组：planes[k] 为 0/1 或 0/255 → 还原样本数组（与 splitPlanes 互逆）。 */
export function mergePlanes(planes, layout) {
  const { width, height, channels } = layout || {};
  const n = width * height * channels;
  const out = new Uint8Array(n);
  for (let k = 0; k < 8; k++) {
    const p = planes[k];
    if (!p) continue;
    if (p.length !== n) throw new Error(`位平面 ${k} 长度 ${p.length} 与 layout 期望 ${n} 不符`);
    for (let i = 0; i < n; i++) {
      const b = p[i] === 255 || p[i] === 1 ? 1 : 0;
      if (b) out[i] |= 1 << k;
    }
  }
  return out;
}

// ============================================================
// 通道分离 / 重组
// ============================================================
/** 通道分离：返回 Uint8Array[]，长度 = channels（下标 0=R,1=G,2=B,3=A）。 */
export function splitChannels(src) {
  const { width, height, channels, samples } = src;
  const px = width * height;
  const out = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Uint8Array(px);
    for (let i = 0; i < px; i++) ch[i] = samples[i * channels + c];
    out.push(ch);
  }
  return out;
}

/**
 * 通道重组：把若干单通道平面按显式通道顺序合回交错样本。
 * @param {Uint8Array[]} chans 按目标通道顺序给出的平面（长度须 = channels）
 * @param {object} layout {width,height,channels}
 */
export function mergeChannels(chans, layout) {
  const { width, height, channels } = layout || {};
  if (!Number.isInteger(channels) || channels <= 0) throw new Error("layout.channels 非法");
  if (chans.length !== channels) throw new Error(`通道数不符：给 ${chans.length} 个，layout 要 ${channels} 个`);
  const px = width * height;
  for (const c of chans) if (c.length !== px) throw new Error(`通道平面长度 ${c.length} ≠ ${width}×${height}`);
  const out = new Uint8Array(px * channels);
  for (let i = 0; i < px; i++) for (let c = 0; c < channels; c++) out[i * channels + c] = chans[c][i];
  return out;
}

// ============================================================
// 计划描述（人可读，用于报告与日志；保证「声明了什么」可见）
// ============================================================
export function describePlan(q) {
  const sel = q.select.map((s) => `c${s.channel == null ? 0 : s.channel}@b${s.plane == null ? 0 : s.plane}`).join(",");
  return `${q.scan === "col" ? "列主序" : "行主序"} · ${sel} · ${q.bitOrder === "msb" ? "MSB-first" : "LSB-first"}`;
}

// ============================================================
// 便捷构造：像素集合 → 位源
// ============================================================
export function makeSource(width, height, channels, samples) {
  return { width, height, channels, samples: samples instanceof Uint8Array ? samples : Uint8Array.from(samples) };
}