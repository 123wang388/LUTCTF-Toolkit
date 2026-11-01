/*
 * pipNumerals.js — 点数记数（骰面 / 骨牌），cat:'radix'，双向。
 *
 * 族归并（本文件把「同一内核的多个变体」收敛为一个 op + 参数档）：
 *   同源内核＝「十进制数字串 ↔ 以『点』(pips) 排列表示 0–6 数值的 Unicode 符号」。
 *   档 1 dice  ：数字 1–6  ←→ U+2680–U+2685（DIE FACE-1 … DIE FACE-6），1 位数字 = 1 枚骰面。
 *   档 2 domino：数字对 (a,b)（a,b∈0–6）←→ 骨牌字符，1 组两位数字 = 1 块骨牌，
 *                可横排（U+1F031–U+1F061）或竖排（U+1F063–U+1F093）。
 *   两档共享输入域（数字串）、输出域（点数符号串）、失败语义（不可表示的数值即报错），
 *   差别仅在「几位数字合成一枚符号」与「符号来自哪个字符区」——即档位边界。
 *
 * 权威依据（标准编号 + 版本 + 字符条目）：
 *   - The Unicode Standard（字符数据库 UnicodeData，版本以本机 CPython 3.11.4 的
 *     unicodedata 数据库 **14.0.0** 逐字符实测为准）：
 *       U+2680..U+2685 名称 DIE FACE-1 … DIE FACE-6（Miscellaneous Symbols 区）；
 *       U+1F030 名称 DOMINO TILE HORIZONTAL BACK；
 *       U+1F031..U+1F061 名称 DOMINO TILE HORIZONTAL-<a>-<b>（a,b∈0..6，码位 = 0x1F031 + 7a + b）；
 *       U+1F062 名称 DOMINO TILE VERTICAL BACK；
 *       U+1F063..U+1F093 名称 DOMINO TILE VERTICAL-<a>-<b>（码位 = 0x1F063 + 7a + b）。
 *     上述公式由逐码位名称实测反推，非猜测：例如 0x1F038 = HORIZONTAL-01-00、0x1F061 = HORIZONTAL-06-06。
 *   - 数值语义（1–6 为骰点、0–6 为骨牌两端点数）来自这两类字符集本身的定义：
 *     六面骰只有 1–6 点；双六骨牌（double-six）每端 0–6 点，故骰面与骨牌的合法数值域不同，
 *     这正是两档必须分开的参数边界。
 *
 * 契约（重点，如实登记）：
 *   - 输入/输出均为文本；空白字符在两个方向上原样透传（当作分隔符保留，不增删）。
 *   - dice 档：数字 0/7/8/9 无法用骰面表示 → 显式报错（不静默丢弃、不猜）。
 *     U+1F3B2（GAME DIE，🎲）不是数字，本工具不映射为任何数码；解码遇到即报错。
 *   - domino 档：数字串按「非数字分隔符」切段，每段长度必须为偶数、每位数必须 ∈0–6，
 *     否则报错；若段内出现另一朝向的骨牌字符或 BACK 字符（U+1F030 / U+1F062）→ 报错并提示换档。
 *   - 非数字、非分隔符的字符（在 dice 档）与非法分隔符（在 domino 档）一律报错——本 op 是严格编解码器，
 *     不做「安静跳过未知字符」的宽松处理，以免掩盖契约违反。
 */
import { register } from "./registry.js";

const DICE_BASE = 0x2680;          // DIE FACE-1
const DOM_H_BASE = 0x1f031;        // DOMINO TILE HORIZONTAL-00-00
const DOM_V_BASE = 0x1f063;        // DOMINO TILE VERTICAL-00-00
const DOM_H_BACK = 0x1f030;        // DOMINO TILE HORIZONTAL BACK
const DOM_V_BACK = 0x1f062;        // DOMINO TILE VERTICAL BACK
const DOM_H_END = 0x1f061;         // DOMINO TILE HORIZONTAL-06-06
const DOM_V_END = 0x1f093;         // DOMINO TILE VERTICAL-06-06

// 骨牌档允许的分隔符（其余字符报错）
const DOM_SEP = /[\s,/|()]/;

function domBase(orientation) {
  const o = orientation === "vertical" ? "vertical" : "horizontal";
  return o === "vertical" ? DOM_V_BASE : DOM_H_BASE;
}

