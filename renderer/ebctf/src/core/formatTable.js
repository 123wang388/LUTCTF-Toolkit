/*
 * formats.mjs —— 「魔数 → 容器 → 字段 → 提取规则」声明式格式表 + 通用执行器（层⑤ 最小候选）
 *
 * ============================================================
 * 为什么需要这一层
 * ============================================================
 * 现状：文件结构处理是**按格式各自手写**的 —— 每种格式一个函数、每加一种格式改共享代码。
 * 结果是「加格式 = 改代码」，而且改动落在共享文件里（串行瓶颈）。
 *
 * 本层把「格式」变成**一张数据表**：
 *   声明式表 = 魔数 + 容器遍历方式 + 必需块/字段 + 校验算法 + 嵌入数据插座
 *   通用执行器 = 按表遍历 / 按表读字段 / 报「缺什么」/ 按表重算校验
 * 于是：**加格式 = 加一行表**，执行器一行不改。
 *
 * ============================================================
 * 权威依据（每个格式写进表项 spec 字段，不靠约定俗成）
 * ============================================================
 *   PNG  : ISO/IEC 15948 (PNG 1.2) — 签名 8 字节；chunk = len(4,BE)+type(4)+data+crc(4)；
 *          CRC-32 覆盖 type+data；IHDR 为 13 字节固定结构
 *   JPEG : ITU-T T.81 — SOI(FFD8) / 段(FF marker + len(2,BE)) / EOI(FFD9)；COM=FFFE
 *   GIF  : GIF89a 规范 — Header(6)+LSD(7)+[GCT]+块流；注释扩展 0x21 0xFE；Trailer 0x3B
 *   BMP  : Microsoft 位图文件格式 — "BM"+bfSize(4,LE)+bfOffBits(4,LE)+DIB 头
 *   PDF  : ISO 32000-1 — 间接对象 "n g obj … endobj"；流 "stream…endstream"；%%EOF 结束
 *   ZIP  : PKWARE APPNOTE.TXT — LFH(PK\x03\x04) / CDH(PK\x01\x02) / EOCD(PK\x05\x06)
 *   RAR  : RAR 技术说明 — RAR4 签名 Rar!\x1a\x07\x00；RAR5 签名 Rar!\x1a\x07\x01\x00
 *   WAV  : Microsoft RIFF / WAVE — "RIFF"+size(4,LE)+"WAVE" + chunk(id(4)+len(4,LE)+data)
 *
 * ============================================================
 * 契约
 * ============================================================
 *   identify(bytes)          → { id, name, spec, magicOffset, magicLabel } | null
 *   readFields(bytes)        → [{name, offset, size, type, value, text?, note?}]
 *   walk(bytes)              → { id, blocks:[…], tail:{offset,len}, errors:[…] }
 *   sockets(bytes)           → [{ id, kind, label, offset, len, text?, bytes?, note }]
 *   missing(bytes)           → { id, missing:[{kind,label,note}] }
 *   verify(bytes)            → { id, checks:[{id,label,ok,detail}] }
 *   repair(bytes)            → { id, bytes, fixes:[…], verifiedAfter:boolean }
 *   report(bytes)            → 综合（人可读多行）
 *
 * 零依赖、零 UI、纯函数（可独立摘取）。
 */

