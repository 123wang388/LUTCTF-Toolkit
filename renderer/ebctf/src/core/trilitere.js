/*
 * trilitere.js — Trilitère 三元密码（cat:'classic'）。
 *
 * 原理（照权威来源，未编造）：
 *  - 单表替换：每个明文字母 → 三个符号组成的三元组（trigram）。是培根二元密码的三进制姊妹。
 *  - 基础档（dCode「Base 3 (espace ⌴ à la fin = CCC)」）：A=AAA, B=AAB, C=AAC, D=ABA, …
 *    等价于 A=0,B=1,C=2 的三进制计数，值 v=0..25 对应 A..Z，v=26(CCC) 分配给空格。
 *  - 变体档「Base 3 (espace ⌴ au début = AAA)」把空格放最前：⌴=AAA, A=AAB, …, Z=CCC（整体 +1）。
 *  - 三个符号默认 A/B/C，也可换成 1/2/3 或 0/1/2（仅改书写符号，不改三元组结构）。
 *
 * 权威来源：
 *  - dCode「Chiffre Trilitère」(https://www.dcode.fr/chiffre-trilitere)，访问日期 2026-09-21：
 *    给出完整字母表序列（Base3 空格=CCC / 空格=AAA 两档，逐条抄录并已用脚本校验为 27 个
 *    三元组的完整置换，见 ref/trilitere_tables_check.py），并给出算例 DCODE → ABA AAC BBC ABA ABB。
 *    本实现默认参数复现该例。
 *  - 同页说明：trilitère 三元字母表最早出现于 1550-1650 年；可与培根密码同样用于文本隐写。
 *    同页另列 Frederici / Cardan / Vigenère / Wilkins 四张三元表，但四表均有**重复三元组**
 *    （如 Frederici 的 I=BBA 与 J=BBA、U=CAA 与 V=CAA；Cardan 的 I=ABB 与 J=ABB、
 *    U=V=W=BAB）且**均缺空格项**（26 项 × 4 = 104 字符，应为 108），转录不可靠——
 *    本实现不收这四张表（不编造）。
 *
 * 约定：
 *  - 明文中非 A-Z 且非空格的字符一律丢弃（字母表只定义 A-Z 与空格），输出大写。
 *  - 密文分组长度必须是 3 的倍数，且**只含所选三个符号**（允许空白作为三元组分隔符，
 *    如 dCode 算例的书写形式 "ABA AAC BBC ABA ABB"）；出现任何表外字符一律报错，
 *    不再静默过滤——静默过滤会把「多打了一个字符」的输入解成看似正常的结果。
 *  - 符号集若全为字母，则匹配忽略大小写（"abc" 与 "ABC" 等价）；若忽略大小写后有重复
 *    （如 "aA1"）则拒绝，因为无法确定唯一映射。
 *  - variant 只接受 base3 / base3space；其他取值（含科普中点名的未收录档如 frederici）
 *    一律报错，不再静默回落到 base3。
 *
 * 契约：register({id, cat:"classic", name, desc, params, encode, decode})。
 */
import { register } from "./registry.js";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ABC = "ABC";
const VARIANTS = ["base3", "base3space"];

/** 生成 27 项表：{ label -> "ABC 三元组" }。spaceVariant: "CCC" 或 "AAA"。 */
function trilitereTable(spaceVariant) {
  const t = new Map();
  for (let i = 0; i < 26; i++) {
    const v = spaceVariant === "AAA" ? i + 1 : i;
    t.set(AZ[i], ABC[Math.floor(v / 9)] + ABC[Math.floor(v / 3) % 3] + ABC[v % 3]);
  }
  t.set(" ", spaceVariant === "AAA" ? "AAA" : "CCC");
  return t;
}

/** 归一化档位：未给出时取默认 base3；给出但不认识则报错（不再静默回落）。 */
function normVariant(variant) {
  if (variant == null || String(variant).trim() === "") return "CCC";
  const s = String(variant).trim();
  if (s === "base3") return "CCC";
  if (s === "base3space") return "AAA";
  throw new Error(
    `Trilitère：未知三元表档位 "${s}"（仅支持 ${VARIANTS.join(" / ")}；` +
    `Frederici/Cardan/Vigenère/Wilkins 四表因来源转录不可靠未收录）。`
  );
}

/**
 * 解析符号集：恰好 3 个互异字符；不得含空白；忽略大小写后仍须互异。
 * 返回 { chars, fold: boolean }，fold=true 表示按忽略大小写匹配。
 */
