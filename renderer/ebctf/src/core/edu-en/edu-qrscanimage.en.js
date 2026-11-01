// English edu shard: QR image scanning (qrScanImage). Pure data, no imports, no side effects.
// Source of truth: ISO/IEC 18004 "QR Code bar code symbology specification" (finder ratio,
// version-to-size mapping, alignment pattern positions, BCH(15,5) format information).
// Convention: `formulas[].tex` stays plain LaTeX (the renderer reads data-tex directly);
// inline math in prose uses $...$. No stray $ elsewhere, so no hash/flag string is mis-split.
export default {
  qrScanImage: {
    what: "QR image scanning — decode a QR code directly from a **picture**. The other QR tools in this toolbox only accept a 0/1 module matrix (i.e. a QR that has already been located). This one adds the missing front end: hand it a photo, a screenshot or a scan, and it finds the code, straightens it, samples the grid, corrects errors and returns the text. Typical CTF style: a QR whose finder patterns were erased, occluded, or photographed at an angle.",
    principle:
      "1. Grayscale and binarize: three binarization methods (global Otsu, local mean, fixed threshold) are tried, each in both polarities — screenshots and scans routinely come out inverted.\n" +
      "2. Finder detection: a QR has three corner finder patterns (concentric squares). Horizontal and vertical scanlines are searched independently for the $1:1:3:1:1$ dark/light ratio, and the hits are clustered by voting, giving finder centers that are independent of image scale.\n" +
      "3. Geometry: the three finder centers define an affine transform onto the standard module grid; the finder patterns themselves are used as a self-calibration template, and alignment patterns are used for a second-order correction when present.\n" +
      "4. Sampling: the module size implied by the version is used to sample a 0/1 matrix.\n" +
      "5. Decoding: the matrix goes to the existing QR decoder — read the format information (error level + mask, BCH(15,5)), unmask, Reed-Solomon correct per block, then restore the text segment by segment. When the format area is unreadable, all 32 (error level x mask) combinations are brute-forced.\n" +
      "6. **No-finder fallback**: the finder pattern is a *function pattern* — its values are fully determined by the standard and carry no data. Erasing it therefore loses only the *geometric reference*, not information. When fewer than three 1:1:3:1:1 patterns are found, the grid is rebuilt from the image's own scale evidence (whole image is the symbol / robust bounding box / 4-module quiet zone / run-length pitch mode), orientation is enumerated over the eight isometries of the square (the D4 group), error level and mask are brute-forced over 32 combinations, and every accepted solution must **re-encode to the identical codeword stream**.\n" +
      "7. **Occlusion erasure**: modules are dark or light, nothing else. If a module's neighbourhood is largely neither dark ink nor light ink, that area is not valid module rendering (a grey block, a coloured overlay) — it is marked as an *erasure position* and handed to Reed-Solomon with erasures. Known positions cost one check symbol each instead of two, which rescues far more damage.\n" +
      "8. Budget: each image gets an 8-second budget with early exit, so one hard image cannot stall everything.",
    usage:
      "Just drop an image file in (it arrives over the rawBytes channel). PNG is decoded by a pure-JS decoder (zero dependencies); JPEG / GIF / BMP / WebP are decoded by the browser.\n\n" +
      "Parameters: report (emit a diagnostic report), budgetMs (per-image time budget, default 8000 ms).\n\n" +
      "**When it fails, turn report on**: the report names the exact stage it got stuck at (image parse / binarize / finder detection / grid sampling / format information / RS correction / erasure capacity / capacity gate / re-encode gate / ambiguous), the primary cause, a per-stage failure count, an advisory tied to the relevant clause of the standard, and a trace of every path tried (how many finders each binarization found, every sampled candidate with its version and structural scores, which grids the no-finder fallback attempted). 'Not enough finders' and 'beyond RS capacity' are completely different failures and the report keeps them apart.",
    examples: [
      { in: "(no-finder sample: 25x25 modules, all three finder patterns wiped out)", param: "default",
        out: "flag{QR_c0de_1s_1nterest1n9}", desc: "Decoded for real; matched the 'whole image is the symbol' grid model with timing-pattern agreement 1.00 and format-info Hamming distance 0" },
      { in: "(finder patterns wiped out, image one row taller than the symbol)", param: "default",
        out: "flag{QR_c0de_1s_1nterest1n9}", desc: "Decoded for real; a non-square difference of at most 2% triggers square-window enumeration on the short side — no per-sample special case" },
      { in: "(QR with a large grey block covering the bottom-right corner)", param: "default",
        out: "sample_data", desc: "Decoded for real; the ink signal marked 19 erasure codewords and Reed-Solomon with erasures recovered it" },
      { in: "(QR covered by thin grey cross lines)", param: "default",
        out: "FLAG IS YOIDUKI MONOGATARI", desc: "Decoded for real; uniform grey lines binarize identically under every method (so the disagreement signal goes silent) and the ink signal is what localises the erasures" },
      { in: "(real sample: a version 7 QR with a torn area)", param: "default",
        out: "This text is just example to show that small teared data on important location can cause Q",
        desc: "Decoded for real in about 30 ms" },
      { in: "(occlusion beyond the error-correction capacity)", param: "default",
        out: "Not decoded: stuck at RS correction / erasure capacity, with the quantified reason that per-block erasures exceed the check codewords", desc: "Beyond capacity means unrecoverable; the tool does not fabricate a result" },
    ],
    formulas: [
      { tex: "\\mathrm{finder}:\\ 1:1:3:1:1", caption: "On any scanline through its center, a finder pattern shows the dark/light module width ratio 1:1:3:1:1 (ISO/IEC 18004 clause 6.3.2)" },
      { tex: "\\mathrm{size} = 4\\,V + 17", caption: "Module side length for version V (1-40); sampling infers the version from the measured module size (ISO/IEC 18004 clause 6.4)" },
      { tex: "e + 2v \\le \\mathrm{nsym}", caption: "Per-block correction capacity: e erasures plus v unknown errors; an erasure at a known position costs one check symbol (ISO/IEC 18004 clause 6.5)" },
      { tex: "\\mathrm{BCH}(15,5):\\ g(x) = x^{10}+x^8+x^5+x^4+x^2+x+1", caption: "Format information is a (15,5) BCH code able to correct 3 errors; when unreadable, 32 combinations are brute-forced (clause 6.9.1)" },
    ],
    tips: [
      "The finder patterns are the three concentric squares whose ratio is always $1:1:3:1:1$ — a scale-free criterion, so one detector handles both large and small images without knowing the code size in advance.",
      "Version sets the size: version V has a module side of $4V+17$ (V=1 is 21x21, V=40 is 177x177). Sampling estimates the module size first and infers the version from it; a wrong version misaligns everything.",
      "**Erasing the finder patterns does not destroy the code**: their values are fully determined by the standard (dark ring, light ring, 3x3 dark core), so they are a *function pattern*, not data. What is lost is only the geometric reference — which is exactly why the no-finder fallback can work.",
      "Inversions and mirrors must be enumerated: screenshots, print-then-photograph and glass reflections all flip polarity, and orientation enumeration covers 90/180/270 rotations plus every mirror. For a square symbol the full set of orientations is exactly the eight elements of the dihedral group D4.",
      "**When occlusion is mid-grey, the binarization-disagreement signal goes silent**: a uniform grey block binarizes the same way under every method, which looks like reassuring agreement. The reliable evidence is the ink itself — modules are dark or light only, so a neighbourhood dominated by pixels that are neither dark ink nor light ink is not module content.",
      "Error-correction capacity is a hard boundary: L/M/Q/H roughly recover 7%/15%/25%/30% of codeword damage, and erasures are cheaper than unknown errors ($e + 2v \\le \\mathrm{nsym}$). Beyond capacity nothing can recover it, and this tool will not fabricate an answer — it would rather miss one image than report a wrong string.",
      "'Not enough finders' and 'sampling/correction failed' are two different problems: the first means the image is too blurry or too heavily occluded, the second means the image is clear but the data is damaged. The diagnostic report tells them apart and points in the right direction.",
      "Real photographs have a much lower success rate than synthetic images — that is true of every algorithm in this class. Results on real image sets are reported honestly, not inflated; failures come with the stage and the reason.",
      "Safety boundary: everything runs locally with zero uploads and zero third-party dependencies; PNG decoding is pure JS. There is no batch mode for multiple codes in one image, and no 1D barcode recognition.",
      "Source: ISO/IEC 18004 (QR Code bar code symbology specification) — finder ratio and fixed values, timing patterns, quiet zone, version-to-size relation, alignment pattern position table, BCH(15,5) format information and error-correction capacity all come from that standard.",
    ],
    aka: ["qr scan image", "QR code scanner", "read qr code", "qr from image", "damaged qr", "occluded qr", "qr without finder", "qr finder pattern", "二维码识别", "二维码扫描", "二维码读图", "无定位符二维码", "二维码遮挡修复", "二维码诊断"],
  },
};