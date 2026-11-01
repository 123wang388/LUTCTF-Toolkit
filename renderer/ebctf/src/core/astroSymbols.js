/*
 * astroSymbols.js — 天文 / 黄道符号字符集（cat:'fancy'，双向）。
 *
 * 族归并（一个 op + 参数档，收敛「同一内核的多个变体」）：
 *   同源内核＝「天体/星座的英文名 ↔ 该对象在 Unicode 标准里唯一的符号字符」。
 *   档 1 planets：太阳/月球/八大行星/冥王星/四颗最早发现的小行星（谷神星、智神星、婚神星、灶神星）。
 *   档 2 zodiac ：黄道十二宫符号。
 *   两档同属一个字符区族（Miscellaneous Symbols 区 U+2600–U+26FF 及其补充 U+2Bxx/U+1F7xx），
 *   输入域（英文名文本）与输出域（单个 Unicode 符号）一致，差别只在「符号清单属于哪一组」——
 *   即档位边界：同一天体的多个历史字形只在其所属档内互为别名，跨档符号解码时报错。
 *
 * ⚠ 边界声明：本 op 是**字符集映射**（名称 ↔ 符号），不做生辰→星座推算、不做占卜，
 *   也不处理星座日期区间（那属于「非编解码能力」，本工具箱不收录）。
 *
 * 权威依据（标准编号 + 版本 + 字符条目）：
 *   - The Unicode Standard（UnicodeData 字符数据库，版本以本机 CPython 3.11.4 的
 *     unicodedata 数据库 **14.0.0** 逐字符实测为准）：
 *       U+2600 BLACK SUN WITH RAYS ／ U+2609 SUN ／ U+263C WHITE SUN WITH RAYS
 *       U+263D FIRST QUARTER MOON ／ U+263E LAST QUARTER MOON
 *       U+263F MERCURY ／ U+2641 EARTH ／ U+2643 JUPITER ／ U+2644 SATURN
 *       U+2645 URANUS ／ U+2646 NEPTUNE ／ U+2647 PLUTO ／ U+26E2 ASTRONOMICAL SYMBOL FOR URANUS
 *       U+26B3 CERES ／ U+26B4 PALLAS ／ U+26B5 JUNO ／ U+26B6 VESTA
 *       U+2648 ARIES … U+2653 PISCES（连续 12 个，名称即十二宫英文名）
 *   - 名称与符号的一一对应关系直接取自上述**字符名**；两处名称与通行天文名称不一致，
 *     如实登记、不按通行名称改写 Unicode 名称：
 *       U+2640 的 Unicode 名是 FEMALE SIGN（通行天文名为金星 Venus）；
 *       U+2642 的 Unicode 名是 MALE SIGN（通行天文名为火星 Mars）。
 *     二者在字符层面是同一枚符号，被天文与性别两义共用——这是 Unicode 的既有事实，
 *     本 op 在天文语义下把 U+2640 绑定到 VENUS、U+2642 绑定到 MARS（并在下方表中显式标注）。
 *   - 别名（解码时接受的历史字形）只在其同义字形的 Unicode 名称可核实时收录；未收录者不猜：
 *       U+26E2（ASTRONOMICAL SYMBOL FOR URANUS）与 U+2645 同为天王星符号；
 *       U+2600 / U+263C 为太阳的另两个 Unicode 名称明确的字形；U+263E 为月球的另一半月相字形。
 *
 * 契约（如实登记）：
 *   - encode：输入按「连续字母」切分为名称 token，大小写不敏感；token 必须是当前档的英文名，
 *     未知名（含拼写错误、缩写）→ 显式报错（不猜缩写，避免编造 IAU 缩写的歧义）。
 *     非字母字符（空格、逗号、斜杠等）原样透传，用作分隔保留。
 *   - decode：输入按字符扫描，命中当前档符号 → 输出其规范英文名（大写）；命中另一档的符号 →
 *     报错并提示换档；标点与空白原样透传（与 encode 的透传对称，保证含标点输入可逆）；
 *     其余字符（字母、不属于本档的外来符号如 ★）→ 报错。不做「安静跳过」。
 */
import { register } from "./registry.js";

