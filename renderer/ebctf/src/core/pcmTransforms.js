/*
 * pcmTransforms.js — PCM 波形/声道差/差分/反相/倒放/阈值 纯变换（cat:'audio'，run 型）。
 *
 * 做什么：对 WAV 整数 PCM（8/16/24/32 bit，格式码 1 或 0xFFFE 子格式 1）做
 * 逐样本确定性变换，出样本数组 / 重建 WAV / 阈值位流：
 *   chdiff    声道差 L-R（mono 输入显式拒绝；输出 32bit WAV + 饱和计数）
 *   delta     一阶差分 x[n]-x[n-1]（首个样本保持原值；wrap 语义）
 *   invert    波形反相 -x（环绕语义；8 位 = (256-v)&255）
 *   reverse   时间倒放（每声道独立）
 *   threshold 阈值位流（逐样本 / 分窗取 max 两档，LSB-first 打包字节）
 *
 * ---- 语义口径（显式定义） ----
 * · 8 位 PCM 文件字节无符号（0..255），读回时居中为有符号（-128..127）——
 *   跟随 audiostego.readPcmSamples 的真实口径；16/24/32 位有符号 LE。
 *   故全部位深在变换域均为有符号居中值。
 * · 算术一律在「宽位域」做后回绕（wrap）：16 位在 int16 域环绕、24 位在
 *   [-2^23,2^23) 环绕、32 位在 int32 域环绕——与 numpy 定点环绕一致；
 *   -x 对 -max（如 -32768）环绕回自身，这是定点补码的固有不对称，非 bug。
 * · 声道差在宽位域计算（无环绕，Float64 承载）：16/24 位差必在安全域内；
 *   32 位差可能越界 ±2^32 → 样本数组保留真实宽域差值，输出 WAV 用 32 位
 *   + 饱和（越界计数显式报告）。
 * · 阈值位流：sample > T → 1，否则 0（严格大于，样本为居中有符号域，
 *   T 亦取该域）；位按 LSB-first 打包字节。分窗档：每窗取 max 与阈值
 *   比较出 1 bit，窗长/步长参数化；多声道取首声道（显式声明）。
 * · 不可逆过滤（阈值）不提供逆操作；可逆变换（差分/反相/倒放）语义上
 *   可逆但本 op 不造「逆 op」——重复同一变换即回逆（delta 二次差分除外，
 *   属数学性质，不冒充可逆 op）。
 *
 * ---- 依赖（现用源复用，勿重写） ----
 * import 自 ./audiostego.js：parseWav / readPcmSamples / buildWav / inputToBytes
 * （buildWav 吃原始字节流，故本文件自带样本↔字节转换。）
 *
 * ---- 边界 ----
 * · 只支持整数 PCM；IEEE float（格式码 3）与压缩格式显式报错。
 * · 压缩音频 → PCM 属可选离线模块范围，本 op 不做。
 * · 验证：与 Python(numpy) 独立期望逐样本对拍 39/39（8/16/24/32 位立体声
 *   + 16 位单声道夹具：读回/声道差/差分/反相/倒放/往返/阈值/拒绝例）。
 *
 * 红线遵守：纯前端零外发，无 node 专属 API；件内自注册；报告无 emoji。
 */
import { register } from "./registry.js";
import { parseWav, readPcmSamples, buildWav, inputToBytes } from "./audiostego.js";

/** 解析并校验：返回 { fmt, channels:Int32Array[], frames } 或抛错。 */
export function pcmLoad(bytes) {
  const w = parseWav(bytes);
  if (!w.ok || !w.data) throw new Error("非合法 WAV 或缺 fmt/data 块（" + (w.error || "无 data") + "）");
  const f = w.fmt;
  const tag = f.formatTag === 0xFFFE ? f.subFormat : f.formatTag;
  if (tag !== 1) throw new Error("仅支持整数 PCM（格式码 " + f.formatTag + (f.formatTag === 0xFFFE ? " 子格式 " + f.subFormat : "") + " 不支持）");
  if (![8, 16, 24, 32].includes(f.bitsPerSample)) throw new Error("不支持的位深 " + f.bitsPerSample + " bit");
  const pcm = readPcmSamples(bytes, f, w.data.offset, w.data.actual);
  return { fmt: f, channels: pcm.channels, frames: pcm.frames };
}

