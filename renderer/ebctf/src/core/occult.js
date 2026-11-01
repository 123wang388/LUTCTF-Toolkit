/*
 * occult.js — 神秘学字母四件（Theban / Lunaire / Celestial / Malachim，cat:'fancy'）。
 *
 * 原理（照权威来源，未编造，四个档）：
 *  - Theban（巫师字母/Runes of Honorius）：1518 年 Johannes Trithemius
 *    《Polygraphia》公布，归于 Honorius of Thebes。dCode 表 24 符：26 拉丁
 *    字母中 I/J 同符、U/V/W 同符，另有词/句终点符（点）。dCode 原文：
 *    "L'alphabet thébain possède 24 symboles…Le caractère [点] est utilisé
 *    pour les fin de phrases et assimilé à un point. Il n'y a pas de chiffres
 *    ou d'autres symboles dans cet alphabet, et la casse est ignorée."
 *  - Lunaire（Alphabet Lunaire, Leandro Katz 1978）：阿根廷艺术家用 27 个月相
 *    照片替换西班牙语 27 字母（A-Z + Ñ）。dCode 原文："la lettre Ñ ne peut
 *    pas être encodée sur dCode, elle est automatiquement transformée en N."
 *  - Celestial（天城/天使字母）与 Malachim：Agrippa《De occulta philosophia》
 *    卷三（Celestial p.439 / Malachim p.440）。两者都是从拉丁转写成希伯来
 *    字母、再一字母一符号（dCode 站内符号图即以希伯来码点命名，如
 *    char(1490).png=ג）。22 希伯来字母对 26 拉丁字母多对一：ג=C/G、י=I/J、
 *    ו=F/U/V(W)；ט 与 צ 无拉丁对应（dCode 原文明示）。
 *
 * 文本形态约定（重点，如实登记——四档两层差别）：
 *  - theban / lunaire 档：符号层是图形（dCode 图名 char(65..90)/char(126)
 *    即以拉丁字母为内部名），文本域 token = 字母本身（与项目内「跳舞小人」
 *    token 描述版同思路，如实声明不冒充图形）。机器可读信息为合并规则：
 *    theban：J→I、V/W→U（dCode 槽位口径），句点 "." 保留；lunaire：Ñ→N
 *    （dCode 自动转 N 口径），其余字母不动。非字母原样保留。
 *  - celestial / malachim 档：文本域 = 希伯来字母串（逻辑序与拉丁序一致，
 *    逐字母转写；希伯来显示方向 RTL 是渲染属性）。dCode 页面例（逐字复现）：
 *      Celestial：CELESTIAL → גהלהשתיאל；ANGELIC 例 → אנגהליג
 *      Malachim：MALACHIN → מאלאגחינ；AGRIPPA 例 → אגריפפא
 *    转写表（dCode 例+FAQ 显式给 14 字母，余按希伯来字母表次序对应补全，
 *     每条在 SOURCES.md 逐条给来源）：
 *      A→א B→ב C→ג D→ד E→ה F→ו G→ג H→ח I→י K→כ L→ל M→מ N→נ
 *      O→ע P→פ Q→ק R→ר S→ש T→ת U→ו W→ו Y→י Z→ז
 *    多对一收敛：decode 取 dCode FAQ 首列字母（ג→C、ו→F、י→I），
 *    故 G/J/V/W/Y 的往返会收敛到 C/J 之外的对应字母——22 对 26 的固有歧义，
 *    dCode 原文承认 "Cette opération n'est pas toujours univoque"。
 *  - 省略并登记：拉丁 X 无可靠转写（dCode 页面与 Agrippa 原表均未给，
 *    编码遇到 X 显式报错）；希伯来 ט(ט)、ס(ס)、צ(צ) 无拉丁对应，解码遇到
 *    报错；Malachim 的 Samech 第二字形（23 符对 22 字母）只在图形层，文本
 *    层不可区分，省略。
 *
 * 权威来源（访问日期均为 2026-09-22）：
 *  - dCode「Alphabet Thébain」https://www.dcode.fr/alphabet-thebain
 *    （24 符表 I/J、U/V/W 合并、句点符、THEBES./HONORIUS 例、Trithemius 1518）。
 *  - dCode「Alphabet Lunaire (L. Katz)」https://www.dcode.fr/alphabet-lunaire-leandro-katz
 *    （27 字母西班牙语表、Ñ→N、DCODE/LEANDRO 例、1978/1980 两版）。
 *  - dCode「Alphabet Celestial」https://www.dcode.fr/alphabet-celestial
 *    （希伯来转写原理、CELESTIAL→גהלהשתיאל、ANGELIC→אנגהליג 例、RTL、
 *    ג=C/G י=I/J ו=F/V/U、ט/צ 无对应）。
 *  - dCode「Alphabet Malachim」https://www.dcode.fr/alphabet-malachim
 *    （23 符对 22 字母、Samech 双字形、MALACHIN→מאלאגחינ、AGRIPPA→אגריפפא 例）。
 *  - Wikipedia「Malachim」（Agrippa 出处、22-23 符与 Samech 双字形交叉核对）；
 *    Wikipedia「Vav (letter)」「Yodh」（W→ו、Y→י 对应，补 dCode 未列的 5 字母）。
 */
