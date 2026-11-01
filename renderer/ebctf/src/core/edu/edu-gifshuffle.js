// gifshuffle — GIF 调色板排列隐写科普（数据与权威对拍一致）
export const GIFSHUFFLE_EDU_ZH = {
  gifshuffle: {
    what: "GifShuffle 调色板排列隐写：GIF 全局调色板里颜色的「顺序」不影响显示，把消息藏进排列序数里，外观逐像素不变。兼容 Matthew Kwan 的 gifshuffle 2.0（ICE 加密 + 内置 Huffman 压缩），支持透明色、动画与局部色表。",
    principle:
      "n 个唯一颜色的排列共有 n! 种，把消息编码成 [0, n!-1] 的整数 m，即可藏约 log2(n!) 位：256 个唯一颜色最多 1683 位（210 字节）。\n\n" +
      "**编码**：消息 → 位流（可选 Huffman 压缩 → 可选 ICE 加密）→ 前置哨兵 1 → 阶乘进制逐色重建色表 → 把每帧像素索引重映射到新色表。\n\n" +
      "**解码**：从色表顺序还原 m，去掉哨兵位即得位流，逆过加密与压缩得到原文。\n\n" +
      "**口令**：ICE 64 位分组密码、1 位 CFB；口令每字符取低 7 位，密钥长度决定 ICE level。有口令时 2.0 还按「颜色密文的字典序」排色表，让小消息的色表也看似随机（兼容档可退回自然序）。\n\n" +
      "**关键限定**：容量完全由唯一颜色数决定（n! 的比特长度），唯一颜色 ≤ 1 时容量为 0；无全局色表的 GIF 无法嵌入。",
    usage: "encode：选 GIF 封面 + 填消息（可选口令/压缩）→ 下载外观不变的 GIF。decode：选 GIF + 同口令 → 取回消息。容量与作者 -S 输出一致；超容量/无全局色表/唯一颜色过少都会显式报错。",
    examples: [
      { in: "gifshuffle -S cover.gif", out: "约 210 字节（256 唯一色）", desc: "查询容量：唯一色越多容量越大" },
      { in: "gifshuffle -m msg.txt cover.gif out.gif", out: "out.gif（外观逐像素不变）", desc: "无口令嵌入" },
      { in: "gifshuffle -c -k secret -m msg.txt cover.gif out.gif", out: "ICE 加密 + Huffman 压缩", desc: "口令与压缩，解码需同口令" },
      { in: "gifshuffle -k secret -r out.gif", out: "msg.txt（逐字节一致）", desc: "同口令提取" },
    ],
    tips: [
      "外观**逐像素不变**：帧、时长、透明语义、唯一颜色集合都一样，只有色表「顺序」变了——逐字节比对会看到差异，要看像素。",
      "容量取决于**唯一颜色数**而非文件大小：256 唯一色约 210 字节，16 色只有几个字节；唯一色 ≤ 1 容量为 0。",
      "必须有**全局色表**；没有全局色表的 GIF（每帧自带局部色表）会显式拒绝，与作者实现一致。",
      "压缩（Huffman）对英文/长文本更省容量，对短随机数据可能反而变大；加密与压缩参数两侧须一致。",
      "口令每字符取低 7 位，非 ASCII 字符会被截高位——与原版行为一致。",
      "本实现与作者二进制做了四路对拍（权威→本项目 / 本项目→权威等），随机 80 轮接受性零分歧。",
    ],
    aka: [
      "gifshuffle", "GifShuffle", "gif shuffle", "调色板隐写", "GIF调色板隐写",
      "调色板排列隐写", "palette steganography", "Matthew Kwan", "gif隐写",
      "GIF colourmap stego", "调色板顺序隐写", "gifshuffle 2.0",
    ],
  },
};
export default GIFSHUFFLE_EDU_ZH;

export const GIFSHUFFLE_EDU_EN = {
  gifshuffle: {
    what: "GifShuffle palette-order steganography: the ORDER of entries in a GIF global colour table does not affect display, so a message is hidden in the permutation index while pixels stay identical. Compatible with Matthew Kwan's gifshuffle 2.0 (ICE encryption + built-in Huffman compression); supports transparency, animation and local colour tables.",
    principle:
      "n unique colours admit n! permutations, so a message maps to an integer m in [0, n!-1], hiding about log2(n!) bits: 256 unique colours hold at most 1683 bits (210 bytes).\n\n" +
      "**Encoding**: message to bitstream (optional Huffman compression, optional ICE encryption) -> prepend a sentinel 1 -> rebuild the colour table by factorial-base insertion -> remap every frame's pixel indices to the new table.\n\n" +
      "**Decoding**: recover m from the table order, drop the sentinel bit, then undo encryption and compression.\n\n" +
      "**Passphrase**: ICE 64-bit block cipher in 1-bit CFB; each password character contributes its low 7 bits, and key length sets the ICE level. With a passphrase, 2.0 also orders the table by the ciphertext sort of the colours, so even small messages look random (a compat flag falls back to natural order).\n\n" +
      "**Key limits**: capacity depends only on the count of unique colours; with one or zero unique colours capacity is zero, and a GIF without a global colour table cannot be embedded at all.",
    usage: "Encode: pick a GIF cover, type the message (optional passphrase/compression), download a visually identical GIF. Decode: pick the GIF with the same passphrase to recover it. Capacity matches the author's -S output; over-capacity, missing global table and too-few-colours cases all fail explicitly.",
    examples: [
      { in: "gifshuffle -S cover.gif", out: "about 210 bytes (256 unique colours)", desc: "Capacity query: more unique colours, more room" },
      { in: "gifshuffle -m msg.txt cover.gif out.gif", out: "out.gif (pixel-identical appearance)", desc: "Embedding without a passphrase" },
      { in: "gifshuffle -c -k secret -m msg.txt cover.gif out.gif", out: "ICE encryption + Huffman compression", desc: "Passphrase and compression; decode needs the same passphrase" },
      { in: "gifshuffle -k secret -r out.gif", out: "msg.txt (byte-identical)", desc: "Extraction with the same passphrase" },
    ],
    tips: [
      "The appearance is **pixel-identical**: frames, durations, transparency semantics and the unique colour set are unchanged - only the table ORDER differs, so compare pixels, not bytes.",
      "Capacity depends on the number of **unique colours**, not file size: about 210 bytes at 256 colours, a few bytes at 16, and zero at one colour.",
      "A **global colour table** is required; GIFs whose frames carry only local tables are rejected explicitly, matching the author's implementation.",
      "Huffman compression helps English text and longer messages but can grow short random data; encryption/compression flags must match on both sides.",
      "Password characters use their low 7 bits only - non-ASCII characters are truncated, matching upstream.",
      "This implementation was cross-checked against the author's binary in four directions, with zero acceptance disagreements over 80 randomized rounds.",
    ],
    aka: [
      "gifshuffle", "GifShuffle", "gif shuffle", "palette steganography",
      "GIF palette steganography", "colourmap order stego", "Matthew Kwan",
      "gif steganography", "GIF colourmap stego", "gifshuffle 2.0",
      "palette permutation stego", "GIF order stego",
    ],
  },
};