const MASKS = { 8: 0xff, 16: 0xffff, 24: 0xffffff, 32: 0xffffffff };

/** 宽域值 → 指定位深回绕（wrap）+ 符号扩展（全部位深统一居中有符号域）。 */
function wrap(v, bits) {
  const m = MASKS[bits];
  v = v & m;
  const sign = 1 << (bits - 1);
  return (v ^ sign) - sign;
}

/** 声道差 L-R。mono 拒绝。返回宽域差值 Float64Array（不回绕）。 */
export function pcmChDiff(bytes) {
  const { fmt, channels, frames } = pcmLoad(bytes);
  if (channels.length < 2) throw new Error("声道差需要立体声（当前 " + channels.length + " 声道）");
  const L = channels[0], R = channels[1];
  const out = new Float64Array(frames); // 宽域（32 位差可越 Int32）
  for (let i = 0; i < frames; i++) out[i] = L[i] - R[i];
  return { fmt, frames, diff: out };
}

/** 一阶差分 x[n]-x[n-1]（wrap 语义），对每个声道独立做。 */
export function pcmDelta(bytes) {
  const { fmt, channels, frames } = pcmLoad(bytes);
  const bits = fmt.bitsPerSample;
  const out = channels.map((ch) => {
    const d = new Int32Array(frames);
    d[0] = ch[0];
    for (let i = 1; i < frames; i++) d[i] = wrap(ch[i] - ch[i - 1], bits);
    return d;
  });
  return { fmt, frames, delta: out };
}

/** 波形反相 -x（wrap 语义；8 位 = (256-v)&255）。 */
export function pcmInvert(bytes) {
  const { fmt, channels, frames } = pcmLoad(bytes);
  const bits = fmt.bitsPerSample;
  const out = channels.map((ch) => {
    const d = new Int32Array(frames);
    for (let i = 0; i < frames; i++) d[i] = wrap(-ch[i], bits);
    return d;
  });
  return { fmt, frames, invert: out };
}

/** 时间倒放（每声道独立）。 */
export function pcmReverse(bytes) {
  const { fmt, channels, frames } = pcmLoad(bytes);
  const out = channels.map((ch) => {
    const d = new Int32Array(frames);
    for (let i = 0; i < frames; i++) d[i] = ch[frames - 1 - i];
    return d;
  });
  return { fmt, frames, reverse: out };
}

/**
 * 阈值位流。
 * @param mode 'sample' 逐样本 | 'window' 分窗取 max
 * @param threshold 阈值 T（与样本同域）
 * @param winLen/winHop 分窗参数（默认 100/100）
 */
export function pcmThreshold(bytes, mode, threshold, winLen, winHop) {
  const { fmt, channels, frames } = pcmLoad(bytes);
  mode = mode || "sample";
  const ch = channels[0]; // 多声道取首声道（显式声明）
  const T = Number(threshold);
  if (!Number.isFinite(T)) throw new Error("阈值非法");
  let bits;
  if (mode === "sample") {
    bits = new Uint8Array(frames);
    for (let i = 0; i < frames; i++) bits[i] = ch[i] > T ? 1 : 0;
  } else if (mode === "window") {
    const L = Math.max(1, winLen | 0 || 100), H = Math.max(1, winHop | 0 || 100);
    const n = Math.max(0, Math.floor((frames - L) / H) + 1);
    bits = new Uint8Array(n);
    for (let w = 0; w < n; w++) {
      let mx = ch[w * H];
      for (let i = 1; i < L; i++) { const v = ch[w * H + i]; if (v > mx) mx = v; }
      bits[w] = mx > T ? 1 : 0;
    }
  } else throw new Error("mode 需为 sample|window");
  const packed = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) packed[i >> 3] |= bits[i] << (i & 7);
  const runs = [];
  let cur = -1, len = 0;
  for (let i = 0; i < bits.length && runs.length < 200; i++) {
    if (bits[i] === cur) len++;
    else { if (cur >= 0) runs.push({ bit: cur, len }); cur = bits[i]; len = 1; }
  }
  if (cur >= 0 && runs.length < 200) runs.push({ bit: cur, len });
  return { fmt, bits, packed, runs, ones: bits.reduce((a, b) => a + b, 0) };
}

