export const STEGHIDE_EDU_ZH = {
  steghide: {
    what: "steghide 0.5.1 隐写双向：把消息嵌进 JPEG（DCT 系数）或 WAV（样本位），支持口令派生加密与可选压缩；是 CTF「steghide 题」的标准对应实现，用同一口令即可取回。",
    principle: "steghide 把载荷压缩（可选）后经口令派生的加密，再按图灵囚禁式嵌入把比特分散写进载体：JPEG 改量化后 DCT 系数，WAV 改样本最低位。口令同时决定「改哪些位置」与加密密钥。**载荷无独立认证标签（无 MAC）**：错误口令通常提取失败，但「取出字节」在数学上不等于口令已验证。",
    usage: "encode：选 JPEG/WAV 载体 + 填消息 + 口令 → 下载产物。decode：选产物 + 同口令 → 取回消息。容量不足与格式不符会显式报错。",
    examples: [
      { in: "steghide embed -cf cover.jpg -ef msg.txt -p secret", out: "cover.jpg（外观几乎不变）", desc: "嵌入" },
      { in: "steghide extract -sf cover.jpg -p secret", out: "msg.txt", desc: "同口令提取" },
      { in: "steghide info cover.jpg", out: "可嵌入容量信息", desc: "查询载体容量" },
    ],
    tips: [
      "口令两侧必须一致；错误口令通常直接失败，但别把「有输出」当「口令正确」。",
      "载体只认 JPEG 与 WAV；PNG/BMP 不支持。",
      "嵌入会使 JPEG 重编码、WAV 样本位轻微变化——外观/听感几乎无差。",
      "本引擎为本地 WASM，离线可用； steghide 官方为 GPL 许可项目。",
    ],
    aka: [
      "steghide", "steghide 0.5.1", "steghide隐写", "JPEG隐写 steghide", "WAV隐写",
      "音频隐写 steghide", "steghide extract", "steghide解密", "已知口令隐写 steghide",
      "音频LSB steghide", "steghide密码", "steghide提取",
    ],
  },
};
export default STEGHIDE_EDU_ZH;

export const STEGHIDE_EDU_EN = {
  steghide: {
    what: "steghide 0.5.1 steganography, both directions: hides a message in a JPEG (DCT coefficients) or WAV (sample bits) with passphrase-derived encryption and optional compression; the standard implementation behind CTF steghide tasks. Recover with the same passphrase.",
    principle: "The payload is optionally compressed, encrypted with a key derived from the passphrase, and embedded bit-distributed into the carrier: JPEG quantised DCT coefficients or WAV sample bits. The passphrase drives both placement and encryption. **No standalone authentication tag (no MAC)**: a wrong passphrase usually fails outright, but produced bytes are never proof of a correct passphrase.",
    usage: "Encode: pick a JPEG/WAV carrier, type the message, set a passphrase, download the product. Decode: pick the product with the same passphrase to recover it. Insufficient capacity and unsupported formats fail explicitly.",
    examples: [
      { in: "steghide embed -cf cover.jpg -ef msg.txt -p secret", out: "cover.jpg (near-identical look)", desc: "Embedding" },
      { in: "steghide extract -sf cover.jpg -p secret", out: "msg.txt", desc: "Extraction with the same passphrase" },
      { in: "steghide info cover.jpg", out: "capacity information", desc: "Query carrier capacity" },
    ],
    tips: [
      "The passphrase must match on both sides; wrong passphrases usually fail outright - never treat output as proof.",
      "Only JPEG and WAV carriers are supported; PNG/BMP are not.",
      "Embedding re-encodes the JPEG and slightly perturbs WAV samples - visually/audibly imperceptible.",
      "This engine is a local WASM build and works offline; upstream steghide is a GPL-licensed project.",
    ],
    aka: [
      "steghide", "steghide 0.5.1", "steghide steganography", "JPEG stego steghide",
      "WAV stego", "audio stego steghide", "steghide extract", "steghide decode",
      "known-passphrase stego", "steghide passphrase", "steghide capacity", "steghide embed",
    ],
  },
};