// ============================================================
// 字段类型（声明式表只引用类型名，读取逻辑集中在此）
// ============================================================
export const FIELD_TYPES = {
  u8:    { size: 1, read: (b, o) => b[o] },
  u16le: { size: 2, read: (b, o) => (b[o] | (b[o + 1] << 8)) >>> 0 },
  u16be: { size: 2, read: (b, o) => ((b[o] << 8) | b[o + 1]) >>> 0 },
  u32le: { size: 4, read: (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0 },
  u32be: { size: 4, read: (b, o) => ((b[o] * 0x1000000) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0 },
  i16le: { size: 2, read: (b, o) => { const v = (b[o] | (b[o + 1] << 8)) >>> 0; return v >= 0x8000 ? v - 0x10000 : v; } },
  i32le: { size: 4, read: (b, o) => (FIELD_TYPES.u32le.read(b, o) | 0) },
  ascii: { size: 0, read: (b, o, n) => latin1(b.subarray(o, o + n)) },
  hex:   { size: 0, read: (b, o, n) => [...b.subarray(o, o + n)].map((x) => x.toString(16).padStart(2, "0")).join("") },
};

export const latin1 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return s; };
export const hex = (u8, sep = "") => [...u8].map((x) => x.toString(16).padStart(2, "0")).join(sep);

// ============================================================
// CRC-32（ISO 3309 / ITU-T V.42，PNG 与 ZIP 同用；查表法）
// ============================================================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(u8, seed = 0) {
  let c = (seed ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < u8.length; i++) c = (CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const eq = (u8, off, pat) => { for (let i = 0; i < pat.length; i++) if (u8[off + i] !== pat[i]) return false; return true; };
const B = (...a) => a;

// ============================================================
// 声明式格式表
// ============================================================
export const FORMATS = [
  {
    id: "png", name: "PNG", spec: "ISO/IEC 15948 (PNG 1.2)",
    magic: [{ offset: 0, bytes: B(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), label: "PNG 签名" }],
    walk: "png-chunks",
    required: [
      { kind: "IHDR", label: "图像头（必须是首个块）" },
      { kind: "IDAT", label: "图像数据（可多个，须连续）" },
      { kind: "IEND", label: "结束块" },
    ],
    header: {
      at: { kind: "IHDR" },
      fields: [
        { name: "width",     type: "u32be", offset: 0, note: "IHDR 宽（像素）" },
        { name: "height",    type: "u32be", offset: 4, note: "IHDR 高（像素）" },
        { name: "bitDepth",  type: "u8",    offset: 8, note: "样本位深 1/2/4/8/16" },
        { name: "colorType", type: "u8",    offset: 9, note: "0灰度 2真彩 3调色板 4灰度+A 6真彩+A" },
        { name: "compression", type: "u8",  offset: 10, note: "压缩法（规范规定 0）" },
        { name: "filter",    type: "u8",    offset: 11, note: "滤波法（规范规定 0）" },
        { name: "interlace", type: "u8",    offset: 12, note: "0=非隔行 1=Adam7" },
      ],
    },
    sockets: [
      { id: "tEXt", kind: "chunk", label: "未压缩文本块（keyword\\0text，Latin-1）", split: "nul", lhs: "keyword", rhs: "text", enc: "latin1" },
      { id: "zTXt", kind: "chunk", label: "压缩文本块（keyword\\0method+deflate）", split: "nul", lhs: "keyword", rhs: "zlib" },
      { id: "iTXt", kind: "chunk", label: "国际化文本块（keyword\\0comp\\0method\\0lang\\0trans\\0text）", split: "itxt" },
      { id: "eXIf", kind: "chunk", label: "EXIF 元数据块", raw: true },
    ],
    checks: [{ id: "IHDR-CRC", kind: "chunk-crc", label: "逐块 CRC-32（覆盖 type+data）", spec: "ISO/IEC 15948 §5.3" }],
    repair: { kind: "chunk-crc" },
  },
  {
    id: "jpeg", name: "JPEG", spec: "ITU-T T.81",
    magic: [{ offset: 0, bytes: B(0xff, 0xd8, 0xff), label: "SOI + 首段标记" }],
    walk: "jpeg-segments",
    required: [
      { kind: "SOI", label: "图像起始 FFD8" },
      { kind: "SOFn", label: "帧头（含宽高，T.81 §B.2.2）" },
      { kind: "SOS", label: "扫描起始（含熵编码数据）" },
      { kind: "EOI", label: "图像结束 FFD9" },
    ],
    header: {
      at: { kind: "SOFn" },
      fields: [
        { name: "precision", type: "u8",  offset: 0, note: "样本精度（位）" },
        { name: "height",    type: "u16be", offset: 1, note: "行数 Y" },
        { name: "width",     type: "u16be", offset: 3, note: "每行样本数 X" },
        { name: "components", type: "u8", offset: 5, note: "分量数 Nf" },
      ],
    },
    sockets: [
      { id: "COM", kind: "segment", label: "注释段 FFFE（自由文本）", enc: "latin1", payloadAt: 0 },
      { id: "APP0", kind: "segment", label: "JFIF/APP0（含缩略图插座）", payloadAt: 14 },
      { id: "APP1", kind: "segment", label: "EXIF/XMP（含元数据插座）", raw: true },
      { id: "APPn", kind: "segment-any", label: "其余 APPn（FFE0–FFEF 全部载荷）", raw: true },
    ],
    checks: [
      { id: "SOI-EOI", kind: "marker-pair", label: "SOI(FFD8) 与 EOI(FFD9) 成对", spec: "ITU-T T.81 §B.2.1" },
      { id: "SEGLEN", kind: "segment-lengths", label: "段长度字段自洽（可走到 EOI）", spec: "ITU-T T.81 §B.1.1.4" },
    ],
    repair: null,
  },
  {
    id: "gif", name: "GIF", spec: "GIF89a 规范 / ISO/IEC 13660 前身",
    magic: [{ offset: 0, bytes: B(0x47, 0x49, 0x46, 0x38), label: "GIF87a/GIF89a 前缀" }],
    walk: "gif-blocks",
    required: [{ kind: "Header", label: "头 6 字节" }, { kind: "LSD", label: "逻辑屏幕描述符 7 字节" }, { kind: "Trailer", label: "结束符 0x3B" }],
    header: {
      at: { kind: "LSD" },
      fields: [
        { name: "width",  type: "u16le", offset: 0, note: "逻辑屏幕宽" },
        { name: "height", type: "u16le", offset: 2, note: "逻辑屏幕高" },
        { name: "packed", type: "u8",    offset: 4, note: "全局色表标志/色深/排序" },
        { name: "bgIndex", type: "u8",   offset: 5, note: "背景色索引" },
        { name: "aspect", type: "u8",    offset: 6, note: "像素宽高比" },
      ],
    },
    sockets: [
      { id: "COMMENT", kind: "gif-ext", label: "注释扩展 21 FE（子块串）", enc: "latin1" },
      { id: "PLAINTEXT", kind: "gif-ext", label: "无格式文本扩展 21 01", raw: true },
      { id: "APPLICATION", kind: "gif-ext", label: "应用扩展 21 FF（NETSCAPE 等）", raw: true },
    ],
    checks: [{ id: "TRAILER", kind: "trailer", label: "结束符 0x3B 存在（且位于末字节或尾随数据前）", spec: "GIF89a §17" }],
    repair: null,
  },
  {
    id: "bmp", name: "BMP", spec: "Microsoft 位图文件格式",
    magic: [{ offset: 0, bytes: B(0x42, 0x4d), label: "BM 签名" }],
    walk: "bmp-flat",
    required: [{ kind: "FILEHEADER", label: "BITMAPFILEHEADER 14 字节" }, { kind: "DIBHEADER", label: "BITMAPINFOHEADER/DIB 头" }, { kind: "PIXELS", label: "像素数据" }],
    header: {
      at: { kind: "FILEHEADER" },
      fields: [
        { name: "bfSize",    type: "u32le", offset: 2,  note: "文件总大小" },
        { name: "bfOffBits", type: "u32le", offset: 10, note: "像素数据偏移" },
      ],
      extra: {
        at: { kind: "DIBHEADER" },
        fields: [
          { name: "dibSize", type: "u32le", offset: 0, note: "DIB 头大小（40=INFOHEADER）" },
          { name: "width",   type: "i32le", offset: 4, note: "宽（负=自右向左，罕见）" },
          { name: "height",  type: "i32le", offset: 8, note: "高（负=自上而下）" },
          { name: "planes",  type: "u16le", offset: 12, note: "平面数（恒 1）" },
          { name: "bpp",     type: "u16le", offset: 14, note: "位深" },
          { name: "compression", type: "u32le", offset: 16, note: "0=BI_RGB 未压缩" },
        ],
      },
    },
    sockets: [
      { id: "TRAILING", kind: "tail", label: "像素数据之后的尾随字节（CTF 常在此追加隐藏数据）" },
      { id: "GAP", kind: "gap", label: "DIB 头与像素数据之间的空隙（另一处常见藏数据点）" },
    ],
    checks: [{ id: "BFSIZE", kind: "size-field", label: "bfSize 与实际文件长度一致", spec: "Microsoft 位图文件格式 §2.2" }],
    repair: { kind: "size-field", field: "bfSize" },
  },
  {
    id: "pdf", name: "PDF", spec: "ISO 32000-1 (PDF 1.7)",
    magic: [{ offset: 0, bytes: B(0x25, 0x50, 0x44, 0x46, 0x2d), label: "%PDF- 头" }],
    walk: "pdf-objects",
    required: [{ kind: "HEADER", label: "%PDF-n.m 头" }, { kind: "TRAILER", label: "trailer / startxref" }, { kind: "EOF", label: "%%EOF 结束标记" }],
    header: {
      at: { kind: "HEADER" },
      fields: [{ name: "version", type: "ascii", offset: 5, size: 3, note: "PDF 版本，如 1.7" }],
    },
    sockets: [
      { id: "STREAM", kind: "pdf-stream", label: "对象流 stream…endstream（对象流/内容流/附件）", raw: true },
      { id: "INFO", kind: "pdf-dict", label: "Info 字典字符串（Author/Title/Subject/Keywords）", enc: "latin1" },
      { id: "TRAILING", kind: "tail", label: "%%EOF 之后的尾随字节" },
    ],
    checks: [
      { id: "HEADER", kind: "has-marker", label: "文件头为 %PDF-", spec: "ISO 32000-1 §7.5.2" },
      { id: "EOF", kind: "has-marker", label: "含 %%EOF", spec: "ISO 32000-1 §7.5.5" },
    ],
    repair: null,
  },
  {
    id: "zip", name: "ZIP", spec: "PKWARE APPNOTE.TXT",
    magic: [{ offset: 0, bytes: B(0x50, 0x4b, 0x03, 0x04), label: "本地文件头 PK\\x03\\x04" },
            { offset: 0, bytes: B(0x50, 0x4b, 0x05, 0x06), label: "空归档 PK\\x05\\x06" }],
    walk: "zip-entries",
    required: [{ kind: "LFH", label: "本地文件头 PK\\x03\\x04" }, { kind: "CDH", label: "中央目录 PK\\x01\\x02" }, { kind: "EOCD", label: "中央目录结束 PK\\x05\\x06" }],
    header: {
      at: { kind: "EOCD" },
      fields: [
        { name: "entryCount",   type: "u16le", offset: 10, note: "本盘条目数" },
        { name: "cdSize",       type: "u32le", offset: 12, note: "中央目录大小" },
        { name: "cdOffset",     type: "u32le", offset: 16, note: "中央目录起始偏移" },
        { name: "commentLen",   type: "u16le", offset: 20, note: "归档注释长度" },
      ],
    },
    sockets: [
      { id: "ARCHIVE-COMMENT", kind: "zip-comment", label: "归档注释（EOCD 尾部，APPNOTE §4.3.16）" },
      { id: "ENTRY-COMMENT", kind: "zip-entry-comment", label: "条目注释（各中央目录条目尾部）" },
      { id: "EXTRA-FIELD", kind: "zip-extra", label: "扩展字段区 extra field（APPNOTE §4.5，含 ADS/时间戳等）" },
      { id: "TRAILING", kind: "tail", label: "EOCD 注释之后的尾随字节" },
    ],
    checks: [
      { id: "EOCD", kind: "has-marker", label: "EOCD 存在", spec: "APPNOTE §4.3.16" },
      { id: "CD-CONSISTENT", kind: "zip-cd-consistency", label: "EOCD 的条目数/目录大小/偏移与实测中央目录一致", spec: "APPNOTE §4.4.1" },
    ],
    repair: { kind: "zip-cd" },
  },
  {
    id: "rar", name: "RAR", spec: "RAR 技术说明（RAR4 / RAR5）",
    magic: [{ offset: 0, bytes: B(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00), label: "RAR4 签名 Rar!\\x1a\\x07\\x00", version: 4 },
            { offset: 0, bytes: B(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00), label: "RAR5 签名 Rar!\\x1a\\x07\\x01\\x00", version: 5 }],
    walk: "rar-headers",
    required: [{ kind: "MAIN", label: "主档头（MARK 头）" }],
    header: {
      at: { kind: "MARK" },
      fields: [
        { name: "signature", type: "hex", offset: 0, size: 8, note: "8 字节签名（区分 RAR4/RAR5）" },
        { name: "headerSize", type: "u16le", offset: 8, note: "RAR4 MARK 头长度（RAR5 见 vint 编码）" },
      ],
    },
    sockets: [
      { id: "ARCHIVE-COMMENT", kind: "rar-comment", label: "归档注释块（RAR4 CMT 主档头 / RAR5 注释头）" },
      { id: "EXTRA-AREA", kind: "rar-extra", label: "头尾 extra area（RAR5 扩展开销区）" },
      { id: "TRAILING", kind: "tail", label: "末头之后的尾随字节" },
    ],
    checks: [{ id: "SIGNATURE", kind: "has-marker", label: "RAR4/RAR5 签名之一命中", spec: "RAR 技术说明" }],
    repair: null,
  },
  {
    id: "wav", name: "WAV", spec: "Microsoft RIFF / WAVE 格式",
    magic: [{ offset: 0, bytes: B(0x52, 0x49, 0x46, 0x46), label: "RIFF 容器标记" }],
    walk: "riff-chunks",
    required: [{ kind: "RIFF", label: "RIFF 头" }, { kind: "fmt ", label: "fmt 块（音频格式）" }, { kind: "data", label: "data 块（采样数据）" }],
    header: {
      at: { kind: "RIFF" },
      fields: [
        { name: "riffSize", type: "u32le", offset: 4, note: "RIFF 块大小（= 文件长度 − 8）" },
        { name: "waveId",   type: "ascii", offset: 8, size: 4, note: "容器类型，应为 WAVE" },
      ],
      extra: {
        at: { kind: "fmt " },
        fields: [
          { name: "audioFormat", type: "u16le", offset: 0, note: "1=PCM 3=IEEE float …" },
          { name: "channels",    type: "u16le", offset: 2, note: "声道数" },
          { name: "sampleRate",  type: "u32le", offset: 4, note: "采样率 Hz" },
          { name: "byteRate",    type: "u32le", offset: 8, note: "字节率" },
          { name: "blockAlign",  type: "u16le", offset: 12, note: "块对齐" },
          { name: "bitsPerSample", type: "u16le", offset: 14, note: "位深" },
        ],
      },
    },
    sockets: [
      { id: "LIST", kind: "riff-chunk", label: "LIST/INFO 元数据块插座", raw: true },
      { id: "bext", kind: "riff-chunk", label: "广播扩展 bext（自由文本 + 时间码）", raw: true },
      { id: "EXTRA-CHUNKS", kind: "riff-any", label: "fmt/data 之外的其余块（CTF 常在此追加隐藏数据）", raw: true },
      { id: "TRAILING", kind: "tail", label: "RIFF 声明长度之后的尾随字节" },
    ],
    checks: [{ id: "RIFFSIZE", kind: "size-field", label: "riffSize 与实际文件长度一致（riffSize = len − 8）", spec: "Microsoft RIFF 规范 §2" }],
    repair: { kind: "size-field-minus8", field: "riffSize" },
  },
];

export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f]));

