// English edu shard: classical batch — jefferson / amsco / ragbaby / trilitere / skipCipher.
// Pure data, no imports, no side effects. Mirrors the Chinese edu cards for the same five opIds.
// Sources: Wikipedia "Jefferson disk"; dCode "Chiffre AMSCO" / "Chiffre Trilitere" / "Chiffre Ragbaby" /
// "Chiffre par saut"; Young Tyros (ACA) Ragbaby tutorial; SPOJ AMSCO1/AMSCO2. All accessed 2026-09-21.
// Every example below was executed against the implementation and reproduces the stated output.
export default {
  jefferson: {
    what: "The Jefferson disk (also called the Bazeries cylinder) — a stack of disks each engraved with a scrambled alphabet, mounted on a common spindle. The order of the disks is the key: you rotate the disks until the plaintext lines up in one row, then read a different row as the ciphertext.",
    principle:
      "Each disk carries one permutation of the 26 letters, and every disk is different. Mount the disks in the agreed order — that order is the key.\n\n" +
      "Encryption: rotate disk by disk so that plaintext letter $p_i$ sits on the reference row (row 0 of the stack in this tool). That fixes every row of the spindle at once; read another row as the ciphertext. With $\\text{idx}(p_i)$ the index of the plaintext letter on its own disk and offset $o$, the ciphertext letter is the one at index $(\\text{idx}(p_i) + o) \\bmod 26$ on that disk.\n\n" +
      "Decryption: mount the ciphertext on the offset row and read $o$ rows back. Historically the receiver had to try row after row until readable text appeared, because the offset was not shared; this tool fixes \"which row to read\" as the parameter offset, which makes it strictly two-way reversible.\n\n" +
      "Every disk uses the same offset — exactly the weakness that broke the device: the shift between plaintext and ciphertext is uniform.",
    usage:
      "Three parameters: key is the disk order (1-based indices, comma separated, e.g. 7,9,5,10,1,6,3,8,2,4); disks defines the disks (one 26-letter permutation per line, each of which must use every letter A-Z exactly once); offset is the ciphertext row measured from the reference row (positive = later in the alphabet, negative = earlier).\n\n" +
      "Encode: enter plaintext to get ciphertext (only A-Z is kept, output is uppercase). Decode: enter ciphertext with the same parameters to recover the plaintext. The default parameters are the Wikipedia 10-disk example and can be verified directly.\n\n" +
      "Plaintext longer than the number of disks is split into blocks: each block consumes one full pass of all disks, and the final block uses only the first few disks, so any length round-trips.",
    examples: [
      { in: "retreat now", param: "defaults (key=7,9,5,10,1,6,3,8,2,4; offset=6)", out: "OMKEGWPDFN", desc: "Wikipedia \"Jefferson disk\" 10-disk example (10 letters after spaces are removed = 10 disks)" },
      { in: "OMKEGWPDFN", param: "defaults, Decode direction", out: "RETREATNOW", desc: "Read back to verify two-way reversibility" },
    ],
    formulas: [
      { tex: "c_i = \\text{disk}_{i}\\!\\left[(\\text{idx}(p_i) + o) \\bmod 26\\right]", caption: "Encryption: index of the plaintext letter on its disk, plus offset, mod 26; decryption subtracts the offset" },
    ],
    tips: [
      "Recognition: the challenge mentions disks, wheels, a cylinder, or gives a set of scrambled alphabets plus a disk-order key.",
      "offset is the crucial parameter: if unknown, enumerate 0-25 (both signs) and look for the row that yields readable English.",
      "Every disk must be a complete A-Z permutation; this tool rejects disks of the wrong length or with repeated letters.",
      "The historic M-94 machine (US Army, 1922-1942) is a 25-disk descendant of this design.",
      "Security: a classical mechanical cipher offers no modern security (the 10-disk example has only 10! ≈ 3.6×10⁶ disk orders and a uniform shift between plaintext and ciphertext). CTF and teaching only.",
      "Sources: Wikipedia \"Jefferson disk\" https://en.wikipedia.org/wiki/Jefferson_disk ; dCode \"Cylindre de Jefferson\" https://www.dcode.fr/cylindre-jefferson (accessed 2026-09-21).",
    ],
    aka: ["Jefferson disk", "Jefferson cipher", "Bazeries cylinder", "wheel cipher", "jefferson cylinder",
      "cylinder cipher", "Jefferson wheel", "disk cipher"],
  },

  amsco: {
    what: "The AMSCO cipher — an \"incomplete columnar\" transposition: the plaintext is written into a grid row by row, but cells hold either one or two letters (alternating), and the columns are then read off in the order given by the key.",
    principle:
      "Write the plaintext into a grid $L$ columns wide ($L$ = key length). The point is that a cell holds 1 or 2 letters, decided by the \"cut sequence\".\n\n" +
      "Look along the anti-diagonals (cells where row + column has the same value): every cell on one anti-diagonal has the same capacity, and the capacity of diagonal $d$ is $\\text{cut}[d \\bmod |\\text{cut}|]$. With cut sequence 1,2 and width 3 the capacities form:\n\n" +
      "row 1: 1 2 1 / row 2: 2 1 2 / row 3: 1 2 1.\n\n" +
      "Cells are filled in row order (the last cell may be short — it takes whatever characters remain). Then the columns are read top-to-bottom in the order produced by sorting the key letters, and concatenated into the ciphertext.\n\n" +
      "Decryption: compute the same capacities, cut the ciphertext back into columns in key order, cut each column into cells by capacity, then read row by row.",
    usage:
      "Two parameters: key is the keyword (letters only, it fixes the column order — sorted ascending, ties keep the earlier column); cut is the cut sequence (the 1s and 2s, comma separated, default 1,2).\n\n" +
      "Encode: plaintext → ciphertext; Decode: ciphertext with the same key/cut → plaintext. Only A-Z is kept and output is uppercase. The default parameters are the dCode worked example, so they can be checked directly.",
    examples: [
      { in: "DCODEAMSCO", param: "key=CLE, cut=1,2", out: "DEAODSCCOM", desc: "dCode worked example: key CLE gives column order 1,3,2" },
      { in: "DEAODSCCOM", param: "key=CLE, cut=1,2, Decode direction", out: "DCODEAMSCO", desc: "Cut back the other way to verify reversibility" },
      { in: "DCODEAMSCO", param: "key=CLE, cut=2,1", out: "DCAODECOMS", desc: "Digraph-first cutting gives a different result" },
    ],
    formulas: [
      { tex: "\\text{cap}(r,c) = \\text{cut}\\,[(r+c) \\bmod |\\text{cut}|]", caption: "The capacity of cell (r,c) is fixed by its anti-diagonal index" },
    ],
    tips: [
      "Recognition: the ciphertext is a permutation of the plaintext letters (same index of coincidence) but column lengths are not uniform, because some columns carry digraph cells.",
      "cut is the easiest parameter to get wrong: the classic form is 1,2 (single first) and 2,1 (digraph first) is also used; the two give different results, so try both.",
      "AMSCO is the initials of 19th-century author A. M. Scott (dCode).",
      "This tool orders columns by ascending key letter, ties by original column index (stable sort) — the usual columnar convention.",
      "Security: a pure transposition does not change letter frequencies (same index of coincidence as the plaintext) and falls quickly to known-plaintext or short keys. CTF and teaching only.",
      "Sources: dCode \"Chiffre AMSCO\" https://www.dcode.fr/chiffre-amsco ; SPOJ AMSCO1/AMSCO2 https://www.spoj.com/problems/AMSCO1/ (accessed 2026-09-21).",
    ],
    aka: ["AMSCO", "amsco cipher", "amsco transposition", "incomplete columnar transposition",
      "alternating column shift", "1-2 transposition", "A. M. Scott cipher", "digraph columnar transposition"],
  },

  ragbaby: {
    what: "The Ragbaby cipher — a polyalphabetic substitution where the shift depends not on how many letters into the message you are, but on how many letters into the current word: the 1st letter of a word shifts by 1, the 2nd by 2, and so on, with each new word starting one higher.",
    principle:
      "Two things define it:\n\n" +
      "(1) A keyword alphabet: the distinct letters of the keyword first, then the rest of the alphabet in order. Keyword `CIPHER` gives the 24-letter alphabet `CIPHERABDFGKLMNOQSTUVWYZ`.\n\n" +
      "(2) The shift: for letter $p$ inside word $w$ (both 1-based), shift $= w + p - 1$. So the first word shifts 1,2,3…, the second word starts at 2 and shifts 2,3,4…, the third starts at 3 — each new word starts one higher than the last.\n\n" +
      "Encryption moves each plaintext letter that many places forward in the keyword alphabet; decryption moves it back the same amount (modulo the alphabet length).\n\n" +
      "The original version uses 24 letters, merging I/J and W/X — equivalent to dropping J and X. This tool also offers a 26-letter mode that round-trips losslessly.",
    usage:
      "Four parameters: keyword (empty means a plain A-Z alphabet); alphabet selects 24 (original, J and X dropped) or 26 (lossless); startShift is the shift of the first letter of the first word (default 1, dCode's \"Décalage du premier mot\"); letterStep is the extra shift added for each further letter in a word (default 1).\n\n" +
      "Encode: plaintext → ciphertext (uppercase); Decode: ciphertext with the same parameters → plaintext. Word boundaries (spaces) are preserved and count toward the word index; punctuation inside a word (hyphen, apostrophe) does not reset the count.",
    examples: [
      { in: "Now is the time for all good men", param: "keyword=CIPHER, alphabet=24", out: "OSC HV WBF YAUK NWL LUV SZCT WMC", desc: "Young Tyros (ACA) tutorial example: keyword CIPHER, progressive per-word shift" },
      { in: "MEET AT NOON", param: "keyword=KEY, alphabet=26", out: "NABX CW QSTT", desc: "26-letter lossless mode" },
      { in: "HELLO", param: "keyword=ROBIN, alphabet=24", out: "KGQSC", desc: "Short example, shifts 1..5" },
    ],
    formulas: [
      { tex: "\\text{shift}(w,p) = w + p - 1,\\qquad C = \\text{KA}\\!\\left[(\\text{KA}^{-1}(P) + \\text{shift}) \\bmod L\\right]", caption: "w = word index, p = position in word (both 1-based), KA = keyword alphabet, L = alphabet length" },
    ],
    tips: [
      "Recognition: the ciphertext preserves word lengths (spaces stay put) but the same plaintext letter becomes different letters at different positions — frequency analysis fails.",
      "The first letter of every word uses a fixed shift, so all word-initial letters form a monoalphabetic sample — the classic entry point (short words like A / OF / TO crack it fast).",
      "In 24-letter mode J→I and X→W, so plaintext containing J/X is normalised on the way through; use 26-letter mode when you need a lossless round trip.",
      "Mnemonic: shift = word index + position in word − 1 (the ACA/Gaines convention, Ct = Pt + Shift).",
      "Security: the shift is derived entirely from word structure and carries no key stream, so known plaintext or a few short words recovers the alphabet. CTF and teaching only.",
      "Sources: Young Tyros \"Ragbaby Tutorial\" https://youngtyros.com/2023/02/28/ragbaby-tutorial/ (ACA); dCode \"Chiffre Ragbaby\" https://www.dcode.fr/chiffre-ragbaby (accessed 2026-09-21).",
    ],
    aka: ["Ragbaby", "ragbaby cipher", "progressive shift cipher", "incremental shift cipher",
      "word-position shift cipher", "ACA Ragbaby", "24-letter Ragbaby", "keyword alphabet progressive shift"],
  },

  trilitere: {
    what: "The Trilitère cipher — each plaintext letter is replaced by a triplet of three symbols (a trigram). It is the ternary sibling of Bacon's biliteral cipher.",
    principle:
      "Base 3 (space ⌴ last = CCC): A=AAA, B=AAB, C=AAC, D=ABA, … equivalent to counting in base 3 with A=0, B=1, C=2, where value v=0..25 maps to A..Z and v=26 (CCC) is reserved for the space.\n\n" +
      "The variant \"Base 3 (space ⌴ first = AAA)\" puts the space first: ⌴=AAA, A=AAB, …, Z=CCC (everything shifted by one).\n\n" +
      "The three symbols default to A/B/C but can be replaced by 1/2/3 or 0/1/2 — that only changes how the trigram is written, not its structure.",
    usage:
      "Two parameters: variant selects the trigram table (base3 with space=CCC, or base3space with space=AAA); symbols sets the three characters used (default ABC).\n\n" +
      "Encode: plaintext → trigrams, non A-Z and non-space characters are dropped, output is uppercase. Decode: the ciphertext length must be a multiple of 3 and it must contain only the three chosen symbols — whitespace is accepted as a separator between trigrams (dCode writes the example as \"ABA AAC BBC ABA ABB\"). Anything else is an error, not silently skipped.",
    examples: [
      { in: "DCODE", param: "variant=base3, symbols=ABC", out: "ABAAACBBCABAABB", desc: "dCode worked example" },
      { in: "A B", param: "variant=base3, symbols=ABC", out: "AAACCCAAB", desc: "Space is encoded as CCC" },
      { in: "DCODE", param: "variant=base3space, symbols=ABC", out: "ABBABABCAABBABC", desc: "The variant table shifts every trigram by one" },
      { in: "DCODE", param: "variant=base3, symbols=123", out: "121113223121122", desc: "Only the written symbols change" },
    ],
    formulas: [
      { tex: "v(\\text{A})=0,\\; v(\\text{B})=1,\\; v(\\text{C})=2,\\qquad \\text{trigram}(i) = \\text{ABC}[\\lfloor i/9 \\rfloor]\\,\\text{ABC}[\\lfloor i/3 \\rfloor \\bmod 3]\\,\\text{ABC}[i \\bmod 3]", caption: "Letter index i (0-25) written as a 3-digit base-3 number; i=26 is the space" },
    ],
    tips: [
      "Recognition: exactly three distinct characters, distributed roughly evenly. Usually A, B and C, but it can be three digits or any three distinct things.",
      "Like Bacon's cipher, a Trilitère message can be hidden in ordinary text by alternating three typefaces, or three letter variants (upper/lower case, bold, italic, underlined).",
      "dCode also lists four further tables (Frederici, Cardan, Vigenère, Wilkins), but all four contain repeated trigrams and are missing the space entry in the retrieved source, so this tool deliberately does not implement them rather than inventing a table.",
      "Security: a monoalphabetic substitution on trigrams — frequency analysis works once the message is long enough. CTF and teaching only.",
      "Sources: dCode \"Chiffre Trilitère\" https://www.dcode.fr/chiffre-trilitere (accessed 2026-09-21).",
    ],
    aka: ["Trilitère", "triliteral cipher", "ternary cipher", "trigram substitution", "abc trigram code",
      "ternary alphabet", "triliteral substitution", "Bacon ternary variant"],
  },

  skipCipher: {
    what: "The Skip cipher — a fixed-stride transposition: starting at the given position, take every s-th character and wrap around at the end until all characters have been taken. Also known by its French name, chiffre par saut.",
    principle:
      "Encoding lays the characters out and reads positions $i, i+s, i+2s, \\ldots$ modulo $N$ (where $N$ is the length after filtering and $i$ the start position). Decoding is the inverse: the character read at step $j$ belongs to position $(i + j\\,s) \\bmod N$.\n\n" +
      "The mapping is a bijection exactly when $\\gcd(s, N) = 1$. Otherwise the stride revisits positions before covering them all, and the ciphertext would silently omit characters — for example SKIP (length 4) with stride 2 produces SISI, and K and P never appear. This tool therefore rejects a stride that is not coprime with the length instead of returning a partial result.",
    usage:
      "Three parameters: skip is the stride s (must be coprime with the length); start is the starting position (0-based); chars selects which characters are kept — alnum keeps only letters and digits (the dCode recommendation) while all keeps spaces and punctuation too.\n\n" +
      "Encode: plaintext → ciphertext; Decode: ciphertext with the same parameters → plaintext. Changing chars changes N and therefore changes whether the stride is coprime, so keep it consistent between the two directions.",
    examples: [
      { in: "DCODE", param: "skip=3", out: "DDCEO", desc: "dCode worked example" },
      { in: "HELLO WORLD", param: "skip=3, chars=alnum", out: "HLODLWLEOR", desc: "The space is dropped, changing the length" },
      { in: "ATTACKATDAWN", param: "skip=5", out: "AKWADTANCATT", desc: "Longer input, stride 5" },
    ],
    formulas: [
      { tex: "c_j = p_{(i + j\\,s) \\bmod N},\\qquad \\gcd(s, N) = 1", caption: "Read position (i + j·s) mod N at step j; the stride must be coprime with N" },
    ],
    tips: [
      "Recognition: the ciphertext uses exactly the same characters as the plaintext (pure transposition) and the letters look regularly interleaved.",
      "A stride that is not coprime with the length is a hard error, not a partial result — if you see the same letter repeating while others never appear, the parameters are wrong.",
      "Switching chars between alnum and all changes the length and therefore the coprime test: try both when the stride is rejected.",
      "Security: a pure transposition, so letter frequencies are untouched and the stride is easily recovered from a crib. CTF and teaching only.",
      "Sources: dCode \"Chiffre par saut\" https://www.dcode.fr/chiffre-saut (accessed 2026-09-21).",
    ],
    aka: ["Skip cipher", "skip transposition", "jump cipher", "fixed stride transposition",
      "equidistant reading", "chiffre par saut", "saut cipher", "stride cipher"],
  },
};
