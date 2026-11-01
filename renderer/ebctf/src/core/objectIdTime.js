/*
 * objectIdTime.js — ObjectID 时间戳解析（cat:'radix'，run 单向）。
 *
 * 原理（照权威来源，未编造）：
 *  - BSON 的 ObjectId 是固定 12 字节值：4 字节时间戳 + 5 字节随机值 + 3 字节自增计数器。
 *  - 时间戳是「自 Unix 纪元起的秒数」（不是毫秒），并且与 BSON 其余数值的小端约定相反，
 *    ObjectId 的时间戳与计数器都是**大端**（最高有效字节在前）。
 *  - 因此字符串形（24 位十六进制）的前 8 个十六进制字符即大端 4 字节秒数；
 *    换算成 UTC 时刻即该 ObjectId 的生成时间（秒级分辨率）。
 *  - 注意语义边界：ObjectId 只含 1 秒时间分辨率，且由客户端时钟生成，故「近似有序、非严格单调」。
 *
 * 权威来源：
 *  - BSON Specification Version 1.1（https://bsonspec.org/spec.html），访问日期 2026-09-23：
 *    元素类型 `signed_byte(7) e_name (byte*12) ObjectId` —— 规定 ObjectId 为 12 字节。
 *  - MongoDB Database Manual「BSON Types → ObjectId」
 *    （https://www.mongodb.com/docs/manual/reference/bson-types/），访问日期 2026-09-23：
 *    「ObjectId values are 12 bytes in length, consisting of: A 4-byte timestamp, representing the
 *     ObjectId's creation, measured in seconds since the Unix epoch. A 5-byte random value generated
 *     once per client-side process... A 3-byte incrementing counter per client-side process...」；
 *    并明确「For timestamp and counter values, the most significant bytes appear first in the byte
 *     sequence (big-endian). This is unlike other BSON values, where the least significant bytes
 *     appear first (little-endian).」
 *  - MongoDB Database Manual「ObjectId.getTimestamp()」
 *    （https://www.mongodb.com/docs/manual/reference/method/objectid.gettimestamp/），访问日期 2026-09-23：
 *    官方向量 `ObjectId("507c7f79bcf86cd7994f6c0e").getTimestamp()` → `ISODate("2012-10-15T21:26:17Z")`。
 *  - MongoDB Database Manual「ObjectId.createFromHexString()」
 *    （https://www.mongodb.com/docs/manual/reference/method/objectid.createfromhexstring/），访问日期 2026-09-23：
 *    官方十六进制样例 `"64c13ab08edf48a008793cac"`（24 位十六进制，用于长度/格式口径）。
 *
 * 形态说明：
 *  - 本 op 为「解析」单向（run），与 CyberChef「Parse ObjectID timestamp」同类；
 *    构造方向不是确定性的（后 8 字节为随机值/计数器），故不注册反向；
 *    但时间戳字段的构造是确定的，已作为纯函数导出（objectIdPrefixFromTimestamp / buildObjectIdHex），
 *    供出题、对拍与闭环验证使用。
 *
 * 契约：register({id, cat:"radix", name, desc, params, run})。
 */
import { register } from "./registry.js";

const HEX24 = /^[0-9a-fA-F]{24}$/;

function toBytes(hex) {
  const out = new Uint8Array(12);
  for (let i = 0; i < 12; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b) {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** ISO8601（UTC，秒级，与官方 getTimestamp 显示一致：2012-10-15T21:26:17Z）。 */
function isoSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * 解析 24 位十六进制 ObjectId。
 * @returns {{hex, bytes, timestamp, iso, randomHex, counter}}
 */
function parseObjectIdHex(input) {
  const s = String(input == null ? "" : input).trim();
  if (!s) throw new Error("ObjectID：输入为空。");
  if (!HEX24.test(s))
    throw new Error(
      `ObjectID：须为 24 位十六进制（12 字节）字符串，当前长度 ${s.length}（${s.slice(0, 32)}${s.length > 32 ? "…" : ""}）。`
    );
  const hex = s.toLowerCase();
  const bytes = toBytes(hex);
  const timestamp = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const counter = ((bytes[9] << 16) | (bytes[10] << 8) | bytes[11]) >>> 0;
  return {
    hex,
    bytes,
    timestamp,
    iso: isoSeconds(timestamp * 1000),
    randomHex: bytesToHex(bytes.subarray(4, 9)),
    counter,
  };
}

/** 时间戳（Unix 秒）→ ObjectId 前 4 字节大端十六进制（8 字符）。 */
function objectIdPrefixFromTimestamp(sec) {
  const n = Number(sec);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff)
    throw new Error(`ObjectID：时间戳须为 0..4294967295 的整数秒（当前 ${sec}）。`);
  return n.toString(16).padStart(8, "0");
}

/** 按「秒时间戳 + 5 字节随机值(hex 10 位) + 3 字节计数器」构造 24 位十六进制 ObjectId。 */
function buildObjectIdHex(sec, randomHex, counter) {
  const prefix = objectIdPrefixFromTimestamp(sec);
  const r = String(randomHex == null ? "" : randomHex).trim().toLowerCase();
  if (!/^[0-9a-f]{10}$/.test(r))
    throw new Error(`ObjectID：随机值须为 10 位十六进制（5 字节），当前 "${randomHex}"。`);
  const c = Number(counter);
  if (!Number.isInteger(c) || c < 0 || c > 0xffffff)
    throw new Error(`ObjectID：计数器须为 0..16777215 的整数（当前 ${counter}）。`);
  return prefix + r + c.toString(16).padStart(6, "0");
}

register({
  id: "objectIdTime", cat: "radix", name: "ObjectID 时间戳解析",
  desc: "BSON ObjectId（12 字节：4 字节大端 Unix 秒 + 5 字节随机值 + 3 字节大端计数器）解析：24 位十六进制 → 生成时间(UTC) + 随机值 + 计数器（run 单向报告）",
  params: [],
  run: (t) => {
    const s = String(t == null ? "" : t).trim();
    if (!s) return "（空输入）";
    const r = parseObjectIdHex(s);
    const lines = [];
    lines.push("=== ObjectID 时间戳解析 ===");
    lines.push("输入: " + r.hex);
    lines.push("字节 (12): " + bytesToHex(r.bytes).replace(/(..)(?=..)/g, "$1 "));
    lines.push("--- 字段分解 ---");
    lines.push("时间戳 (Unix 秒): " + r.timestamp);
    lines.push("生成时间 (UTC): " + r.iso);
    lines.push("随机值 (5 字节): " + r.randomHex);
    lines.push("计数器 (3 字节): " + r.counter);
    lines.push("--- 位拆分（大端）---");
    lines.push("bytes 0-3  (timestamp): 0x" + r.hex.slice(0, 8));
    lines.push("bytes 4-8  (random)   : " + r.randomHex);
    lines.push("bytes 9-11 (counter)  : 0x" + r.hex.slice(18, 24));
    return lines.join("\n");
  },
});

export { parseObjectIdHex, objectIdPrefixFromTimestamp, buildObjectIdHex, isoSeconds };
