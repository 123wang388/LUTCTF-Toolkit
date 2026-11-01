/*
 * ragbaby.js — Ragbaby 密码（cat:'classic'）。
 *
 * 原理（照权威来源，未编造）：
 *  - 多表代换，密钥是一个「关键词字母表」（keyed alphabet）：先写关键词去重后的字母，
 *    再按常规顺序补全其余字母。
 *  - 位移量按「字母在词内的位置」递增：词内第 1 个字母移 1，第 2 个移 2……
 *    且每个新词的起点比上一词的起点 +1（即 shift = 词序号 + 词内位置 - 1）。
 *  - 加密 = 在关键词字母表内把明文字母右移 shift 位；解密 = 左移 shift 位（mod 表长）。
 *  - 词界保留（空格不参与计数，但新词起点递增）；词内标点（连字符/撇号）不重置计数。
 *
 * 权威来源：
 *  - Young Tyros（美国 ACA 谜题圈教程，基于 Gaines《Elementary Cryptanalysis》传统）
 *    「Ragbaby Tutorial」https://youngtyros.com/2023/02/28/ragbaby-tutorial/ ，访问日期 2026-09-20：
 *      24 字母关键词字母表（I/J 与 W/X 合并 = 去掉 J、X），示例 key=CIPHER
 *      → KA = CIPHERABDFGKLMNOQSTUVWYZ；明文 "Now is the time for all good men"
 *      → 密文 "OSC HV WBF YAUK NWL LUV SZCT WMC"（shift 1..n 逐词递增，公式 Ct = Pt + Shift）。
 *      本实现默认参数（keyword=CIPHER, alphabet=24）复现该例。
 *  - dCode「Chiffre Ragbaby」https://www.dcode.fr/chiffre-ragbaby ，访问日期 2026-09-20：
 *      参数「Décalage du premier mot / Décalage pour chaque lettre」对应本实现 startShift / letterStep；
 *      字母表档「26 / 24(Original, sans J et X) / 36」中的 24 档与本实现一致。
 *  - CipherChronicle「Ragbaby cipher」https://www.cipherchronicle.com/en/methods/ragbaby ，访问日期 2026-09-20：
 *      独立佐证「shift = 字母在词内的位置，方向为在关键词字母表内前移」。
 *
 * 约定：
 *  - 字母表长度 26（A-Z，无损）或 24（原始：去 J、X；J→I、X→W 归一，故 24 档对含 J/X
 *    的输入是有损的，往返会把 J 变 I、X 变 W——已在 desc/科普中说明）。
 *  - 输出统一大写（字母替换类与列移位等同口径）；非字母字符（空格/标点）原样保留。
 *
 * 契约：register({id, cat:"classic", name, desc, params, encode, decode})。
 */
import { register } from "./registry.js";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE24 = "ABCDEFGHIKLMNOPQRSTUVWYZ"; // 去 J、X（I/J 与 W/X 合并）
const NORM24 = { J: "I", X: "W" };

/** 由关键词构造字母表。size 为 26 或 24。 */
function buildAlphabet(keyword, size) {
  const base = size === 24 ? BASE24 : AZ;
  const seen = new Set();
  const out = [];
  for (const ch of String(keyword == null ? "" : keyword).toUpperCase()) {
    if (base.includes(ch) && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  }
  for (const ch of base) if (!seen.has(ch)) out.push(ch);
  return out.join("");
}

function ragbabyRun(text, keyword, size, startShift, letterStep, decode) {
  const alpha = buildAlphabet(keyword, size === 24 ? 24 : 26);
  const L = alpha.length;
  const s0 = Number.isFinite(Number(startShift)) ? Number(startShift) : 1;
  const step = Number.isFinite(Number(letterStep)) ? Number(letterStep) : 1;
  const src = String(text == null ? "" : text);
  if (![...src.toUpperCase()].some((c) => AZ.includes(c) || (size === 24 && NORM24[c]))) {
    throw new Error("Ragbaby：输入不含任何字母。");
  }
  let w = 0, p = 0, started = false;
  let out = "";
  for (const ch of src) {
    const up = ch.toUpperCase();
    const isLetter = AZ.includes(up);
    if (isLetter) {
      if (started && p === 0) w++;         // 进入新词：起点 +1
      p++;
      started = true;
      const letter = size === 24 ? (NORM24[up] || up) : up;
      const shift = ((s0 + w + (p - 1) * step) % L + L) % L;
      const idx = alpha.indexOf(letter);
      const j = decode ? (idx - shift + L) % L : (idx + shift) % L;
      out += alpha[j];                      // 字母替换类统一大写输出（与列移位等同口径）
    } else if (/\s/.test(ch)) {
      out += ch;
      p = 0;                                // 词界：下一字母起新词
    } else {
      out += ch;                            // 词内标点：不重置计数
    }
  }
  return out;
}

register({
  id: "ragbaby", cat: "classic", name: "Ragbaby 密码",
  desc: "多表代换：关键词字母表 + 位移随「词内位置」递增（shift=词序号+词内位置-1）；26 字母无损档 / 24 字母原始档（去 J、X）；默认复现 CIPHER 例",
  params: [
    { key: "keyword", label: "关键词（构造密钥字母表，空=标准字母表）", type: "text", default: "CIPHER" },
    { key: "alphabet", label: "字母表", type: "select", default: "24",
      options: [
        { value: "24", label: "24 字母（原始：I/J、W/X 合并，去 J、X）" },
        { value: "26", label: "26 字母（A-Z，无损往返）" },
      ] },
    { key: "startShift", label: "首词首位位移（dCode: Décalage du premier mot）", type: "number", default: 1 },
    { key: "letterStep", label: "词内每后移一位的增量（dCode: Décalage pour chaque lettre）", type: "number", default: 1 },
  ],
  encode: (t, p) => ragbabyRun(t, (p && p.keyword) != null ? p.keyword : "CIPHER", String((p && p.alphabet) || "24") === "26" ? 26 : 24, (p && p.startShift) != null ? p.startShift : 1, (p && p.letterStep) != null ? p.letterStep : 1, false),
  decode: (t, p) => ragbabyRun(t, (p && p.keyword) != null ? p.keyword : "CIPHER", String((p && p.alphabet) || "24") === "26" ? 26 : 24, (p && p.startShift) != null ? p.startShift : 1, (p && p.letterStep) != null ? p.letterStep : 1, true),
});

export { ragbabyRun, buildAlphabet, BASE24 };
