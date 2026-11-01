/*
 * edu_marineFlags.js — 科普卡候选（国际信号旗文本码）。纯数据，无 import 无副作用。
 * 来源：dCode「Code des Signaux Maritimes」/ Wikipedia「International maritime signal flags」
 * （均 2026-09-22 访问）。
 */
export default {
  marineFlags: {
    what: "国际信号旗文本码——国际海上信号 code（ICS）：每面旗代表一个字母（A-Z 方旗）或一个数字（0-9 是另一套三角旗形制）。无线电发明前船与船、船与岸就靠挂旗对话；今天仍在用（ NATO 海军、帆船赛），CTF 里作为字母↔旗的替换码出现。",
    principle:
      "一旗一字符：26 面字母旗 + 10 面数字旗。单旗另有完整语义（A 旗=我船下有潜水员请避让、O 旗=有人落水……），本工具只做文本替换层。\n" +
      "代旗（substitute flags）：一条船只带一套旗，同一组里字母重复就挂不了——于是有四面「代旗」，分别代表本组第 1/2/3/4 面旗（第 4 面非官方）。dCode 例：SOS = S、O、第 1 代旗（第 1 面旗 S 的替身）。\n" +
      "文本化约定（诚实声明）：旗形没有 Unicode 官方编码（区域指示符是国旗 emoji，不是信号旗）。dCode 内部就用字符本身命名旗图（字母旗 char(65..90)、数字旗 char(48..57)、代旗 char(107..110)=k/l/m/n），本工具同款：文本 token = 字母/数字本身，代旗 = 小写 k/l/m/n（大小写敏感，大写 K/L/M/N 是字母旗）。\n" +
      "分组：空格分词 = 一组（一次挂旗 hoist）；代旗只在本组内生效。",
    usage:
      "一个参数：代旗档（默认开）。开：编码时组内重复第 1..4 面旗的字符自动用 k/l/m/n 代旗（SOS→SOk、ABCDCD→ABCDmn、2020→20kl——数字旗与字母旗同位计数，同样可被代旗替换）；解码反向还原并校验（代旗引用不存在的位置报错）。关：原样字母，解码遇 k/l/m/n 报错。",
    examples: [
      { in: "SOS", param: "默认（代旗开）", out: "SOk", desc: "dCode 页面例：第三个 S 挂第 1 代旗（重复本组第 1 面旗 S）" },
      { in: "SOk", param: "默认，解码", out: "SOS", desc: "代旗还原" },
      { in: "FLAG", param: "默认", out: "FLAG", desc: "dCode 页面例：无重复字母，四面旗原样" },
      { in: "NAVY", param: "默认，解码", out: "NAVY", desc: "dCode 页面解码例" },
    ],
    formulas: [
      { tex: "f_j = \\begin{cases}\\mathrm{sub}_k & \\exists\\, k{\\le}4:\\ x_j = f_k \\\\ x_j & \\text{else}\\end{cases}", caption: "代旗规则：组内第 j 字符与第 1..4 面旗相同时挂第 k 代旗（k/l/m/n）" },
    ],
    tips: [
      "识别：红黄蓝白黑拼色的方旗/三角旗序列（ICS 旗不用绿色）、海军/帆船/旗语/信号旗关键词。",
      "和臂板 semaphore 区分：旗语（semaphore）是两面手持旗摆角度，一个动作一个字母；信号旗是一根绳上依次挂的整面旗。本项目另有臂板 semaphore op，别混。",
      "代旗规则按位置不按字母：第 1 代旗永远指本组第 1 面旗——ABAB 加密成 ABkl（第 3、4 字符分别重复第 1、2 面旗）。",
      "小写 k/l/m/n 是代旗、大写 K/L/M/N 是字母旗——文本数据丢大小写信息时这层就没法解了，交换题目务必保留大小写。",
      "单旗语义彩蛋：解码拿到 A-Z 单旗时查 ICS 单旗表常有剧情提示（O=有人落水、W=我需要医疗援助）。",
      "数字旗形制不同（三角/三角缺角），文本层与数字同形；图片层可查 NATO 数字旗表。",
      "来源：dCode https://www.dcode.fr/code-signal-maritime 、Wikipedia https://en.wikipedia.org/wiki/International_maritime_signal_flags （访问日期 2026-09-22）。",
    ],
    aka: ["信号旗", "国际信号旗", "旗语", "海事旗", "marine flags", "signal flags",
      "International maritime signal flags", "ICS flags", "nautical flags", "pavillons maritimes",
      "海军旗语", "船舶信号旗", "flag alphabet", "代旗"],
  },
};
