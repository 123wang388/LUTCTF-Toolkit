/*
 * babylonianNumerals.js — 巴比伦数字（sexagesimal 楔形，cat:'radix'）。
 *
 * 原理（照权威来源，未编造）：
 *  - 巴比伦/苏美尔楔形数字：位值制 60 进制。只有两种基本符号：竖楔（钉/clou，
 *    文本常记 "|"）= 1，横楔（人字/chevron，文本常记 "<"）= 10。1..59 的每位
 *    数字由若干横楔（十位）+若干竖楔（个位）加法组成；60 的幂次之间以空位
 *    分隔（dCode："Le changement de puissance de soixante est représenté par
 *    un espace vide"）。位序：最高位在左（dCode 例 3842 = "| |||| ||" =
 *    1×60² + 4×60 + 2，公式原文 "2·60⁰ + 4·60¹ + 1·60² = 3842"；61 = "| |"）。
 *  - 巴比伦人没有零（dCode："Les babyloniens ne connaissaient pas le zéro"；
 *    Wikipedia：晚期才出现占位符且只用于中间位）。
 *
 * dCode 官方 14 字形表（页面原文逐条，unicode 档照此实现）：
 *    𒐕U+12415=1 𒐖U+12416=2 𒐗U+12417=3 𒐘U+12418=4 𒐙U+12419=5
 *    𒐚U+1241A=6 𒐛U+1241B=7 𒐜U+1241C=8 𒐝U+1241D=9
 *    𒌋U+1230B=10 𒎙U+12399=20 𒌍U+1230D=30 𒐏U+1240F=40 𒐐U+12410=50
 *  （dCode 注：双楔 𒎙=20 漏收于 Unicode 5、Unicode 8 才补。）
 *
 * 文本形态约定（重点，如实登记）：
 *  - form="unicode"（默认）：每位数字写「十位复合字形（10/20/30/40/50 取单符）
 *    + 个位复合字形（1..9 取单符）」，先十后个（dCode："2 dizaines et 3 unités"
 *    → 23 = 𒎙𒐗），位间以空格分隔。
 *  - form="ascii"：横楔记 "<"、竖楔记 "|"，每位 = "<"×t + "|"×u（dCode 记法
 *    "souvent noté | / <"；与 Wikipedia 例 23 = 𒌋𒌋𒁹𒁹𒁹 同构），位间空格。
 *  - 零位占位："0"（历史上无零——晚期占位符是图形符号无文本形；文本域用
 *    ASCII 0 占位为本工具工程化约定，在此声明，不是 dCode 原文。空位分组会
 *    丢失位数信息，故不采用）。允许末尾/中间零位（3600 = "| 0 0"），前导零
 *    位报错。
 *  - decode 容忍：Wikipedia 用 𒁹 U+12079（CUNEIFORM SIGN DISH）作单位楔，
 *    dCode 用 𒐕 U+12415——两者解码均按 1 计（登记），重复出现按加法求和。
 *
 * 契约：非负整数（BigInt）；负数、小数、空输入、非法符号、位值 >59、前导
 * 零位均显式报错。encode/decode 严格互逆。
 *
 * 权威来源（访问日期均为 2026-09-22）：
 *  - dCode「Numération Babylonienne」https://www.dcode.fr/nombres-babyloniens
 *    （14 字形表、23/61/3842/100={1,40} 例、|/< 记法、无零说明、base60 转换
 *    算法与伪码）。
 *  - Wikipedia「Babylonian numerals」https://en.wikipedia.org/wiki/Babylonian_numerals
 *    （两符号制、23 = 𒌋𒌋𒁹𒁹𒁹、8583 = 2×60²+23×60+3 = "𒁹𒁹 𒌋𒌋𒁹𒁹𒁹 𒁹𒁹𒁹"、
 *    空位作零、𒁹=U+12079）。
 */
import { register } from "./registry.js";

// dCode 14 字形表：值 → Unicode 码点。
const BAB_UNITS = { 1: 0x12415, 2: 0x12416, 3: 0x12417, 4: 0x12418, 5: 0x12419, 6: 0x1241a, 7: 0x1241b, 8: 0x1241c, 9: 0x1241d };
const BAB_TENS = { 1: 0x1230b, 2: 0x12399, 3: 0x1230d, 4: 0x1240f, 5: 0x12410 };
const BAB_REV = new Map(); // 码点 → 值
for (const [v, cp] of Object.entries(BAB_UNITS)) BAB_REV.set(cp, Number(v));
for (const [t, cp] of Object.entries(BAB_TENS)) BAB_REV.set(cp, Number(t) * 10); // 十位字形的值 = 个数×10
BAB_REV.set(0x12079, 1); // 𒁹 U+12079 DISH：Wikipedia 单位楔写法，解码按 1（见头注释）

