/*
 * edu_sga.js — 科普卡候选（银河标准字母 SGA）。纯数据，无 import 无副作用。
 * 来源：dCode「Alphabet Galactique Standard」（2026-09-22 访问）。
 */
export default {
  sga: {
    what: "银河标准字母（Standard Galactic Alphabet, SGA）——26 个自创符号一对一替换 26 个拉丁字母的游戏梗字母表：1990 年诞生于 Commander Keen，Quake 4 里用过，最出圈的是 Minecraft——附魔台上的「外星文」就是它，所以又叫附魔台字母/银河标准字母。",
    principle:
      "逐字符单表替换，无密钥：a=ᔑ b=ʖ c=ᓵ d=↸ e=ᒷ f=⎓ g=⊣ h=⍑ i=╎ j=⋮ k=ꖌ l=ꖎ m=ᒲ n=リ o=𝙹 p=! q=¡ r=ᑑ s=∷ t=ᓭ u=ℸ̣(带下加点) v=⚍ w=⍊ x=∴̇(带上加点) y=/ z=||。\n" +
      "诚实说明：SGA 本体是图形，没有 Unicode 官方编码。上面这串是 dCode 收录的民间 Unicode 适配（借加拿大音节、数学符号、假名リ等凑形）——dCode 自己评价「adaptation très mauvaise…assez répandue」（很糟糕但流传很广），CTF 里流通的就是它。\n" +
      "数字 0-9 不在 SGA 里（dCode 原文明示），编码时原样保留。\n" +
      "两个带组合符的坑：u 是 ℸ+U+0323（下加点）、x 是 ∴+U+0307（上加点）——复制粘贴时组合点容易丢，解码对裸 ℸ/∴ 也认。",
    usage:
      "无参数。编码：字母大写化逐个替换，数字与其它字符原样。解码：贪心匹配（先试多码点的 u/x/z，再单字符），未知字符原样。flag 里常见的 || 是 z 不是两个 l。",
    examples: [
      { in: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", param: "编码", out: "ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹!¡ᑑ∷ᓭℸ̣⚍⍊∴̇/||", desc: "dCode FAQ 的 26 符串逐字复现（本 op 的权威向量）" },
      { in: "ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹!¡ᑑ∷ᓭℸ̣⚍⍊∴̇/||", param: "解码", out: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", desc: "反向读回，验证双向可逆" },
      { in: "MINECRAFT", param: "编码", out: "ᒲ╎リᒷᓵᑑᔑ⎓ᓭ", desc: "dCode 页面例（图片例的文本化，Minecraft 梗）" },
      { in: "FLAG", param: "编码", out: "⎓ꖎᔑ⊣", desc: "F=⎓ L=ꖎ A=ᔑ G=⊣；非字母字符原样保留（flag{sga} → ⎓ꖎᔑ⊣{sga}），数字同样不译" },
    ],
    formulas: [
      { tex: "c_i = \\mathrm{SGA}(p_i),\\quad p_i \\in \\{A..Z\\}", caption: "逐字符单表替换（无密钥；数字与非字母原样）" },
    ],
    tips: [
      "识别：附魔台/附魔书上的符号、Commander Keen、Quake 4、Minecraft 梗图、「外星文」。",
      "三个高频坑：p 的符号就是半角感叹号 !、q 是倒感叹号 ¡、z 是两个竖线 || —— 乍看像标点其实是字母。",
      "u/x 的组合点（U+0323/U+0307）复制时容易丢：本工具解码对裸 ℸ/∴ 容忍；但严格出题方可能用带点版本，交换时注意。",
      "别名一堆：enchanting table alphabet、Standard Galactic Alphabet、SGA、Galactic alphabet——CTF 搜索关键词。",
      "dCode 的第 27 个符号 ⨅（U+2A05）没有字母对应（页面串尾多出来的），本工具未收，见到它说明来源表不同。",
      "安全边界：单表替换+全网公开码表，纯装饰性编码，无任何密码学强度。",
      "来源：dCode https://www.dcode.fr/alphabet-galactique-standard （访问日期 2026-09-22）。",
    ],
    aka: ["银河标准字母", "SGA", "Standard Galactic Alphabet", "附魔台字母", "enchanting table",
      "Minecraft 附魔文", "银河字母", "Commander Keen alphabet", "Galactic Alphabet", "附魔语",
      "外星字母 Minecraft", "enchanting alphabet"],
  },
};
