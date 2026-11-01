/*
 * edu_babylonianNumerals.js — 科普卡候选（巴比伦数字）。纯数据，无 import 无副作用。
 * 来源：dCode「Numération Babylonienne」/ Wikipedia「Babylonian numerals」（均 2026-09-22 访问）。
 */
export default {
  babylonianNumerals: {
    what: "巴比伦数字——古巴比伦/苏美尔的楔形文字计数法：竖楔（钉）=1、横楔（人字/chevron）=10，加法组成 1..59，然后按 60 进制位值进位（六十进制）。这是人类最早的位值制系统，也是今天时分秒 60 进制的祖先。",
    principle:
      "两个符号：竖楔 𒐕（文本常记 |）=1，横楔 𒌋（记 <）=10。23 = 2 横 + 3 竖（2×10+3）。\n" +
      "六十进制位值：dCode 例 3842 写作「| |||| ||」三个空格分开的位组 = 1×60² + 4×60 + 2；61 写作「| |」= 1×60 + 1。最高位在左。\n" +
      "dCode 的 14 字形表：1..9 各有单符（𒐕..𒐝），10/20/30/40/50 各有单符（𒌋𒎙𒌍𒐏𒐐）——unicode 档位内先用十位单符再个位单符（23 = 𒎙𒐗）。\n" +
      "没有零：巴比伦人不知道零，晚期才用图形分隔符占位且只用在中间位。文本域里本工具用 ASCII 0 占位（3600 = 「𒐕 0 0」），空位分组会丢位数，不能用。\n" +
      "Wikipedia 用 𒁹（U+12079 DISH）作单位楔而 dCode 用 𒐕（U+12415）——解码两者都按 1 计。",
    usage:
      "一个参数：符号形态（unicode=dCode 14 字形表；ascii=| 与 < 记法，dCode/Wikipedia 同款）。\n" +
      "编码输入十进制非负整数（BigInt 大数可），输出空格分位的六十进制楔形串；解码反向求值。负数/小数/位值>59/前导零位显式报错。",
    examples: [
      { in: "23", param: "默认（unicode）", out: "𒎙𒐗", desc: "dCode 例：2 dizaines + 3 unités → 20符+3符" },
      { in: "23", param: "form=ascii", out: "<<|||", desc: "ASCII 记法：2 个 < 加 3 个 |" },
      { in: "3842", param: "form=ascii", out: "| |||| ||", desc: "dCode 页面原例逐字：1×60²+4×60+2 = 3842" },
      { in: "3600", param: "默认", out: "𒐕 0 0", desc: "六十进制 1,0,0——零位用 0 占位（工具约定，历史上无零）" },
    ],
    formulas: [
      { tex: "n = \\sum_i d_i \\cdot 60^i,\\quad 0 \\le d_i \\le 59,\\quad d_i = 10t_i + u_i", caption: "六十进制位值：每位再按 10+1 两符号加法展开" },
    ],
    tips: [
      "识别：楔形（钉子形/箭头形）符号、两河流域/汉谟拉比/泥板/Plimpton 322 梗、时分秒 60 进制联想。",
      "坑位：位组之间的空格是「进位」不是分隔装饰——「| |」是 61，「||」是 2，CTF 丢空格直接改变答案。",
      "没有零：中问空位（如 3601=1,0,1）历史上靠上下文猜，文本工具必须显式占位（本工具用 0），交换数据时注意口径。",
      "每位的横楔最多 5 个（50）、竖楔最多 9 个——出现 6 个 < 或 10 个 | 就是没进位的错写。",
      "大数很快：60³ 就过 20 万，泥板天文表靠这个压缩位数；反过来解出异常大的数先怀疑进位读错。",
      "与玛雅数字对照着出题是经典组合题（两个位值制古文明各转一遍）。",
      "来源：dCode https://www.dcode.fr/nombres-babyloniens 、Wikipedia https://en.wikipedia.org/wiki/Babylonian_numerals （访问日期 2026-09-22）。",
    ],
    aka: ["巴比伦数字", "巴比伦计数", "楔形数字", "六十进制", "sexagesimal", "Babylonian numerals",
      "cuneiform numbers", "苏美尔数字", "Sumerian numerals", "楔形文字数字", "美索不达米亚数字", "base 60"],
  },
};