function parseSymbols(spec) {
  const s = String(spec == null ? "" : spec);
  const chars = [...s];
  if (chars.length !== 3)
    throw new Error(`Trilitère：符号集须恰好 3 个互异字符（当前 ${chars.length} 个）。`);
  if (new Set(chars).size !== 3)
    throw new Error("Trilitère：符号集有重复字符，须 3 个互异字符。");
  if (chars.some((c) => /\s/.test(c)))
    throw new Error("Trilitère：符号集不能含空白字符（空白用作三元组分隔符）。");
  const fold = chars.every((c) => /[A-Za-z]/.test(c));
  if (fold && new Set(chars.map((c) => c.toUpperCase())).size !== 3)
    throw new Error("Trilitère：符号集忽略大小写后有重复（如 a/A），无法确定唯一映射。");
  return { chars, fold };
}

/** 取字符在符号集中的下标；找不到返回 -1。符号集全为字母时忽略大小写。 */
function symIndexOf(sym, ch) {
  if (!sym.fold) return sym.chars.indexOf(ch);
  const f = ch.toUpperCase();
  for (let i = 0; i < 3; i++) if (sym.chars[i].toUpperCase() === f) return i;
  return -1;
}

function trilitereEncode(text, variant, symbolsSpec) {
  const spaceVariant = normVariant(variant);
  const table = trilitereTable(spaceVariant);
  const sym = parseSymbols(symbolsSpec);
  const src = String(text == null ? "" : text).toUpperCase();
  let out = "";
  let any = false;
  for (const ch of src) {
    const tri = table.get(ch === " " ? " " : ch);
    if (tri === undefined) continue; // 非 A-Z / 非空格：丢弃
    any = true;
    for (const c of tri) out += sym.chars[ABC.indexOf(c)];
  }
  if (!any) throw new Error("Trilitère：明文不含任何 A-Z 字母或空格。");
  return out;
}

function trilitereDecode(text, variant, symbolsSpec) {
  const spaceVariant = normVariant(variant);
  const table = trilitereTable(spaceVariant);
  const rev = new Map();
  for (const [label, tri] of table) rev.set(tri, label);
  const sym = parseSymbols(symbolsSpec);

  const idxs = [];
  const bad = [];
  for (const ch of String(text == null ? "" : text)) {
    const i = symIndexOf(sym, ch);
    if (i >= 0) {
      idxs.push(i);
      continue;
    }
    if (/\s/.test(ch)) continue; // 合法分隔符：空白
    bad.push(ch);
  }
  if (bad.length)
    throw new Error(
      `Trilitère：密文含表外符号 "${[...new Set(bad)].join("")}"` +
      `（只允许所选三符号 ${sym.chars.join("")} 与空白分隔符）。`
    );
  if (!idxs.length) throw new Error("Trilitère：密文为空或不含所选三个符号。");
  if (idxs.length % 3 !== 0)
    throw new Error(`Trilitère：密文长度 ${idxs.length} 不是 3 的倍数（三元组不完整）。`);

  let out = "";
  for (let i = 0; i < idxs.length; i += 3) {
    const tri = ABC[idxs[i]] + ABC[idxs[i + 1]] + ABC[idxs[i + 2]];
    const label = rev.get(tri);
    if (label === undefined)
      throw new Error(`Trilitère：三元组 "${tri}" 不在 ${spaceVariant === "AAA" ? "空格=AAA" : "空格=CCC"} 码表内。`);
    out += label;
  }
  return out;
}

register({
  id: "trilitere", cat: "classic", name: "Trilitère 三元密码",
  desc: "每字母 → abc 三元组（三进制，培根密码的三元姊妹）：默认 A=AAA…Z=CCB、空格=CCC；可换 1/2/3 或 0/1/2 符号",
  params: [
    { key: "variant", label: "三元表", type: "select", default: "base3",
      options: [
        { value: "base3", label: "Base 3（空格=CCC，A=AAA…Z=CCB）" },
        { value: "base3space", label: "Base 3（空格=AAA，A=AAB…Z=CCC）" },
      ] },
    { key: "symbols", label: "使用的三个符号", type: "text", default: "ABC", placeholder: "如 ABC / 123 / 012" },
  ],
  encode: (t, p) => trilitereEncode(t, (p && p.variant) || "base3", (p && p.symbols != null) ? p.symbols : "ABC"),
  decode: (t, p) => trilitereDecode(t, (p && p.variant) || "base3", (p && p.symbols != null) ? p.symbols : "ABC"),
});

export { trilitereEncode, trilitereDecode, trilitereTable, parseSymbols, normVariant };
