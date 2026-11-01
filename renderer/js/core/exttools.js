/* ============================================================
   exttools.js — 外部工具箱 / 在线资源 / 学习资料
   ============================================================ */
const ExtLib = (function () {
  'use strict';

  /* 本机命令行工具：如果已安装可一键启动 */
  const LOCAL = [
    { g: 'Web 渗透', name: 'sqlmap', cmd: 'sqlmap -u "URL" --dbs --batch', url: 'https://github.com/sqlmapproject/sqlmap', desc: '自动化 SQL 注入' },
    { g: 'Web 渗透', name: 'dirsearch', cmd: 'dirsearch -u "URL" -e php,html,js -w db/dicc.txt', url: 'https://github.com/maurosoria/dirsearch', desc: '目录爆破' },
    { g: 'Web 渗透', name: 'gobuster', cmd: 'gobuster dir -u URL -w /usr/share/wordlists/dirb/common.txt', url: 'https://github.com/OJ/gobuster', desc: '目录/子域爆破' },
    { g: 'Web 渗透', name: 'feroxbuster', cmd: 'feroxbuster -u URL', url: 'https://github.com/epi052/feroxbuster', desc: '递归目录爆破' },
    { g: 'Web 渗透', name: 'nuclei', cmd: 'nuclei -u URL -t cves/', url: 'https://github.com/projectdiscovery/nuclei', desc: '漏洞模板扫描' },
    { g: 'Web 渗透', name: 'ffuf', cmd: 'ffuf -w wordlist -u URL/FUZZ', url: 'https://github.com/ffuf/ffuf', desc: '高性能模糊测试' },
    { g: 'Web 渗透', name: 'wfuzz', cmd: 'wfuzz -c -z file,wordlist --hc 404 URL/FUZZ', url: 'https://github.com/xmendez/wfuzz', desc: 'Web 模糊测试' },
    { g: 'Web 渗透', name: 'burpsuite', cmd: 'burpsuite', url: 'https://portswigger.net/burp', desc: '抓包改包必备' },

    { g: '信息收集', name: 'nmap', cmd: 'nmap -A -T4 -p- TARGET', url: 'https://nmap.org/', desc: '端口与服务扫描' },
    { g: '信息收集', name: 'masscan', cmd: 'masscan -p1-65535 TARGET --rate=2000', url: 'https://github.com/robertdavidgraham/masscan', desc: '高速端口扫描' },
    { g: '信息收集', name: 'naabu', cmd: 'naabu -host TARGET', url: 'https://github.com/projectdiscovery/naabu', desc: '快速端口发现' },
    { g: '信息收集', name: 'whatweb', cmd: 'whatweb -v URL', url: 'https://github.com/urbanadventurer/WhatWeb', desc: '指纹识别' },
    { g: '信息收集', name: 'httpx', cmd: 'echo TARGET | httpx -title -status-code', url: 'https://github.com/projectdiscovery/httpx', desc: 'HTTP 探测' },
    { g: '信息收集', name: 'subfinder', cmd: 'subfinder -d TARGET', url: 'https://github.com/projectdiscovery/subfinder', desc: '子域名发现' },

    { g: '密码破解', name: 'hashcat', cmd: 'hashcat -m 0 -a 0 hash.txt rockyou.txt', url: 'https://hashcat.net/hashcat/', desc: 'GPU 高速破解 (-m 0=MD5 / 1000=NTLM / 16500=JWT)' },
    { g: '密码破解', name: 'john', cmd: 'john --wordlist=rockyou.txt hash.txt', url: 'https://www.openwall.com/john/', desc: 'John the Ripper' },
    { g: '密码破解', name: 'hydra', cmd: 'hydra -l admin -P pass.txt TARGET ssh', url: 'https://github.com/vanhauser-thc/thc-hydra', desc: '在线口令爆破' },
    { g: '密码破解', name: 'zip2john', cmd: 'zip2john a.zip > h.txt && john h.txt', url: 'https://www.openwall.com/john/', desc: 'ZIP 加密破解' },
    { g: '密码破解', name: 'fcrackzip', cmd: 'fcrackzip -u -D -p rockyou.txt a.zip', url: 'https://github.com/hyc/fcrackzip', desc: 'ZIP 口令爆破' },
    { g: '密码破解', name: 'openssl', cmd: 'openssl enc -aes-128-cbc -d -in enc.bin -k KEY', url: 'https://www.openssl.org/', desc: '密码学瑞士军刀' },

    { g: '隐写取证', name: 'zsteg', cmd: 'zsteg -a image.png', url: 'https://github.com/zed-0xff/zsteg', desc: 'PNG/BMP LSB 自动检测' },
    { g: '隐写取证', name: 'steghide', cmd: 'steghide info a.jpg / steghide extract -sf a.jpg -p ""', url: 'https://steghide.sourceforge.net/', desc: 'JPEG/WAV 隐写' },
    { g: '隐写取证', name: 'stegseek', cmd: 'stegseek a.jpg rockyou.txt', url: 'https://github.com/RickdeJager/stegseek', desc: 'steghide 口令高速爆破' },
    { g: '隐写取证', name: 'exiftool', cmd: 'exiftool image.jpg', url: 'https://exiftool.org/', desc: '元数据查看/修改' },
    { g: '隐写取证', name: 'binwalk', cmd: 'binwalk -e file.bin', url: 'https://github.com/ReFirmLabs/binwalk', desc: '文件分离/固件分析' },
    { g: '隐写取证', name: 'foremost', cmd: 'foremost -i disk.img -o out/', url: 'https://github.com/korczis/foremost', desc: '文件雕刻恢复' },
    { g: '隐写取证', name: 'volatility', cmd: 'volatility3 -f mem.raw windows.pslist', url: 'https://github.com/volatilityfoundation/volatility3', desc: '内存取证' },
    { g: '隐写取证', name: 'strings', cmd: 'strings -n 6 file | grep -i flag', url: '', desc: '提取可打印字符串' },
    { g: '隐写取证', name: 'chunkc2', cmd: 'python chunk.py', url: '', desc: 'PNG 分块分析自定义' },
    { g: '隐写取证', name: 'audacity', cmd: 'audacity audio.wav', url: 'https://www.audacityteam.org/', desc: '音频频谱/倒放分析' },
    { g: '隐写取证', name: 'gimp/stegsolve', cmd: 'java -jar stegsolve.jar', url: 'http://www.caesum.com/handbook/Stegsolve.jar', desc: 'Stegsolve 通道分析' },

    { g: '逆向', name: 'objdump', cmd: 'objdump -d -M intel ./bin', url: '', desc: '反汇编' },
    { g: '逆向', name: 'gdb+pwndbg', cmd: 'gdb ./bin', url: 'https://github.com/pwndbg/pwndbg', desc: '动态调试' },
    { g: '逆向', name: 'radare2', cmd: 'r2 -A ./bin', url: 'https://rada.re/n/', desc: '逆向框架' },
    { g: '逆向', name: 'checksec', cmd: 'checksec --file=./bin', url: 'https://github.com/slimm609/checksec.sh', desc: '防护机制检查' },
    { g: '逆向', name: 'ROPgadget', cmd: 'ROPgadget --binary ./bin', url: 'https://github.com/JonathanSalwan/ROPgadget', desc: 'ROP 链构造' },
    { g: '逆向', name: 'upx', cmd: 'upx -d packed.bin', url: 'https://upx.github.io/', desc: 'UPX 脱壳' },
    { g: '逆向', name: 'pyinstxtractor', cmd: 'python pyinstxtractor.py app.exe', url: 'https://github.com/extremecoders-re/pyinstxtractor', desc: 'PyInstaller 解包' },
    { g: '逆向', name: 'uncompyle6', cmd: 'uncompyle6 -o . flag.pyc', url: 'https://github.com/rocky/python-uncompyle6', desc: 'pyc 反编译' },
    { g: '逆向', name: 'dnSpy', cmd: 'dnSpy.exe', url: 'https://github.com/dnSpy/dnSpy', desc: '.NET 反编译' },
    { g: '逆向', name: 'jadx', cmd: 'jadx-gui app.apk', url: 'https://github.com/skylot/jadx', desc: 'Android 反编译' },

    { g: '流量分析', name: 'tshark', cmd: 'tshark -r cap.pcap -Y "http.request" -T fields -e http.request.full_uri', url: 'https://www.wireshark.org/', desc: '命令行抓包分析' },
    { g: '流量分析', name: 'wireshark', cmd: 'wireshark cap.pcap', url: 'https://www.wireshark.org/', desc: '图形化流量分析' },
    { g: '流量分析', name: 'aircrack-ng', cmd: 'aircrack-ng cap.cap -w rockyou.txt', url: 'https://www.aircrack-ng.org/', desc: 'Wi-Fi 握手爆破' },
    { g: '流量分析', name: ' NetworkMiner', cmd: 'NetworkMiner.exe', url: 'https://www.netresec.com/?page=NetworkMiner', desc: 'PCAP 文件提取' }
  ];

  /* 在线资源 */
  const ONLINE = [
    { g: '密码/编码', name: 'CyberChef（本地离线版更推荐）', url: 'https://gchq.github.io/CyberChef/', desc: '万能编码变换（考试断网则无法使用，请用本工具内置模块）' },
    { g: '密码/编码', name: 'FactorDB', url: 'http://factordb.com/', desc: '在线大整数分解（RSA 必备）' },
    { g: '密码/编码', name: 'CMD5 / 哈希查询', url: 'https://cmd5.com/', desc: 'MD5/SHA/NTLM 明文反查' },
    { g: '密码/编码', name: '在线 QR 解码', url: 'https://qrdecode.net/ ', desc: '二维码/UPC 条码' },
    { g: '密码/编码', name: 'RSA 公约数 / SageMathCell', url: 'https://sagecell.sagemath.org/', desc: '在线跑数论脚本' },
    { g: '解题平台', name: '攻防世界 XCTF', url: 'https://adworld.xctf.org.cn/', desc: '国内主流训练平台' },
    { g: '解题平台', name: 'BUUOJ', url: 'https://buuoj.cn/', desc: '题目全、适合入门刷 discriminating' },
    { g: '解题平台', name: 'NSSCTF', url: 'https://www.nssctf.cn/', desc: '题目更新快，含新手区' },
    { g: '解题平台', name: 'BugKu', url: 'https://ctf.bugku.com/', desc: '适合 Web/Misc 入门' },
    { g: '解题平台', name: 'CTFtime', url: 'https://ctftime.org/', desc: '国际赛事信息与 writeup' },
    { g: 'Writeup', name: 'CTF Wiki', url: 'https://ctf-wiki.org/', desc: '中文 CTF 知识体系（强烈推荐）' },
    { g: 'Writeup', name: '先知社区 / 安全客', url: 'https://xz.aliyun.com/', desc: '高质量技术文章' },
    { g: 'Writeup', name: 'P神 代码审计知识星球 / 博客', url: 'https://www.leavesongs.com/', desc: 'Web 安全深度好文' },
    { g: 'Writeup', name: 'GitHub 搜索 trick', url: 'https://github.com/search?q=ctf+writeup', desc: '按题型/WP 搜和学习' },
    { g: 'Writeup', name: 'CTF-All-In-One', url: 'https://github.com/firmianay/CTF-All-In-One', desc: 'CTF 全方向开源教程（强烈推荐）' },
    { g: 'Writeup', name: 'PayloadsAllTheThings', url: 'https://github.com/swisskyrepo/PayloadsAllTheThings', desc: 'Web 漏洞 payload 大全' },
    { g: 'Writeup', name: 'HackTricks', url: 'https://github.com/carlospolop/hacktricks', desc: '渗透/CTF 技巧百科' },
    { g: 'Writeup', name: 'ctf-wiki/ctf-tools', url: 'https://github.com/ctf-wiki/ctf-tools', desc: 'CTF 工具资料库' },
    { g: 'Writeup', name: 'CTFtools-wiki', url: 'https://github.com/ProbiusOfficial/CTFtools-wiki', desc: '中文 CTF 工具导航' },
    { g: 'Writeup', name: '0xdf CTF Writeups', url: 'https://github.com/0xdf/ctf-writeups', desc: '高质量英文 WP 合集' },
    { g: '流量取证', name: '菜刀/蚁剑/冰蝎流量特征库', url: 'https://github.com/search?q=webshell', desc: '应急响应流量识别' },
    { g: '流量取证', name: 'VirusTotal', url: 'https://www.virustotal.com/', desc: '文件/URL 多引擎检测' },
    { g: '流量取证', name: '微步在线', url: 'https://x.threatbook.com/', desc: '威胁情报查询' },
    { g: '靶场', name: 'VulnHub', url: 'https://www.vulnhub.com/', desc: '离线靶机' },
    { g: '靶场', name: 'HTB (Hack The Box)', url: 'https://app.hackthebox.com/', desc: '在线综合靶场' },
    { g: '靶场', name: 'Pwn output', url: 'https://pwn.college/', desc: '免费二进制安全课程' }
  ];

  /* 学习地图：面向海丰杯赛点 */
  const LEARN = [
    { g: '海丰杯考点', name: '脚本分析与编程技术', desc: 'Python 流量/加解密脚本编写；建议熟练 requests/pwntools/PIL/numpy' },
    { g: '海丰杯考点', name: '操作系统漏洞探测与利用', desc: '内核提权、脏牛(CVE-2016-5195)、SUID、计划任务、sudo 配置错误' },
    { g: '海丰杯考点', name: '应用软件漏洞挖掘', desc: '缓冲区溢出（栈保护绕过、ROP）、格式化字符串、UAF' },
    { g: '海丰杯考点', name: '隐写术与加密解密', desc: 'LSB/音频频谱/图片结构；古典密码+现代算法+国产商用密码 SM2/SM3/SM4' },
    { g: '海丰杯考点', name: '网络数据分析与 WEB 伪造', desc: 'Wireshark 提取、请求伪造（Referer/XFF/Cookie/JWT 伪造）' },
    { g: '海丰杯考点', name: '逆向分析与软件破解', desc: 'IDA/Ghidra 静态 + GDB 动态；脱壳与反混淆' },
    { g: '海丰杯考点', name: '数据取证逆向', desc: '磁盘镜像、内存取证 Volatility、日志分析、文件恢复' },
    { g: '海丰杯考点', name: '国产商用密码应用', desc: 'SM2 签名验签、SM3 摘要、SM4 加解密；可能要求 lssl/gmssl 调用' },
    { g: '组队建议', name: 'K4L0NG 战队分工', desc: 'Web 2 人 / Crypto 1 人 / PWN+RE 1 人 / Misc+取证 1 人；统一 Flag 提交格式并实时同步进度' },
    { g: '组队建议', name: '比赛节奏', desc: '开赛 15 分钟全员扫描签到题与 Misc；难题先做信息收集，不要过早深挖某一题' },
    { g: '组队建议', name: '本地字典与工具常备', desc: 'rockyou.txt、directory-list-2.3、SecLists、字典妙用；本机工具先跑一遍 –help 以免忘』' }
  ];

  return { LOCAL, ONLINE, LEARN };
})();