// ============================================================
// identify：魔数 → 格式
// ============================================================
export function identify(bytes) {
  const u8 = toU8(bytes);
  for (const f of FORMATS) {
    for (const m of f.magic) {
      if (u8.length >= m.offset + m.bytes.length && eq(u8, m.offset, m.bytes)) {
        return { id: f.id, name: f.name, spec: f.spec, magicOffset: m.offset, magicLabel: m.label, magicBytes: hex(m.bytes, " ") };
      }
    }
  }
  return null;
}

function toU8(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (Array.isArray(x)) return Uint8Array.from(x);
  if (typeof x === "string") {
    const s = x.replace(/\s+/g, "");
    if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
      const o = new Uint8Array(s.length / 2);
      for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16);
      return o;
    }
    return Uint8Array.from(Buffer.from(s, "base64"));
  }
  throw new Error("不支持的输入类型（需 Uint8Array / hex / base64 字符串）");
}

// ============================================================
// 容器遍历器（表项 walk 字段指向这里的一个 key；加格式只加表项，不动此处）
// ============================================================
const WALKERS = {
  // PNG：chunk = len(4,BE)+type(4)+data+crc(4)，CRC 覆盖 type+data
  "png-chunks"(u8) {
    const blocks = [], errors = [];
    let off = 8;
    while (off + 12 <= u8.length) {
      const len = FIELD_TYPES.u32be.read(u8, off);
      const type = latin1(u8.subarray(off + 4, off + 8));
      const dataOff = off + 8;
      if (dataOff + len + 4 > u8.length) { errors.push({ at: off, msg: `块 ${type} 声明长度 ${len} 超出文件尾部` }); break; }
      const crcOff = dataOff + len;
      const crcStored = FIELD_TYPES.u32be.read(u8, crcOff);
      const crcCalc = crc32(u8.subarray(off + 4, dataOff + len));
      blocks.push({ kind: type, offset: off, len, dataOff, dataLen: len, crcOff, crcStored, crcCalc, crcOk: crcStored === crcCalc });
      off = crcOff + 4;
      if (type === "IEND") break;
    }
    return { blocks, tail: { offset: off, len: Math.max(0, u8.length - off) }, errors };
  },

  // RIFF（WAV）：chunk = id(4)+len(4,LE)+data（奇数长度补 1 字节对齐）
  "riff-chunks"(u8) {
    const blocks = [], errors = [];
    if (!eq(u8, 0, B(0x52, 0x49, 0x46, 0x46))) { errors.push({ at: 0, msg: "缺 RIFF 标记" }); return { blocks, tail: { offset: 0, len: u8.length }, errors }; }
    const riffSize = FIELD_TYPES.u32le.read(u8, 4);
    // dataOff 取 0（RIFF 头整体起点），使表里字段偏移按文件起点书写（riffSize@4 / waveId@8）
    blocks.push({ kind: "RIFF", offset: 0, len: riffSize + 8, dataOff: 0, dataLen: riffSize + 8 });
    let off = 12;
    const declEnd = Math.min(u8.length, 8 + riffSize);
    while (off + 8 <= declEnd) {
      const id = latin1(u8.subarray(off, off + 4));
      const len = FIELD_TYPES.u32le.read(u8, off + 4);
      const dataOff = off + 8;
      if (dataOff + len > u8.length) { errors.push({ at: off, msg: `块 ${id} 声明长度 ${len} 超出文件尾部` }); break; }
      blocks.push({ kind: id, offset: off, len, dataOff, dataLen: len });
      off = dataOff + len + (len & 1);
    }
    return { blocks, tail: { offset: Math.max(off, declEnd), len: Math.max(0, u8.length - Math.max(off, declEnd)) }, errors, riffSize };
  },

  // JPEG：FFD8 + 段序列；FFDA(SOS) 之后是熵编码数据，走到 FFD9
  "jpeg-segments"(u8) {
    const blocks = [], errors = [];
    if (!eq(u8, 0, B(0xff, 0xd8))) { errors.push({ at: 0, msg: "缺 SOI(FFD8)" }); return { blocks, tail: { offset: 0, len: u8.length }, errors }; }
    blocks.push({ kind: "SOI", offset: 0, len: 2, dataOff: 2, dataLen: 0 });
    let off = 2;
    while (off + 2 <= u8.length) {
      if (u8[off] !== 0xff) { errors.push({ at: off, msg: "期望段标记 0xFF，此处不是（段长与实际不符）" }); break; }
      const mark = u8[off + 1];
      if (mark === 0xd9) { blocks.push({ kind: "EOI", offset: off, len: 2, dataOff: off + 2, dataLen: 0 }); off += 2; break; }
      if (mark >= 0xd0 && mark <= 0xd7) { blocks.push({ kind: `RST${mark - 0xd0}`, offset: off, len: 2, dataOff: off + 2, dataLen: 0 }); off += 2; continue; }
      if (off + 4 > u8.length) { errors.push({ at: off, msg: "段标记后不足 2 字节长度字段" }); break; }
      const segLen = FIELD_TYPES.u16be.read(u8, off + 2);
      if (segLen < 2) { errors.push({ at: off, msg: `段长 ${segLen} 非法（须 ≥2）` }); break; }
      const dataOff = off + 4, dataLen = segLen - 2;
      const isSOF = (mark >= 0xc0 && mark <= 0xcf) && mark !== 0xc4 && mark !== 0xc8 && mark !== 0xcc;
      const kind = mark === 0xda ? "SOS" : mark === 0xfe ? "COM" : (mark >= 0xe0 && mark <= 0xef) ? `APP${mark - 0xe0}` : isSOF ? "SOFn" : `M${mark.toString(16)}`;
      blocks.push({ kind, marker: mark, offset: off, len: segLen + 2, dataOff, dataLen });
      if (dataOff + dataLen > u8.length) { errors.push({ at: off, msg: `段 ${kind} 声明长度 ${segLen} 超出文件尾部` }); break; }
      off = dataOff + dataLen;
      if (mark === 0xda) {  // SOS 之后：扫描熵数据直到 FFD9
        let i = off;
        while (i + 1 < u8.length && !(u8[i] === 0xff && u8[i + 1] === 0xd9)) i++;
        blocks.push({ kind: "SCAN-DATA", offset: off, len: i - off, dataOff: off, dataLen: i - off });
        off = i;
      }
    }
    return { blocks, tail: { offset: off, len: Math.max(0, u8.length - off) }, errors };
  },

  // GIF：Header(6)+LSD(7)+[GCT]+块流（0x2C 图像 / 0x21 扩展 / 0x3B 结束）
  "gif-blocks"(u8) {
    const blocks = [], errors = [];
    if (u8.length < 13) { errors.push({ at: 0, msg: "长度不足 13 字节（Header 6 + LSD 7）" }); return { blocks, tail: { offset: 0, len: u8.length }, errors }; }
    blocks.push({ kind: "Header", offset: 0, len: 6, dataOff: 0, dataLen: 6 });
    blocks.push({ kind: "LSD", offset: 6, len: 7, dataOff: 6, dataLen: 7 });
    const packed = u8[10];
    let off = 13;
    if (packed & 0x80) off += 3 * (1 << ((packed & 0x07) + 1)); // 全局色表
    while (off < u8.length) {
      const intro = u8[off];
      if (intro === 0x3b) { blocks.push({ kind: "Trailer", offset: off, len: 1, dataOff: off + 1, dataLen: 0 }); off += 1; break; }
      if (intro === 0x21) {
        const label = u8[off + 1];
        const name = label === 0xfe ? "COMMENT" : label === 0x01 ? "PLAINTEXT" : label === 0xff ? "APPLICATION" : `EXT${label.toString(16)}`;
        const s = off + 2;
        const sub = [];
        let p = s;
        while (p < u8.length && u8[p] !== 0) { const n = u8[p]; sub.push({ off: p + 1, len: n }); p += 1 + n; }
        const end = Math.min(u8.length, p + 1);
        blocks.push({ kind: name, offset: off, len: end - off, dataOff: s, dataLen: end - s, subBlocks: sub });
        off = end; continue;
      }
      if (intro === 0x2c) {
        const lpacked = u8[off + 9];
        let p = off + 10;
        if (lpacked & 0x80) p += 3 * (1 << ((lpacked & 0x07) + 1));
        p += 1; // LZW 最小码长
        while (p < u8.length && u8[p] !== 0) { const n = u8[p]; p += 1 + n; }
        const end = Math.min(u8.length, p + 1);
        blocks.push({ kind: "ImageBlock", offset: off, len: end - off, dataOff: off + 10, dataLen: end - (off + 10) });
        off = end; continue;
      }
      errors.push({ at: off, msg: `未知块引导字节 0x${intro.toString(16)}` });
      break;
    }
    return { blocks, tail: { offset: off, len: Math.max(0, u8.length - off) }, errors };
  },

  // BMP：平面结构（文件头 → DIB 头 → 空隙 → 像素 → 尾随）
  "bmp-flat"(u8) {
    const blocks = [], errors = [];
    const patches = [];
    if (u8.length < 14) { errors.push({ at: 0, msg: "长度不足 14 字节（BITMAPFILEHEADER）" }); return { blocks, tail: { offset: 0, len: u8.length }, errors, patches }; }
    const bfSize = FIELD_TYPES.u32le.read(u8, 2);
    const bfOffBits = FIELD_TYPES.u32le.read(u8, 10);
    const dibSize = u8.length >= 18 ? FIELD_TYPES.u32le.read(u8, 14) : 0;
    blocks.push({ kind: "FILEHEADER", offset: 0, len: 14, dataOff: 0, dataLen: 14, bfSize, bfOffBits });
    if (dibSize >= 4 && 14 + dibSize <= u8.length) blocks.push({ kind: "DIBHEADER", offset: 14, len: dibSize, dataOff: 14, dataLen: dibSize });
    else { errors.push({ at: 14, msg: `DIB 头大小 ${dibSize} 非法或超出文件` }); }
    const pixStart = Math.min(bfOffBits, u8.length);
    const dibEnd = 14 + dibSize;
    if (pixStart > dibEnd) blocks.push({ kind: "GAP", offset: dibEnd, len: pixStart - dibEnd, dataOff: dibEnd, dataLen: pixStart - dibEnd });
    // 像素数据长度 = bfSize − bfOffBits（bfSize 为 0 时用文件长度兜底）
    const declared = bfSize > bfOffBits ? bfSize - bfOffBits : (u8.length - pixStart);
    const pixLen = Math.min(declared, Math.max(0, u8.length - pixStart));
    if (pixStart < u8.length) blocks.push({ kind: "PIXELS", offset: pixStart, len: pixLen, dataOff: pixStart, dataLen: pixLen });
    const tailOff = pixStart + pixLen;
    return { blocks, tail: { offset: tailOff, len: Math.max(0, u8.length - tailOff) }, errors, bfSize };
  },

  // PDF：扫描间接对象与流（正则驱动，尽力而为）
  "pdf-objects"(u8) {
    const blocks = [], errors = [];
    const s = latin1(u8);
    blocks.push({ kind: "HEADER", offset: 0, len: 8, dataOff: 0, dataLen: 8 });
    const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = objRe.exec(s)) !== null) {
      const start = m.index;
      const endIdx = s.indexOf("endobj", start);
      const end = endIdx < 0 ? s.length : endIdx + 6;
      const chunk = s.slice(start, end);
      const streamIdx = chunk.indexOf("stream");
      let stream = null;
      if (streamIdx >= 0) {
        let so = streamIdx + 6;
        if (chunk[so] === "\r" && chunk[so + 1] === "\n") so += 2; else if (chunk[so] === "\n" || chunk[so] === "\r") so += 1;
        const se = chunk.lastIndexOf("endstream");
        if (se > so) stream = { off: start + so, len: se - so };
      }
      blocks.push({ kind: "OBJ", offset: start, len: end - start, dataOff: start, dataLen: end - start, objNum: +m[1], gen: +m[2], stream });
    }
    const tIdx = s.search(/\btrailer\b|startxref/);
    if (tIdx >= 0) blocks.push({ kind: "Trailer", offset: tIdx, len: 0, dataOff: tIdx, dataLen: 0 });
    const eof = s.lastIndexOf("%%EOF");
    if (eof >= 0) blocks.push({ kind: "EOF", offset: eof, len: 5, dataOff: eof, dataLen: 5 });
    else errors.push({ at: u8.length, msg: "未找到 %%EOF" });
    const tailOff = eof >= 0 ? eof + 5 : u8.length;
    return { blocks, tail: { offset: tailOff, len: Math.max(0, u8.length - tailOff) }, errors };
  },

  // ZIP：LFH / CDH / EOCD（EOCD 从尾部反向定位）
  "zip-entries"(u8) {
    const blocks = [], errors = [];
    // EOCD（PK\x05\x06）从尾部反向找
    let eocdOff = -1;
    for (let i = u8.length - 22; i >= 0 && i >= u8.length - 22 - 65535; i--) {
      if (eq(u8, i, B(0x50, 0x4b, 0x05, 0x06))) { eocdOff = i; break; }
    }
    const cdhs = [];
    for (let i = 0; i + 46 <= u8.length; i++) if (eq(u8, i, B(0x50, 0x4b, 0x01, 0x02))) cdhs.push(i);
    const lfhs = [];
    for (let i = 0; i + 30 <= u8.length; i++) if (eq(u8, i, B(0x50, 0x4b, 0x03, 0x04))) lfhs.push(i);
    // CDH 用长度串行遍历（避免数据区里巧合字节被误判）
    const cds = [];
    if (cdhs.length) {
      let off = cdhs[0];
      while (off + 46 <= u8.length && eq(u8, off, B(0x50, 0x4b, 0x01, 0x02))) {
        const nameLen = FIELD_TYPES.u16le.read(u8, off + 28);
        const extraLen = FIELD_TYPES.u16le.read(u8, off + 30);
        const cmtLen = FIELD_TYPES.u16le.read(u8, off + 32);
        const total = 46 + nameLen + extraLen + cmtLen;
        cds.push({ kind: "CDH", offset: off, len: total, dataOff: off + 46, dataLen: nameLen,
          name: latin1(u8.subarray(off + 46, off + 46 + nameLen)),
          extraOff: off + 46 + nameLen, extraLen, commentOff: off + 46 + nameLen + extraLen, commentLen: cmtLen,
          crcStored: FIELD_TYPES.u32le.read(u8, off + 16), localOff: FIELD_TYPES.u32le.read(u8, off + 42) });
        off += total;
      }
    }
    for (const o of lfhs.slice(0, 64)) {
      const nameLen = FIELD_TYPES.u16le.read(u8, o + 26);
      const extraLen = FIELD_TYPES.u16le.read(u8, o + 28);
      blocks.push({ kind: "LFH", offset: o, len: 30 + nameLen + extraLen, dataOff: o + 30, dataLen: nameLen,
        name: latin1(u8.subarray(o + 30, o + 30 + nameLen)), extraLen });
    }
    blocks.push(...cds);
    let eocd = null;
    if (eocdOff >= 0) {
      const commentLen = FIELD_TYPES.u16le.read(u8, eocdOff + 20);
      eocd = {
        kind: "EOCD", offset: eocdOff, len: 22 + commentLen, dataOff: eocdOff, dataLen: 22,
        entryCount: FIELD_TYPES.u16le.read(u8, eocdOff + 10),
        cdSize: FIELD_TYPES.u32le.read(u8, eocdOff + 12),
        cdOffset: FIELD_TYPES.u32le.read(u8, eocdOff + 16),
        commentLen, commentOff: eocdOff + 22,
      };
      blocks.push(eocd);
    } else errors.push({ at: u8.length, msg: "未找到 EOCD(PK\\x05\\x06)" });
    const tailOff = eocd ? eocd.offset + eocd.len : u8.length;
    return { blocks, tail: { offset: tailOff, len: Math.max(0, u8.length - tailOff) }, errors, eocd, cds, lfhCount: lfhs.length };
  },

  // RAR：签名 + 头串行遍历（RAR4 头有 HEAD_SIZE/HEAD_CRC；RAR5 用 vint）
  "rar-headers"(u8) {
    const blocks = [], errors = [];
    const v4 = eq(u8, 0, B(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00));
    const v5 = eq(u8, 0, B(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00));
    if (!v4 && !v5) { errors.push({ at: 0, msg: "非 RAR4 / RAR5 签名" }); return { blocks, tail: { offset: 0, len: u8.length }, errors, version: null }; }
    blocks.push({ kind: "MARK", offset: 0, len: v5 ? 8 : 7, dataOff: 0, dataLen: v5 ? 8 : 7, version: v5 ? 5 : 4 });
    let off = v5 ? 8 : 7;
    if (v4) {
      while (off + 7 <= u8.length) {
        const headCrc = FIELD_TYPES.u16le.read(u8, off);
        const headType = u8[off + 2];
        const headFlags = FIELD_TYPES.u16le.read(u8, off + 3);
        const headSize = FIELD_TYPES.u16le.read(u8, off + 5);
        if (headSize < 7 || off + headSize > u8.length) { errors.push({ at: off, msg: `头长度 ${headSize} 非法或超出文件` }); break; }
        blocks.push({ kind: `RAR4H${headType.toString(16)}`, offset: off, len: headSize, dataOff: off, dataLen: headSize, headCrc, headType, headFlags });
        if (headType === 0x7b) { off += headSize; break; } // ENDARC_HEAD（结束头），走过它再收尾
        const addSize = headFlags & 0x8000 ? FIELD_TYPES.u32le.read(u8, off + 7) : 0;
        off += headSize + addSize;
      }
    } else {
      // RAR5：头 = HEAD_CRC(4) + HEAD_SIZE(vint) + HEAD_TYPE(vint) + HEAD_FLAGS(vint) + …
      const readVint = (p) => { let v = 0, shift = 0, n = 0; for (;;) { const b = u8[p + n]; v |= (b & 0x7f) << shift; shift += 7; n++; if (!(b & 0x80)) break; } return { v: v >>> 0, n }; };
      while (off + 5 <= u8.length) {
        const crc = FIELD_TYPES.u32le.read(u8, off);
        const hs = readVint(off + 4);
        const ht = readVint(off + 4 + hs.n);
        const total = 4 + hs.v;
        if (hs.v < 4 || off + total > u8.length) { errors.push({ at: off, msg: `RAR5 头长度 ${hs.v} 非法或超出文件` }); break; }
        blocks.push({ kind: `RAR5H${ht.v}`, offset: off, len: total, dataOff: off, dataLen: total, headCrc: crc, headType: ht.v });
        off += total;
      }
    }
    return { blocks, tail: { offset: off, len: Math.max(0, u8.length - off) }, errors, version: v5 ? 5 : 4 };
  },
};

