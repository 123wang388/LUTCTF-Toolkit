/*
 * marineFlags.js — 国际信号旗文本码（Code international des signaux maritimes，
 * cat:'fancy'）。
 *
 * 原理（照权威来源，未编造）：
 *  - 国际海上信号 code：每面旗 = 一个字母（A-Z 方旗）或一个数字（0-9 为
 *    三角旗/三角 pennant，dCode："L'OTAN utilise 10 drapeaux différents
 *    (de forme carrée) pour coder les chiffres"——数字旗形制不同）。
 *  - 一船只带一套旗：同组内重复字母用「代旗（substitute/repeat flags）」，
 *    dCode 四面：第 1..4 代旗重复本组第 1..4 面旗（第 4 面非官方 code 成员；
 *    dCode："repète le premier/second/troisième/quatrième drapeau"，
 *    "les pavillons répétiteurs…remplacent une répétition d'un pavillon
 *    précédent dans le même groupe"）。dCode 例：SOS 用代旗后 = S O [第1代旗]。
 *
 * 文本形态约定（重点，如实登记）：
 *  - 旗形是图形，无 Unicode 官方编码。dCode 站内旗图即以字符码点命名：
 *    字母旗 char(65..90)、数字旗 char(48..57)、四面代旗 char(107..110)
 *    即 k/l/m/n（本页图名清单逐一核对：SOS 例 = char(83)(79)(107)）。
 *    故文本域 token = 字母/数字本身 + 代旗 k/l/m/n（与项目内「跳舞小人」
 *    以字母为 token 的同款诚实约定，不冒充图形）。
 *  - 分组：以空格分词为一「组」（hoist）；代旗按组内位置生效。
 *  - substitute=on（dCode 勾选框「Utiliser les drapeaux de répétition」口径）：
 *    encode 时，组内字母若与组内第 1..4 面旗相同，则以 k/l/m/n 代之（先比
 *    第 1 位再第 2/3/4 位；组内第 1..4 位本身不复用代旗）。decode 时 k/l/m/n
 *    还原为组内第 1/2/3/4 面旗；引用不存在的位（如组内首字符就是代旗）报错。
 *  - substitute=off：代旗不存在——encode 输出原字母；decode 遇 k/l/m/n 显式
 *    报错（不是旗语字符）。非字母数字（空格、标点）原样保留；小写统一大写。
 *
 * dCode 页面例：FLAG；NAVY（解码例）；SOS→S O [第1代旗]（即文本 "SOk"）。
 *
 * 权威来源（访问日期均为 2026-09-22）：
 *  - dCode「Code des Signaux Maritimes」https://www.dcode.fr/code-signal-maritime
 *    （A-Z 方旗表、0-9 数字旗表、四面代旗语义、FLAG/SOS/NAVY 例、
 *    代旗勾选框、1965《Code International de Signaux》参考书说明）。
 *  - Wikipedia「International maritime signal flags」（ICS 体系、代旗规则
 *    与单旗含义；调研交叉核对）。
 */
import { register } from "./registry.js";

const SUBS = ["k", "l", "m", "n"]; // dCode 代旗槽名 char(107..110)：重复组内第 1..4 面旗

function marineEncode(text, substitute) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("信号旗：输入为空。");
  const outGroups = [];
  for (const group of src.split(/(\s+)/)) {
    if (/^\s+$/.test(group)) { outGroups.push(group); continue; }
    const flags = [];
    for (const ch of group) {
      const up = ch.toUpperCase();
      if (!/[A-Z0-9]/.test(up)) { flags.push(ch); continue; }
      let emitted = up;
      if (substitute) {
        for (let j = 0; j < 4 && j < flags.length; j++) {
          if (flags[j] === up) { emitted = SUBS[j]; break; } // 与组内第 j+1 面旗相同→代旗
        }
      }
      flags.push(emitted);
    }
    outGroups.push(flags.join(""));
  }
  return outGroups.join("");
}

function marineDecode(text, substitute) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("信号旗：密文为空。");
  const outGroups = [];
  for (const group of src.split(/(\s+)/)) {
    if (/^\s+$/.test(group)) { outGroups.push(group); continue; }
    const flags = [];
    for (const ch of group) {
      const up = ch.toUpperCase();
      if (!/[A-Z0-9]/.test(up)) { flags.push(ch); continue; }
      if (SUBS.includes(ch)) { // 大小写敏感：小写 k/l/m/n=代旗，大写 K/L/M/N=字母旗
        if (!substitute)
          throw new Error(`信号旗：字符 "${ch}" 是代旗记号，但代旗档未开启（k/l/m/n = 第 1..4 代旗）。`);
        const idx = SUBS.indexOf(ch);
        if (idx >= flags.length)
          throw new Error(
            `信号旗：代旗 "${ch}" 引用本组第 ${idx + 1} 面旗，但本组此前只有 ${flags.length} 面旗。`
          );
        flags.push(flags[idx]);
      } else {
        flags.push(up);
      }
    }
    outGroups.push(flags.join(""));
  }
  return outGroups.join("");
}

register({
  id: "marineFlags", cat: "fancy", name: "国际信号旗文本码",
  desc: "国际海上信号旗（ICS）：一面旗一个 A-Z 字母/0-9 数字，文本 token=字符本身（旗图无 Unicode，按 dCode 内部槽名）；代旗档 substitute：组内重复的第 1..4 面旗以 k/l/m/n 代旗表示（SOS→SOk），解码反向还原并校验代旗引用；关闭档遇 k/l/m/n 报错",
  params: [
    { key: "substitute", label: "代旗（重复旗替换）", type: "bool", default: true },
  ],
  encode: (t, p) => marineEncode(t, (p && p.substitute) !== false),
  decode: (t, p) => marineDecode(t, (p && p.substitute) !== false),
});

export { marineEncode, marineDecode, SUBS };
