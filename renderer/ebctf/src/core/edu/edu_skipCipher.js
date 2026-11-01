/*
 * edu_skipCipher.js — 科普卡：Skip 跳读。纯数据，无 import 无副作用。
 * 来源：dCode「Chiffre par Saut (Skip/Jump)」(2026-09-20 访问)，含算例 DCODE / saut=3 → DDCEO。
 */
export default {
  skipCipher: {
    what: "Skip（跳读）密码——一种换位密码：从起点开始，每隔固定步长 s 取一个字符，取到末尾就回到开头接着数，直到把全部字符取完。字符一个没变，只是顺序被重排了。",
    principle:
      "设消息长度 $N$、跳步 $s$、起点 $\\text{start}$。密文的第 $j$ 个字符 = 明文的第 $(\\text{start} + j \\cdot s) \\bmod N$ 个字符。\n\n" +
      "换个说法：把消息首尾相接无限重复，然后每隔 $s$ 个字符取一个。比如 `DCODE`（$N=5$）取 $s=3$，取到的下标是 0, 3, 6→1, 9→4, 12→2，得到 `DDCEO`。\n\n" +
      "解密：准备 $N$ 个空位，把密文第 $j$ 个字符放回下标 $(\\text{start} + j \\cdot s) \\bmod N$ 的位置，填满后按序读就是明文。\n\n" +
      "注意：只有当 $\\gcd(s, N) = 1$（跳步与长度互素）时，这个取法才会走遍每一个位置。否则会在部分字符上打转，密文根本装不下全部字符——例如长度 4 的 `SKIP` 用 $s=2$ 只会得到 `SISI`，`K`、`P` 永远取不到。本工具遇到这种组合会直接报错。",
    usage:
      "三个参数：skip 是跳步 s（必须与消息长度互素）；start 是起始位置（0 起，默认 0）；chars 决定保留哪些字符（默认只保留字母数字，符合 dCode 建议；也可选保留全部字符含空格标点）。\n\n" +
      "编码：填明文 → 密文；解码：填密文 + 相同参数 → 明文。注意「保留字符」这一档会影响长度 $N$，从而影响互素判断——加解密要用同一档。",
    examples: [
      { in: "DCODE", param: "skip=3, start=0", out: "DDCEO", desc: "dCode 官方算例" },
      { in: "HELLO WORLD", param: "skip=3, start=0, chars=alnum", out: "HLODLWLEOR", desc: "先去空格得 HELLOWORLD（N=10），gcd(3,10)=1" },
      { in: "ATTACKATDAWN", param: "skip=5, start=0", out: "AKWADTANCATT", desc: "N=12，gcd(5,12)=1" },
    ],
    formulas: [
      { tex: "c_j = p_{(\\text{start} + j \\cdot s) \\bmod N},\\qquad \\gcd(s, N) = 1", caption: "跳读取字符；互素是能取遍全部字符的充要条件" },
    ],
    tips: [
      "识别：密文的字母集合与明文完全一样、只是顺序乱了（换位密码通性），重合指数不变。",
      "不知道跳步时，枚举所有与长度 N 互素的 s（约 $\\varphi(N)$ 个）逐个试即可。",
      "长度很短时容易踩坑：N=4 只有 s=1,3 可用；本工具会明确报「不互素」。",
      "题目里带空格/标点会改变 N，进而改变结果——加解密必须约定同一种字符保留口径。",
      "安全边界：纯换位，字母频率与明文完全一致，跳步 s 只有约 φ(N) 种可能，暴力枚举即可破——仅用于 CTF/教学，不可用于真实保密。",
      "来源：dCode「Chiffre par Saut (Skip/Jump)」https://www.dcode.fr/chiffre-saut （访问日期 2026-09-20）。",
    ],
    aka: [
      "Skip 跳读",
      "跳读密码",
      "skip cipher",
      "saut 密码",
      "chiffre par saut",
      "跳跃密码",
      "固定步长取字",
      "跳步换位",
      "skip transposition",
      "等间隔读取",
      "跳字密码",
      "间隔取字",
      "jump cipher",
    ],
  },
};
