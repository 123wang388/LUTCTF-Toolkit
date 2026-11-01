# LUTCTF 工具合集 · 兰州理工大学 K4L0NG

面向 **兰州理工大学 K4L0NG 战队** 与 **甘肃省「海丰杯」高校网络安全技能大赛** 的一体化解题工作台。

> 43 个内置工具 · 完全离线 · 数据不外传 · 针对国产商用密码（SM3/SM4）专项覆盖
> v1.1 新增：PCAP/PCAPNG 流量分析、PNG 宽高修复、Web 字典爆破、Cookie 越权、AES-CBC 原始字节、ELF/PE checksec、Pwn 速查、QR 识别、Brainfuck、核心价值观、海丰杯 2025 题目复盘

---

## 一、快速开始

**方式一（推荐）**：双击桌面上的 **「LUTCTF 工具合集」** 快捷方式即可启动。

**方式二**：进入安装目录 `LUTCTF-Toolkit`，双击 `start.bat`。

**方式三（命令行 / 开发）**：
```bash
cd LUTCTF-Toolkit
npm install
npm start          # 或: .\node_modules\electron\dist\electron.exe .
```

**方式四（发给同学 / 下载即用）**：
直接分发 `dist\LUTCTF-Toolkit-1.1.0-portable.exe`。这是单文件便携版，**不需要安装 Node.js、Java 或 Python**，双击即用；首次运行如被 SmartScreen 拦截，选择「更多信息 → 仍要运行」。

> 首次启动若被 Windows Defender SmartScreen 拦截，选择「更多信息 → 仍要运行」即可（未签名的自编译应用常见现象）。

---

## 二、快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + K` | 打开全局搜索（支持工具名 / 算法 / 考点关键词模糊匹配） |
| `Esc` | 关闭搜索浮层 |
| `Enter` | 在搜索浮层中打开选中项 |
| `↑ / ↓` | 在搜索结果中切换 |

点击左上角的 📌 可将窗口**置顶**，方便一边做题一边看参考资料。

---

## 三、知识域与工具清单

### 🔡 编码转换
- **Base 全家桶**：Base64 / URL-Safe / Base32 / Base32-Crockford / Base16 / Base58 / Ascii85 / Z85 / Base91 / Base100，含 Base64↔图片预览
- **URL / HTML / Unicode**：编码解码、**双重 URL 编码**、HTML 实体（十进制/十六进制）、`\u` `\x` 八进制转义，支持**多层自动解码链**
- **摩斯 / 培根 / 敲击**：摩斯电码（含宽松解码）、培根密码（26/24 字表）、敲击码、银河字母表
- **进制与比特串**：2~36 进制任意互转、5/6/7/8 位比特串↔文本、全角半角互转

### 🗝️ 古典密码
- **凯撒 / ROT 穷举**：ROT13/47/5，25 种偏移按 χ² 拟合度排序
- **维吉尼亚（含自动破译）**：IC 推断密钥长度 + χ² 逐列求解 + 英文评分挑最优；另含 Beaufort / Autokey
- **栅栏 / 列移位**：Z 型与 W 型，穷举全部栏数
- **替换 / Playfair / Polybius / ADFGX**：含**爬山法全自动替换密码破译**
- **仿射 / Atbash**：自动求乘法逆元，312 种密钥全程穷举
- **XOR 工具箱**：单字节/重复密钥异或、**单字节爆破优选排序**、已知明文头推密钥

### 🔐 现代密码
- **哈希实验室**：MD5 / SHA-1/256/384/512 / **SM3（国密）** / NTLM(MD4) / CRC32 / HMAC 系列
- **对称加密**：AES-CBC/CTR/GCM、**SM4（国密）ECB/CBC**、RC4，支持 Hex/Base64/文本三种出入格式
- **RSA 密码分析**：PEM 解析提 n·e、Pollard-Rho / Fermat 分解、**批量 GCD 共素数**、Wiener 攻击、泄漏 d 求 p·q、共模攻击、广播(Håstad)攻击

### 🖼️ 隐写取证
- **图片隐写分析台**：LSB 提取（可指定通道/位平面/行序/列序/位序）、**Stegsolve 式位平面渲染**、通道变换（反色/灰度/单通道/R^G），自动识别 PNG·ZIP·JPEG·PDF 文件头并导出
- **文件取证工作台**：mini binwalk 文件头扫描并按偏移切片导出、PNG 分块解析、**JPEG 段与 EXIF 字符串**、strings（含 UTF-16LE）、Hex 查看器
- **音频频谱 / 摩斯分析**：WAV 解析 + **FFT 频谱图渲染**（看字蛛）、包络分析与摩斯序列推测
- **ZIP 结构与伪加密**：枚举条目、识别加密标志位、生成伪加密修复命令

### 🌐 Web 安全
- **Payload 速查字典**：SQLi（Union/报错/布尔/时间/堆叠/WAF 绕过）、XSS、SSTI（Jinja2/Twig/OGNL 等）、SSRF（含 Gopher 打 Redis）、文件上传、**命令注入**（空格与关键字绕过、反弹 Shell 全集）、XXE、反序列化
- **JWT 解析与伪造**：重签 HS256/384/512、**alg=none 攻击**、SM3-HMAC 变体、弱密钥爆破指引
- **HTTP 请求构造器**：自定义方法/请求头/请求体发包查看完整响应（**主进程发包，无视 CORS**），一键生成 curl 与 Python 脚本
- **WAF / 请求头绕过备忘**：IP 伪造头、403 绕过、后台路径字典、FOFA/Shodan/ZoomEye/Google 语法