// 行星系（规范名 → 主符号码位；aliases 为解码时接受的历史字形）
const PLANETS = [
  ["SUN", 0x2609, [0x2600, 0x263c]],
  ["MOON", 0x263d, [0x263e]],
  ["MERCURY", 0x263f, []],
  ["VENUS", 0x2640, []],   // Unicode 名 = FEMALE SIGN（天文义为金星）
  ["EARTH", 0x2641, []],
  ["MARS", 0x2642, []],    // Unicode 名 = MALE SIGN（天文义为火星）
  ["JUPITER", 0x2643, []],
  ["SATURN", 0x2644, []],
  ["URANUS", 0x2645, [0x26e2]], // ⛢ ASTRONOMICAL SYMBOL FOR URANUS
  ["NEPTUNE", 0x2646, []],
  ["PLUTO", 0x2647, []],
  ["CERES", 0x26b3, []],
  ["PALLAS", 0x26b4, []],
  ["JUNO", 0x26b5, []],
  ["VESTA", 0x26b6, []],
];

// 黄道十二宫（U+2648 ARIES … U+2653 PISCES，顺序即 Unicode 名称顺序）
const ZODIAC = [
  ["ARIES", 0x2648, []], ["TAURUS", 0x2649, []], ["GEMINI", 0x264a, []],
  ["CANCER", 0x264b, []], ["LEO", 0x264c, []], ["VIRGO", 0x264d, []],
  ["LIBRA", 0x264e, []], ["SCORPIUS", 0x264f, []], ["SAGITTARIUS", 0x2650, []],
  ["CAPRICORN", 0x2651, []], ["AQUARIUS", 0x2652, []], ["PISCES", 0x2653, []],
];

const SETS = { planets: PLANETS, zodiac: ZODIAC };

function buildTables(setName) {
  const set = SETS[setName] || SETS.planets;
  const enc = new Map(); // NAME → 主码位
  const dec = new Map(); // 码位(主+别名) → NAME
  for (const [name, cp, aliases] of set) {
    enc.set(name, cp);
    dec.set(cp, name);
    for (const a of aliases) dec.set(a, name);
  }
  return { enc, dec, set };
}

const TABLES = { planets: buildTables("planets"), zodiac: buildTables("zodiac") };

function astroEncode(text, setName) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("天文符号：输入为空。");
  const { enc } = TABLES[setName] || TABLES.planets;
  let out = "";
  let token = "";
  const flush = () => {
    if (!token) return;
    const name = token.toUpperCase();
    if (!enc.has(name))
      throw new Error(`天文符号：未知名称 "${token}"（本档只认标准英文名，缩写与拼写变体不收）。`);
    out += String.fromCodePoint(enc.get(name));
    token = "";
  };
  for (const ch of src) {
    if (/[A-Za-z]/.test(ch)) token += ch;
    else { flush(); out += ch; }
  }
  flush();
  return out;
}

function astroDecode(text, setName) {
  const src = String(text == null ? "" : text);
  if (!src.trim()) throw new Error("天文符号：密文为空。");
  const name = (setName === "zodiac") ? "zodiac" : "planets";
  const { dec } = TABLES[name];
  const other = name === "zodiac" ? TABLES.planets.dec : TABLES.zodiac.dec;
  let out = "";
  for (const ch of src) {
    const cp = ch.codePointAt(0);
    if (dec.has(cp)) { out += dec.get(cp); continue; }
    if (other.has(cp))
      throw new Error(
        `天文符号：符号 "${ch}" 属于${name === "zodiac" ? "行星" : "黄道"}档，当前为${name === "zodiac" ? "黄道" : "行星"}档（换档再试）。`
      );
    if (/\s/.test(ch)) { out += ch; continue; }
    if (/[!-\/:-@\[-`{-~]/.test(ch)) { out += ch; continue; } // ASCII 标点透传（与 encode 对称；★ 等外来符号不在此列，仍报错）
    throw new Error(`天文符号：字符 "${ch}" 不在本档符号表内（本档只认标准天文/黄道符号字符）。`);
  }
  return out;
}

register({
  id: "astroSymbols", cat: "fancy", name: "天文 / 黄道符号",
  desc: "天体与星座英文名 ↔ Unicode 标准符号：planets 档 太阳☉月球☽水星☿金星♀地球♁火星♂…谷神⚳(U+2609/263D/263F/2640/2641/2642…26B3–B6)；zodiac 档 十二宫 ♈–♓(U+2648–2653)；异档符号与未知名称显式报错，非字母字符透传",
  params: [
    { key: "set", label: "符号集", type: "select", default: "planets",
      options: [
        { value: "planets", label: "行星系（☉☽☿♀♁♂♃♄♅♆♇ + 谷神/智神/婚神/灶神）" },
        { value: "zodiac", label: "黄道十二宫（♈♉♊♋♌♍♎♏♐♑♒♓）" },
      ] },
  ],
  encode: (t, p) => astroEncode(t, (p && p.set) || "planets"),
  decode: (t, p) => astroDecode(t, (p && p.set) || "planets"),
});

export { astroEncode, astroDecode, PLANETS, ZODIAC };