// ============================================================
// walk：按表遍历
// ============================================================
export function walk(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  if (!id) return { id: null, blocks: [], tail: { offset: 0, len: u8.length }, errors: [{ at: 0, msg: "魔数不匹配任何已声明格式" }] };
  const fn = WALKERS[FORMAT_BY_ID[id.id].walk];
  return { id: id.id, name: id.name, spec: id.spec, ...fn(u8) };
}

// ============================================================
// readFields：按表读「结构字段」
// ============================================================
export function readFields(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  if (!id) return [];
  const fmt = FORMAT_BY_ID[id.id];
  const w = WALKERS[fmt.walk](u8);
  const out = [];
  const groups = [fmt.header, fmt.header && fmt.header.extra].filter(Boolean);
  for (const g of groups) {
    if (!g || !g.at) continue;
    let block = w.blocks.find((b) => b.kind === g.at.kind);
    // JPEG 的 SOFn 在表里是通配名；SUFFIX 匹配兜底
    if (!block && g.at.kind === "SOFn") block = w.blocks.find((b) => /^SOFn$|^M(c[0-9a-f])$/.test(b.kind));
    if (!block && g.at.prefix) block = w.blocks.find((b) => String(b.kind).startsWith(g.at.prefix));
    if (!block) continue;
    for (const f of g.fields) {
      const t = FIELD_TYPES[f.type];
      if (!t) continue;
      const at = block.dataOff + f.offset;
      const size = f.size != null ? f.size : t.size;
      if (at + size > u8.length) continue;
      const value = t.read(u8, at, size);
      out.push({ fmt: fmt.id, block: block.kind, name: f.name, type: f.type, offset: at, size, value, text: typeof value === "string" ? value : undefined, note: f.note });
    }
  }
  return out;
}