/** 样本数组（每声道 Int32）→ 原始字节（8 位无符号 / 其余 LE 有符号）。 */
export function samplesToBytes(channels, bits) {
  const bps = bits >> 3;
  const frames = channels[0].length;
  const out = new Uint8Array(frames * channels.length * bps);
  let p = 0;
  for (let f = 0; f < frames; f++) {
    for (const ch of channels) {
      let v = ch[f];
      if (bits === 8) { out[p++] = (v + 128) & 0xff; continue; }
      for (let b = 0; b < bps; b++) { out[p++] = v & 0xff; v = Math.floor(v / 256); }
    }
  }
  return out;
}

/** 差值（宽域）→ 32 位输出 WAV（饱和计数）。 */
export function diffToWav(diff, sampleRate) {
  let clipped = 0;
  const s = new Int32Array(diff.length);
  for (let i = 0; i < diff.length; i++) {
    let v = diff[i];
    if (v > 2147483647) { v = 2147483647; clipped++; }
    if (v < -2147483648) { v = -2147483648; clipped++; }
    s[i] = v;
  }
  const bytes = samplesToBytes([s], 32);
  return { wav: buildWav(bytes, 1, sampleRate, 32), clipped };
}

/** 通用重建 WAV（保持原位深/声道数/采样率）。 */
export function rebuildWav(channels, fmt) {
  const bytes = samplesToBytes(channels, fmt.bitsPerSample);
  return buildWav(bytes, channels.length, fmt.sampleRate, fmt.bitsPerSample);
}

// ============================================================
// op 入口
// ============================================================
function bytesHexPreview(b, max) {
  const n = Math.min(b.length, max == null ? 64 : max);
  let s = "";
  for (let i = 0; i < n; i++) s += b[i].toString(16).padStart(2, "0");
  if (b.length > n) s += "…";
  return s;
}

