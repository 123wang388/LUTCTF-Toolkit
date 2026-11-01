/*
 * skipCipher.js — Skip 跳读密码（cat:'classic'）。
 *
 * 原理（照权威来源，未编造）：
 *  - 换位密码：从起始位置起，每隔 s 个字符取一个，取到末尾后回到开头继续循环计数，
 *    直到取满全部字符。等价说法：把消息首尾相接地无限重复，取下标为 (start + k·s) mod N 的字符。
 *  - 解密：建 N 个空位，把密文第 j 个字符放回 (start + j·s) mod N，填满后按序读即明文。
 *  - 可逆的充要条件：gcd(s, N) = 1（s 与消息长度互素）。否则计数会陷在部分字符上循环，
 *    密文永远取不到全部字符（dCode 例：长度 4 的 SKIP 用 s=2 只得 SISI）——本实现对此直接报错。
 *
 * 权威来源：
 *  - dCode「Chiffre par Saut (Skip/Jump)」(https://www.dcode.fr/chiffre-saut)，访问日期 2026-09-20：
 *    给出算例 明文 DCODE、saut=3 → 密文 DDCEO；并给出解密公式「第 i 个密文字母放回 (i-1)·s mod N」；
 *    并说明 s 必须与 N 互素（反例 SKIP 长 4 用 2 得 SISI），以及「建议忽略空格与标点，
 *    只保留字母数字」。本实现默认参数（skip=3, start=0）复现 DDCEO 例。
 *
 * 约定：
 *  - 默认只保留字母数字（A-Za-z0-9），其余字符丢弃（dCode 建议）；可切换「保留全部字符」。
 *  - 大小写保留；输出与输入同字符集（纯换位，不改变字符）。
 *
 * 契约：register({id, cat:"classic", name, desc, params, encode, decode})。
 */
import { register } from "./registry.js";

const ALNUM = /[A-Za-z0-9]/;

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

function normalize(text, chars) {
  const src = String(text == null ? "" : text);
  return chars === "all" ? [...src] : [...src].filter((c) => ALNUM.test(c));
}

function skipRun(text, skip, start, chars, decode) {
  const s = Number(skip);
  if (!Number.isInteger(s) || s < 1)
    throw new Error(`Skip：跳步须为 ≥1 的整数（当前 ${skip}）。`);
  const st = Number(start) || 0;
  const msg = normalize(text, chars);
  const n = msg.length;
  if (n === 0) throw new Error("Skip：输入为空（或没有可保留的字母数字字符）。");
  const g = gcd(s % n, n);
  if (g !== 1)
    throw new Error(`Skip：跳步 ${s} 与长度 ${n} 不互素（gcd=${g}），密文无法覆盖全部字符、不可逆；请换一个与 ${n} 互素的跳步。`);
  if (!decode) {
    let out = "";
    for (let j = 0; j < n; j++) out += msg[(((st + j * s) % n) + n) % n];
    return out;
  }
  const slots = new Array(n);
  for (let j = 0; j < n; j++) slots[(((st + j * s) % n) + n) % n] = msg[j];
  return slots.join("");
}

register({
  id: "skipCipher", cat: "classic", name: "Skip 跳读密码",
  desc: "固定步长跳读换位：从 start 起每 s 个字符取一个、到头回绕循环；要求 gcd(s,长度)=1；默认例 DCODE+3 → DDCEO",
  params: [
    { key: "skip", label: "跳步 s（与长度须互素）", type: "number", default: 3 },
    { key: "start", label: "起始位置（0 起）", type: "number", default: 0 },
    { key: "chars", label: "保留字符", type: "select", default: "alnum",
      options: [
        { value: "alnum", label: "只保留字母数字（dCode 建议）" },
        { value: "all", label: "保留全部字符（含空格标点）" },
      ] },
  ],
  encode: (t, p) => skipRun(t, (p && p.skip) != null ? p.skip : 3, (p && p.start) || 0, (p && p.chars) || "alnum", false),
  decode: (t, p) => skipRun(t, (p && p.skip) != null ? p.skip : 3, (p && p.start) || 0, (p && p.chars) || "alnum", true),
});

export { skipRun, gcd, normalize };