// ============================================================
// missing：按表报「缺什么」（修复向导的依据）
// ============================================================
export function missing(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  if (!id) {
    // 魔数全错时，给出「可能想要的格式」：按前 4 字节相似度排序
    const guess = FORMATS.map((f) => {
      const m = f.magic[0].bytes;
      let same = 0;
      for (let i = 0; i < Math.min(m.length, u8.length); i++) if (u8[i] === m[i]) same++;
      return { id: f.id, name: f.name, same };
    }).filter((g) => g.same > 0).sort((a, b) => b.same - a.same);
    return { id: null, missing: [{ kind: "MAGIC", label: "魔数（无法识别任何已声明格式）", note: guess.length ? `前几字节最接近：${guess.slice(0, 3).map((g) => `${g.name}(相符 ${g.same} 字节)`).join(" / ")}` : "与任何声明格式均无字节相符" }] };
  }
  const fmt = FORMAT_BY_ID[id.id];
  const w = WALKERS[fmt.walk](u8);
  const present = new Set(w.blocks.map((b) => b.kind));
  const miss = [];
  for (const r of fmt.required) {
    let ok = present.has(r.kind);
    if (!ok && r.kind === "SOFn") ok = w.blocks.some((b) => /^SOFn$/.test(b.kind));
    if (!ok && r.kind === "Trailer") ok = w.blocks.some((b) => b.kind === "Trailer");
    if (!ok && r.kind === "EOF") ok = w.blocks.some((b) => b.kind === "EOF");
    if (!ok && r.kind === "MAIN") ok = w.blocks.some((b) => String(b.kind).startsWith("MARK"));
    if (!ok && r.kind === "MARK") ok = w.blocks.some((b) => String(b.kind).startsWith("MARK"));
    if (!ok && r.kind === "CDH") ok = w.cds && w.cds.length > 0;
    if (!ok && r.kind === "LFH") ok = (w.lfhCount || 0) > 0;
    if (!ok && r.kind === "data") ok = present.has("data");
    if (!ok) miss.push({ kind: r.kind, label: r.label, note: "未在文件中找到该块/标记" });
  }
  for (const e of w.errors) miss.push({ kind: e.msg.includes("超出文件尾部") ? "TRUNCATED" : "PARSE", label: `@偏移 ${e.at}：${e.msg}`, note: "结构性错误" });
  return { id: fmt.id, name: fmt.name, missing: miss };
}