function pcmRun(text, p) {
  const mode = (p && p.mode) || "chdiff";
  const L = [];
  L.push("=== PCM 波形变换 ===");
  L.push("");

  let bytes;
  try {
    bytes = inputToBytes(text, p);
  } catch (e) {
    L.push("✗ 输入解析失败: " + (e.message || String(e)));
    L.push("  提示：拖入 WAV 文件，或粘贴其 base64/hex。");
    return L.join("\n");
  }
  if (!bytes || !bytes.length) {
    L.push("✗ 输入为空。请拖入 WAV 文件，或粘贴其 base64/hex。");
    return L.join("\n");
  }

  let fmt, channels, frames;
  try {
    const loaded = pcmLoad(bytes);
    fmt = loaded.fmt; channels = loaded.channels; frames = loaded.frames;
  } catch (e) {
    L.push("✗ " + (e.message || String(e)));
    return L.join("\n");
  }
  L.push(`● 输入: ${bytes.length} 字节  ${fmt.bitsPerSample}bit / ${channels.length} 声道 / ${fmt.sampleRate} Hz / ${frames} 帧（整数 PCM）`);
  L.push(`● 变换: ${mode}`);
  L.push("");

  const files = [];
  try {
    if (mode === "chdiff") {
      const d = pcmChDiff(bytes);
      const w32 = diffToWav(d.diff, fmt.sampleRate);
      L.push("--- 声道差 L-R ---");
      L.push(`● 差值域: 宽域（Float64 承载，不回绕）；输出 32bit 单声道 WAV ${w32.wav.length} 字节`);
      L.push(`● 饱和截断: ${w32.clipped} 样本${w32.clipped ? "（32 位差越界，已夹到 ±2^31 边界）" : ""}`);
      L.push("● 语义: L[i] - R[i]；立体声隐写（声道差藏数据/相位差分析）的第一步。");
      files.push({ name: "chdiff.wav", mime: "audio/wav", bytes: w32.wav });
    } else if (mode === "delta") {
      const d = pcmDelta(bytes);
      const wav = rebuildWav(d.delta, d.fmt);
      L.push("--- 一阶差分 ---");
      L.push(`● d[0]=x[0]，d[n]=wrap(x[n]-x[n-1])（${fmt.bitsPerSample} 位域环绕）`);
      L.push("● 产物 WAV: " + wav.length + " 字节（保持原位深/声道/采样率）");
      L.push("● 用途: 差分把低频能量压到零附近，能量异常点=可能的人为改写。");
      files.push({ name: "delta.wav", mime: "audio/wav", bytes: wav });
    } else if (mode === "invert") {
      const d = pcmInvert(bytes);
      const wav = rebuildWav(d.invert, d.fmt);
      L.push("--- 波形反相 ---");
      L.push(`● wrap(-x)（${fmt.bitsPerSample} 位域环绕；8 位文件字节口径 = (256-v)&255）`);
      L.push("● 产物 WAV: " + wav.length + " 字节；再反相一次即还原原始波形。");
      L.push("● 用途: 声道反相卡拉OK/隐写（左右声道反相叠加会抵消伴奏留下差异轨）。");
      files.push({ name: "inverted.wav", mime: "audio/wav", bytes: wav });
    } else if (mode === "reverse") {
      const d = pcmReverse(bytes);
      const wav = rebuildWav(d.reverse, d.fmt);
      L.push("--- 时间倒放 ---");
      L.push("● 产物 WAV: " + wav.length + " 字节（每声道独立倒放）；再倒放一次即还原。");
      L.push("● 用途: 倒放藏话（backmasking）类题的第一步——倒放后直接听/看频谱。");
      files.push({ name: "reversed.wav", mime: "audio/wav", bytes: wav });
    } else if (mode === "threshold") {
      const T = (p && p.threshold != null) ? Number(p.threshold) : 0;
      const thrMode = (p && p.thrMode) || "sample";
      const winLen = parseInt((p && p.winLen) || "100", 10) || 100;
      const winHop = parseInt((p && p.winHop) || "100", 10) || 100;
      const t = pcmThreshold(bytes, thrMode, T, winLen, winHop);
      L.push("--- 阈值位流 ---");
      L.push(`● 判据: ${thrMode === "window" ? `分窗取 max（窗长 ${winLen} / 步长 ${winHop}）` : "逐样本"} > ${T} → 1，否则 0（首声道）`);
      L.push(`● 位流: ${t.bits.length} 位，其中 1 值 ${t.ones} 个（${(100 * t.ones / Math.max(1, t.bits.length)).toFixed(2)}%）`);
      L.push(`● 游程（前 ${Math.min(12, t.runs.length)} 段/共 ${t.runs.length}）: ` +
        t.runs.slice(0, 12).map((r) => `${r.bit}×${r.len}`).join(", "));
      L.push(`● LSB-first 打包: ${t.packed.length} 字节，hex 头: ${bytesHexPreview(t.packed, 64)}`);
      L.push("● 说明: 阈值是不可逆过滤，无逆操作；位流可接一键解码/位流类 op 继续分析。");
      files.push({ name: "threshold_bits.bin", mime: "application/octet-stream", bytes: t.packed });
    } else {
      L.push("✗ 未知变换模式: " + mode);
      return L.join("\n");
    }
  } catch (e) {
    L.push("✗ 变换失败: " + (e.message || String(e)));
    return L.join("\n");
  }

  L.push("");
  L.push("说明: 8/16/24/32 位整数 PCM；IEEE float / 压缩格式不支持。纯本地计算、零外发。");
  return { text: L.join("\n"), files };
}

register({
  id: "pcmTransforms",
  cat: "audio",
  name: "PCM 波形变换",
  desc: "WAV 整数 PCM（8/16/24/32bit）逐样本变换五档：声道差 L-R（宽域计算，输出 32bit WAV + 饱和计数）、一阶差分、波形反相、时间倒放（保持原格式重建 WAV）与阈值位流（逐样本/分窗取 max，LSB-first 打包 + 游程统计）。IEEE float 与压缩格式显式拒绝。纯前端零外发",
  acceptsBytes: true,
  params: [
    {
      key: "mode", label: "变换", type: "select", default: "chdiff",
      options: [
        { value: "chdiff", label: "声道差 L-R（立体声）" },
        { value: "delta", label: "一阶差分" },
        { value: "invert", label: "波形反相" },
        { value: "reverse", label: "时间倒放" },
        { value: "threshold", label: "阈值位流" },
      ],
    },
    { key: "threshold", label: "阈值 T（threshold 档）", type: "number", default: 0 },
    {
      key: "thrMode", label: "阈值档位", type: "select", default: "sample",
      options: [
        { value: "sample", label: "逐样本" },
        { value: "window", label: "分窗取 max" },
      ],
    },
    { key: "winLen", label: "窗长（分窗档）", type: "number", default: 100 },
    { key: "winHop", label: "步长（分窗档）", type: "number", default: 100 },
  ],
  run: pcmRun,
});

export { pcmRun };