function pipEncode(text, system, orientation) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("点数记数：输入为空。");
  if (system === "domino") {
    const base = domBase(orientation);
    let out = "";
    let run = ""; // 待配对的数字段
    const flush = (sep) => {
      if (run.length) {
        if (run.length % 2)
          throw new Error(
            `点数记数（骨牌）：数字段 "${run}" 长度为奇数，无法两两配对成骨牌（骨牌每块含左右两端）。`
          );
        for (let i = 0; i < run.length; i += 2) {
          const a = run.charCodeAt(i) - 48, b = run.charCodeAt(i + 1) - 48;
          if (a > 6 || b > 6)
            throw new Error(
              `点数记数（骨牌）：数字 ${a > 6 ? a : b} 超出双六骨牌每端 0–6 的取值域。`
            );
          out += String.fromCodePoint(base + a * 7 + b);
        }
        run = "";
      }
      out += sep;
    };
    for (const ch of src) {
      if (ch >= "0" && ch <= "9") { run += ch; continue; }
      if (DOM_SEP.test(ch)) { flush(ch); continue; }
      throw new Error(`点数记数（骨牌）：字符 "${ch}" 既不是数字 0–9，也不是允许的分隔符（空白 , / | ( )）。`);
    }
    flush("");
    return out;
  }
  // dice 档
  let out = "";
  for (const ch of src) {
    if (ch >= "0" && ch <= "9") {
      const n = ch.charCodeAt(0) - 48;
      if (n < 1 || n > 6)
        throw new Error(`点数记数（骰面）：数字 ${n} 无法用六面骰表示（骰面只对应 1–6）。`);
      out += String.fromCodePoint(DICE_BASE + n - 1);
    } else if (/\s/.test(ch)) {
      out += ch; // 分隔符原样透传
    } else {
      throw new Error(`点数记数（骰面）：字符 "${ch}" 不是数字 1–6，也不是空白分隔符。`);
    }
  }
  return out;
}

function pipDecode(text, system, orientation) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("点数记数：密文为空。");
  if (system === "domino") {
    const base = domBase(orientation);
    const other = base === DOM_H_BASE ? DOM_V_BASE : DOM_H_BASE;
    const otherName = base === DOM_H_BASE ? "竖排" : "横排";
    const myName = base === DOM_H_BASE ? "横排" : "竖排";
    let out = "";
    for (const ch of src) {
      const cp = ch.codePointAt(0);
      if (cp === DOM_H_BACK || cp === DOM_V_BACK)
        throw new Error("点数记数（骨牌）：该字符是骨牌背面（BACK），背面不携带点数，无法解码。");
      if (cp >= base && cp <= base + 48) {
        const v = cp - base;
        out += String(Math.floor(v / 7)) + String(v % 7);
        continue;
      }
      if (cp >= other && cp <= other + 48)
        throw new Error(`点数记数（骨牌）：该字符是${otherName}骨牌，当前指向${myName}档（换朝向档再试）。`);
      if (DOM_SEP.test(ch)) { out += ch; continue; }
      throw new Error(`点数记数（骨牌）：字符 "${ch}" 不是骨牌字符（U+1F031–U+1F061 / U+1F063–U+1F093），也不是空白分隔符。`);
    }
    return out;
  }
  // dice 档
  let out = "";
  for (const ch of src) {
    const cp = ch.codePointAt(0);
    if (cp >= DICE_BASE && cp <= DICE_BASE + 5) { out += String(cp - DICE_BASE + 1); continue; }
    if (cp === 0x1f3b2)
      throw new Error("点数记数（骰面）：🎲(U+1F3B2 GAME DIE) 不是点数符号，不携带 1–6 数值，无法解码。");
    if (/\s/.test(ch)) { out += ch; continue; }
    throw new Error(`点数记数（骰面）：字符 "${ch}" 不是骰面符号（U+2680–U+2685），也不是空白分隔符。`);
  }
  return out;
}

register({
  id: "pipNumerals", cat: "radix", name: "点数记数（骰面 / 骨牌）",
  desc: "十进制数字串 ↔ 点数(pips)符号：dice 档 1–6 ↔ ⚀⚁⚂⚃⚄⚅(U+2680–2685)，domino 档数字对 0–6 ↔ 横/竖骨牌(U+1F031–61/1F063–93)；非法值(0/7–9、奇数长度、背面、异朝向)显式报错，空白透传",
  params: [
    { key: "system", label: "符号系统", type: "select", default: "dice",
      options: [
        { value: "dice", label: "骰面（1–6 ↔ U+2680–U+2685，每位数字一枚）" },
        { value: "domino", label: "骨牌（每两位 0–6 ↔ 一块 U+1F031+ 骨牌）" },
      ] },
    { key: "orientation", label: "骨牌朝向（仅骨牌档）", type: "select", default: "horizontal",
      options: [
        { value: "horizontal", label: "横排（U+1F031–U+1F061）" },
        { value: "vertical", label: "竖排（U+1F063–U+1F093）" },
      ] },
  ],
  encode: (t, p) => pipEncode(t, (p && p.system) || "dice", (p && p.orientation) || "horizontal"),
  decode: (t, p) => pipDecode(t, (p && p.system) || "dice", (p && p.orientation) || "horizontal"),
});

export { pipEncode, pipDecode, DICE_BASE, DOM_H_BASE, DOM_V_BASE, DOM_H_BACK, DOM_V_BACK };