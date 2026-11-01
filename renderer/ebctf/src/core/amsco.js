/*
 * amsco.js — AMSCO 换位密码（cat:'classic'）。
 *
 * 原理（照权威来源，未编造）：
 *  - AMSCO 是「不完整列的列换位」：明文按行写入一个 L 列网格（L = 密钥长度），
 *    每个格子的容量（1 个或 2 个字母，由切割序列给出）沿**反对角线**取值；再按密钥
 *    给出的列序逐列读出。
 *  - 容量规则（dCode FAQ「Comment découper correctement le texte dans la grille ?」）：
 *    「Le texte doit alterner les tailles de coupes (**même si la clé est de taille paire**)
 *      ce qui formera alors des ensembles en **diagonales**」
 *    → 同一反对角线 d = 行+列 上的所有格容量相同，容量 = cut[d mod |cut|]。即宽 3 切 1,2 时
 *      1 2 1
 *      2 1 2
 *      1 2 1
 *    dCode 同页另给三张容量表佐证：宽 3 切 (2,1) = 212/121/212；宽 4 切 (1,2) = 1212/2121/1212；
 *    宽 3 切 (3,2,1) = 321/213/132。注意「宽 4」与「3 元切割」两例**只在反对角线口径下成立**
 *    （行主序口径会给出 1212/1212/1212 与 321/321/321，与权威不符）。
 *  - 格子在网格中按行主序展开，末格按剩余字符数截断；dCode 明文写出 10 字符时
 *    容量表为 121/212/100，即「1+2+1+2+1+2+1+0+0 = 10」，剩余为 0 的格不再占用字符。
 *  - 列序 = 密钥字母升序（稳定，同字母按列号先后）。读列时自上而下拼接各格内容。
 *
 * 权威来源：
 *  - dCode「Chiffre AMSCO」(https://www.dcode.fr/chiffre-amsco)，访问日期 2026-09-21。
 *    该页给出完整算例：明文 DCODEAMSCO、密钥 CLE（列序 1,3,2）、切割 1,2 → 密文 DEAODSCCOM；
 *    并给出解密时网格容量表 121/212/100 与逐列写回过程；另有上述四张容量表与
 *    「même si la clé est de taille paire」的明文规定。本实现默认参数即该例。
 *  - 交叉权威（端到端、独立于 dCode）：SPOJ AMSCO1/AMSCO2（SP13941/SP14435，
 *    https://www.spoj.com/problems/AMSCO1/ ，访问日期 2026-09-21）。两题互为加解密，给出
 *    密钥序 41325 + 明文 INCOMPLETECOLUMNARWITHALTERNATINGSINGLELETTERSANDDIGRAPHS
 *    → 密文 CECRTEGLENPHPLUTNANTEIOMOWIRSITDDSINTNALINESAALEMHATGLRGR，并附完整网格
 *    （其容量沿反对角线、以双字母起首，等价于本 op 的 cut="2,1"）。
 *  - 词源：AMSCO 为 19 世纪 A. M. Scott 姓名缩写（dCode FAQ「Quand AMSCO a-t-il été inventé ?」）。
 *
 * 约定：
 *  - 明文/密文只取 A-Z（其余字符丢弃），输出大写；密钥只取字母，大写后排序。
 *  - 明文长度 > 网格容量时？不需要——网格按需增长行数，任意长度都可容纳。
 *
 * 契约：register({id, cat:"classic", name, desc, params, encode, decode})。
 */
import { register } from "./registry.js";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 解析切割序列（如 "1,2" 或 "3 2 1"），返回正整数数组。 */
function parseCut(spec) {
  const parts = String(spec == null ? "" : spec).split(/[^0-9]+/).filter(Boolean);
  if (!parts.length) throw new Error("AMSCO：切割序列为空（如 1,2）。");
  return parts.map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 1)
      throw new Error(`AMSCO：切割序列含非法值 ${s}（须为正整数）。`);
    return n;
  });
}

