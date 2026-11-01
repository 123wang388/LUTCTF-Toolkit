/*
 * lznt1.js — LZNT1 解压（Windows LZ77 压缩格式，cat:'archive'，单向 run）。
 *
 * 解决什么：CTF / 取证常遇的 Windows LZNT1 流（NTFS 压缩属性数据、注册表
 * CompressedValue、调试转储中的 RtlCompressBuffer 产物）解回明文。
 *
 * 格式（照 wine dlls/ntdll/rtl.c 与 ReactOS sdk/lib/rtl/compress.c 的
 * lznt1_decompress（两者逐行一致，ReactOS 注明 "Based on Wine Staging"），
 * 并经本机 Windows 10 26100 ntdll RtlCompressBuffer 真样本逐字节核对，
 * 见 ref/SOURCES_A.md 与 ref/samples_win_lznt1/manifest.json）：
 *   - 流 = 若干 chunk。chunk 头 2 字节 LE：
 *       bits 0-11  = 块数据长度 - 1（数据长 = (h & 0xFFF) + 1，压缩/未压缩同口径）
 *       bits 12-14 = 0b011（签名 3；实测 0xBxxx 压缩 / 0x3xxx 存储）
 *       bit  15    = 1 压缩块（LZ77 编码）/ 0 存储块（原样字节）
 *       头 == 0x0000 = 流结束标记（成功收尾）
 *   - 未压缩块：数据即原样字节（实测整 4096，头 0x3FFF）。
 *   - 压缩块：标志字节 + 8 个 token（LSB 位序）：位 0 = 字面字节，位 1 =
 *     反向引用 2 字节 LE。位移/长度位分割随块内已解出位置 pos 变化：
 *       displacement_bits = min(12, max(4, bitlen(pos-1)))
 *       length = (code & (2^(16-db) - 1)) + 3
 *       displacement = (code >> (16-db)) + 1（只在当前 4096 块内回引，逐字节拷贝可重叠）
 *   - 每块解出上限 4096 字节；块间若未对齐 4096 则补零到对齐（照 wine/ReactOS，
 *     正常流只有末块非整）。块满即止（部分解压非错误，Windows 口径）。
 *
 * 权威样本（本机生成，Windows 10.0.26100 / ntdll 10.0.26100.3915，
 * RtlCompressBuffer(COMPRESSION_FORMAT_LZNT1, engine STANDARD, chunk 4096)，12 例
 * 全解回原明文；空输入压缩器拒收 0x117 如实登记）：ref/samples_win_lznt1/。
 * 例：b"AAAA…"(100 字节) → 03 b0 02 41 60 00（头 0xB003 压缩块 4 字节数据：
 * 标志 0x02 → 字面 'A' + 反向引用 0x0060 = 长 99 / 位移 1）。
 *
 * 仅解压（单向）。LZNT1 压缩方向未实现——Windows 的压缩器有块内贪心匹配策略
 * 非规范强制，单向工具按「真样本 + 独立参考 + 性质测试」口径验证。
 *
 * 输入：hex / base64 / 原样 UTF-8（inputEnc 可指定）或拖文件（rawBytes）。
 * 输出：可打印 UTF-8 → 文本，否则 hex（与工程内其他字节类 op 一致）。
 *
 * 红线：算法照 wine/ReactOS 逐行移植，真样本对拍；畸形流（块声明长度越界 /
 * 反向引用缺字节 / 位移越界）显式报错。纯本地零外发；仅依赖 registry。
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

// ============================================================
// 单 chunk 解码（lznt1_decompress_chunk 逐行对应；块内输出上限 0x1000）
// ============================================================
function lznt1DecompressChunk(src) {
  const out = new Uint8Array(0x1000);
  let dst = 0; // 块内已解出位置
  let sp = 0;
  while (sp < src.length && dst < 0x1000) {
    let flags = 0x8000 | src[sp++]; // 高字节哨兵：8 个 token 后自然停
    while ((flags & 0xff00) !== 0 && sp < src.length) {
      if (flags & 1) {
        // 反向引用 token
        if (sp + 2 > src.length) throw new Error("LZNT1: 反向引用 token 缺 2 字节（块数据截断）");
        const code = src[sp] | (src[sp + 1] << 8);
        sp += 2;
        // 位移位宽：从 12 往下找首个满足 (1<<(db-1)) < pos 的 db，下限 4
        let db = 4;
        for (let t = 12; t > 4; t--) {
          if ((1 << (t - 1)) < dst) { db = t; break; }
        }
        const lengthBits = 16 - db;
        const length = (code & ((1 << lengthBits) - 1)) + 3;
        const displacement = (code >>> lengthBits) + 1;
        if (dst < displacement) throw new Error("LZNT1: 反向引用位移越出块内已解出范围");
        for (let k = 0; k < length; k++) {
          if (dst >= 0x1000) return out.subarray(0, dst); // 块满即止（部分解压非错误）
          out[dst] = out[dst - displacement];
          dst++;
        }
      } else {
        // 字面字节
        if (dst >= 0x1000) return out.subarray(0, dst);
        out[dst++] = src[sp++];
      }
      flags >>>= 1;
    }
  }
  return out.subarray(0, dst);
}

// ============================================================
// 流级解压（lznt1_decompress，offset=0 即 RtlDecompressBuffer 路径）
// ============================================================
function lznt1Decompress(data) {
  const chunks = [];
  let pos = 0;
  let outLen = 0;
  while (pos + 2 <= data.length) {
    const header = data[pos] | (data[pos + 1] << 8);
    pos += 2;
    if (header === 0) break; // 结束标记：成功收尾
    const chunkSize = (header & 0x0fff) + 1;
    if (pos + chunkSize > data.length) throw new Error("LZNT1: 块声明长度超出输入（流被截断）");
    // 块间对齐：输出未到 4096 整数倍则补零（照 wine/ReactOS；正常流仅防御路径）
    if ((outLen & 0xfff) !== 0) {
      const pad = 0x1000 - (outLen & 0xfff);
      const z = new Uint8Array(pad);
      chunks.push(z);
      outLen += pad;
    }
    if (header & 0x8000) {
      const part = lznt1DecompressChunk(data.subarray(pos, pos + chunkSize));
      chunks.push(part);
      outLen += part.length;
    } else {
      chunks.push(data.subarray(pos, pos + chunkSize));
      outLen += chunkSize;
    }
    pos += chunkSize;
  }
  const out = new Uint8Array(outLen);
  let w = 0;
  for (const c of chunks) {
    out.set(c, w);
    w += c.length;
  }
  return out;
}

// ============================================================
// 输入 / 输出（hex / base64 / utf8 自动，与 compress.js 口径一致）
// ============================================================
const TE = new TextEncoder();
const B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
function isHexStr(s) { return /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0 && s.length >= 2; }
function isB64Str(s) {
  if (!s || s.length % 4 !== 0) return false;
  for (const c of s) if (!B64C.includes(c)) return false;
  return true;
}
function hexToBytes(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) out[i / 2] = parseInt(s.slice(i, i + 2), 16);
  return out;
}
function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function lznt1InputToBytes(text, p) {
  if (p && p.rawBytes != null) {
    return p.rawBytes instanceof Uint8Array ? p.rawBytes : new Uint8Array(p.rawBytes);
  }
  const enc = (p && p.inputEnc) || "auto";
  const s = String(text).trim().replace(/\s+/g, "");
  if (enc === "hex") {
    if (!isHexStr(s)) throw new Error("LZNT1: 输入不是合法 hex（偶数长度 0-9a-f）");
    return hexToBytes(s);
  }
  if (enc === "base64") {
    try { return b64ToBytes(s); } catch { throw new Error("LZNT1: 输入不是合法 base64"); }
  }
  if (enc === "utf8") return TE.encode(String(text));
  if (isHexStr(s)) return hexToBytes(s);
  if (isB64Str(s)) {
    try { return b64ToBytes(s); } catch { /* fall through */ }
  }
  return TE.encode(String(text));
}

