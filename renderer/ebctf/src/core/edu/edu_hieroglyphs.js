/*
 * edu_hieroglyphs.js — 科普卡候选（圣书体字母 MdC）。纯数据，无 import 无副作用。
 * 来源：dCode「Hiéroglyphes (Manuel de Codage)」（2026-09-22 访问）+ Unicode 字符名核对。
 */
export default {
  hieroglyphs: {
    what: "圣书体字母映射（Manuel de Codage 单字母符）——埃及学标准转写法 MdC 里，几千个圣书体符号中只有一小群「单字母符」（unilittéral）一个符号对应一个字母：秃鹫𓄿=A、苇叶𓇋=I、水纹𓈖=N、折布𓋴=S……把英文单词逐字母换成圣书体符号。",
    principle:
      "编码表 20 字母（dCode 原文）：A𓄿 B𓃀 D𓂧 F𓆑 G𓎼 H𓉔 I𓇋 K𓎡 L𓃭 M𓅓 N𓈖 P𓊪 Q𓈎 R𓂋 S𓋴 T𓏏 W𓅱 X𓐍 Y𓇌 Z𓊃。\n" +
      "C/E/J/O/U/V 没有单字母符（古埃及语音系里这些音由别的字母覆盖），dCode 原文明示编不了——遇到直接报错，不猜。\n" +
      "解码表 30 字形：除 20 个正字还有 10 个变体（𓂝 前臂也是 A、𓏲 也是 W、𓐝 也是 M、𓋔 也是 N、𓎛 也是 H、𓄡 也是 X、𓈙 也是 S、𓍿 也是 T、𓆓 角蝰也是 D、𓏭 也是 Y）——古文字一字多形，字母级无歧义，输出统一大写。\n" +
      "符号的 Unicode 名内嵌 Gardiner 编号（G001/D058/D046…），与埃及学标准编号一一对应，可当查字典的钥匙。",
    usage:
      "无参数。编码：输入文本（大写化），20 个可编字母换成圣书体符号，C/E/J/O/U/V 报错，空格标点原样保留。解码：30 个符号还原大写字母，其余原样。SPHINX → 𓋴𓊪𓉔𓇋𓈖𓐍，𓄿𓈖𓎡𓉔 → ANKH（dCode 页面双例）。",
    examples: [
      { in: "SPHINX", param: "编码", out: "𓋴𓊪𓉔𓇋𓈖𓐍", desc: "dCode 页面例：S,P,H,I,N,X 六符号" },
      { in: "𓄿𓈖𓎡𓉔", param: "解码", out: "ANKH", desc: "dCode 页面例：ankh 生命之符的四个字母" },
      { in: "ANKH", param: "编码", out: "𓄿𓈖𓎡𓉔", desc: "与上例互逆" },
      { in: "DCODE", param: "编码", out: "报错：C 无单字母符", desc: "C/E/J/O/U/V 编不了（dCode 口径），CTF 出题会避开或要求手工近似" },
    ],
    formulas: [
      { tex: "\\text{glyph}(x) = \\mathrm{MdC}_{\\text{uni}}(x),\\quad x \\in \\{\\text{A,B,D,}\\ldots\\text{,Z}\\}", caption: "20 个单字母符逐字母替换（C/E/J/O/U/V 无字形）" },
    ],
    tips: [
      "识别：成串的圣书体符号（鸟、蛇、眼睛、水纹）、提到象形文字/罗塞塔/埃及学/Manuel de Codage/Gardiner 编号。",
      "与「埃及数字」区分：数字那 7 个符号（𓏺𓎆𓍢…）表示 10 的幂，本 op 的 30 个符号表示字母——同在圣书体块 U+13000..U+1342F，别混。",
      "坑位：英文里最常见的 E/O 恰好编不了——密文里出现𓎛(H 变体) 要认得，出现可疑长元音拼写先想想是不是出题人绕开了 E/O。",
      "解码变体归并：𓂝 和 𓄿 都解成 A（一个是前臂音值 a、一个是秃鹫音值 aleph，转写学里都写 A 段），这是 dCode 口径。",
      "字体要求：圣书体块需要 Unicode 5.2+ 字体（Noto Sans Egyptian Hieroglyphs 等），缺字显示方框不影响码点。",
      "只收单字母符：双字母（如 𓄡 之外的 nb 组合）、三字母、限定符都不在本 op（dCode 同口径），真古文转写用专业工具（JSesh 等）。",
      "来源：dCode https://www.dcode.fr/hieroglyphes-manuel-de-codage （访问日期 2026-09-22）。",
    ],
    aka: ["圣书体", "象形文字字母", "Manuel de Codage", "MdC", "hieroglyphs", "Egyptian hieroglyphs",
      "埃及象形文字", "圣书体转写", "uniliteral signs", "单字母符", "Gardiner", "埃及字母表"],
  },
};