// ============================================================
// sockets：按表提取「嵌入数据插座」
// ============================================================
export function sockets(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  if (!id) return [];
  const fmt = FORMAT_BY_ID[id.id];
  const w = WALKERS[fmt.walk](u8);
  const out = [];
  const push = (o) => out.push(o);

  for (const s of fmt.sockets) {
    if (s.kind === "chunk") {
      for (const b of w.blocks.filter((b) => b.kind === s.id)) {
        const data = u8.subarray(b.dataOff, b.dataOff + b.dataLen);
        if (s.split === "itxt") {
          const parts = splitNul(data, 5);
          push({ id: s.id, kind: "chunk", label: s.label, offset: b.dataOff, len: b.dataLen,
            text: parts[5] == null ? "" : latin1(parts[5]), fields: { keyword: latin1(parts[0] || []), compFlag: parts[1] ? parts[1][0] : null, lang: latin1(parts[3] || []) }, note: "国际化文本块（本层不做 inflate，仅定位并交回原文节）" });
        } else if (s.split === "nul") {
          const z = data.indexOf(0);
          const kw = z < 0 ? data : data.subarray(0, z);
          const rest = z < 0 ? new Uint8Array(0) : data.subarray(z + 1);
          push({ id: s.id, kind: "chunk", label: s.label, offset: b.dataOff, len: b.dataLen,
            text: s.enc ? latin1(rest) : undefined, bytes: s.enc ? undefined : rest,
            fields: { keyword: latin1(kw) }, note: s.rhs === "zlib" ? "压缩文本块：后半为 zlib 流（本层只定位，解压交回上层）" : "未压缩文本块" });
        } else {
          push({ id: s.id, kind: "chunk", label: s.label, offset: b.dataOff, len: b.dataLen, bytes: data });
        }
      }
    } else if (s.kind === "segment") {
      for (const b of w.blocks.filter((b) => b.kind === s.id)) {
        const from = b.dataOff + (s.payloadAt || 0);
        push({ id: s.id, kind: "segment", label: s.label, offset: from, len: Math.max(0, b.dataLen - (s.payloadAt || 0)),
          text: s.enc ? latin1(u8.subarray(from, from + Math.max(0, b.dataLen - (s.payloadAt || 0)))) : undefined,
          bytes: s.enc ? undefined : u8.subarray(from, from + Math.max(0, b.dataLen - (s.payloadAt || 0))) });
      }
    } else if (s.kind === "segment-any") {
      for (const b of w.blocks.filter((b) => /^APP/.test(b.kind) && b.kind !== "APP0" && b.kind !== "APP1")) {
        push({ id: b.kind, kind: "segment", label: `${b.kind} 载荷（${b.dataLen} 字节）`, offset: b.dataOff, len: b.dataLen, bytes: u8.subarray(b.dataOff, b.dataOff + b.dataLen) });
      }
    } else if (s.kind === "gif-ext") {
      for (const b of w.blocks.filter((b) => b.kind === s.id)) {
        const sub = b.subBlocks || [];
        const raw = new Uint8Array(sub.reduce((a, x) => a + x.len, 0));
        let p = 0;
        for (const x of sub) { raw.set(u8.subarray(x.off, x.off + x.len), p); p += x.len; }
        push({ id: s.id, kind: "gif-ext", label: s.label, offset: b.dataOff, len: b.dataLen,
          text: s.enc ? latin1(raw) : undefined, bytes: s.enc ? undefined : raw, note: `子块串 ${sub.length} 段` });
      }
    } else if (s.kind === "tail") {
      if (w.tail.len > 0) push({ id: s.id, kind: "tail", label: s.label, offset: w.tail.offset, len: w.tail.len, bytes: u8.subarray(w.tail.offset, w.tail.offset + w.tail.len) });
    } else if (s.kind === "gap") {
      for (const b of w.blocks.filter((b) => b.kind === "GAP")) push({ id: s.id, kind: "gap", label: s.label, offset: b.dataOff, len: b.dataLen, bytes: u8.subarray(b.dataOff, b.dataOff + b.dataLen) });
    } else if (s.kind === "pdf-stream") {
      for (const b of w.blocks.filter((b) => b.kind === "OBJ" && b.stream)) {
        push({ id: s.id, kind: "pdf-stream", label: `对象 ${b.objNum} ${b.gen} 的流`, offset: b.stream.off, len: b.stream.len, bytes: u8.subarray(b.stream.off, b.stream.off + b.stream.len) });
      }
    } else if (s.kind === "pdf-dict") {
      const sText = latin1(u8);
      const re = /\/(Author|Title|Subject|Keywords|Creator|Producer)\s*\(([^)]{0,200})\)/g;
      let m;
      while ((m = re.exec(sText)) !== null) push({ id: "INFO", kind: "pdf-dict", label: `Info: ${m[1]}`, offset: m.index, len: m[0].length, text: m[2] });
    } else if (s.kind === "zip-comment") {
      const e = w.eocd;
      if (e && e.commentLen > 0) push({ id: "ARCHIVE-COMMENT", kind: "zip-comment", label: s.label, offset: e.commentOff, len: e.commentLen, bytes: u8.subarray(e.commentOff, e.commentOff + e.commentLen), text: latin1(u8.subarray(e.commentOff, e.commentOff + e.commentLen)) });
    } else if (s.kind === "zip-entry-comment") {
      for (const c of (w.cds || [])) if (c.commentLen > 0) push({ id: "ENTRY-COMMENT", kind: "zip-entry-comment", label: `${c.name} 的条目注释`, offset: c.commentOff, len: c.commentLen, bytes: u8.subarray(c.commentOff, c.commentOff + c.commentLen), text: latin1(u8.subarray(c.commentOff, c.commentOff + c.commentLen)) });
    } else if (s.kind === "zip-extra") {
      for (const c of (w.cds || [])) if (c.extraLen > 0) push({ id: "EXTRA-FIELD", kind: "zip-extra", label: `${c.name} 的 extra field`, offset: c.extraOff, len: c.extraLen, bytes: u8.subarray(c.extraOff, c.extraOff + c.extraLen) });
    } else if (s.kind === "rar-comment") {
      const cmtBlocks = w.blocks.filter((b) => b.headType === 0x75 || b.headType === 3);
      for (const b of cmtBlocks) push({ id: "ARCHIVE-COMMENT", kind: "rar-comment", label: "归档注释头（载荷为注释文本，需按 RAR 规范解 vint 长度）", offset: b.dataOff, len: b.dataLen, bytes: u8.subarray(b.dataOff, b.dataOff + b.dataLen) });
    } else if (s.kind === "rar-extra") {
      for (const b of w.blocks.filter((b) => /RAR5H/.test(b.kind))) push({ id: "EXTRA-AREA", kind: "rar-extra", label: `RAR5 头 0x${(b.headType || 0).toString(16)} 的整体字节（含 extra area）`, offset: b.dataOff, len: b.dataLen, bytes: u8.subarray(b.dataOff, b.dataOff + b.dataLen) });
    } else if (s.kind === "riff-chunk") {
      for (const b of w.blocks.filter((b) => b.kind === s.id)) push({ id: s.id, kind: "riff-chunk", label: s.label, offset: b.dataOff, len: b.dataLen, bytes: u8.subarray(b.dataOff, b.dataOff + b.dataLen) });
    } else if (s.kind === "riff-any") {
      const known = new Set(["RIFF", "fmt ", "data", "LIST", "bext"]);
      for (const b of w.blocks.filter((b) => !known.has(b.kind))) push({ id: b.kind.trim() || b.kind, kind: "riff-chunk", label: `附加块 ${b.kind}`, offset: b.dataOff, len: b.dataLen, bytes: u8.subarray(b.dataOff, b.dataOff + b.dataLen) });
    }
  }
  return out;
}

