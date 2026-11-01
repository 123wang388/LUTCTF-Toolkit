// outguess — OutGuess 0.4 隐写双向科普（数据与四路对拍实测一致）
export const OUTGUESS_EDU_ZH = {
  outguess: {
    what: "OutGuess 0.4 隐写双向工具：encode 把消息嵌入载体，decode 用同一口令取回。JPEG 走量化后 DCT 系数的 LSB，PPM/PGM（P2/P3/P5/P6）走像素位。是 CTF 里最经典的「已知口令 OutGuess」题型对应实现，兼容原版 outguess CLI 的 -d/-k/-r 语义。",
    principle:
      "OutGuess 由 Niels Provos 设计，核心是「改最少的位、尽量不动直方图」。\n\n" +
      "**JPEG 路径**：用打过补丁的 libjpeg 解码到量化 DCT 系数，只动非零系数的 LSB（改 1 位最多把系数挪 1，不产生新的零系数）；写回时同样在系数域改 LSB，再由 libjpeg 重新 Huffman 编码。所以产物不是 Canvas 重编码，而是系数域编辑——这正是能对拍原版的前提。\n\n" +
      "**PNM 路径**：按行扫描像素位，位选择由伪随机流决定。\n\n" +
      "**选位与保真**：伪随机流由口令经 MD5 派生、用 ARC4 生成，决定「改哪些位」；-F+（默认开）打开统计保真（statistical steganography foiling），在嵌入后微调系数让一阶统计量尽量回到原图，降低卡方类检测的命中率；-F- 关闭。\n\n" +
      "**纠错**：-e 启用 (23,12,7) Golay 码，能在提取时纠正最多 3 位错误，代价是可用容量约减半。**编码与解码两侧都要给 -e**，只在编码给会取不回。\n\n" +
      "**关键限定**：OutGuess 0.4 的载荷**没有认证标签（无 MAC）**。提取端只做「长度头是否合理」的判断，因此错误口令**有时会**吐出一段看似正常的字节。所以「输出了字节」**不等于**「口令正确」——必须靠内容本身判断。",
    usage: "encode：选载体 + 填消息 + 口令 → 下载产物。decode：选产物 + 同一口令 → 取回消息。JPEG 载体默认按质量 75 重编码，可用 -p 提高到 75–100；容量不足会明确报 not enough bits in bitmap。载体类型按魔数分派，只认 JPEG 与 P2/P3/P5/P6。",
    examples: [
      { in: "-k secret -d msg.txt cover.jpg out.jpg", out: "out.jpg（JPEG 载体，系数域嵌入）", desc: "JPEG 嵌入，输出仍是可正常打开的 JPEG" },
      { in: "-k secret -r out.jpg msg.txt", out: "msg.txt（与原文逐字节相同）", desc: "同口令提取，往返逐字节一致" },
      { in: "-k secret -d msg.txt cover.ppm out.ppm", out: "out.ppm", desc: "P6 PPM 载体，像素位嵌入" },
      { in: "-k secret -e -d msg.txt cover.jpg out.jpg", out: "启用 Golay 纠错；解码也要加 -e", desc: "纠错档，容量减半但可纠 3 位错" },
    ],
    tips: [
      "JPEG 产物**不是**原图的字节副本：OutGuess 会按质量 75 重新编码，像素值本来就会变。要看「有没有嵌入」应比对系数/容量，而不是逐字节比图。",
      "上游只按扩展名分派：.jpeg 和 .pgm 原生会被判「Unknown data type」。本工具已在前端按**魔数**自动映射，拖入即可，不受改名坑影响。",
      "PNM 解析器要求魔数行以**单个 LF** 结尾（P6 加换行）。带 CRLF 的头会被直接拒绝——Windows 上生成的 PPM 常踩这个坑。",
      "**空载荷会崩**：0 字节载荷触发上游整数除零缺陷。本工具前端已先拦空载荷。",
      "**截断不报错**：把产物截断后仍可能返回一段**错误**的字节，不会提示损坏；对可疑产物以内容判读。",
      "错误口令有时也会吐出非空字节（实测 200 个错口令里有 19 个如此）。别把「有输出」当「解对了」。",
      "容量：日志里的 Extracting usable bits 是可嵌入位数上限，嵌入需求超过它就直接失败；JPEG 的可用位数随质量与图像内容变化。",
      "第二载荷（-K/-D/-E）与 OutGuess 0.2/0.13 等历史变体**不在首批支持范围**，不按「完整 OutGuess」宣传。",
    ],
    aka: [
      "OutGuess", "outguess", "outguess 0.4", "outguess隐写", "JPEG隐写 OutGuess",
      "DCT系数隐写", "系数LSB隐写", "Niels Provos隐写", "provos stego",
      "已知口令隐写", "统计保真隐写", "foiling隐写", "Golay纠错隐写", "outguess解密",
    ],
  },
};
export default OUTGUESS_EDU_ZH;