function bytesToHexLocal(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

/** 字节 → 输出文本：合法 UTF-8 且控制字符少 → 文本，否则 hex。 */
function bytesToOutputText(bytes) {
  if (bytes.length === 0) return "";
  try {
    const s = _decodeUtf8Fatal(bytes);
    let ctrl = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) ctrl++;
    }
    if (s.length > 0 && ctrl / s.length < 0.1) return s;
  } catch { /* 走 hex */ }
  return bytesToHexLocal(bytes);
}

// ============================================================
// op 入口
// ============================================================
function lznt1Run(text, p) {
  const bytes = lznt1InputToBytes(text, p);
  if (bytes.length === 0) throw new Error("LZNT1: 输入为空（至少应有 chunk 头 2 字节）");
  const out = lznt1Decompress(bytes);
  return bytesToOutputText(out);
}

// ============================================================
// 加载期自检（真 Windows 样本锚点 + 手造块；任一失败抛错）
// ============================================================
(function selfCheck() {
  const hexToB = (h) => hexToBytes(h.replace(/\s+/g, ""));
  // ① 真 Windows 样本锚点（Windows 10.0.26100 RtlCompressBuffer 产物，ref/samples_win_lznt1）
  // "A"*100 → 03b0 02 41 60 00
  {
    const out = lznt1Decompress(hexToB("03b002416000"));
    if (out.length !== 100 || out[0] !== 0x41 || out[99] !== 0x41) throw new Error("LZNT1 自检①失败：A×100 样本");
  }
  // ② 真 Windows 样本：pattern(4095) 完整流（23 字节）→ 4095 字节 "0123456789abcdef" 循环
  {
    const out = lznt1Decompress(hexToB("14b0003031323334353637" + "00383961626364656601ecff"));
    if (out.length !== 4095) throw new Error("LZNT1 自检②失败：pattern×4095 长度 " + out.length);
    for (let i = 0; i < 4095; i++) {
      if (out[i] !== "0123456789abcdef".charCodeAt(i % 16)) throw new Error("LZNT1 自检②失败：第 " + i + " 字节");
    }
  }
  // ③ 手造存储块：头 0x3002（size 3）+ "XYZ" → "XYZ"
  {
    const out = lznt1Decompress(hexToB("0230" + "58595a"));
    if (out.length !== 3 || out[0] !== 0x58 || out[2] !== 0x5a) throw new Error("LZNT1 自检③失败：存储块");
  }
  // ④ 结束标记：头 0x0000 → 空输出（成功收尾）
  {
    const out = lznt1Decompress(hexToB("0000"));
    if (out.length !== 0) throw new Error("LZNT1 自检④失败：结束标记");
  }
  // ⑤ 手造反向引用边界：16 字面 + 位移 16 / 长 3（pos=16 时 db=4，位移域 12 位顶格）
  // 编码：00 "01234567" 00 "89abcdef" 01 00F0（word=0xF000 → disp=16,len=3）→ 头 0xB014
  {
    const out = lznt1Decompress(hexToB("14b0" + "00" + "3031323334353637" + "00" + "3839616263646566" + "01" + "00f0"));
    if (out.length !== 19 || out[16] !== 0x30 || out[17] !== 0x31 || out[18] !== 0x32) {
      throw new Error("LZNT1 自检⑤失败：位移 16 回引（长度 " + out.length + "）");
    }
  }
  // ⑥ 真 Windows 样本：one_byte_A → "A"
  {
    const out = lznt1Decompress(hexToB("01b00041"));
    if (out.length !== 1 || out[0] !== 0x41) throw new Error("LZNT1 自检⑥失败：单字节样本");
  }
})();

register({
  id: "lznt1",
  cat: "archive",
  name: "LZNT1 解压",
  desc: "Windows LZNT1（RtlCompressBuffer / NTFS 压缩）LZ77 流解压：位标志 chunk + 反向引用（offset/length 位分割随块内位置变化）。仅解压单向；过本机 Windows 真样本 12 例 + 独立 Python 参考对拍",
  params: [
    {
      key: "inputEnc",
      label: "输入编码",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "自动（hex/base64/UTF-8）" },
        { value: "hex", label: "Hex" },
        { value: "base64", label: "Base64" },
        { value: "utf8", label: "UTF-8 文本" },
      ],
    },
  ],
  run: lznt1Run,
  acceptsBytes: true,
});

export { lznt1Run, lznt1Decompress, lznt1DecompressChunk };