function splitNul(u8, max) {
  const parts = [];
  let start = 0;
  for (let i = 0; i <= u8.length && parts.length < max; i++) {
    if (i === u8.length || u8[i] === 0) { parts.push(u8.subarray(start, i)); start = i + 1; }
  }
  return parts;
}

// ============================================================
// verify：按表重算校验
// ============================================================
export function verify(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  if (!id) return { id: null, checks: [{ id: "MAGIC", label: "魔数识别", ok: false, detail: "不匹配任何已声明格式" }] };
  const fmt = FORMAT_BY_ID[id.id];
  const w = WALKERS[fmt.walk](u8);
  const checks = [];

  for (const c of fmt.checks) {
    if (c.kind === "chunk-crc") {
      const bad = w.blocks.filter((b) => b.crcOk === false);
      checks.push({ id: c.id, label: c.label, ok: bad.length === 0, spec: c.spec,
        detail: bad.length === 0 ? `${w.blocks.length} 个块 CRC 全部通过` : `${bad.length} 个块 CRC 不符：${bad.map((b) => b.kind).join(",")}` });
    } else if (c.kind === "marker-pair") {
      const so = w.blocks.some((b) => b.kind === "SOI"), eo = w.blocks.some((b) => b.kind === "EOI");
      checks.push({ id: c.id, label: c.label, ok: so && eo, spec: c.spec, detail: `SOI=${so ? "有" : "缺"} EOI=${eo ? "有" : "缺"}` });
    } else if (c.kind === "segment-lengths") {
      const lenErrs = w.errors.filter((e) => /段长|段 .* 声明长度|期望段标记/.test(e.msg));
      checks.push({ id: c.id, label: c.label, ok: lenErrs.length === 0, spec: c.spec, detail: lenErrs.length === 0 ? "段长串行自洽（可走到 EOI）" : lenErrs.map((e) => e.msg).join("；") });
    } else if (c.kind === "trailer") {
      const ok = w.blocks.some((b) => b.kind === "Trailer");
      checks.push({ id: c.id, label: c.label, ok, spec: c.spec, detail: ok ? "0x3B 存在" : "缺 0x3B（文件被截断）" });
    } else if (c.kind === "size-field") {
      // BMP 的 bfSize 直接等于文件长度；RIFF 的 riffSize = 文件长度 − 8（RIFF 规范 §2）
      const declared = fmt.id === "bmp" ? w.bfSize : FIELD_TYPES.u32le.read(u8, 4);
      const want = fmt.id === "bmp" ? u8.length : u8.length - 8;
      const ok = declared === want;
      checks.push({ id: c.id, label: c.label, ok, spec: c.spec, detail: `声明 ${declared} / 应为 ${want}（实际文件 ${u8.length}）${ok ? "" : " ← 不一致（宽高或大小被篡改 / 文件被追加）"}` });
    } else if (c.kind === "has-marker") {
      let ok = false, detail = "";
      if (fmt.id === "pdf") ok = latin1(u8.subarray(0, 5)) === "%PDF-" && latin1(u8).includes("%%EOF");
      if (fmt.id === "zip") ok = w.eocd != null;
      if (fmt.id === "rar") ok = w.version != null;
      detail = ok ? "命中" : "未命中";
      checks.push({ id: c.id, label: c.label, ok, spec: c.spec, detail });
    } else if (c.kind === "zip-cd-consistency") {
      const e = w.eocd;
      if (!e) { checks.push({ id: c.id, label: c.label, ok: false, spec: c.spec, detail: "无 EOCD，无法核对" }); }
      else {
        const actualSize = e.offset - e.cdOffset;
        const okCount = e.entryCount === (w.cds || []).length;
        const okSize = actualSize === e.cdSize;
        checks.push({ id: c.id, label: c.label, ok: okCount && okSize, spec: c.spec,
          detail: `条目数 声明${e.entryCount}/实测${(w.cds || []).length}（${okCount ? "符" : "不符"}）；目录大小 声明${e.cdSize}/实测${actualSize}（${okSize ? "符" : "不符"}）` });
      }
    }
  }
  return { id: fmt.id, name: fmt.name, checks };
}