import { register } from "./registry.js";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Celestial/Malachim 共用拉丁→希伯来转写（来源逐条见头注释与 SOURCES.md）。
const OCC_HEB = {
  A: "\u05D0", B: "\u05D1", C: "\u05D2", D: "\u05D3", E: "\u05D4", F: "\u05D5",
  G: "\u05D2", H: "\u05D7", I: "\u05D9", J: "\u05D9", K: "\u05DB", L: "\u05DC",
  M: "\u05DE", N: "\u05E0", O: "\u05E2", P: "\u05E4", Q: "\u05E7", R: "\u05E8",
  S: "\u05E9", T: "\u05EA", U: "\u05D5", V: "\u05D5", W: "\u05D5", Y: "\u05D9", Z: "\u05D6",
};
const OCC_LAT = { // 希伯来 → 拉丁（dCode FAQ 首列；ט/ס/צ 不在此表=报错）
  "\u05D0": "A", "\u05D1": "B", "\u05D2": "C", "\u05D3": "D", "\u05D4": "E",
  "\u05D5": "F", "\u05D6": "Z", "\u05D7": "H", "\u05D9": "I", "\u05DB": "K",
  "\u05DC": "L", "\u05DE": "M", "\u05E0": "N", "\u05E2": "O", "\u05E4": "P",
  "\u05E7": "Q", "\u05E8": "R", "\u05E9": "S", "\u05EA": "T",
};
const OCC_HEB_NAMES = {
  "\u05D8": "ט(Teth)", "\u05E1": "ס(Samech)", "\u05E6": "צ(Tzaddi)",
};

function occultEncode(text, alphabet) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("神秘学字母：输入为空。");
  let out = "";
  for (const ch of src) {
    if (alphabet === "theban" || alphabet === "lunaire") {
      const up = ch.toUpperCase();
      if (!/[A-ZÑ]/.test(up)) { out += ch; continue; }
      if (alphabet === "theban") {
        if (up === "J") out += "I"; // I/J 同符（dCode 槽位 char(73)）
        else if (up === "V" || up === "W") out += "U"; // U/V/W 同符（槽位 char(85)）
        else out += up === "Ñ" ? "N" : up;
      } else {
        out += up === "Ñ" ? "N" : up; // lunaire：Ñ→N（dCode 口径），槽位 char(126)
      }
    } else { // celestial / malachim：拉丁→希伯来
      const up = ch.toUpperCase();
      if (!/[A-Z]/.test(up)) { out += ch; continue; }
      const heb = OCC_HEB[up];
      if (heb == null)
        throw new Error(
          `神秘学字母：字母 ${up} 无希伯来转写（X 在 dCode/Agrippa 均无对应，已省略不猜；C/G、I/J/Y、F/U/V/W 走 ג/י/ו 多对一）。`
        );
      out += heb;
    }
  }
  if (!out.trim()) throw new Error("神秘学字母：输入不含任何可编码字母。");
  return out;
}

function occultDecode(text, alphabet) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("神秘学字母：密文为空。");
  let out = "";
  if (alphabet === "theban" || alphabet === "lunaire") {
    for (const ch of src) {
      const up = ch.toUpperCase();
      out += /[A-Z]/.test(up) || up === "Ñ" ? up : ch;
    }
    return out;
  }
  for (const ch of src) {
    const lat = OCC_LAT[ch];
    if (lat != null) out += lat;
    else if (OCC_HEB_NAMES[ch])
      throw new Error(`神秘学字母：希伯来字母 ${OCC_HEB_NAMES[ch]} 无拉丁对应（dCode 原文明示），不能解码。`);
    else out += ch;
  }
  return out;
}

register({
  id: "occult", cat: "fancy", name: "神秘学字母四件",
  desc: "theban 档：巫师字母 24 符（J→I、V/W→U 合并，词尾 . 保留，文本 token=字母，图形层见 dCode）；lunaire 档：Katz 月相字母（Ñ→N，27 槽）；celestial/malachim 档：Agrippa 天使/玛拉基字母——拉丁↔希伯来转写（ג=C/G ו=F/U/V/W י=I/J/Y 收敛，X 无对应报错，ט/ס/צ 报错）；CELESTIAL→גהלהשתיאל",
  params: [
    { key: "alphabet", label: "字母表", type: "select", default: "theban",
      options: [
        { value: "theban", label: "Theban 巫师字母（1518 Trithemius；J→I、V/W→U）" },
        { value: "lunaire", label: "Lunaire 月相字母（Katz 1978；Ñ→N）" },
        { value: "celestial", label: "Celestial 天使字母（Agrippa；拉丁↔希伯来转写）" },
        { value: "malachim", label: "Malachim 玛拉基字母（Agrippa；拉丁↔希伯来转写）" },
      ] },
  ],
  encode: (t, p) => occultEncode(t, (p && p.alphabet) || "theban"),
  decode: (t, p) => occultDecode(t, (p && p.alphabet) || "theban"),
});

export { occultEncode, occultDecode, OCC_HEB, OCC_LAT, OCC_HEB_NAMES };
