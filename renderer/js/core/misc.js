/* ============================================================
   misc.js — 杂项引擎与知识库
   进制 / 时间戳 / 正则 / 字典生成 / 应急响应 checklist
   流量分析 tshark 语法 / 逆向速查 / 综合命令备忘
   ============================================================ */
const Misc = (function () {
  'use strict';

  /* ---------------- 任意进制转换（BigInt） ---------------- */
  const Radix = {
    convert(value, from, to) {
      from = parseInt(from); to = parseInt(to);
      if (!(from >= 2 && from <= 36) || !(to >= 2 && to <= 36)) throw new Error('进制需在 2~36 之间');
      let n;
      const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const v = String(value).trim().replace(/[\s_,]/g, '');
      if (from === 10) n = BigInt(v);
      else {
        n = 0n;
        for (const ch of v.toUpperCase()) {
          const d = BigInt(digits.indexOf(ch));
          if (d < 0n) throw new Error('非法字符 "' + ch + '"（不符合 ' + from + ' 进制）');
          n = n * BigInt(from) + d;
        }
      }
      if (n === 0n) return '0';
      let out = '', neg = n < 0n;
      if (neg) n = -n;
      while (n > 0n) { out = digits[Number(n % BigInt(to))] + out; n /= BigInt(to); }
      return (neg ? '-' : '') + out;
    },
    toAll(value, from) {
      const bases = [2, 8, 10, 16, 32, 36, 64];
      const out = {};
      for (const b of bases) {
        try { out[b] = Radix.convert(value, from, b); } catch (e) { out[b] = '—'; }
      }
      return out;
    }
  };

  /* ---------------- 时间戳 ---------------- */
  const Time = {
    now: () => Math.floor(Date.now() / 1000),
    nowMs: () => Date.now(),
    fmt(d, tz) {
      const pad = n => String(n).padStart(2, '0');
      if (tz === 'utc') return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
        ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC';
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    },
    parse(v) {
      const s = String(v).trim();
      if (/^\d{10}$/.test(s)) return new Date(parseInt(s) * 1000);
      if (/^\d{13}$/.test(s)) return new Date(parseInt(s));
      const d = new Date(s.replace(/-/g, '/').replace('T', ' ').replace(/Z$/, ' UTC'));
      if (isNaN(d.getTime())) {
        const d2 = new Date(s.replace(' ', 'T') + '+08:00');
        if (isNaN(d2.getTime())) throw new Error('无法解析的时间格式');
        return d2;
      }
      return d;
    }
  };

  /* ---------------- 随机生成 ---------------- */
  const Rand = {
    str(len, charset) {
      const cs = (charset || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      const cryptoObj = window.crypto;
      if (cryptoObj && cryptoObj.getRandomValues) {
        const arr = new Uint32Array(len);
        cryptoObj.getRandomValues(arr);
        return Array.from(arr, x => cs[x % cs.length]).join('');
      }
      let s = ''; for (let i = 0; i < len; i++) s += cs[Math.floor(Math.random() * cs.length)];
      return s;
    },
    uuid() {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      return `${h.substr(0, 8)}-${h.substr(8, 4)}-${h.substr(12, 4)}-${h.substr(16, 4)}-${h.substr(20, 12)}`;
    },
    password(len, opts = {}) {
      const sets = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', num: '0123456789', sym: '!@#$%^&*()-_=+[]{};:,.?/' };
      let chars = '', result = [];
      if (opts.lower !== false) { chars += sets.lower; result.push(sets.lower[Math.floor(Math.random() * 26)]); }
      if (opts.upper) { chars += sets.upper; result.push(sets.upper[Math.floor(Math.random() * 26)]); }
      if (opts.num) { chars += sets.num; result.push(sets.num[Math.floor(Math.random() * 10)]); }
      if (opts.sym) { chars += sets.sym; result.push(sets.sym[Math.floor(Math.random() * sets.sym.length)]); }
      if (!chars) throw new Error('至少选择一种字符类型');
      const need = Math.max(0, len - result.length);
      for (let i = 0; i < need; i++) result.push(chars[Math.floor(Math.random() * chars.length)]);
      for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[result[i], result[j]] = [result[j], result[i]]; }
      return result.join('');
    }
  };

  /* ---------------- 字典生成 ---------------- */
  const Dict = {
    mutations: (words, opts) => {
      const out = new Set();
      const suffixes = opts.suffix ? ['123', '123456', '!', '!!', '123!', '2023', '2024', '2025', '888', '666', '1', '01', '@123', '.', '_'] : [''];
      const prefixes = opts.prefix ? ['!', '@', 'admin', 'root', 'test'] : [''];
      const leetify = s => opts.leet ? s.replace(/a/gi, '4').replace(/e/gi, '3').replace(/i/gi, '1').replace(/o/gi, '0').replace(/s/gi, '5') : s;
      for (const w of words) {
        for (const base of opts.caseVariants ? [w, w.toLowerCase(), w.toUpperCase(), w[0].toUpperCase() + w.slice(1).toLowerCase()] : [w]) {
          for (const p of prefixes) for (const s of suffixes) {
            out.add(p + base + s);
            if (opts.leet) out.add(p + leetify(base) + s);
          }
        }
      }
      return [...out];
    },
    weakTop: [
      '123456', '123456789', 'qwerty', 'password', '12345678', '111111', '123123', 'admin',
      'abc123', 'qwerty123', 'root', 'toor', 'passw0rd', '11111111', '88888888', 'test',
      'administrator', 'iloveyou', '1234567890', '66666666', '888888', 'a123456', 'woaini',
      '5201314', 'qazwsx', 'abc123456', '123456a', 'p@ssw0rd', 'Lut2020', 'lut123456',
      '123456789a', 'woaini1314', '88888888', 'zxcvbnm', '1qaz2wsx', 'asdfghjkl'
    ].filter(x => /^[a-zA-Z0-9@._!]{1,32}$/.test(x))
  };

  /* ---------------- 应急响应 Checklist ---------------- */
  const Checklist = {
    linux: [
      { t: '账户排查', c: ['cat /etc/passwd | grep -v nologin  # 检查可登录账户', 'awk -F: \'$3==0{print $1}\' /etc/passwd  # UID=0 账户', 'cat /etc/shadow | grep \\$6\\$  # 检查有密码账户', 'lastb | head -20  # 失败登录', 'last -n 20  # 最近登录', 'w; who  # 当前在线用户'] },
      { t: '进程与网络', c: ['ps aux --sort=-%cpu | head -20', 'ps -ef | grep -E "\\.\\./|curl|wget|nc|bash -i" ', 'lsof -i -Pn | grep ESTABLISHED', 'netstat -antlp | grep -v "127.0.0.1"', 'ss -antp', 'ls -l /proc/*/exe 2>/dev/null | grep deleted  # 已删除进程'] },
      { t: '持久化', c: ['crontab -l; cat /etc/crontab; ls /etc/cron.d/', 'ls -la /etc/init.d/ /etc/rc.local /etc/rc.d/', 'systemctl list-unit-files --type=service | grep enabled', 'cat ~/.ssh/authorized_keys', 'cat /etc/profile.d/*.sh 2>/dev/null', 'ls -la /etc/ld.so.preload && cat /etc/ld.so.preload'] },
      { t: '日志', c: ['journalctl -xe --no-pager | tail -100', 'grep "Failed password" /var/log/auth.log | tail -30', 'grep "Accepted" /var/log/secure | tail -30', 'lastlog | grep -v Never', 'cat /var/log/nginx/access.log | awk \'{print $1}\' | sort | uniq -c | sort -nr | head'] },
      { t: 'Webshell', c: ['find /var/www -name "*.php" -newermt "2024-01-01" 2>/dev/null', 'grep -rE "eval|assert|system|passthru|\\$_POST\\[" /var/www --include="*.php" | head -30', 'find / -name "*.jsp" -o -name "*.jspx" 2>/dev/null | head', '检查图片马: file shell.jpg; strings shell.jpg | grep -i "<?php"'] },
      { t: '痕迹与加固', c: ['history | tail -50; cat ~/.bash_history', 'rm -f authorized_keys 中的异常项', 'find / -perm -4000 -type f 2>/dev/null  # SUID', 'find / \\( -perm -o=w \\) -type f 2>/dev/null | head  # 任意用户可写', 'rpm -Va 2>/dev/null | head -30  # 校验系统文件'] }
    ],
    windows: [
      { t: '账户排查', c: ['net user  # 列出账户', 'net user <用户名>  # 查看详情/上次登录', 'wmic useraccount get name,SID  # 隐藏账户（$结尾）', 'reg query "HKLM\\SAM\\SAM\\Domains\\Account\\Users"  # 需 SYSTEM 权限', 'Get-LocalUser | Format-Table Name,Enabled,LastLogon (PowerShell)', 'eventvwr → 安全日志 4624/4625/4720/4732'] },
      { t: '进程与网络', c: ['tasklist /svc  # 查看进程对应服务', 'wmic process get name,processid,executablepath', 'netstat -ano | findstr ESTABLISHED', 'Get-NetTCPConnection | Where State -eq Established (PowerShell)', 'wmic process where "name=\'powershell.exe\'" get commandline  # 命令行含编码即高度可疑'] },
      { t: '持久化', c: ['schtasks /query /fo LIST /v  # 计划任务', 'reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'dir %WINDIR%\\System32\\Tasks  # 任务文件', 'Get-CimInstance Win32_StartupCommand (PowerShell)', '检查服务: sc query state= all | findstr SERVICE_NAME', '检查 WMI: Get-WmiObject -Namespace root\\subscription -Class __EventFilter'] },
      { t: '日志', c: ['安全日志 ID: 4624登录/4625失败/4720新建用户/4732加组/4688进程创建', 'wevtutil qe Security /rd:true /f:text /c:50', 'Get-WinEvent -FilterHashtable @{LogName="Security";ID=4625} -MaxEvents 20', 'IIS 日志: %SystemDrive%\\inetpub\\logs\\LogFiles', 'RDP 日志 4778/4779'] },
      { t: '应急处置', c: ['断网隔离但不停机（保留内存）', 'netstat -ano 定位外连 PID → taskkill /f /pid <PID>', '删除恶意启动项/计划任务', 'D盾/河马 webshell 查杀', '修改口令，检查 RDP 3389 是否暴露外网', '内存取证: dumpit → volatility'] }
    ],
    traffic: [
      { t: 'Wireshark 显示过滤器', c: ['http.request.method == "POST"', 'http contains "flag"', 'tcp contains "password"', 'dns.qry.name contains "xxx"', 'ftp-data', 'ssl.handshake.type == 1', 'tcp.stream eq 3', 'usbhid.data', '!(arp or icmp or dns)'] },
      { t: 'tshark 常用', c: ['tshark -r 1.pcap -Y "http.request" -T fields -e http.request.full_uri', 'tshark -r 1.pcap --export-objects http,out/', 'tshark -r 1.pcap -Y "ftp-data" -T fields -e data', 'tshark -r 1.pcap -z conv,tcp', 'tshark -r 1.pcap -Y "dns.qry.name contains \"dns\"" -T fields -e dns.qry.name'] },
      { t: '取证分析思路', c: ['先 io graph / conversations 看异常连接', '导出对象: File → Export Objects → HTTP/SMB/FTP', 'DNS 隧道: 大量 TXT/长子域名 → tshark 提取并重拼', 'USB 键盘流量: usb.capdata 提取键码 → 还原按键', '查找明文协议中的 flag 字符串', 'Wi-Fi WPA2: aircrack-ng 握手包爆破'] }
    ],
    re: [
      { t: '静态分析', c: ['file xxx; strings -n 6 xxx | grep -i flag', 'readelf -h/-S/-s xxx (ELF)', 'objdump -d -M intel xxx | less', 'checksec: RELRO/STACK CANARY/NX/PIE', 'Python 反编译: uncompyle6 / pycdc / decompyle3', 'PE: PEiD / DIE 查壳 (UPX: upx -d xxx)'] },
      { t: '动态调试', c: ['gdb ./pwn → checksec → cyclic 找偏移', 'pwndbg/peda: vmmap, stack 50, searchmem "flag"', 'strace ./xxx  # 系统调用', 'ltrace ./xxx  # 库调用', 'lsof -p <pid>  # 打开文件', 'Windows: x64dbg 中文搜索 / API 断点'] },
      { t: '常见套路', c: ['flag 多半藏在 String 或需要异或/RC4/Base64 变换', 'UPX 壳: upx -d；花指令: nop 填充后 F5', '栈溢出: cyclic(200) → 崩溃点取偏移 → ret2libc/ret2syscall', '格式化字符串: %p 泄露地址，%n 写入', '壳和混淆: 交叉引用搜索关键字符串', '反汇编后 goto IDA View-A → Strings'] }
    ]
  };

  /* ---------------- Shodan / FOFA / Hunter 语法 ---------------- */
  const SearchEngine = {
    fofa: ['title="管理后台"', 'body="thinkphp"', 'app="Apache-Shiro"', 'header="Jenkins"',
      'ip="x.x.x.0/24" && port="3306"', 'domain="edu.cn" && title="教务"', 'protocol="http" && country="CN"'],
    shodan: ['product:"thinkphp"', 'http.title:"Flask"', 'os:"Windows Server 2016"', 'port:6379 country:CN',
      'org:"China Education"', 'has_screenshot:true port:8080', 'ssl.cert.subject.cn:"edu.cn"'],
    hunter: ['cert="兰州理工大学"', 'domain="lut.edu.cn"', 'ip="202.201.xx.0/24"'],
    google: ['site:lut.edu.cn filetype:pdf', 'site:edu.cn intitle:"后台管理"', 'inurl:admin_login',
      'filetype:sql "INSERT INTO"', 'site:edu.cn intext:"password" filetype:xls'],
    zoomeye: ['app:"Apache httpd" ver:"2.4.29"', 'device:"router" country:"China"']
  };

  return { Radix, Time, Rand, Dict, Checklist, SearchEngine };
})();
