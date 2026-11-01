/*
 * mayaNumerals.js — 玛雅数字（vigesimal 点横系统，cat:'radix'）。
 *
 * 原理（照权威来源，未编造）：
 *  - 玛雅数字：位值制 20 进制（vigesimal）。每位数字 0..19 由三种符号加法组合：
 *    点 = 1、横条 = 5、贝壳形 = 0（dCode 原文："un point • vaut 1, une barre
 *    horizontale vaut 5, le symbole [贝壳] représente 0"）。写法纵向，个位在底，
 *    二十位在上；本工具文本化为「最高位在左、位间空格分隔」（dCode 输入框
 *    "côte à côte ou verticalement" 的横排口径）。
 *  - 例（dCode 页面原文）：14 = 2 barres + 4 points（2×5+4）；17 = 2 points +
 *    3 traits（2×1+3×5）；26 = 两层：上层 1 点（×20）+ 下层 1 点 1 条（1+5）；
 *    20 = 上层 1 点 + 下层贝壳零（"20 ne s'écrit pas avec 4 barres"）。
 *    Wikipedia《Maya numerals》另给：33 = (1,13)（上层 1 点，下层 3 点 2 条）；
 *    406 = (1,0,6)（20² 位为贝壳）；429 = (1,1,9)。
 *  - 长纪历（compte long）变体：dCode/Wikipedia 一致——第三位起不再是 20²=400，
 *    而是 18×20=360（tun），之后 7200（katun）、144000（baktun）继续 ×20；
 *    第二位（uinal）只出现 0..17（Wikipedia："only digits up to 17 appear in
 *    the second position"）。dCode 例：360 在纯 20 进制写 (18,0)，长纪历写
 *    (1,0,0)（"en base 20 modifiée, 360 s'écrit [comme 400]"）；7200 长纪历
 *    写作 (1,0,0,0)（"7200 s'écrit comme 8000"）。
 *
 * 文本形态约定（重点，如实登记）：
 *  - form="unicode"（默认）：每位一个 Unicode 字符，玛雅数字块 U+1D2E0..U+1D2F3
 *    （MAYAN NUMERAL ZERO..NINETEEN，Unicode 14 收录；dCode 页「Avec les
 *    symboles Unicode 𝋮 (v14+ nécessaire)」档）。位值 = 码点 - 0x1D2E0。
 *  - form="dotbar"：每位写成「点×n1 + 横条×n5」，先点后条（对应玛雅图形
 *    「点在条上方」的横向读序，本工具约定）；位 0 写作 "0"。dCode 的点横档
 *    ("- et .") 页面未给零的文本符号（贝壳零是图形）——"0" 占位为本工具
 *    工程化约定，已在此声明，不是 dCode 原文。
 *  - 两种形态位间均以单空格分隔，最高位在左。decode 两种形态均容忍空白/换行。
 *
 * 契约：非负整数（BigInt）；负数、小数、空输入、非法符号、longcount 档
 * 第二位 >17、任何位 >19 均显式报错。encode/decode 严格互逆。
 *
 * 权威来源（访问日期均为 2026-09-22）：
 *  - dCode「Numération Maya」https://www.dcode.fr/nombres-mayas
 *    （点=1/条=5/贝壳=0、14/17/22/26 例、20 的写法、360/7200 长纪历例、
 *    unicode 档说明、base20 与 compte long 两档）。
 *  - Wikipedia「Maya numerals」https://en.wikipedia.org/wiki/Maya_numerals
 *    （0..19 位值制、20/26/33/406/429 写法、长纪历第三位=360、第二位≤17）。
 */
import { register } from "./registry.js";

const MAYA_ZERO_CP = 0x1d2e0; // U+1D2E0 MAYAN NUMERAL ZERO（块首）

function mayaDigits(n, mode) {
  // 返回位值数组（最低位在索引 0）。
  const digits = [];
  if (n === 0n) return [0n];
  let rem = n;
  digits.push(rem % 20n); // 第 0 位：kin，0..19
  rem /= 20n;
  if (mode === "longcount") {
    if (rem > 0n) {
      digits.push(rem % 18n); // 第 1 位：uinal，0..17
      rem /= 18n;
    }
    while (rem > 0n) {
      digits.push(rem % 20n); // 第 2 位起：tun/katun/baktun…，0..19
      rem /= 20n;
    }
  } else {
    while (rem > 0n) {
      digits.push(rem % 20n);
      rem /= 20n;
    }
  }
  return digits;
}

function digitUnicode(d) {
  return String.fromCodePoint(Number(MAYA_ZERO_CP + Number(d)));
}

function digitDotbar(d) {
  const n = Number(d);
  if (n === 0) return "0";
  return ".".repeat(n % 5) + "-".repeat(Math.floor(n / 5));
}

