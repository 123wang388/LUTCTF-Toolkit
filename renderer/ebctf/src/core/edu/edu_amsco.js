/*
 * edu_amsco.js — 科普卡：AMSCO。纯数据，无 import 无副作用。
 * 来源：dCode「Chiffre AMSCO」(2026-09-20 访问)，含完整算例 DCODEAMSCO/CLE/1,2 → DEAODSCCOM。
 */
export default {
  amsco: {
    what: "AMSCO 密码——一种「不完整列」的列换位：明文按行写进一个网格，但每格有的装 1 个字母、有的装 2 个字母（交替），再按密钥给出的列序逐列读出来。",
    principle:
      "把明文按行填进一个宽 $L$ 列的网格（$L$ = 密钥长度）。关键在每格的容量不是 1 而是 1 或 2，由「切割序列」决定：\n\n" +
      "沿反对角线（行号 + 列号 = 同一个值的那些格子）看，同一条反对角线上每格容量相同，第 $d$ 条反对角线的容量 = $\\text{cut}[d \\bmod |\\text{cut}|]$。所以切割序列取 1,2 时，宽 3 的网格容量排成：\n\n" +
      "第 1 行 1 2 1 / 第 2 行 2 1 2 / 第 3 行 1 2 1。\n\n" +
      "逐格按行序把明文字母塞进去（最后一格可能装不满，按剩余字符数截断）。然后按密钥的字母升序排出的列序，逐列自上而下读出来拼成密文。\n\n" +
      "解密：先用同样规则算出每格容量，把密文按列序切回各列、各列再按容量切回各格，最后按行读即得明文。",
    usage:
      "两个参数：key 是密钥（只取字母，决定列序——按字母从小到大排，同字母按列号先后）；cut 是切割序列（每格的 1 或 2，逗号分隔，默认 1,2）。\n\n" +
      "编码：填明文 → 密文；解码：填密文 + 相同 key/cut → 明文。明文/密文只取 A-Z，输出大写。默认参数是 dCode 的算例，可直接验证。",
    examples: [
      { in: "DCODEAMSCO", param: "key=CLE, cut=1,2", out: "DEAODSCCOM", desc: "dCode 官方算例：CLE 的列序是 1,3,2" },
      { in: "DEAODSCCOM", param: "key=CLE, cut=1,2，方向=解码", out: "DCODEAMSCO", desc: "反向切回，验证双向可逆" },
      { in: "DCODEAMSCO", param: "key=CLE, cut=2,1", out: "DCAODECOMS", desc: "换成先 2 后 1 的切割，结果不同" },
    ],
    formulas: [
      { tex: "\\text{cap}(r,c) = \\text{cut}\\,[(r+c) \\bmod |\\text{cut}|]", caption: "第 (r,c) 格的容量由反对角线序号决定" },
    ],
    tips: [
      "识别：密文只换了顺序、字母集合与明文完全一致（重合指数不变），且长度分布不像普通列换位那样整列等长——因为有的列装的是双字母格。",
      "cut 是最容易搞错的参数：标准是 1,2（先单后双），也有 2,1 的写法，两者结果不同，都要试。",
      "AMSCO 是 19 世纪 A. M. Scott 姓名的缩写（dCode 口径）。",
      "本工具按「列字母升序、同字母按原列号」定列序（稳定排序），与经典列换位一致。",
      "安全边界：纯换位不改变字母频率（重合指数与明文相同），在已知明文/短密钥下极易被破——仅用于 CTF/教学，不可用于真实保密。",
      "来源：dCode「Chiffre AMSCO」https://www.dcode.fr/chiffre-amsco （访问日期 2026-09-20）。",
    ],
    aka: [
      "AMSCO",
      "AMSCO 密码",
      "AMSCO 换位",
      "amsco cipher",
      "不完整列换位",
      "交替列移位",
      "1-2 换位",
      "交替 1/2 列移位",
      "amsco transposition",
      "A. M. Scott 密码",
      "双格换位",
      "AMSCO 加密",
    ],
  },
};
