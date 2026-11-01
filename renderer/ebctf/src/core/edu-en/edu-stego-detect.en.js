// English edu shard: unified steganography detection (stegoDetect). Pure data, no imports, no side effects.
export default {
  stegoDetect: {
    what: "One unified steganography-detection entry: a single card that switches between 11 detectors by mode — 8 text-side (zero-width / invisible character scan, homoglyph scan, Unicode normalization, whitespace anomalies, Bidi controls, character inspection, invisible-character visualization, confusables skeleton) and 3 file-side (quick stego scan, JPEG chi-square detection, full LSB combination scan). Paste text, or drop an image / audio / binary file, and get a conclusion directly.",
    principle:
      "There is no universal steganalysis algorithm — the trick is to look for **patterns that should not exist** on the right **observation surface**, and that surface depends on the carrier.\n\n" +
      "**Text carriers are inspected at the character layer.** Ordinary text never contains zero-width characters (U+200B/200C/200D/2060/FEFF), variation selectors (U+FE00–FE0F, U+E0100–E01EF), soft hyphens (U+00AD) or Bidi controls (U+202A–202E, U+2066–2069) — they render invisibly or take no space, which makes them natural payload channels. Homoglyphs (Cyrillic а vs Latin a, Greek ο vs Latin o) look identical but differ in code point, forming a substitution channel; mapping a passage to its confusables skeleton exposes the mixing.\n\n" +
      "**File carriers are inspected at the byte and bit-plane layers.** LSB embedding writes data into the least significant bit of pixels or DCT coefficients: the statistical test is the chi-square attack, which asks whether the occurrence counts of coefficient pairs $(2i,\\ 2i+1)$ have been \"levelled\" (Westfeld & Pfitzmann, 1999). A clean image has an approximately Laplacian histogram with $h(2i) \\gg h(2i+1)$; after embedding the two become close. The other route brute-forces every combination of bit plane × channel × bit order × row/column order, extracts the bits, and scores readability — which often pulls shallow payloads straight out.\n\n" +
      "The first 8 modes live on the text surface and the last 3 on the file surface; the unified entry only dispatches by `mode`, so **no kernel is implemented twice**.",
    usage:
      "Pick a `mode`, then supply input. Text modes take pasted text directly; file modes accept a dropped file, or pasted hex / base64 (`inputEnc` defaults to `auto`, sniffing hex / base64 / UTF-8 so no manual conversion is needed).\n\n" +
      "Per-mode parameters: `form` for `unicodeNormalize` (default NFC); `comp` (component, default Y luma only) and `sens` (sensitivity) for `stegdetect`; `maxBit` (highest bit plane), `columnMajor`, `flagRegex`, `exportCombo` (export a downloadable artifact on a hit) and `exportMaxBytes` for `zstegScan`. Parameters belonging to other modes are ignored rather than raising an error.",
    examples: [
      { in: "Hello\\u200BWorld\\u200C\\u200D!", param: "mode = zwScan", out: "3 invisible characters hit: U+200B ZERO WIDTH SPACE, U+200C ZWNJ, U+200D ZWJ — with a position table, a highlight view (· marks hits) and the stripped text", desc: "Zero-width characters take no space and are invisible; the scan mode surfaces them immediately" },
      { in: "Drop a JPEG suspected of jsteg embedding", param: "mode = stegdetect, component = Y only, sensitivity = standard", out: "chi-square and p value, a 20-step cumulative chi-square curve, a 10-segment p distribution, histogram features, and a combined \"suspected sequential LSB embedding\" verdict", desc: "Do not invert the direction: p≈0 is clean, p→1 is more suspicious" },
      { in: "Drop a PNG", param: "mode = zstegScan, maxBit = 6, row-major", out: "A readability score table across all bit-plane combinations; on a hit it reports the readable string and where it was found", desc: "Shallow payloads often come out as readable text directly" },
    ],
    formulas: [
      { tex: "b_i = p_i \\bmod 2", caption: "LSB bit-plane extraction: the least significant bit of the i-th pixel/coefficient is one payload bit" },
      { tex: "\\chi^{2} = \\sum_{i} \\frac{(h(2i) - n(i))^{2}}{n(i)},\\quad n(i) = \\frac{h(2i) + h(2i+1)}{2}", caption: "Chi-square attack: h is the occurrence count, degrees of freedom = number of valid coefficient pairs − 1; the more \"levelled\" the (2i, 2i+1) pairs, the larger p and the more likely an embedding" },
    ],
    tips: [
      "**Text first, statistics second**: for a suspicious passage, run `zwScan` / `charInspect` before reaching for chi-square — DCT statistics are the wrong surface for text steganography.",
      "The p-value direction is the easiest thing to invert: p≈0 is clean, p→1 is suspicious.",
      "**Small payloads are always missed**: a few hundred bytes inside millions of coefficients will not level the PoV pairs — that is a limitation of every statistical detector, not a flaw of this tool.",
      "Every verdict is \"suspected\": confirm by running the matching extraction slot with the key, or by cross-checking with the original tool.",
      "The full bit-plane combination scan grows with `maxBit` and image size; start with a lower `maxBit` on large images and raise it step by step.",
      "Homoglyph mixing (the leading letter of `аpple` is Cyrillic а) is invisible to the eye; mapping both sides to a confusables skeleton and comparing is the reliable approach.",
    ],
    aka: [
      "steganography detection", "stegoDetect", "steganalysis", "stego detection",
      "LSB detection", "LSB stego detection", "bit plane scan", "zero width detection",
      "homoglyph detection", "Bidi control detection", "invisible character detection", "whitespace steganography detection",
      "JPEG stego detection", "chi-square attack", "zsteg", "stegdetect",
      "stego scan", "steganography scanner",
    ],
  },
};