/*
 * edu-stego-detect.js — 统一隐写检测 stegoDetect 科普卡（隐写按原理拆类后的检测入口）。
 * 格式契约见 eduContent.js 头注释：纯数据、无 import、无副作用。
 * aka ≥10 条真实别名（_alias_verify 三件套红线）。
 */
export default {
  stegoDetect: {
    what: "统一隐写检测入口：一张卡按「模式」切换 11 个检测器 —— 文本侧 8 种（零宽/不可见字符扫描、同形字扫描、Unicode 规范化、空白异常、Bidi 控制符、字符透视、不可见字符可视化、同形字骨架），文件侧 3 种（隐写快速扫描、JPEG 卡方检测、LSB 全组合扫描）。纯文本贴进去、图片/音频/二进制文件拖进来，都可以直接出结论。",
    principle:
      "隐写检测没有万能算法，关键是在正确的「观测面」上找**不该有的规律**。载体不同，观测面就不同：\n\n" +
      "**文本载体看字符层。** 正常文本不会出现零宽字符（U+200B/200C/200D/2060/FEFF）、变体选择器（U+FE00–FE0F、U+E0100–E01EF）、软连字符（U+00AD）与 Bidi 控制符（U+202A–202E、U+2066–2069）——它们渲染时不可见或不占位，是天然的载荷通道；同形字（西里尔 а 与拉丁 a、希腊 ο 与拉丁 o）看起来一模一样却码位不同，是替换通道，把一段文本映射到 confusables 骨架后即可比对出混用。\n\n" +
      "**文件载体看字节与位平面。** LSB 类嵌入把信息写进像素或 DCT 系数的最低位：统计检验用 chi-square 攻击看系数对 $(2i,\\ 2i+1)$ 的出现次数是否被「拉平」（Westfeld & Pfitzmann, 1999），干净图的直方图近似拉普拉斯分布、$h(2i) \\gg h(2i+1)$，嵌过之后两者趋于相等；另一条路是暴力枚举「位平面 × 通道 × 位序 × 行/列序」全组合去抽比特，再按可读性打分，把藏得浅的载荷直接捞出来。\n\n" +
      "前 8 个模式落在文本观测面、后 3 个落在文件观测面，统一入口只按 `mode` 分派到对应检测器，**同一内核不重复实现**。",
    usage:
      "先选 `mode`，再给输入。文本模式直接把文本粘进输入框；文件模式拖入文件，或粘 hex / base64（`inputEnc` 默认 `auto`，会自动嗅探 hex / base64 / UTF-8，无需先手动转换）。\n\n" +
      "按模式生效的参数：`unicodeNormalize` 用 `form`（默认 NFC）；`stegdetect` 用 `comp`（分析分量，默认仅 Y 亮度）与 `sens`（灵敏度）；`zstegScan` 用 `maxBit`（最大位平面）、`columnMajor`（列主序）、`flagRegex`（命中正则）、`exportCombo`（命中后导出可下载产物）、`exportMaxBytes`。非当前模式的参数会被忽略，不会报错。",
    examples: [
      { in: "Hello\\u200BWorld\\u200C\\u200D!", param: "mode = zwScan", out: "命中不可见字符 3 个：U+200B ZERO WIDTH SPACE、U+200C ZWNJ、U+200D ZWJ —— 附位置表、高亮视图（· 标出命中处）与剥离后的文本", desc: "零宽字符不占位、肉眼不可见，扫描模式一列即现形" },
      { in: "拖入一张疑似 jsteg 隐写的 JPEG", param: "mode = stegdetect，分量 = 仅 Y，灵敏度 = 标准", out: "χ² 与 p 值、20 级累计卡方曲线、10 段分块 p 分布、直方特征，综合给出「疑似 LSB 顺序嵌入」结论", desc: "方向别记反：p≈0 干净，p→1 越像嵌过" },
      { in: "拖入一张 PNG", param: "mode = zstegScan，maxBit = 6，行主序", out: "位平面全组合的可读性打分表；命中时直接给出可读串与命中位置", desc: "藏得浅的载荷常被直接捞成可读文本" },
    ],
    formulas: [
      { tex: "b_i = p_i \\bmod 2", caption: "LSB 位平面提取：第 i 个像素/系数的最低位即一个载荷比特" },
      { tex: "\\chi^{2} = \\sum_{i} \\frac{(h(2i) - n(i))^{2}}{n(i)},\\quad n(i) = \\frac{h(2i) + h(2i+1)}{2}", caption: "卡方攻击：h 为系数出现次数，自由度 = 有效系数对数 − 1；对 (2i, 2i+1) 越「拉平」，p 值越大、越像嵌过" },
    ],
    tips: [
      "**先文本后统计**：拿到一段可疑文本，先跑 `zwScan` / `charInspect`，别一上来就上卡方统计——文本隐写用 DCT 统计是驴唇不对马嘴。",
      "p 值方向最容易记反：p≈0 是干净，p→1 才疑似嵌入。",
      "**小载荷必然漏检**：几百字节嵌进百万级系数里，PoV 对根本拉不平——这是所有统计检测器的通病，不是本工具的缺陷。",
      "结论一律是「疑似」：检出后要拿密钥走对应提取档，或用原版工具复核，才算定罪。",
      "位平面全组合扫描代价随 `maxBit` 与图尺寸增长，大图先压低 `maxBit` 试水再逐级放大。",
      "文本里的同形字混用（`аpple` 的首字母是西里尔 а）光看是看不出来的，`confusablesSkeleton` 把两边都映射到骨架再比对才是可靠做法。",
    ],
    aka: [
      "隐写检测", "stegoDetect", "steganography detection", "隐写分析", "steganalysis",
      "LSB 检测", "LSB 隐写检测", "位平面扫描", "bit plane scan", "零宽字符检测",
      "同形字检测", "homoglyph 检测", "Bidi 控制符检测", "不可见字符检测", "空白隐写检测",
      "JPEG 隐写检测", "卡方攻击", "chi-square attack", "zsteg", "stegdetect",
      "隐写扫描", "隐写检测器",
    ],
  },
};