/** 解析密钥为「列序」：按密钥字母升序稳定排序后的列下标数组。 */
function keyOrder(key) {
  const letters = [...String(key == null ? "" : key).toUpperCase()].filter((c) => AZ.includes(c));
  if (!letters.length) throw new Error("AMSCO：密钥为空（须为字母，决定列序）。");
  return letters
    .map((ch, i) => [ch, i])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))
    .map(([, i]) => i);
}

/**
 * 行主序展开的每格容量表（长度 = 实际占用的格子数，末格按剩余截断）。
 *
 * 权威口径：容量只取决于反对角线序号 d = r + c，cap = cut[d mod cut.length]。
 * L 必须传入——容量与列数有关，旧版按「格子序号 k mod |cut|」取值等价于行主序，
 * 仅在 (L-1) ≡ 0 (mod |cut|) 时与权威重合。
 */
function cellCaps(n, L, cut) {
  if (!Number.isInteger(L) || L < 1) throw new Error("AMSCO：列数 L 非法（须为正整数）。");
  const caps = [];
  let rem = n;
  let r = 0;
  let c = 0;
  while (rem > 0) {
    const cap = cut[(r + c) % cut.length];
    const take = Math.min(cap, rem);
    caps.push(take);
    rem -= take;
    c++;
    if (c === L) {
      c = 0;
      r++;
    }
  }
  return caps;
}

/** 纯函数：由容量表 + 列序装配网格并按列读出。 */
function readColumns(grid, rows, order) {
  let out = "";
  for (const c of order) for (let r = 0; r < rows; r++) out += grid[r][c];
  return out;
}

function amscoEncode(text, key, cutSpec) {
  const order = keyOrder(key);
  const cut = parseCut(cutSpec);
  const L = order.length;
  const letters = [...String(text == null ? "" : text).toUpperCase()].filter((c) => AZ.includes(c));
  if (!letters.length) throw new Error("AMSCO：明文不含任何 A-Z 字母。");
  const caps = cellCaps(letters.length, L, cut);
  const rows = Math.ceil(caps.length / L);
  const grid = Array.from({ length: rows }, () => new Array(L).fill(""));
  let pos = 0;
  for (let k = 0; k < caps.length; k++) {
    const r = Math.floor(k / L), c = k % L;
    grid[r][c] = letters.slice(pos, pos + caps[k]).join("");
    pos += caps[k];
  }
  return readColumns(grid, rows, order);
}

function amscoDecode(text, key, cutSpec) {
  const order = keyOrder(key);
  const cut = parseCut(cutSpec);
  const L = order.length;
  const letters = [...String(text == null ? "" : text).toUpperCase()].filter((c) => AZ.includes(c));
  if (!letters.length) throw new Error("AMSCO：密文不含任何 A-Z 字母。");
  const caps = cellCaps(letters.length, L, cut);
  const rows = Math.ceil(caps.length / L);
  const grid = Array.from({ length: rows }, () => new Array(L).fill(""));
  const byCol = new Map();
  for (let k = 0; k < caps.length; k++) {
    const r = Math.floor(k / L), c = k % L;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push([r, caps[k]]);
  }
  let pos = 0;
  for (const c of order) {
    for (const [r, cap] of byCol.get(c) || []) {
      grid[r][c] = letters.slice(pos, pos + cap).join("");
      pos += cap;
    }
  }
  let out = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < L; c++) out += grid[r][c];
  return out;
}

register({
  id: "amsco", cat: "classic", name: "AMSCO 密码",
  desc: "不完整列换位：网格每格容量沿反对角线交替（切割序列，默认 1,2），按密钥字母序逐列读出；默认例 DCODEAMSCO+CLE → DEAODSCCOM",
  params: [
    { key: "key", label: "密钥（决定列序）", type: "text", default: "CLE" },
    { key: "cut", label: "切割序列（交替的每格容量，逗号分隔）", type: "text", default: "1,2" },
  ],
  encode: (t, p) => amscoEncode(t, (p && p.key != null) ? p.key : "CLE", (p && p.cut != null) ? p.cut : "1,2"),
  decode: (t, p) => amscoDecode(t, (p && p.key != null) ? p.key : "CLE", (p && p.cut != null) ? p.cut : "1,2"),
});

export { amscoEncode, amscoDecode, keyOrder, cellCaps, parseCut };