function babDigitGroups(n) {
  // 返回 60 进制位数组（最高位在左），0 → [0]。
  if (n === 0n) return [0n];
  const ds = [];
  let rem = n;
  while (rem > 0n) {
    ds.push(rem % 60n);
    rem /= 60n;
  }
  return ds.reverse();
}

function babEncode(text, form) {
  const src = String(text == null ? "" : text).trim();
  if (!src) throw new Error("巴比伦数字：输入为空（应为非负整数的十进制写法）。");
  if (!/^[0-9]+$/.test(src))
    throw new Error(`巴比伦数字：输入 "${src.slice(0, 24)}" 不是非负整数（巴比伦数字无负数与小数）。`);
  if (/^0[0-9]+$/.test(src))
    throw new Error("巴比伦数字：十进制输入不允许前导零。");
  const ds = babDigitGroups(BigInt(src)).map((d) => Number(d));
  return ds
    .map((d) => {
      if (d === 0) return "0";
      const t = Math.floor(d / 10), u = d % 10;
      if (form === "ascii") return "<".repeat(t) + "|".repeat(u);
      return (t ? String.fromCodePoint(BAB_TENS[t]) : "") + (u ? String.fromCodePoint(BAB_UNITS[u]) : "");
    })
    .join(" ");
}

function babDecode(text, form) {
  const src = String(text == null ? "" : text).trim();
  if (!src) throw new Error("巴比伦数字：密文为空。");
  const groups = src.split(/[\s,;]+/).filter(Boolean);
  const digits = [];
  for (const g of groups) {
    if (g === "0") { digits.push(0); continue; }
    if (form === "ascii") {
      if (!/^[<|]+$/.test(g))
        throw new Error(`巴比伦数字：位组 "${g}" 非法（ascii 档只允许 <（十）与 |（个），零位写 0）。`);
      const t = [...g].filter((c) => c === "<").length;
      const u = [...g].filter((c) => c === "|").length;
      const v = t * 10 + u;
      if (v < 1 || v > 59)
        throw new Error(`巴比伦数字：位组 "${g}" 位值 ${v} 超出 1..59。`);
      digits.push(v);
    } else {
      const chars = [...g];
      let v = 0, known = true;
      for (const c of chars) {
        const cp = c.codePointAt(0);
        const val = BAB_REV.get(cp);
        if (val == null) { known = false; break; }
        v += val;
      }
      if (!known || v < 1 || v > 59)
        throw new Error(
          `巴比伦数字：位组 "${g}" 非法（unicode 档只允许 dCode 14 字形表内的楔形数字符，位值须 1..59；容错 𒁹 U+12079 按 1）。`
        );
      digits.push(v);
    }
  }
  while (digits.length > 1 && digits[0] === 0)
    throw new Error("巴比伦数字：不允许前导零位（历史无零；占位 0 只用于中间位与末位）。");
  let value = 0n;
  for (const d of digits) value = value * 60n + BigInt(d);
  return value.toString();
}

register({
  id: "babylonianNumerals", cat: "radix", name: "巴比伦数字",
  desc: "非负整数 ↔ 巴比伦 60 进制楔形数字（竖楔=1 横楔=10，位间空格，最高位在左）；unicode 档用 dCode 14 字形表（𒐕..𒐐，位内先十后个），ascii 档用 | 与 <（dCode 记法）；无零——文本以 0 占位（工具约定），前导零报错",
  params: [
    { key: "form", label: "符号形态", type: "select", default: "unicode",
      options: [
        { value: "unicode", label: "Unicode 楔形（dCode 14 字形表：𒐕𒐖…𒐐）" },
        { value: "ascii", label: "ASCII 记法（| = 1，< = 10，dCode/Wikipedia 记法）" },
      ] },
  ],
  encode: (t, p) => babEncode(t, (p && p.form) || "unicode"),
  decode: (t, p) => babDecode(t, (p && p.form) || "unicode"),
  detect: (t) => {
    const chars = [...t.replace(/\s/g, "")];
    if (!chars.length || chars.length > 60) return 0;
    const known = chars.filter((c) => BAB_REV.has(c.codePointAt(0))).length;
    if (known === chars.length) return 0.4;
    if (/^([<|]+|0)([\s]+([<|]+|0))+$/.test(t.trim()) && /[<|]/.test(t)) return 0.3;
    return 0;
  },
});

export { babEncode, babDecode, babDigitGroups, BAB_UNITS, BAB_TENS, BAB_REV };
