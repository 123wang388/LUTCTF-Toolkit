/*
 * edu_occult.js — 科普卡候选（神秘学字母四件）。纯数据，无 import 无副作用。
 * 来源：dCode 四页（alphabet-thebain / alphabet-lunaire-leandro-katz / alphabet-celestial /
 * alphabet-malachim）+ Wikipedia Malachim/Vav/Yodh（均 2026-09-22 访问）。
 */
export default {
  occult: {
    what: "神秘学字母四件——文艺复兴神秘学传统里的四个替换字母表：Theban 巫师字母（1518，Trithemius《Polygraphia》，Wicca 常用，也叫 Honorius 如尼）、Lunaire 月相字母（艺术家 Leandro Katz 1978，每个字母是一张月亮照片）、Celestial 天使字母与 Malachim（均出自 Agrippa《De occulta philosophia》卷三 1531/1533，从希伯来字母派生）。影视剧（Ozzy Osbourne、Hellsing、黑执事）和 CTF 里常见 Theban。",
    principle:
      "Theban：24 符对 26 字母——I/J 同符、U/V/W 同符，外加一个词/句终点符（当句号用）。文本工具里符号层是图形（dCode 内部就用字母命名符号图），机器可读信息是合并规则：J→I、V/W→U。\n" +
      "Lunaire：Katz 用西班牙语 27 字母（A-Z + Ñ），每个字母一张月相照片（从新月到满月）。dCode 约定 Ñ 自动转 N。\n" +
      "Celestial/Malachim：两层转写——拉丁字母先转成希伯来字母，再一字母一符号（dCode 的符号图就以希伯来码点命名）。22 个希伯来字母对 26 个拉丁字母是多对一：ג=C/G、י=I/J/Y、ו=F/U/V/W；ט 和 צ 没有拉丁对应。方向：希伯来从右往左读（逻辑序与拉丁逐字母对应）。\n" +
      "正字 vs 变体：Malachim 有 23 个符号（Samech 有两形）——多出来的那形只在图形层，文本层（希伯来字母）看不见。",
    usage:
      "一个参数：字母表（theban / lunaire / celestial / malachim）。\n" +
      "theban/lunaire 档：编码输出字母规范形（J→I、V/W→U、Ñ→N），解码大写化；符号图形请配图像工具。\n" +
      "celestial/malachim 档：编码输出希伯来字母串（如 CELESTIAL→גהלהשתיאל），解码把希伯来转回拉丁（多对一收敛到 C/F/I）；X 编不了（报错）、ט/ס/צ 解不了（报错）。\n" +
      "官方例（dCode）：THEBES.、HONORIUS（theban）；DCODE、LEANDRO（lunaire）；CELESTIAL→גהלהשתיאל、ANGELIC→אנגהליג（celestial）；MALACHIN→מאלאגחינ、AGRIPPA→אגריפפא（malachim）。",
    examples: [
      { in: "CELESTIAL", param: "alphabet=celestial，编码", out: "גהלהשתיאל", desc: "dCode 页面原例逐字（C E L E S T I A L 九个希伯来字母）" },
      { in: "אנגהליג", param: "alphabet=celestial，解码", out: "ANCELIC", desc: "dCode 页面例：ANGELIC 的希伯来写法解回（ג 收敛为 C——G 的痕迹丢了，22 对 26 的固有歧义）" },
      { in: "MALACHIN", param: "alphabet=malachim，编码", out: "מאלאגחינ", desc: "dCode 页面原例逐字" },
      { in: "WITCH", param: "alphabet=theban，编码", out: "UITCH", desc: "W→U（U/V/W 同符），文本 token=字母；真符号是 24 个巫师符文图形" },
    ],
    formulas: [
      { tex: "h_i = T(p_i),\\ T=\\{\\text{C}\\!\\mapsto\\!\\text{ג},\\ \\text{G}\\!\\mapsto\\!\\text{ג},\\ \\text{F/U/V/W}\\!\\mapsto\\!\\text{ו},\\ \\text{I/J/Y}\\!\\mapsto\\!\\text{י},\\ldots\\}", caption: "Celestial/Malachim：拉丁→希伯来多对一转写（22 希伯来字母对 26 拉丁字母）" },
    ],
    tips: [
      "识别：像如尼的巫师符文（Theban）、月亮照片序列（Lunaire）、端点带圆点/星星的几何符号（Celestial/Malachim 三兄弟同源长相接近）、Wicca/所罗门钥匙/Agrippa 梗。",
      "Celestial、Malachim、Passing the River 三者图形几乎一样（同出 Agrippa 卷三），文本层都是希伯来转写——解出希伯来字母串后三家通用。",
      "希伯来层解回拉丁必有信息丢失：G 变 C、J/Y 变 I、V/W 变 F（dCode FAQ 首列收敛）。出题用 ANGELIC 这类词时同一希伯来串对应多候选，靠词义挑。",
      "Theban 的 I/J、U/V/W 合并是字母表本身的历史设计（英语拼写的 I/J 到 17 世纪才分流）。",
      "Lunaire 是当代艺术（1978）不是古密码——按月相亮度排序正好 27 个：从新月渐盈到满月再亏回去。",
      "X 报错不是 bug：希伯来没有 X 音，Agrippa 原表就没给，本工具不编造映射。",
      "来源：dCode 四页 https://www.dcode.fr/alphabet-thebain 、/alphabet-lunaire-leandro-katz 、/alphabet-celestial 、/alphabet-malachim （访问日期 2026-09-22）。",
    ],
    aka: ["神秘学字母", "巫师字母", "Theban", "Theban alphabet", "女巫字母", "witches alphabet",
      "Runes of Honorius", "月相字母", "Lunar alphabet", "Leandro Katz", "Celestial alphabet",
      "天使字母", "Malachim", "Agrippa alphabet", "魔法字母", "occult alphabets"],
  },
};
