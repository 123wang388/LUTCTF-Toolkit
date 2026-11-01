/*
 * edu_ragbaby.js — 科普卡：Ragbaby。纯数据，无 import 无副作用。
 * 来源：Young Tyros「Ragbaby Tutorial」(ACA，2026-09-20 访问) / dCode「Chiffre Ragbaby」(2026-09-20 访问)
 *       / CipherChronicle「Ragbaby cipher」(2026-09-20 访问)。算例均已用独立参考实现复算。
 */
export default {
  ragbaby: {
    what: "Ragbaby 密码——一种多表代换：位移量不看「消息里的第几个字母」，而看「这个词里的第几个字母」，词内第 1 个移 1、第 2 个移 2……而且每个新词的起点还要再往后挪 1。",
    principle:
      "两样东西决定它：\n\n" +
      "（1）关键词字母表：把关键词去重后的字母写在最前，再按顺序补上其余字母。例如关键词 `CIPHER` 得到 24 字母表 `CIPHERABDFGKLMNOQSTUVWYZ`。\n\n" +
      "（2）位移量：词内第 $p$ 个字母、全文第 $w$ 个词（都从 1 起）时，位移 $= w + p - 1$。也就是第一个词移 1,2,3…，第二个词接着从 2 开始移 2,3,4…，第三个词从 3 开始——所以每个新词的起点比上个词的起点多 1。\n\n" +
      "加密就是在关键词字母表里把明文字母右移这么多位，解密则左移同样的位数（对表长取模）。\n\n" +
      "原始版本用 24 字母表：把 I/J 合并、W/X 合并，等于去掉 J 和 X。本工具另给 26 字母档，往返无损。",
    usage:
      "四个参数：keyword 是关键词（留空则用标准 A-Z 顺序表）；alphabet 选 24（原始，去 J、X）或 26（无损）；startShift 是第一个词第一位的位移（默认 1，对应 dCode 的「Décalage du premier mot」）；letterStep 是词内每后移一位增加的位移（默认 1）。\n\n" +
      "编码：填明文 → 密文（输出大写）；解码：填密文 + 相同参数 → 明文。词界（空格）保留、参与换词计数；词内标点（连字符、撇号）不重置计数。",
    examples: [
      { in: "Now is the time for all good men", param: "keyword=CIPHER, alphabet=24", out: "OSC HV WBF YAUK NWL LUV SZCT WMC", desc: "Young Tyros（ACA）教程原例：关键词 CIPHER，逐词递增位移" },
      { in: "MEET AT NOON", param: "keyword=KEY, alphabet=26", out: "NABX CW QSTT", desc: "26 字母无损档" },
      { in: "HELLO", param: "keyword=ROBIN, alphabet=24", out: "KGQSC", desc: "短词例，位移 1..5" },
    ],
    formulas: [
      { tex: "\\text{shift}(w,p) = w + p - 1,\\qquad C = \\text{KA}\\!\\left[(\\text{KA}^{-1}(P) + \\text{shift}) \\bmod L\\right]", caption: "w=词序号、p=词内位置（均从 1 起），KA=关键词字母表，L=表长" },
    ],
    tips: [
      "识别：密文保留了原词长（空格位置不变），但同一个字母在不同位置会变成不同的密文字母——频率分析失效。",
      "每个词的第一个字母位移固定，所以「所有词首字母」构成一个单表代换样本，是经典突破口（配 1-2 字母短词如 A / OF / TO 很快）。",
      "24 字母档下 J→I、X→W，含 J/X 的明文往返会被归一化；要无损就用 26 字母档。",
      "口诀：位移 = 词序号 + 词内位置 − 1（ACA/Gaines 口径，Ct = Pt + Shift）。",
      "安全边界：位移完全由词结构决定、不含密钥流，已知明文或词组即可反推字母表——仅用于 CTF/教学，不可用于真实保密。",
      "来源：Young Tyros「Ragbaby Tutorial」https://youngtyros.com/2023/02/28/ragbaby-tutorial/ （美国 ACA 教程，访问日期 2026-09-20）；dCode「Chiffre Ragbaby」https://www.dcode.fr/chiffre-ragbaby 。",
    ],
    aka: [
      "Ragbaby",
      "Ragbaby 密码",
      "拉格贝比密码",
      "ragbaby cipher",
      "词内递增位移",
      "递增位移密码",
      "progressive shift cipher",
      "关键词字母表递增位移",
      "ACA Ragbaby",
      "渐进位移替换",
      "24 字母 Ragbaby",
    ],
  },
};