function mayaEncode(text, mode, form) {
  const src = String(text == null ? "" : text).trim();
  if (!src) throw new Error("玛雅数字：输入为空（应为非负整数的十进制写法）。");
  if (!/^[0-9]+$/.test(src))
    throw new Error(`玛雅数字：输入 "${src.slice(0, 24)}" 不是非负整数（玛雅数字无负数与小数）。`);
  if (/^0[0-9]+$/.test(src))
    throw new Error("玛雅数字：十进制输入不允许前导零。");
  const n = BigInt(src);
  const digits = mayaDigits(n, mode);
  if (mode === "longcount" && digits.length > 1 && digits[1] > 17n)
    throw new Error("玛雅数字：长纪历第二位（uinal）只能 0..17。");
  const hi = [...digits].reverse();
  return hi.map((d) => (form === "dotbar" ? digitDotbar(d) : digitUnicode(d))).join(" ");
}

function mayaDecode(text, mode, form) {
  const src = String(text == null ? "" : text).trim();
  if (!src) throw new Error("玛雅数字：密文为空。");
  let digits; // 最高位在左
  if (form === "dotbar") {
    const toks = src.split(/[\s,;]+/).filter(Boolean);
    digits = toks.map((t) => {
      if (t === "0") return 0n;
      const m = /^(\.{0,4})(-{0,3})$/.exec(t);
      if (!m)
        throw new Error(
          `玛雅数字：token "${t}" 非法（点横档每层应为 0..4 个点 + 0..3 个横条，如 5="-"、14="....--"；零层写 0）。`
        );
      const dots = m[1].length, bars = m[2].length;
      const v = dots + 5 * bars;
      if (v < 1 || v > 19)
        throw new Error(`玛雅数字：token "${t}" 位值 ${v} 超出 0..19。`);
      return BigInt(v);
    });
  } else {
    const chars = [...src.replace(/[\s,;]/g, "")];
    if (!chars.length) throw new Error("玛雅数字：密文为空。");
    digits = chars.map((c) => {
      const cp = c.codePointAt(0);
      if (cp < MAYA_ZERO_CP || cp > MAYA_ZERO_CP + 19)
        throw new Error(
          `玛雅数字：字符 "${c}"（U+${cp.toString(16).toUpperCase()}）不在玛雅数字块 U+1D2E0..U+1D2F3 内。`
        );
      return BigInt(cp - MAYA_ZERO_CP);
    });
  }
  // 去前导零层（"0 5" 这类）；全零则值为 0。
  while (digits.length > 1 && digits[0] === 0n) digits.shift();
  for (let i = 0; i < digits.length; i++) {
    const v = digits[i];
    if (v > 19n)
      throw new Error(`玛雅数字：第 ${digits.length - i} 层位值 ${v} 超出 0..19。`);
    if (mode === "longcount" && digits.length >= 2 && i === digits.length - 2 && v > 17n)
      throw new Error(`玛雅数字：长纪历第二位（uinal）位值 ${v} 超出 0..17。`);
  }
  // 权重：第 0 层（最低）×1，第 1 层×20，第 2 层起 longcount 为 360、7200…（先×18 再×20）
  let value = 0n, weight = 1n;
  const lo = [...digits].reverse(); // 最低位在索引 0
  for (let i = 0; i < lo.length; i++) {
    if (i === 1) weight *= 20n;
    else if (i >= 2) weight *= (mode === "longcount" && i === 2) ? 18n : 20n;
    value += lo[i] * weight;
  }
  return value.toString();
}

register({
  id: "mayaNumerals", cat: "radix", name: "玛雅数字",
  desc: "非负整数 ↔ 玛雅 vigesimal 点横数字（点=1 条=5 贝壳=0，位值×20）；unicode 档用 Unicode 玛雅数字块 U+1D2E0..U+1D2F3 一字一位，dotbar 档用 . 和 -（零层写 0，工具约定）；longcount 档第三位起按 18×20=360 长纪历（uinal≤17）",
  params: [
    { key: "mode", label: "进制模式", type: "select", default: "vigesimal",
      options: [
        { value: "vigesimal", label: "纯 20 进制（dCode「Système Vigésimal classique」）" },
        { value: "longcount", label: "长纪历（第三位=18×20=360，dCode「compte long」）" },
      ] },
    { key: "form", label: "符号形态", type: "select", default: "unicode",
      options: [
        { value: "unicode", label: "Unicode 玛雅数字块 𝋠..𝋳（dCode unicode 档）" },
        { value: "dotbar", label: "点 . 横 -（dCode 点横档；零层写 0）" },
      ] },
  ],
  encode: (t, p) => mayaEncode(t, (p && p.mode) || "vigesimal", (p && p.form) || "unicode"),
  decode: (t, p) => mayaDecode(t, (p && p.mode) || "vigesimal", (p && p.form) || "unicode"),
  detect: (t) => {
    const chars = [...t.replace(/\s/g, "")];
    if (!chars.length || chars.length > 40) return 0;
    const inBlock = chars.filter((c) => {
      const cp = c.codePointAt(0);
      return cp >= 0x1d2e0 && cp <= 0x1d2f3;
    }).length;
    if (inBlock === chars.length) return 0.6;
    if (/^([.\-]{1,7}|0)([\s]+([.\-]{1,7}|0))+$/.test(t.trim())) return 0.3;
    return 0;
  },
});

export { mayaEncode, mayaDecode, mayaDigits, MAYA_ZERO_CP };
