/* ============================================================
   registry5.js — 二进制 / Pwn / QR / 海丰杯题目实战
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  function readFile(file, cb) {
    const r = new FileReader();
    r.onload = () => cb(new Uint8Array(r.result));
    r.readAsArrayBuffer(file);
  }
  function bindDrop(drop, input, handler) {
    drop.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) handler(input.files[0]); };
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handler(f); });
  }

  /* ==================== 7. ELF / PE checksec ==================== */
  TOOLS.push({
    id: 'bin-info', name: 'ELF / PE 二进制分析', cat: 'pwn', icon: '🧬', badge: 'checksec',
    desc: '离线解析 ELF/PE 头、架构、PIE/NX/RELRO/Canary、段表与节表，Pwn/Reverse 第一步',
    tags: ['ELF', 'PE', 'checksec', 'Reverse'], keywords: 'elf pe checksec pie nx relro canary 逆向 pwn',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('适合拿到附件先做“体检”：看架构、位数、PIE、NX、RELRO、Canary，再决定用 IDA/Ghidra 还是直接打。') +
        T.card('载入 ELF / PE', `<input type="file" id="file" style="display:none">
          <div class="drop" id="drop">点击或拖入 ELF / .exe / .dll 文件</div><div id="sum" style="margin-top:12px"></div>`) +
        T.card('结构', `<div id="detail"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      bindDrop(q('#drop'), q('#file'), file => {
        readFile(file, bytes => {
          try {
            const info = CTF.detect(bytes);
            const check = info.format === 'ELF'
              ? `<div class="stat-grid">
                  <div class="stat"><b>${info.bits}</b><span>位数</span></div>
                  <div class="stat"><b>${info.machine}</b><span>架构</span></div>
                  <div class="stat"><b>${info.pie ? 'Yes' : 'No'}</b><span>PIE</span></div>
                  <div class="stat"><b>${info.nx ? 'Yes' : 'No'}</b><span>NX</span></div>
                  <div class="stat"><b>${info.relro}</b><span>RELRO</span></div>
                  <div class="stat"><b>${info.canary ? 'Yes' : 'No'}</b><span>Canary</span></div>
                </div>`
              : `<div class="stat-grid">
                  <div class="stat"><b>${info.bits}</b><span>位数</span></div>
                  <div class="stat"><b>${info.machine}</b><span>架构</span></div>
                  <div class="stat"><b>${info.aslr ? 'Yes' : 'No'}</b><span>ASLR</span></div>
                  <div class="stat"><b>${info.dep ? 'Yes' : 'No'}</b><span>DEP</span></div>
                  <div class="stat"><b>${info.cfg ? 'Yes' : 'No'}</b><span>CFG</span></div>
                  <div class="stat"><b>${info.type}</b><span>类型</span></div>
                </div>`;
            q('#sum').innerHTML = check + `<div class="note">${info.format} · ${info.endian || ''} · ${info.type || ''}${info.interpreter ? ' · 解释器 ' + esc(info.interpreter) : ''}</div>`;
            const rows = info.format === 'ELF'
              ? info.sections.map(s => [esc(s.name), '0x' + (s.addr >>> 0).toString(16), s.size])
              : info.sections.map(s => [esc(s.name), '0x' + (s.vaddr >>> 0).toString(16), s.vsize + ' / ' + s.rawSize]);
            q('#detail').innerHTML = `<div class="io-label">${info.format === 'ELF' ? '节表（Section Headers）' : '段表（Sections）'}</div>` +
              T.tbl(info.format === 'ELF' ? ['名称', '地址', '大小'] : ['名称', '虚拟地址', '虚拟/原始大小'], rows) +
              `<div class="note" style="margin-top:12px">更多反编译/调试请用 IDA、Ghidra、Binary Ninja；本工具只做离线体检和结构解析。</div>`;
            App.toast('解析完成', 'ok');
          } catch (e) { q('#sum').innerHTML = `<div class="note warn">${esc(e.message)}</div>`; q('#detail').innerHTML = ''; }
        });
      });
    }
  });

  /* ==================== 8. Pwn 速查 / 模板 ==================== */
  TOOLS.push({
    id: 'pwn-kit', name: 'Pwn 速查 / 模板', cat: 'pwn', icon: '💣',
    desc: 'pwntools 模板、checksec/ROPgadget/one_gadget 命令、格式化字符串与 shellcode 速查；一键复制',
    tags: ['pwntools', 'ROP', 'one_gadget', 'fmtstr'], keywords: 'pwn pwntools rop one_gadget 格式化字符串 shellcode',
    render(host) {
      const py = `from pwn import *\n\ncontext.log_level = 'debug'\ncontext.arch = 'amd64'\n\n# p = process('./pwn')\np = remote('TARGET', 1337)\n\n# 泄漏 / 交互\n# p.recvuntil(b'> ')\n# p.sendline(payload)\n\np.interactive()`;
      const fmt = `from pwn import *\n\n# 找偏移：AAAA%p%p%p... 或 pwndbg fmtarg\n# 64 位前 6 个参数在寄存器，第 7 个起在栈上\noffset = 6\nwrites = {elf.got['printf']: elf.plt['system']}\npayload = fmtstr_payload(offset, writes, numbwritten=0, write_size='short')\np.sendline(payload)`;
      const rop = `ROPgadget --binary ./pwn --only "pop|ret"\nROPgadget --binary ./pwn --ropchain\none_gadget ./libc.so.6\nchecksec --file=./pwn`;
      const sc = `from pwn import *\ncontext.arch = 'amd64'\nprint(asm(shellcraft.sh()))\nprint(asm(shellcraft.cat('/flag')))`;
      const d = document.createElement('div');
      d.innerHTML =
        T.note('实际漏洞利用需要 Linux/WSL 或远程环境；这里提供常用模板与命令，复制到终端即可。') +
        T.card('pwntools 模板', `<pre class="term">${esc(py)}</pre><button class="btn sm" data-cp="${encodeURIComponent(py)}">复制</button>`) +
        T.card('格式化字符串', `<pre class="term">${esc(fmt)}</pre><button class="btn sm" data-cp="${encodeURIComponent(fmt)}">复制</button>`) +
        T.card('ROP / checksec 命令', `<pre class="term">${esc(rop)}</pre><button class="btn sm" data-cp="${encodeURIComponent(rop)}">复制</button>`) +
        T.card('shellcode', `<pre class="term">${esc(sc)}</pre><button class="btn sm" data-cp="${encodeURIComponent(sc)}">复制</button>`) +
        T.card('本机工具检测', `<div class="btn-row"><button class="btn primary" id="scan">检测 gdb / ROPgadget / one_gadget / checksec / nc</button></div><div id="scanOut" style="margin-top:10px"></div>`);
      host.appendChild(d);
      d.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => App.copy(decodeURIComponent(b.dataset.cp)));
      d.querySelector('#scan').onclick = async () => {
        const tools = ['python', 'gdb', 'ROPgadget', 'one_gadget', 'checksec', 'nc'];
        const res = [];
        for (const t of tools) {
          let ok = false;
          try { ok = window.api && window.api.scanTool ? await window.api.scanTool(t) : false; } catch (e) { }
          res.push(`<span class="cc-status ${ok ? 'ok' : ''}">${t} ${ok ? '已安装' : '未检测到'}</span>`);
        }
        d.querySelector('#scanOut').innerHTML = `<div class="cd-meta">${res.join(' ')}</div><div class="note">Windows 下建议在 WSL/Kali 里装 pwntools、ROPgadget、one_gadget；本机检测只检查 PATH。</div>`;
      };
    }
  });

  /* ==================== 9. QR 识别 ==================== */
  TOOLS.push({
    id: 'qr-scan', name: '二维码识别', cat: 'forensics', icon: '🔳', badge: 'misc6',
    desc: '离线识别图片中的 QR 码（jsQR），支持拖入截图/照片，海丰杯图片题常用',
    tags: ['QR', '二维码', 'jsQR'], keywords: 'qr 二维码 扫码 图片 misc6',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('载入图片', `<input type="file" id="file" accept="image/*" style="display:none">
          <div class="drop" id="drop">点击或拖入图片（png/jpg）</div>
          <canvas id="cv" style="max-width:100%;margin-top:12px;border:1px solid var(--border);border-radius:8px;display:none"></canvas>`) +
        T.card('识别结果', `<div id="res" class="note">等待图片…</div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      const img = new Image();
      img.onload = () => {
        const cv = q('#cv'), ctx = cv.getContext('2d', { willReadFrequently: true });
        const maxW = 900;
        const scale = Math.min(1, maxW / img.width);
        cv.width = Math.floor(img.width * scale); cv.height = Math.floor(img.height * scale);
        cv.style.display = 'block'; ctx.drawImage(img, 0, 0, cv.width, cv.height);
        try {
          if (typeof jsQR !== 'function') throw new Error('jsQR 未加载');
          const data = ctx.getImageData(0, 0, cv.width, cv.height);
          const code = jsQR(data.data, cv.width, cv.height);
          if (!code) { q('#res').innerHTML = '<div class="note warn">没有识别到二维码，换更清晰/正对的图试试。</div>'; return; }
          q('#res').innerHTML = `<div class="note ok">识别成功（${code.location ? '已定位' : '未知位置'}）：</div>
            <div class="result" style="word-break:break-all">${esc(code.data)}</div>
            <button class="btn sm" id="cp">复制内容</button>`;
          q('#cp').onclick = () => App.copy(code.data);
        } catch (e) { q('#res').innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
      };
      bindDrop(q('#drop'), q('#file'), file => {
        const r = new FileReader();
        r.onload = () => { img.src = r.result; };
        r.readAsDataURL(file);
      });
    }
  });

  /* ==================== 9.5 AES-CBC 原始字节 ==================== */
  TOOLS.push({
    id: 'aes-raw', name: 'AES-CBC 原始字节（无自动填充）', cat: 'crypto', icon: '🔓', badge: 'misc12',
    desc: '处理 CTF 常见的零字节/自定义填充 AES-CBC（WebCrypto 会因 PKCS#7 校验失败），支持 key/iv/data 的文本/Hex/Base64',
    tags: ['AES', 'CBC', 'no padding', 'misc12'], keywords: 'aes cbc 无填充 零填充 解密 key iv misc12',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('海丰杯 misc12 的 AES 参数是 <code>key = iv = QWERTYUIOPASDFGH</code>，明文用零字节补齐，WebCrypto 会报 OperationError；本工具在主进程用 <code>setAutoPadding(false)</code> 解密，能保留原始字节。') +
        T.card('参数', `
          <div class="form-row"><label>操作</label><select id="op" style="max-width:120px"><option value="decrypt">解密</option><option value="encrypt">加密</option></select>
            <label>Key 格式</label><select id="kf" style="max-width:110px"><option value="text">文本</option><option value="hex">Hex</option></select>
            <label>Data 格式</label><select id="df" style="max-width:110px"><option value="b64">Base64</option><option value="hex">Hex</option></select></div>
          <div class="io-grid"><div class="io-box"><div class="io-label">Key</div><textarea id="key" rows="3" placeholder="QWERTYUIOPASDFGH"></textarea></div>
          <div class="io-box"><div class="io-label">IV</div><textarea id="iv" rows="3" placeholder="QWERTYUIOPASDFGH"></textarea></div></div>
          <div class="io-box" style="margin-top:10px"><div class="io-label">数据</div><textarea id="data" rows="4" placeholder="Base64 或 Hex"></textarea></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="run">执行</button></div>`) +
        T.card('结果', `<textarea id="out" rows="8"></textarea><div id="meta" class="note"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      const parse = (s, fmt) => fmt === 'hex' ? Codec.hexToBytes(s.replace(/\s/g, '')) : Codec.b64ToBytes(s.trim());
      q('#run').onclick = async () => {
        try {
          if (!window.api || !window.api.aesCbc) throw new Error('当前环境不支持主进程 AES');
          const key = q('#kf').value === 'hex' ? Codec.hexToBytes(q('#key').value.replace(/\s/g, '')) : Codec.toBytes(q('#key').value);
          const iv = q('#kf').value === 'hex' ? Codec.hexToBytes(q('#iv').value.replace(/\s/g, '')) : Codec.toBytes(q('#iv').value);
          const data = parse(q('#data').value, q('#df').value);
          const r = await window.api.aesCbc({ op: q('#op').value, key: Array.from(key), iv: Array.from(iv), data: Array.from(data) });
          if (!r.ok) throw new Error(r.error);
          const bytes = Codec.b64ToBytes(r.base64);
          q('#out').value = Codec.fromBytes(bytes).replace(/\0+$/, '');
          q('#meta').textContent = `输出 ${bytes.length} 字节；Hex：${r.hex}`;
        } catch (e) { q('#out').value = '错误：' + e.message; q('#meta').textContent = ''; }
      };
    }
  });

  /* ==================== 10. 海丰杯题目实战 ==================== */
  const CH = [
    { id: 'signin', cat: 'Misc', name: '签到', method: 'Base64 → Base32 → Hex', tools: ['enc-base', 'enc-bits'], status: '内置', steps: '源码注释/附件里的串先 Base64，得到 Base32 串，再 Base32 解码得到十六进制，最后 Hex 转字符。' },
    { id: 'web1', cat: 'Web', name: 'web1 登录爆破', method: '源码字典 + POST 爆破', tools: ['web-brute'], status: '内置', steps: 'Ctrl+U 看源码拿到密码字典；抓登录 POST，把 pass 设为变量，导入本工具字典批量发包，按状态码/长度差异找命中。' },
    { id: 'web2', cat: 'Web', name: 'web2 Cookie 越权', method: 'Base64 Cookie 改 admin', tools: ['web-cookie'], status: '内置', steps: 'Cookie 是 Base64 用户标识；解出测试用户，改成 admin，重新 Base64 编码替换 Cookie 发包。' },
    { id: 'web3', cat: 'Web', name: 'web3 文件上传', method: '.log 后缀 + 短标签', tools: ['web-payload'], status: '部分', steps: '常见后缀被过滤，测出 .log 可解析；内容用短标签绕过一句话检测。Payload 库提供上传/绕过清单，实际以题目环境为准。' },
    { id: 'misc1', cat: 'Misc', name: 'misc1 图片藏包', method: 'strings + foremost + 古代数字', tools: ['stego-file', 'misc-cheat'], status: '部分', steps: 'strings 发现线索，foremost/binwalk 提取 zip，解压后是古代数字字符，对照表解码。古代数字对照需外部资料。' },
    { id: 'misc2', cat: 'Misc', name: 'misc2 pcap 上传', method: 'HTTP POST + 导出对象', tools: ['pcap-lab', 'zip-lab'], status: '部分', steps: 'pcapng 过滤 HTTP POST，导出上传的 zip；zip 需要密码，需字典/爆破（本工具只做结构分析）。' },
    { id: 'misc3', cat: 'Misc', name: 'misc3 pcap 导出 zip', method: 'pcap 对象 + URL 末段密码', tools: ['pcap-lab', 'zip-lab'], status: '内置', steps: 'pcap 中导出压缩包，密码是 URL 最后一段；解压得到 Base64，解码出 flag。' },
    { id: 'misc4', cat: 'Misc', name: 'misc4 核心价值观', method: 'pcap strings → Base64 → 核心价值观', tools: ['pcap-lab', 'values'], status: '内置', steps: 'pcap strings 找到 Base64，解码得到核心价值观编码串，用“核心价值观”工具解码。' },
    { id: 'misc5', cat: 'Misc', name: 'misc5 SQLi 流量', method: 'pcap HTTP + 内网 IP MD5', tools: ['pcap-lab', 'hash-lab'], status: '内置', steps: 'pcap 里看到 SQLi payload 和内网 IP 192.168.17.8；对 IP 做 MD5 得 flag1，第二条流量解码得 flag2。' },
    { id: 'misc6', cat: 'Misc', name: 'misc6 PNG 宽高', method: 'IHDR 宽高修复 + QR', tools: ['png-repair', 'qr-scan'], status: '内置', steps: 'PNG 宽高被改导致打不开；用 PNG 修复改回正确宽高并重算 CRC，解压后 Base64 转图片，再扫码。' },
    { id: 'misc7', cat: 'Misc', name: 'misc7 源码密码', method: '图片源码 + 解压', tools: ['stego-file', 'zip-lab'], status: '部分', steps: '看图片/页面源码拿到解压密码，解压后得到纯色图片，需进一步分析（可能是通道/位平面）。' },
    { id: 'misc8', cat: 'Misc', name: 'misc8 图片藏 zip', method: '图片隐写 + zip 头修复 + 弱口令', tools: ['stego-img', 'zip-lab'], status: '部分', steps: '图片中提取 zip，头部有脏数据需修复；密码爆破得到 abcd。zip 修复命令在 ZIP 工具里。' },
    { id: 'misc9', cat: 'Misc', name: 'misc9 WiFi 握手', method: 'capinfos + hcxpcapngtool + hashcat', tools: ['pcap-lab'], status: '外部', steps: 'pcap 是 WPA 四次握手；capinfos 看元信息，hcxpcapngtool 导出 22000 哈希，hashcat -m 22000 爆破。需外部工具。' },
    { id: 'misc10', cat: 'Misc', name: 'misc10 图片密钥', method: '图片 key + zip/docx/mp3', tools: ['stego-img', 'zip-lab'], status: '部分', steps: '图片中提取 key 解压压缩包，docx 实际是 mp3；需 010/文件头分析，工具提供文件头扫描。' },
    { id: 'misc11', cat: 'Misc', name: 'misc11 图片藏包', method: 'strings + foremost + 爆破 + QR', tools: ['stego-file', 'zip-lab', 'qr-scan'], status: '部分', steps: 'strings 发现线索，foremost 提取压缩包，爆破密码后扫码。' },
    { id: 'misc12', cat: 'Misc', name: 'misc12 TLS 解密', method: 'Telnet AES + pcap 提 RAR + SSLKEYLOG', tools: ['pcap-lab', 'sym-crypto'], status: '部分', steps: 'pcap 中 Telnet 泄漏 Python 脚本和 AES 参数（key=iv=QWERTYUIOPASDFGH），解出 passwd；再提 RAR 得 sslkey.log，Wireshark 解密 TLS。TLS 解密需 Wireshark。' },
    { id: 'crypto1', cat: 'Crypto', name: 'crypto1 混合编码', method: 'Hex + 多层编码', tools: ['enc-bits', 'enc-base'], status: '内置', steps: '源码/附件先 Hex 转字符，再按特征做 Base/Unicode/古典多层解码；本工具支持自动解码链。' },
    { id: 'crypto2', cat: 'Crypto', name: 'crypto2 SM3/SM4 爆破', method: '国密哈希/对称爆破', tools: ['hash-lab', 'sym-crypto'], status: '内置', steps: 'SM3 像 MD5 一样对候选明文做哈希比对；SM4 用已知 key/iv 解密或按候选密钥爆破。' }
  ];
  const WP = 'https://www.qidao123.com/bbs/thread-206820-1-1.html';

  TOOLS.push({
    id: 'ctf-hub', name: '海丰杯 2025 题目实战', cat: 'ctf', icon: '🏁', badge: '18 题',
    desc: '把海丰杯 2025 的 18 道题逐个映射到工具箱：签到、Web1-3、Misc1-12、Crypto1-2；内置自测验证核心链路',
    tags: ['海丰杯', 'Writeup', '复盘', '题目'], keywords: '海丰杯 2025 题目 writeup 复盘 ctf 实战 签到 web misc crypto',
    render(host) {
      const builtin = CH.filter(c => c.status === '内置').length;
      const d = document.createElement('div');
      d.innerHTML =
        T.note('基于公开 Writeup 整理：<span id="wpLink" style="color:var(--accent);cursor:pointer;text-decoration:underline">2025 海丰杯 WP</span>。这里不抄 flag，只把“题目 → 工具”的路径固化；绿色“内置”表示本工具箱可直接完成，黄色/红色表示还需外部工具。') +
        `<div class="stat-grid">
          <div class="stat"><b>${CH.length}</b><span>复盘题目</span></div>
          <div class="stat"><b>${builtin}</b><span>工具箱直接覆盖</span></div>
          <div class="stat"><b>${CH.length - builtin}</b><span>需外部工具</span></div>
          <div class="stat"><b>4</b><span>核心自测</span></div>
        </div>` +
        `<div class="btn-row" id="filters" style="margin:6px 0 4px">
          ${['全部', 'Web', 'Misc', 'Crypto'].map((c, i) => `<button class="btn sm ${i === 0 ? 'primary' : ''}" data-c="${c}">${c}</button>`).join('')}
          <button class="btn sm" id="selftest" style="margin-left:auto">运行核心链路自测</button>
        </div><div class="challenge-grid" id="grid"></div><div id="detail"></div><div id="testOut" style="margin-top:12px"></div>`;
      host.appendChild(d);
      const q = s => d.querySelector(s);
      q('#wpLink').onclick = () => { if (window.api && window.api.openExternal) window.api.openExternal(WP); };
      let filter = '全部';
      function renderGrid() {
        const list = CH.filter(c => filter === '全部' || c.cat === filter);
        q('#grid').innerHTML = list.map(c => `<div class="challenge-card" data-id="${c.id}">
          <div class="cc-top"><span class="cc-cat">${c.cat}</span><span class="cc-status ${c.status === '内置' ? 'ok' : c.status === '部分' ? 'part' : 'ext'}">${c.status}</span></div>
          <h4>${esc(c.name)}</h4><p>${esc(c.method)}</p></div>`).join('');
        q('#grid').querySelectorAll('.challenge-card').forEach(card => card.onclick = () => showDetail(card.dataset.id));
      }
      function showDetail(id) {
        const c = CH.find(x => x.id === id); if (!c) return;
        q('#detail').innerHTML = `<div class="challenge-detail">
          <h3>${esc(c.name)} <span class="cc-status ${c.status === '内置' ? 'ok' : c.status === '部分' ? 'part' : 'ext'}">${c.status}</span></h3>
          <div class="cd-meta"><span class="cc-cat">${c.cat}</span><span class="cc-cat">${esc(c.method)}</span></div>
          <div class="cd-body">${esc(c.steps)}</div>
          <div class="btn-row" style="margin-top:12px">${c.tools.map(t => {
            const tool = TOOLS.find(x => x.id === t);
            return tool ? `<button class="btn sm" data-open="${t}">打开「${esc(tool.name)}」</button>` : '';
          }).join('')}<button class="btn sm" data-open="ext-online">更多资源</button></div>
        </div>`;
        q('#detail').querySelectorAll('[data-open]').forEach(b => b.onclick = () => App.openTool(b.dataset.open));
      }
      q('#filters').querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        filter = b.dataset.c;
        q('#filters').querySelectorAll('[data-c]').forEach(x => x.classList.toggle('primary', x === b));
        renderGrid();
      });
      q('#selftest').onclick = async () => {
        q('#testOut').innerHTML = '<div class="note">正在跑 签到 / misc3 / misc5 / misc12 四个核心链路…</div>';
        const rows = [];
        const add = (name, ok, detail) => rows.push(`<tr><td>${name}</td><td>${ok ? '<b style="color:var(--ok)">PASS</b>' : '<b style="color:var(--err)">FAIL</b>'}</td><td>${esc(detail)}</td></tr>`);
        try {
          const b64 = 'R1kzRE1ZWldHRTNET04zQ0dNWURHTUpXR1laVFNNWlVHTVpER01SVEdNWkdJTVpYR00zRE1OQlRHWVpHSU1aVUdNWlRHTkpXR0laR0lOUlJHWVpER05KVEdJWkdJTVpXR00yVEdOQldHSTNER01aVEdZM0RHTlpXR1VaVFFNWlFHTTJET1pBPQ==';
          const b32 = Codec.B64.dec(b64);
          const hex = Codec.Base32.dec(b32);
          const flag = Codec.Base16.dec(hex);
          add('签到：Base64→Base32→Hex', flag === 'flag{01f94223-76d6-435b-ab52-654bc3f7e804}', flag);
        } catch (e) { add('签到：Base64→Base32→Hex', false, e.message); }
        try {
          const f = Codec.B64.dec('ZmxhZ3thbjRseXozZF90aDNfdHI0ZmYxY19sMWszX2FfcHIwfQo=');
          add('misc3：Base64 flag', f.trim() === 'flag{an4lyz3d_th3_tr4ff1c_l1k3_a_pr0}', f.trim());
        } catch (e) { add('misc3：Base64 flag', false, e.message); }
        try {
          const h = Digest.md5(Codec.toBytes('192.168.17.8'));
          add('misc5：IP MD5', h === 'dd73a692d474f6b3f4d668ff6cd37f51', h);
        } catch (e) { add('misc5：IP MD5', false, e.message); }
        try {
          const key = Codec.toBytes('QWERTYUIOPASDFGH');
          const ct = Codec.b64ToBytes('19aaFYsQQKr+hVX6hl2smAUQ5a767TsULEUebWSajEo=');
          const r = await window.api.aesCbc({ op: 'decrypt', key: Array.from(key), iv: Array.from(key), data: Array.from(ct) });
          if (!r.ok) throw new Error(r.error);
          const txt = Codec.fromBytes(Codec.b64ToBytes(r.base64)).replace(/\0+$/, '');
          add('misc12：AES-CBC', txt === 'passwd={No_One_Can_Decrypt_Me}', txt);
        } catch (e) { add('misc12：AES-CBC', false, e.message); }
        const pass = rows.filter(r => r.includes('PASS')).length;
        q('#testOut').innerHTML = `<div class="note ${pass === rows.length ? 'ok' : 'warn'}">自测 ${pass}/${rows.length} 通过：</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>链路</th><th>结果</th><th>实际输出</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
      };
      renderGrid();
    }
  });

})();
