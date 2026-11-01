/*
 * edu_jefferson.js — 科普卡：杰斐逊轮盘。纯数据，无 import 无副作用。
 * 来源：Wikipedia「Jefferson disk」(2026-09-20 访问) / dCode「Cylindre de Jefferson」(2026-09-20 访问)。
 */
export default {
  jefferson: {
    what: "杰斐逊轮盘（Jefferson disk，又叫 Bazeries 圆盘）——一串刻着乱序字母的圆盘套在同一根轴上，圆盘的排列顺序就是密钥，转动圆盘让明文排成一行，再读另一行当密文。",
    principle:
      "每个圆盘边缘刻着 26 个字母的一个排列（乱序字母表），各盘不同。把圆盘按双方约定的顺序装到轴上，这个顺序就是密钥。\n\n" +
      "加密：逐盘转动，让明文的第 $i$ 个字母对准「基准行」（本工具取盘串的第 0 行），此时整根轴各行的字母都被确定；再从另一行读出一串字母当密文。设明文字母在它那个盘上的下标为 $\\text{idx}(p_i)$，偏移为 $o$，则密文字母就是该盘下标 $(\\text{idx}(p_i) + o) \\bmod 26$ 处的字母。\n\n" +
      "解密：把密文按同样的顺序装盘、对到偏移行，再往回读 $o$ 行即得明文。真实历史用法里接收者要逐行试读找通顺的那行（因为偏移当时不共享）；本工具把「读哪一行」固定成参数 offset，所以是严格双向可逆的。\n\n" +
      "注意每个盘的偏移量都一样——这正是它当年被破的弱点：明密文的位移是均匀的。",
    usage:
      "三个参数：key 是圆盘顺序（1 起的序号，逗号分隔，如 7,9,5,10,1,6,3,8,2,4）；disks 是圆盘定义（每行一个 26 字母的排列，必须正好是 A-Z 各一次）；offset 是密文行相对基准行的偏移（正数向字母表后方，负数向前方）。\n\n" +
      "编码：填明文 → 得到密文（只取 A-Z，输出大写）。解码：填密文 + 相同参数 → 还原明文。默认参数就是 Wikipedia 的 10 盘算例，可直接点着验证。\n\n" +
      "明文比圆盘数长时会自动分块：每块用一轮全部圆盘，最后一块只用前几个盘，所以任意长度都能双向还原。",
    examples: [
      { in: "retreat now", param: "默认参数（key=7,9,5,10,1,6,3,8,2,4；offset=6）", out: "OMKEGWPDFN", desc: "Wikipedia「Jefferson disk」10 盘算例（去空格后 10 个字母 = 10 个盘）" },
      { in: "OMKEGWPDFN", param: "默认参数，方向=解码", out: "RETREATNOW", desc: "反向读回，验证双向可逆" },
    ],
    formulas: [
      { tex: "c_i = \\text{disk}_{i}\\!\\left[(\\text{idx}(p_i) + o) \\bmod 26\\right]", caption: "加密：明文字母在对应盘上的下标加偏移后取模；解密减偏移" },
    ],
    tips: [
      "识别：题目提到「圆盘 / 转轮 / cylinder / 轮盘」，或给出一组乱序字母表 + 一个盘序密钥。",
      "offset 是关键参数：不知道时可以枚举 0-25（正负各一轮）逐个看哪行出通顺英文。",
      "每个盘必须是 A-Z 的完整排列；本工具会拒绝长度不对或有重复字母的盘。",
      "历史名机 M-94（美军 1922-1942 用）就是它的后继，25 个铝盘。",
      "安全边界：古典机械密码没有现代安全性（10 盘例的盘序只有 10! ≈ 3.6×10⁶ 种，且明密文位移均匀），只能用于 CTF/教学与理解转轮思想，不可用于真实保密。",
      "来源：Wikipedia「Jefferson disk」https://en.wikipedia.org/wiki/Jefferson_disk 、dCode「Cylindre de Jefferson」https://www.dcode.fr/cylindre-jefferson （访问日期 2026-09-20）。",
    ],
    aka: [
      "杰斐逊轮盘",
      "杰弗逊圆盘",
      "Jefferson disk",
      "Jefferson cipher",
      "Bazeries cylinder",
      "巴泽里圆盘",
      "轮盘密码",
      "圆盘密码",
      "wheel cipher",
      "jefferson cylinder",
    ],
  },
};
