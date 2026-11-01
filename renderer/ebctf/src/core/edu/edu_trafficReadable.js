/*
 * edu_trafficReadable.js — 科普卡分片（流量可读结论）。纯数据，无 import 无副作用。
 * 格式来源：libpcap 文件格式；pcapng v1.0；USBPcap / Linux usbmon 伪头；
 * USB HID 1.21；MQTT 3.1.1 / 5.0；HTTP/1.1 RFC 9112；DNS RFC 1035；TLS SNI RFC 6066。
 * 示例向量为本工具在真实样本上的实测输出，可复跑。
 */
export default {
  trafficReadable: {
    what: "流量可读结论——把抓包文件从「一屏十六进制」变成人能直接读的话。识别容器与链路类型后自动分流：USB 键盘流量还原成按键序列，USB 鼠标流量还原成轨迹点集，网络流量转成 HTTP / DNS / TLS 摘要与 TCP 会话转录，MQTT 转成主题表，最后统一扫一遍 flag 与明文线索。CTF 取证与杂项题里，「拖进去看不懂」是最常见的卡点，本工具专门解决这一步。",
    principle:
      "1. 容器识别：按魔数区分 libpcap（a1b2c3d4 / d4c3b2a1 / a1b2cd34 / 34cdb2a1）与 pcapng（SHB 0x0A0D0D0A），后者还要走 IDB/EPB/SPB/NRB 块结构，支持多接口与纳秒时间戳。\n" +
      "2. 链路分流：按 linkType 判断是 USB 还是以太网。USB 侧还要认两种伪头——USBPcap（headerLen + irpId + status + function + info + bus + device + endpoint + transfer + dataLength）与 Linux usbmon mmap（64 字节头，type 在偏移 8）。\n" +
      "3. USB 侧：先解析配置描述符（class/subclass/protocol）判断接口角色是键盘还是鼠标，再按 HID 1.21 boot 报告还原。键盘报告是 8 字节（Modifier + Reserved + Keycode1-6），要处理 Shift / CapsLock 状态、长按去重、退格，并且**修饰键必须参与字符生成**：Ctrl 组合键按 ASCII 控制字符还原（Ctrl+A=0x01 … Ctrl+Z=0x1A、Ctrl+[=0x1B、Ctrl+Space=0x00），Alt 组合键按 POSIX 终端约定还原为 ESC 前缀，GUI 组合键由本机系统消费、明文对应位置无字符；鼠标报告是按钮 + X/Y 位移，位移量按候选布局（1/2/4 字节有符号）自动选最合理的一档，再累加成轨迹。\n" +
      "4. 网络侧：按四层剥开，TCP 流做重组后转录；HTTP 解析请求行/头/体并对体做多层解码；DNS 解析问题与回答；TLS 抓 ClientHello 里的 SNI。MQTT 解析固定头（类型/QoS/retain）+ 剩余长度变长整数 + PUBLISH 载荷，聚成主题表。\n" +
      "5. flag 与明文：对全部还原出的文本统一做模式扫描（flag{...} 及常见变体、key{...} 等），命中即置顶提示。花括号内**不允许出现控制字符**——组合键本来是控制字节，若把它当正文纳入，就会造出「flag{...c}」这类假 flag 并高置信置顶；同理**名字前不得出现「单词字符紧跟控制字节」的形态**（`f␃lag{...}` 里控制字节把单词劈开，通用名字模式会匹配到被截断的后缀 `lag{...}`，报出前缀错误的假 flag）。判据精确到「控制字节是否劈开了单词」：控制字节前若没有字母/数字/下划线（行首、空白之后），说明没有单词被劈开，其后若是完好前缀**照常命中**（否则会漏掉「组合键打在 flag 之前」的真答案）。总体原则：宁可漏报也不许假报。",
    usage:
      "把 pcap/pcapng 文件拖进来即可（走 rawBytes 通道），也可以粘贴流量的 hex 或 base64 文本。\n\n" +
      "参数：backspace（退格是否生效，关掉则保留 [BKSP] 标记）、capsInitial（初始大写锁定，用于那些全程没发 CapsLock 报告的样本）、canvasWidth（鼠标轨迹画布宽度，字符列数）。\n\n" +
      "报告结构固定：先给结论行（识别到什么接口、还原出什么），再给「解出 flag / 明文」置顶块，之后按节展开各类明细。与既有的 USB 键盘 / USB 鼠标 / pcap 解析 op 并存不替换，那些 op 适合看单点细节，本工具适合先拿到「人话结论」。",
    examples: [
      { in: "（真实样本：USB 键盘流量 pcap）", param: "backspace=true",
        out: "flag{pr355_0nwards_a2fee6e0}", desc: "实测：识别 1 个键盘接口，还原 29 次按键，直接给出 flag" },
      { in: "（真实样本：USB 键盘流量 pcapng，小键盘打十六进制）", param: "backspace=true",
        out: "moectf{n1ha0w0y0udianl32451}", desc: "实测：数字小键盘输入的十六进制串还原为明文" },
      { in: "（真实样本：TCP/telnet 会话抓包）", param: "默认",
        out: "flag{d316759c281bf925d600be698a4973d5}", desc: "实测：TCP 流重组后转录会话内容，flag 直接出现在明文里" },
      { in: "（真实样本：MQTT 流量 pcapng）", param: "默认",
        out: "主题表 /game/flag、/game/flag/find_flag", desc: "实测：载荷导出为 RAR 归档，主题表给出定位线索" },
    ],
    formulas: [
      { tex: "\\mathrm{varint}:\\ \\mathrm{value} = \\sum_i (b_i \\bmod 128)\\cdot 128^{\\,i}", caption: "MQTT 剩余长度的变长整数编码（每字节低 7 位有效，最高位为续接标志）" },
      { tex: "\\mathrm{flag\\ hit} \\iff \\mathrm{body} \\cap \\{\\,0\\text{x}00 \\dots 0\\text{x}1\\text{F}, 0\\text{x}7\\text{F}\\,\\} = \\varnothing \\ \\wedge\\ \\neg\\bigl(\\mathrm{word}_{\\mathrm{char}}[\\,0\\text{x}00 \\dots 0\\text{x}1\\text{F}, 0\\text{x}7\\text{F}\\,]^{+}\\ \\mathrm{before}\\ \\mathrm{prefix}\\bigr) \\ \\wedge\\ \\mathrm{text} \\sim \\text{/(?:flag|key|ctf)\\{\\dots\\}/}", caption: "flag / 明文线索扫描判据：前缀命中 + 花括号内非空 + 正文不含控制字符 + 前缀前不出现「单词字符紧跟控制字节」的劈词形态（否则 Ctrl 组合键会把名字截断成后缀，造出假答案；控制字节前无单词字符则不算劈词，照常命中）" },
    ],
    tips: [
      "USB 键盘报告是 8 字节：Modifier + Reserved + Keycode1-6。同一时刻多键按下时 keycode 数组会有多个非零值；修饰键（Shift/Ctrl/Alt/GUI）只在 Modifier 字节里，不在 keycode 里。",
      "组合键不在明文里留裸字母。例如样本末尾的 Ctrl+C 在报告里是 Modifier=0x01 + Keycode=0x06，明文还原为控制字符 0x03（ASCII ETX）并写作 \\x03 —— 这正是终端实际交给前台程序的字节；Alt+字母按 POSIX 终端约定还原为 ESC 前缀（\\x1b + 字母），GUI 组合键由本机系统消费、明文对应位置无字符。报告会单列每次组合键及其还原字节，便于人工判读。",
      "鼠标位移量有 1/2/4 字节有符号三种常见编码，本工具自动选最合理的一档，并在报告里标明采用的布局与坐标范围。轨迹是相对位移累加的结果，不是绝对坐标。",
      "「解不出」通常不是工具坏了：先看概览行的包总数与链路类型。链路类型不是 USB 却按 USB 看，或包数为 0，才是真问题。",
      "MQTT 的载荷常常是压缩包或 base64，本工具会把可导出的产物列出来，但不会替你解压——按提示把载荷取出再走归档工具。",
      "安全边界：全程本地内存解析，零外发、零第三方依赖、不依赖任何 Node 内置模块，可直接在浏览器 Worker 里跑。畸形输入不抛异常，返回结构化错误。",
      "来源：libpcap 文件格式与 pcapng v1.0 规范；USBPcap 与 Linux usbmon 伪头格式；USB HID 1.21（Keyboard/Keypad 页 0x07 usage 表）；MQTT 3.1.1 / 5.0（OASIS 标准）；HTTP/1.1 RFC 9112；DNS RFC 1035；TLS SNI 扩展 RFC 6066。",
    ],
    aka: ["流量分析", "流量可读", "抓包分析", "pcap", "pcapng", "流量包", "USB 流量", "键盘流量", "鼠标流量",
      "traffic analysis", "packet capture", "USB HID", "MQTT 主题表", "TCP 流重组", "CTF 流量题", "取证流量"],
  },
};