export const OUTGUESS_EDU_EN = {
  outguess: {
    what: "OutGuess 0.4 steganography, both directions: encode hides a message in a carrier, decode recovers it with the same passphrase. JPEG carriers use the LSBs of quantised DCT coefficients; PPM/PGM (P2/P3/P5/P6) carriers use pixel bits. This is the classic known-passphrase OutGuess CTF task, matching the original outguess CLI -d/-k/-r semantics.",
    principle:
      "OutGuess was designed by Niels Provos around one idea: change as few bits as possible and leave the histogram as close to the original as you can.\n\n" +
      "**JPEG path**: a patched libjpeg decodes to quantised DCT coefficients; only the LSBs of non-zero coefficients are touched (flipping one bit moves a coefficient by at most one and never creates a new zero coefficient). Writing back happens in the coefficient domain, then libjpeg re-runs Huffman coding. The output is therefore coefficient-domain editing, not a Canvas-style decode/re-encode - which is exactly what makes byte-for-byte comparison with upstream meaningful.\n\n" +
      "**PNM path**: pixel bits are scanned in order and the bit positions are chosen by a pseudorandom stream.\n\n" +
      "**Bit selection and foiling**: the pseudorandom stream is derived from the passphrase via MD5 and generated with ARC4; it decides which bits are touched. -F+ (the default) enables statistical steganography foiling, nudging coefficients after embedding so first-order statistics drift back towards the original and chi-square style detectors are less likely to fire; -F- turns it off.\n\n" +
      "**Error correction**: -e enables the (23,12,7) Golay code, which corrects up to 3 bit errors on extraction at the cost of roughly halving capacity. **Both encode and decode must be given -e**; encoding alone will not decode.\n\n" +
      "**Critical limitation**: OutGuess 0.4 payloads carry **no authentication tag (no MAC)**. Extraction only checks whether the length header is plausible, so a wrong passphrase **can** produce output that looks like normal bytes. Bytes came out therefore does **not** mean the passphrase was correct - judge by the content itself.",
    usage: "Encode: pick a carrier, type the message, supply a passphrase, download the product. Decode: pick the product, use the same passphrase, recover the message. JPEG carriers are re-encoded at quality 75 by default; raise it to 75-100 with -p. Insufficient capacity fails explicitly with not enough bits in bitmap. The carrier type is dispatched by magic bytes, and only JPEG and P2/P3/P5/P6 are recognised.",
    examples: [
      { in: "-k secret -d msg.txt cover.jpg out.jpg", out: "out.jpg (JPEG carrier, coefficient-domain embed)", desc: "JPEG embed; the output is still a valid, openable JPEG" },
      { in: "-k secret -r out.jpg msg.txt", out: "msg.txt (byte-identical to the original)", desc: "Extract with the same passphrase; the round trip is byte-exact" },
      { in: "-k secret -d msg.txt cover.ppm out.ppm", out: "out.ppm", desc: "P6 PPM carrier, pixel-bit embedding" },
      { in: "-k secret -e -d msg.txt cover.jpg out.jpg", out: "Golay correction on; decode also needs -e", desc: "ECC mode: half the capacity, corrects up to 3 bit errors" },
    ],
    tips: [
      "The JPEG product is **not** a byte copy of the carrier: OutGuess re-encodes at quality 75, so pixel values legitimately change. To tell whether something was embedded, compare coefficients or capacity, not raw image bytes.",
      "Upstream dispatches on the file extension only: .jpeg and .pgm are rejected natively with Unknown data type. This tool maps by **magic bytes** in the front end, so dropped-in files just work.",
      "The PNM parser requires the magic line to end in a **single LF**. A CRLF header is rejected outright - an easy trap for PPM files produced on Windows.",
      "**An empty payload crashes it**: a zero-byte payload triggers an integer divide-by-zero upstream. The front end rejects empty payloads first.",
      "**Truncation is not reported**: a truncated product can still hand back **wrong** bytes with no corruption warning; judge suspicious products by their content.",
      "A wrong passphrase sometimes returns non-empty bytes (19 out of 200 tried here). Never treat there-is-output as it-decrypted-correctly.",
      "Capacity: Extracting usable bits in the log is the maximum number of embeddable bits. Exceeding it fails outright. For JPEG the usable count depends on quality and image content.",
      "The second dataset (-K/-D/-E) and historical OutGuess variants (0.2 / 0.13) are **out of scope for the first batch**. Do not advertise full OutGuess.",
    ],
    aka: [
      "OutGuess", "outguess", "outguess 0.4", "outguess steganography",
      "JPEG steganography OutGuess", "DCT coefficient steganography",
      "coefficient LSB steganography", "Niels Provos steganography",
      "provos stego", "known-passphrase steganography",
      "statistical foiling steganography", "Golay ECC steganography",
      "outguess decode", "outguess extract",
    ],
  },
};
