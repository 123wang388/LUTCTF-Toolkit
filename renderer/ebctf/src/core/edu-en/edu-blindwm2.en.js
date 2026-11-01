/*
 * edu-blindwm2.en.js — English edu cards for the dual-image watermark family
 * (blindWatermarkDualFft.js / blindWatermarkDwtSvd.js).
 * dualFftWatermark (frequency-domain additive dual-image) · dwtSvdWatermark (DWT-DCT-SVD blind)
 * Example outputs come from real runs and real samples (four-way verification + reference cross-check).
 */
export default {
  dualFftWatermark: {
    what:
      "Dual-image blind watermark (frequency-domain additive) — two images in (a carrier plus a watermark image) " +
      "produce a copy that looks identical to the eye; subtract the original from that copy and the watermark image " +
      "comes back. The classic CTF shape is \"two images, one of them processed\".",
    principle:
      "Treat the image as a 2-D signal, take its Fourier transform, and embed additively in the frequency plane " +
      "(the classic spread-spectrum idea of Cox et al. 1997 §III): $$F' = F + \\alpha \\cdot R$$ where $F$ is the " +
      "carrier's 2D FFT, $\\alpha$ the embedding strength (parameter alpha, default 3.0), and $R$ the real matrix " +
      "obtained by moving the watermark into the upper half of the spectrum, shuffling rows/columns with a random " +
      "permutation, then completing with a 180° rotation.\n\n" +
      "Because $R$ is spread over the whole spectrum, the spatial-domain difference is invisible. Extraction needs " +
      "no watermark but does need the **original**: $$R \\approx \\frac{\\mathcal{F}(\\text{stego}) - " +
      "\\mathcal{F}(\\text{original})}{\\alpha}$$ then un-shuffle with the same permutation and the watermark returns " +
      "to the top-left corner.\n\n" +
      "The permutation is driven by `seed` (the key field, default 20160930) — a **shuffling seed, not a key**: with " +
      "original + stego anyone can extract. This tool replicates the reference implementation's Python Mersenne " +
      "Twister shuffle bit-for-bit (both CPython 2 and 3 variants; variant switch, or auto which tries both on decode " +
      "and picks by watermark continuity).",
    usage:
      "Embed: drop the carrier, paste the watermark image in the parameter field → stego PNG. Extract: drop the stego, " +
      "paste the original → watermark PNG. Both images must share dimensions (extract direction). If the extracted " +
      "watermark looks noisy, enable mirror-redundancy averaging; for ±1 pixel jitter switch the decode output to " +
      "\"clamp 0-255\" (default \"wrap 8-bit\" is the bit-exact reference-compatible mode).",
    examples: [
      { in: "1.png + encpy3.png (400×626)", param: "key=20160930, alpha=3.0, py3", out: "text watermark 我喜欢你", desc: "Real sample" },
      { in: "1.png + encpy2.png (400×626)", param: "py2 variant", out: "text watermark 我喜欢你", desc: "Same sample, CPython 2 shuffle" },
      { in: "py2_1.png + py2_2.png (414×306)", param: "py2 + mirror averaging", out: "flag{yOu_are_well}", desc: "Real flag watermark" },
      { in: "py3_1.png + py3_2.png (952×1000)", param: "py3", out: "large readable watermark", desc: "High-resolution sample" },
    ],
    tips: [
      "Two visually identical images are the signature of this attack: pixel-diff them first, then use this op.",
      "Without the original (semi-blind premise) extraction is impossible — an information-theoretic boundary, not a bug.",
      "Watermarks must be low-frequency content (text, logos, flat shapes): fine high-frequency patterns get smoothed by the real-part projection.",
      "CPython 2 / 3 shuffle variants are not interchangeable: switch variant on failure, or use auto.",
      "The key is a shuffling seed, not confidentiality; this tool never treats it as encryption.",
      "Strong JPEG compression / rescale / crop breaks pixel alignment — restore alignment before extracting.",
    ],
    aka: [
      "dual image watermark", "blind watermark", "frequency domain watermark", "fft watermark",
      "双图盲水印", "频域盲水印", "傅里叶盲水印", "盲水印提取", "图片盲水印", "watermark decode",
      "spread spectrum watermark", "半盲水印", "two images watermark", "blind watermark extraction",
    ],
  },

  dwtSvdWatermark: {
    what:
      "DWT-DCT-SVD blind watermark — a truly blind scheme: the watermark text is extracted from a single watermarked " +
      "image, no original required. This is the common algorithm of mainstream blind-watermark libraries " +
      "(the blind_watermark family) and the most frequently met branch besides the dual-image scheme.",
    principle:
      "One bit per block through three transforms: a one-level Haar wavelet splits the image into four sub-bands and " +
      "the **low-frequency band cA** (most concentrated energy, most robust) is used; cA is cut into 4×4 blocks, each " +
      "orthogonally DCT-II transformed, then SVD is applied and the **leading singular value s[0] is quantized** onto " +
      "a grid of step d1 (default 36): bit 0 at $(k+\\frac{1}{4})d_1$, bit 1 at $(k+\\frac{3}{4})d_1$; the second " +
      "singular value s[1] can be quantized the same way (d2, default 20, 0 = off).\n\n" +
      "Payload format: 32-bit big-endian length header + UTF-8 bytes, tiled cyclically over all low-frequency blocks, " +
      "averaged over the 3 channels on extraction (extract_avg). The password (password_img) drives the **intra-block " +
      "permutation** of the 16 coefficients (a numpy RandomState shuffle, replicated bit-for-bit by a hand-written " +
      "JS MT19937, matching the authority position by position).\n\n" +
      "Honest family property: the password only permutes coefficients inside each block, and s[0] is dominated by " +
      "block energy, so it is nearly permutation-invariant — measured on the reference (numpy) a wrong password flips " +
      "only ~11/248 bits; this JS implementation 0/248. **The password is not a decryption key**: the scheme provides " +
      "robust embedding, not confidentiality.",
    usage:
      "Embed: drop a carrier, enter the watermark text → watermarked PNG. Extract: drop the watermarked image → text " +
      "via automatic length header. When interoperating with the reference implementation, supply wmBits (total bits); " +
      "larger d1/d2 means more robustness and more visible distortion. If extraction reports \"no valid watermark\", " +
      "check password, d1/d2 against embedding, and whether the image was strongly compressed.",
    examples: [
      { in: "512×384 carrier", param: "pw=1, d1=36, d2=20", out: "DWT-DCT-SVD blind watermark demo", desc: "248-bit payload, four-way bit-exact closure" },
      { in: "watermarked image (400×320)", param: "auto header", out: "flag{dwt_dct_svd_ok}", desc: "192 bits, 0-difference cross-decode with the reference" },
      { in: "256×256 carrier", param: "pw=7, d1=30, d2=0", out: "hello-真盲水印-2026", desc: "d2 disabled variant also passes" },
      { in: "unwatermarked original", param: "same params", out: "error \"no valid DWT-DCT-SVD watermark…\"", desc: "No false success" },
      { in: "over-long text", param: "embed", out: "error \"watermark too long: needs N bit, image holds M bit\"", desc: "Hard capacity from low-frequency block count" },
    ],
    tips: [
      "A single image plus a \"blind watermark\" hint → try this op first (truly blind); two images → the dual-image frequency scheme.",
      "SVD quantization sits in the low frequencies: robust to compression/rescale, sensitive to rotation/cropping.",
      "Extraction runs a hand-written Jacobi SVD, numerically within 1e-13 of numpy linalg.svd.",
      "The d2 majority vote never overrides the s[0] decision (weight structure), so disabling d2 does not change extraction correctness.",
      "Capacity = number of low-frequency blocks ((cA size / 4)²); the tool hard-validates it before embedding and reports the available count.",
      "Authority: Navas et al., DWT-DCT-SVD watermarking (COMSWARE 2008 §III) plus the frozen blind_watermark bwm_core.py implementation, verified by four-way cross-checks.",
    ],
    aka: [
      "dwt dct svd watermark", "dwt svd watermark", "blind watermark extract", "svd watermarking",
      "小波盲水印", "奇异值盲水印", "真盲水印", "单图盲水印", "blind watermark decoding", "dwt watermark",
      "svd-dct watermark", "图像盲水印提取", "watermark stego", "数字水印",
    ],
  },

  watermarkhFft: {
    what:
      "WaterMarkH frequency-domain invisible watermark — the algorithm of that old 52pojie image-watermark tool, now " +
      "reimplemented in pure front-end (it used to require launching its exe). The watermark lives in the frequency domain: " +
      "a black-background/white-text pattern is added **directly as a spectrum**, so it is invisible to the eye; extraction " +
      "renders the image's **magnitude spectrum**, where the text surfaces.",
    principle:
      "Embedding (as in the original tool): with $x$ the normalised channel value, $W$ the watermark pattern and $N=w\\times h$,\n\n" +
      "$$\\text{out} = 256 \\times \\left| x + \\frac{\\alpha}{\\sqrt{N}}\\cdot \\mathrm{DFT}(W) \\right|$$\n\n" +
      "where $\\alpha = \\text{strength}/500$ (default 0.1). Key point: it is **not** 'FFT the watermark image then add it' — the " +
      "pattern itself is used as a spectrum. In the spatial domain it becomes a noise-like perturbation of about one grey level " +
      "(invisible), while in the frequency domain it appears as the pattern.\n\n" +
      "The pattern is first **mirrored centre-symmetrically** ($W[y][x] = W[h-1-y][w-1-x]$) so its inverse transform is real-valued " +
      "(only a half-sample linear phase remains) and the image does not suffer random complex-phase distortion. The cost is that " +
      "extraction shows the text **together with its 180°-rotated copy**.\n\n" +
      "Extraction takes the channel **magnitude spectrum** $|\\mathrm{DFT}(x)|\\times 256\\times gain$ (gain = brightness/5, default 10). " +
      "The image's own frequency content forms a noisy background with the watermark text as bright glyphs on top.\n\n" +
      "**Both dimensions must be powers of two**, which is why the original tool offers 5 geometry schemes (scale / pad / crop) " +
      "to bring an image to a power-of-two size.",
    usage:
      "Embed: drag in a carrier image + type the watermark text (separate lines with `|`) → outputs a watermarked PNG; you can also " +
      "switch Pattern source to Image and use a picture as the pattern. Extract: drag in the watermarked image → outputs a " +
      "**magnitude spectrum** image whose text is read **by eye** (no key, no error-correction code, not an automatic decoder). " +
      "Pick a geometry scheme when the size isn't a power of two; embedding and extraction **must use the same scheme**.",
    examples: [
      { in: "watermarkH盲水印.PNG (2048×1024)", param: "scheme 1, gain 10", out: "Spectrum shows flag{Unity_of_knowledge_and_action} plus its 180° copy", desc: "Real sample; matches the platform slogan" },
      { in: "watermark.jpg (2048×1024, JPEG)", param: "scheme 1, gain 5", out: "Spectrum shows SQCTF{...}", desc: "Lossy JPEG blurs glyph edges; needs zooming to read" },
      { in: "320×320 carrier + text \"WMDEMO\"", param: "scheme 1, strength 50", out: "Extraction spectrum shows WMDEMO", desc: "Four-way acceptance test" },
      { in: "synthetic 256×256 carrier", param: "α=0.1", out: "mean pixel delta 0.99 grey levels (invisible); pattern contrast 55×", desc: "Quantified invisibility and extractability" },
      { in: "image with non-power-of-two size", param: "any scheme", out: "Scaled/padded/cropped to a power of two before embedding", desc: "Hard algorithmic constraint" },
    ],
    tips: [
      "**If an image looks clean but the challenge hints at a watermark, try this** — it is another form of 'true blind': no original image needed.",
      "Extraction yields a **spectrum image**; the text is read by eye. There is **no** automatic decoding step, so don't expect a string back.",
      "Embedding and extraction **must use the same scheme** (same size / resampling kernel / pad colour), otherwise the spectrum is misaligned and the text is unreadable.",
      "**Any re-compression, rescaling or cropping weakens it badly** — the watermark is a ~1 grey-level frequency-domain perturbation. Measured: PNG sample crisp, JPEG sample blurred.",
      "The text overlaps its own 180° copy — enable 'Extract: suppress mirror copy' to subtract what both share, making small text clearer.",
      "If brightness is hard to tune, enable 'Extract: auto gain' + 'normalise background'.",
      "The pattern can be an **image** (better than the original tool): pick a file with the upload button or drag an image into the parameter box; black-and-white images work best.",
      "This op replaces watermarkH.exe: the original exe and its local-bridge whitelist entry have been retired.",
      "Basis: compatibility cross-checks against WaterMarkH 1.2.0.0 sample outputs; FFT phase convention verified to 1e-15.",
    ],
    aka: [
      "watermarkH", "watermarkh", "watermarkH盲水印", "频域隐形水印", "隐形水印", "图像水印",
      "盲水印", "图片盲水印", "水印隐写", "fft watermark", "invisible watermark",
      "spectrum watermark", "水印提取", "幅度谱水印", "52pojie watermark",
    ],
  },
};