// ============================================================
// repair：按表重写校验（并在修复后自证通过）
// ============================================================
export function repair(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  if (!id) throw new Error("魔数不匹配任何已声明格式，无法按表修复");
  const fmt = FORMAT_BY_ID[id.id];
  if (!fmt.repair) throw new Error(`${fmt.name} 未声明可修复项（本层的修复规则来自表项 repair 字段）`);
  const out = Uint8Array.from(u8);
  const fixes = [];
  const r = fmt.repair;

  if (r.kind === "chunk-crc") {
    const w = WALKERS["png-chunks"](u8);
    for (const b of w.blocks) {
      if (b.crcStored === b.crcCalc) continue;
      const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
      dv.setUint32(b.crcOff, b.crcCalc);
      fixes.push({ what: `${b.kind} 块 CRC-32`, was: b.crcStored.toString(16).padStart(8, "0"), now: b.crcCalc.toString(16).padStart(8, "0"), at: b.crcOff });
    }
  } else if (r.kind === "size-field") {
    const w = WALKERS["bmp-flat"](u8);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const now = out.length;
    if (w.bfSize !== now) { dv.setUint32(2, now, true); fixes.push({ what: "bfSize", was: String(w.bfSize), now: String(now), at: 2 }); }
  } else if (r.kind === "size-field-minus8") {
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const was = FIELD_TYPES.u32le.read(u8, 4);
    const now = out.length - 8;
    if (was !== now) { dv.setUint32(4, now, true); fixes.push({ what: "riffSize", was: String(was), now: String(now), at: 4 }); }
  } else if (r.kind === "zip-cd") {
    const w = WALKERS["zip-entries"](u8);
    const e = w.eocd;
    if (!e) throw new Error("无 EOCD，超出本层修复能力（需重建中央目录，属另一层）");
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const cdhs = (w.cds || []).length;
    const actualSize = e.offset - e.cdOffset;
    if (e.entryCount !== cdhs) { dv.setUint16(e.offset + 10, cdhs, true); fixes.push({ what: "EOCD 条目数", was: String(e.entryCount), now: String(cdhs), at: e.offset + 10 }); }
    if (e.cdSize !== actualSize) { dv.setUint32(e.offset + 12, actualSize, true); fixes.push({ what: "EOCD 中央目录大小", was: String(e.cdSize), now: String(actualSize), at: e.offset + 12 }); }
  }

  const v = verify(out);
  return { id: fmt.id, name: fmt.name, bytes: out, fixes, verifiedAfter: v.checks.every((c) => c.ok), checks: v.checks };
}

// ============================================================
// report：综合人可读报告
// ============================================================
export function report(bytes) {
  const u8 = toU8(bytes);
  const id = identify(u8);
  const L = [];
  L.push("=== 声明式格式表 · 结构报告 ===");
  L.push(`文件长度：${u8.length} 字节`);
  if (!id) {
    const m = missing(u8);
    L.push("识别结果：未匹配任何已声明格式");
    for (const x of m.missing) L.push(`  - ${x.label}${x.note ? "  (" + x.note + ")" : ""}`);
    return L.join("\n");
  }
  L.push(`识别结果：${id.name}   魔数 ${id.magicBytes} @${id.magicOffset}（${id.magicLabel}）`);
  L.push(`权威依据：${id.spec}`);
  const w = walk(u8);
  L.push("");
  L.push(`--- 容器结构（${w.blocks.length} 个块/段） ---`);
  for (const b of w.blocks.slice(0, 40)) {
    const extra = b.name ? `  name=${b.name}` : (b.objNum != null ? `  obj=${b.objNum}` : "");
    L.push(`  ${String(b.kind).padEnd(14)} @${String(b.offset).padStart(7)}  长度 ${String(b.len).padStart(8)}${extra}`);
  }
  if (w.tail.len) L.push(`  [尾随数据]     @${w.tail.offset}  长度 ${w.tail.len}`);
  for (const e of w.errors) L.push(`  ⚠ @${e.at}：${e.msg}`);
  L.push("");
  L.push("--- 结构字段（按表读取） ---");
  for (const f of readFields(u8)) L.push(`  ${f.block}.${f.name} = ${typeof f.value === "string" ? `"${f.value}"` : f.value}   (${f.type} @${f.offset}；${f.note})`);
  L.push("");
  L.push("--- 缺项（修复向导） ---");
  const m = missing(u8);
  if (m.missing.length === 0) L.push("  ✓ 必需块/标记齐备");
  else for (const x of m.missing) L.push(`  ✗ ${x.label}  — ${x.note}`);
  L.push("");
  L.push("--- 嵌入数据插座 ---");
  const ss = sockets(u8);
  if (ss.length === 0) L.push("  （无可提取插座）");
  for (const s of ss) {
    const preview = s.text != null ? JSON.stringify(s.text.slice(0, 80)) : (s.bytes ? hex(s.bytes.subarray(0, 24), " ") + (s.bytes.length > 24 ? " …" : "") : "");
    L.push(`  [${s.id}] @${s.offset} ${s.len} 字节  ${preview}`);
    if (s.note) L.push(`      ${s.note}`);
  }
  L.push("");
  L.push("--- 校验 ---");
  for (const c of verify(u8).checks) L.push(`  ${c.ok ? "✓" : "✗"} ${c.label}：${c.detail}   [${c.spec || ""}]`);
  return L.join("\n");
}