### 🧰 杂项辅助
- **时间戳与编码换算**：Unix 秒/毫秒自动识别、北京/UTC/ISO8601 互转、实时时钟
- **正则表达式测试**：含 flag 格式、内网 IP、JWT、私钥 PEM 等实用模板
- **密码 / 字典生成器**：强随机口令、UUID v4、关键词 Leet/大小写/前后缀变形字典 + 常见弱口令库
- **流量 / 逆向速查**：Wireshark 显示过滤器、tshark 命令行、内存取证、GDB/IDA/ROP 速查

### 🚨 应急响应
- **Linux 应急响应**：账户 / 进程网络 / 持久化 / 日志 / Webshell / 痕迹加固 六类排查命令
- **Windows 应急响应**：账户 / 进程网络 / 计划任务注册表 / 日志 / 处置流程
- **应急响应报告模板**：一键生成 Markdown 骨架（ checksum 检测、时间线、处置措施、加固建议）

### 🧰 外部整合
- **本机工具箱**：整合 sqlmap / nmap / hashcat / binwalk / zsteg / volatility 等 **50+ 外部工具**，检测本机安装情况并**一键拉起终端**
- **在线资源导航**：CTF 训练平台、Writeup 站点、密码查询、威胁情报
- **海丰杯备战指南**：按官方赛点拆解五大方向 + K4L0NG 战队分工与比赛节奏建议

### 📡 流量 / 取证（v1.1 新增）
- **PCAP 流量分析台**：离线解析 pcap/pcapng，提取 HTTP 请求/响应、multipart 上传对象、DNS、Telnet、TCP 流、字符串与 flag 线索，支持导出对象
- **PNG 宽高修复**：解析 IHDR 分块、修改宽高并重算 CRC，检查 IEND 后附加数据（海丰杯 misc6 同款）
- **二维码识别**：内置 jsQR，完全离线扫码
- **图片隐写 / 文件结构 / 音频频谱**：沿用原有 LSB、Stegsolve 位平面、binwalk 文件头扫描、PNG/JPEG/ZIP 结构

### 🧬 二进制 / Pwn（v1.1 新增）
- **ELF / PE 体检**：位数、架构、PIE、NX、RELRO、Canary、ASLR/DEP/CFG、节表/段表
- **Pwn 速查**：pwntools 模板、格式化字符串、ROPgadget/one_gadget/checksec 命令、shellcode、常用外部工具检测

### 🏁 题目实战（v1.1 新增）
- **海丰杯 2025 复盘**：18 道题（签到、Web1-3、Misc1-12、Crypto1-2）逐题映射到工具，标注“内置 / 部分 / 外部”
- **核心链路自测**：签到 Base64→Base32→Hex、misc3 Base64、misc5 IP MD5、misc12 AES-CBC 四链路一键验证

---

## 四、为什么离线很重要

1. **比赛断网也能用** —— 所有算法（含 MD5 / SM3 / SM4 / RSA / AES / RC4 / LSB / FFT）均为本地 JS 实现，不调用任何外部 API。
2. **数据不外传** —— 除「在线资源导航」「HTTP 构造器」由你主动触发外，应用自身不做任何网络请求，避免把 Flag、密钥、题目数据上传到第三方。
3. **零环境依赖** —— 核心能力纯 JS 实现，无需 Python/Java 环境即可解绝大多数 Misc / Crypto 题。

---

## 五、目录结构

```
LUTCTF-Toolkit/
├── main.js                  # Electron 主进程（窗口、IPC、HTTP 发包、工具检测）
├── preload.js               # 安全桥接层（contextIsolation）
├── package.json
├── assets/icon.ico          # 应用图标
├── renderer/
│   ├── index.html
│   ├── css/style.css        # 明暗双主题
│   └── js/
│       ├── app.js           # 应用框架（导航/Tab/搜索/主题/窗口控制）
│       ├── registry.js      # 工具注册表① 编码 / 古典 / 密码学
│       ├── registry2.js     # 工具注册表② 隐写取证 / Web 安全
│       ├── registry3.js     # 工具注册表③ 杂项 / 应急响应 / 外部工具
│       └── core/
│           ├── codec.js     # 编码引擎（Base 全族 / URL / HTML / Unicode / Morse）
│           ├── classical.js # 古典密码 + 自动破译（χ² / IC / 爬山法）
│           ├── digest.js    # MD5 / MD4 / SM3 / CRC32 / SM4 / RC4 / AES
│           ├── rsa.js       # RSA 全套攻击（BigInt）
│           ├── stego.js     # LSB / 文件结构 / strings / FFT 频谱
│           ├── web.js       # Payload 库 / JWT / HTTP
│           ├── misc.js      # 进制 / 时间 / 字典 / 速查
│           └── exttools.js  # 外部工具与在线资源数据
└── node_modules/            # Electron 运行时（请勿删除）
```

---

## 六、免责声明

本工具仅供**网络安全学习、授权测试与正式竞赛**使用。请在法律允许范围内使用，禁止用于未经授权的系统渗透、破坏或任何违法活动。作者不承担因滥用造成的任何责任。

---

**Built for 兰州理工大学 K4L0NG · 为海丰杯而生** 🧡💙
