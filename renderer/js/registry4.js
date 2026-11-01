/* ============================================================
   registry4.js — Web 爆破 / Cookie / 流量取证 / PNG 修复 /
                  Brainfuck / 核心价值观
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  function readFile(file, asText, cb) {
    const r = new FileReader();
    r.onload = () => cb(asText ? r.result : new Uint8Array(r.result));
    if (asText) r.readAsText(file); else r.readAsArrayBuffer(file);
  }
  function downloadBytes(name, bytes) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    App.toast('已导出 ' + name, 'ok');
  }
  function bindDrop(drop, input, handler) {
    drop.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) handler(input.files[0]); };
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handler(f); });
  }

  /* ==================== 1. Web 字典爆破 ==================== */
  TOOLS.push({
    id: 'web-brute', name: 'Web 字典爆破器', cat: 'web', icon: '💥', badge: 'Web1',
    desc: '自定义请求 + 密码字典批量发包，按状态码/长度差异自动标记命中，海丰杯 web1 直接可用',
    tags: ['Burp Intruder', '字典', '爆破', 'POST'], keywords: '爆破 字典 intruder 密码 web1 登录 枚举',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('适合 <b>海丰杯 2025 web1</b> 这类“源码给字典、登录口爆破”的题。先在浏览器/Burp 里抓一次登录请求，把 URL、请求头、Body 模板填进来；Body 里用 <code>{{user}}</code> 和 <code>{{pass}}</code> 占位。') +
        T.card('目标请求', `
          <div class="form-row"><label>方法</label><select id="m" style="max-width:110px">
            ${['POST', 'GET'].map(x => T.opt(x, x)).join('')}</select>
            <label>URL</label><input type="text" id="u" placeholder="http://target/login.php" style="flex:2"></div>
          <div class="form-row"><label>用户名</label><input type="text" id="user" value="admin" style="max-width:180px">
            <label class="chk"><input type="checkbox" id="enc" checked> 对用户名/密码做 URL 编码</label></div>
          <div class="io-grid">
            <div class="io-box"><div class="io-label">请求头（每行 Key: Value）</div>
              <textarea id="h" rows="4" placeholder="Cookie: PHPSESSID=...&#10;Content-Type: application/x-www-form-urlencoded"></textarea></div>
            <div class="io-box"><div class="io-label">Body 模板</div>
              <textarea id="b" rows="4">admin={{user}}&amp;pass={{pass}}</textarea></div>
          </div>`) +
        T.card('密码字典', `
          <div class="form-row"><label>字典文件</label><input type="file" id="file" accept=".txt,.lst,.dic">
            <button class="btn sm" id="loadFile">载入文件</button><span class="hint" id="fileTip"></span></div>
          <textarea id="pwd" rows="9" placeholder="每行一个密码，例如：&#10;password&#10;admin123&#10;gansuhuaneng"></textarea>
          <div class="form-row" style="margin-top:10px">
            <label>并发</label><input type="number" id="conc" value="5" min="1" max="20" style="max-width:80px">
            <label>延迟(ms)</label><input type="number" id="delay" value="0" min="0" style="max-width:90px">
            <button class="btn primary" id="start">开始爆破</button>
            <button class="btn" id="stop" disabled>停止</button>
          </div>`) +
        T.card('结果', `<div id="prog" class="note">等待开始…</div><div id="res"></div><div id="preview"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      let stopped = false, running = false;

      q('#loadFile').onclick = () => q('#file').click();
      q('#file').onchange = () => {
        const f = q('#file').files[0]; if (!f) return;
        readFile(f, true, txt => { q('#pwd').value = txt; q('#fileTip').textContent = `已载入 ${txt.split(/\r?\n/).filter(Boolean).length} 条`; });
      };

      const gather = () => ({
        method: q('#m').value, url: q('#u').value.trim(),
        headers: WebKit.parseHeaders(q('#h').value), bodyTpl: q('#b').value,
        user: q('#user').value, enc: q('#enc').checked
      });
      const makeBody = (g, pass) => {
        const u = g.enc ? encodeURIComponent(g.user) : g.user;
        const p = g.enc ? encodeURIComponent(pass) : pass;
        return g.bodyTpl.replace(/\{\{user\}\}/g, u).replace(/\{\{pass\}\}/g, p);
      };
      const send = async (g, pass) => {
        const o = { method: g.method, url: g.url, headers: g.headers, body: makeBody(g, pass), timeout: 12000 };
        if (g.method === 'GET') { o.url = g.url + (g.url.includes('?') ? '&' : '?') + makeBody(g, pass); o.body = ''; }
        return window.api && window.api.http ? window.api.http(o) : WebKit.httpRequest(o);
      };

      let base = null;
      q('#start').onclick = async () => {
        if (running) return;
        const g = gather();
        if (!g.url) return App.toast('请填写 URL', 'err');
        let list = q('#pwd').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        list = [...new Set(list)];
        if (!list.length) return App.toast('请填写密码字典', 'err');
        running = true; stopped = false;
        q('#start').disabled = true; q('#stop').disabled = false;
        q('#res').innerHTML = ''; q('#preview').innerHTML = '';
        q('#prog').textContent = '正在建立基线…';
        base = await send(g, '__lutctf_baseline__');
        if (!base || !base.ok) {
          q('#prog').textContent = '基线请求失败：' + (base && base.error ? base.error : '未知错误');
          running = false; q('#start').disabled = false; q('#stop').disabled = true; return;
        }
        const baselineLen = (base.body || '').length;
        q('#prog').textContent = `基线：HTTP ${base.status}，长度 ${baselineLen}，开始跑 ${list.length} 条…`;
        const rows = [];
        let idx = 0, done = 0;
        const conc = Math.max(1, Math.min(20, parseInt(q('#conc').value, 10) || 5));
        const delay = Math.max(0, parseInt(q('#delay').value, 10) || 0);
        const render = () => {
          const hits = rows.filter(r => r.hit).length;
          q('#prog').innerHTML = `进度 <b>${done}/${list.length}</b> · 命中 <b style="color:var(--ok)">${hits}</b> · 基线 ${base.status}/${baselineLen}`;
          const sorted = rows.slice().sort((a, b) => (b.hit - a.hit) || (a.status - b.status));
          q('#res').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>密码</th><th>状态</th><th>长度</th><th>耗时</th><th>判定</th></tr></thead><tbody>` +
            sorted.map(r => `<tr class="${r.hit ? 'hit' : ''}" data-i="${r.i}"><td>${r.i + 1}</td><td><code>${esc(r.pass)}</code></td><td>${r.status || '-'}</td><td>${r.len}</td><td>${r.ms}ms</td><td>${r.hit ? '<b style="color:var(--ok)">疑似命中</b>' : ''}</td></tr>`).join('') +
            `</tbody></table></div>`;
          q('#res').querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => {
            const r = rows.find(x => x.i === +tr.dataset.i);
            if (r) q('#preview').innerHTML = `<div class="io-label" style="margin-top:12px">${esc(r.pass)} 的响应（${r.status}，${r.len} 字符）</div><textarea rows="12">${esc((r.body || '').slice(0, 12000))}</textarea>`;
          });
        };
        const worker = async () => {
          while (!stopped && idx < list.length) {
            const i = idx++, pass = list[i];
            let r;
            try { r = await send(g, pass); } catch (e) { r = { ok: false, error: e.message }; }
            const len = r.ok ? (r.body || '').length : 0;
            const hit = r.ok && (r.status !== base.status || Math.abs(len - baselineLen) > 5);
            rows.push({ i, pass, status: r.ok ? r.status : 'ERR', len, ms: r.ms || 0, body: r.body || '', hit });
            done++; render();
            if (delay) await new Promise(res => setTimeout(res, delay));
          }
        };
        await Promise.all(Array.from({ length: conc }, worker));
        running = false; q('#start').disabled = false; q('#stop').disabled = true;
        q('#prog').innerHTML = stopped ? '已停止。' : `完成：共 ${list.length} 条，疑似命中 ${rows.filter(r => r.hit).length} 条（按绿色行查看响应）。`;
      };
      q('#stop').onclick = () => { stopped = true; };
    }
  });

  /* ==================== 2. Cookie / Token 编解码 ==================== */
  TOOLS.push({
    id: 'web-cookie', name: 'Cookie / Token 编解码', cat: 'web', icon: '🍪', badge: 'Web2',
    desc: 'Base64 / URL / Hex / JWT 多层解码与重编码，改完直接复制回 Cookie（海丰杯 web2 同款）',
    tags: ['Cookie', 'Base64', 'JWT', '越权'], keywords: 'cookie token base64 解码 编码 越权 web2',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('海丰杯 2025 web2 的套路：Cookie 里是 Base64 用户标识，解出测试用户后改成 <code>admin</code>，再 Base64 编码放回去。') +
        T.card('输入', `<textarea id="inp" rows="4" placeholder="粘贴 Cookie 值或整段 token…"></textarea>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="dec">尝试解码</button><button class="btn" id="clr">清空</button></div>`) +
        T.card('解码结果', `<div id="out"></div>`) +
        T.card('重编码', `<textarea id="edit" rows="4" placeholder="在这里改内容，例如把 user 改成 admin"></textarea>
          <div class="btn-row" style="margin-top:10px"><button class="btn" id="b64">Base64 编码</button><button class="btn" id="url">URL 编码</button><button class="btn" id="hex">Hex 编码</button></div>
          <textarea id="encoded" rows="3" style="margin-top:10px" placeholder="编码结果…"></textarea>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      const add = (label, val) => {
        q('#out').innerHTML += `<div style="margin-bottom:10px"><div class="io-label">${label}<div class="spacer"></div><button class="btn sm" data-cp="${encodeURIComponent(val)}">复制</button></div><textarea rows="3">${esc(val)}</textarea></div>`;
      };
      q('#dec').onclick = () => {
        q('#out').innerHTML = '';
        const raw = q('#inp').value.trim();
        if (!raw) return;
        add('原始', raw);
        try { add('URL 解码', decodeURIComponent(raw)); } catch (e) { }
        try {
          let s = raw.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
          const dec = Codec.B64.dec(s); add('Base64 解码', dec); q('#edit').value = dec;
        } catch (e) { }
        try {
          if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) add('Hex 解码', Codec.Base16.dec(raw));
        } catch (e) { }
        if (raw.split('.').length === 3) {
          try {
            const p = raw.split('.').map((x, i) => i < 2 ? JSON.stringify(JSON.parse(Codec.B64.dec(x.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(x.length / 4) * 4, '='))), null, 1) : x);
            add('JWT 分段', p.join('\n\n'));
          } catch (e) { }
        }
        q('#out').querySelectorAll('[data-cp]').forEach(b => b.onclick = () => App.copy(decodeURIComponent(b.dataset.cp)));
      };
      q('#clr').onclick = () => { q('#inp').value = ''; q('#out').innerHTML = ''; q('#edit').value = ''; q('#encoded').value = ''; };
      q('#b64').onclick = () => q('#encoded').value = Codec.B64.enc(q('#edit').value);
      q('#url').onclick = () => q('#encoded').value = encodeURIComponent(q('#edit').value);
      q('#hex').onclick = () => q('#encoded').value = Codec.Base16.enc(q('#edit').value);
    }
  });

  /* ==================== 3. PCAP 流量分析 ==================== */
  TOOLS.push({
    id: 'pcap-lab', name: 'PCAP 流量分析台', cat: 'forensics', icon: '📡', badge: 'misc2-5',
    desc: '离线解析 pcap/pcapng：HTTP 请求与上传对象、DNS、Telnet、TCP 流、字符串与 flag 线索，支持导出文件',
    tags: ['pcap', 'pcapng', 'Wireshark', 'HTTP', 'Telnet'], keywords: '流量 pcap pcapng wireshark http dns telnet 取证 misc',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('对应海丰杯 misc2/misc3/misc5/misc12 这类流量题：优先看 <b>HTTP</b> 里的 POST/上传对象，再查 <b>DNS / Telnet / 字符串</b>。TLS 加密流量仍需 SSLKEYLOGFILE 或 Wireshark 解密。') +
        T.card('载入流量包', `<input type="file" id="file" accept=".pcap,.pcapng,.cap" style="display:none">
          <div class="drop" id="drop">点击或拖入 .pcap / .pcapng / .cap 文件</div><div id="sum" style="margin-top:12px"></div>`) +
        T.card('分析结果', `<div class="btn-row" id="tabs" style="margin-bottom:10px"></div><div id="out"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      let parsed = null, current = 'http';
      const tabs = [
        ['http', 'HTTP 对象'], ['dns', 'DNS'], ['telnet', 'Telnet'], ['flows', 'TCP 流'], ['strings', '字符串'], ['flags', 'Flag 线索']
      ];
      function renderTabs() {
        q('#tabs').innerHTML = tabs.map(([k, n]) => `<button class="btn sm ${current === k ? 'primary' : ''}" data-t="${k}">${n}${parsed ? ' ' + (k === 'http' ? parsed.http.length : k === 'dns' ? parsed.dns.length : k === 'telnet' ? parsed.telnet.length : k === 'flows' ? parsed.flows.length : '') : ''}</button>`).join('');
        q('#tabs').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { current = b.dataset.t; renderTabs(); renderBody(); });
      }
      function renderBody() {
        if (!parsed) { q('#out').innerHTML = '<div class="note">请先载入流量包。</div>'; return; }
        if (current === 'http') {
          if (!parsed.http.length) { q('#out').innerHTML = '<div class="note">没有解析到明文 HTTP 对象（可能是 TLS，或需要重组更复杂的流）。</div>'; return; }
          q('#out').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>方向</th><th>方法</th><th>URL</th><th>状态</th><th>类型</th><th>大小</th><th>文件</th></tr></thead><tbody>` +
            parsed.http.map((o, i) => `<tr data-i="${i}" style="cursor:pointer"><td>${i + 1}</td><td>${o.direction}</td><td>${o.method || '-'}</td><td>${esc(o.url || '-')}</td><td>${o.status || '-'}</td><td>${esc(o.contentType || '-')}</td><td>${o.bodyLen}</td><td>${esc(o.filename || '-')}</td></tr>`).join('') + `</tbody></table></div><div id="obj"></div>`;
          q('#out').querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => showObj(parsed.http[+tr.dataset.i]));
        } else if (current === 'dns') {
          q('#out').innerHTML = parsed.dns.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>域名</th><th>类型</th><th>来源</th></tr></thead><tbody>` +
            parsed.dns.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${x.type}</td><td>${x.src}</td></tr>`).join('') + '</tbody></table></div>' : '<div class="note">没有 DNS 查询。</div>';
        } else if (current === 'telnet') {
          q('#out').innerHTML = parsed.telnet.length ? parsed.telnet.map(t => `<div class="io-label">${esc(t.key)}</div><pre class="result" style="max-height:320px">${esc(t.text)}</pre>`).join('') : '<div class="note">没有 Telnet 流量。</div>';
        } else if (current === 'flows') {
          q('#out').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>连接</th><th>协议</th><th>包数</th><th>重组字节</th></tr></thead><tbody>` +
            parsed.flows.map((f, i) => `<tr><td>${i + 1}</td><td><code>${esc(f.key)}</code></td><td>${f.proto}</td><td>${f.packets}</td><td>${f.bytes}</td></tr>`).join('') + '</tbody></table></div>';
        } else if (current === 'strings') {
          q('#out').innerHTML = `<div class="io-label">ASCII / UTF-16 字符串（最多 600 条）</div><pre class="result" style="max-height:500px">${esc(parsed.strings.join('\n'))}</pre>`;
        } else {
          q('#out').innerHTML = parsed.flags.length ? parsed.flags.map(f => `<div class="note ok" style="cursor:pointer" onclick="App.copy(${JSON.stringify(f)})"><code>${esc(f)}</code></div>`).join('') : '<div class="note">没有自动匹配到 flag{...}。可以到“字符串”里搜索，或用正则工具。</div>';
        }
      }
      function showObj(o) {
        const parts = (o.parts || []).map((p, i) => `<div class="note">上传字段 <code>${esc(p.filename || p.name)}</code>（${p.data.length} bytes） <button class="btn sm" data-part="${i}">导出</button></div>`).join('');
        q('#out').querySelector('#obj').innerHTML = `<div class="io-label" style="margin-top:12px">${o.direction === 'request' ? '请求' : '响应'} ${esc(o.url || o.status)} · ${o.bodyLen} bytes</div>
          ${parts}<textarea rows="10">${esc(o.preview || '')}</textarea>
          <div class="btn-row" style="margin-top:8px"><button class="btn sm" id="dlObj">导出整个 Body</button></div>`;
        q('#out').querySelector('#dlObj').onclick = () => downloadBytes(o.filename || 'http_body.bin', o.body);
        q('#out').querySelectorAll('[data-part]').forEach(b => b.onclick = () => { const p = o.parts[+b.dataset.part]; downloadBytes(p.filename || 'upload.bin', p.data); });
      }
      function load(file) {
        readFile(file, false, bytes => {
          try {
            parsed = Forensics.parse(bytes);
            const s = parsed.stats;
            q('#sum').innerHTML = `<div class="stat-grid">
              <div class="stat"><b>${s.packets}</b><span>数据包</span></div>
              <div class="stat"><b>${s.flows}</b><span>流</span></div>
              <div class="stat"><b>${s.http}</b><span>HTTP 对象</span></div>
              <div class="stat"><b>${s.dns}</b><span>DNS</span></div>
              <div class="stat"><b>${s.tls}</b><span>TLS 包</span></div>
              <div class="stat"><b>${(s.bytes / 1024).toFixed(1)}K</b><span>字节</span></div>
            </div><div class="note">格式 ${parsed.format} · 链路类型 ${parsed.linktypes.join(',')}。${s.tls ? '检测到 TLS，需 keylog/Wireshark 解密。' : ''}</div>`;
            current = parsed.http.length ? 'http' : 'flows';
            renderTabs(); renderBody();
            App.toast('流量包解析完成', 'ok');
          } catch (e) { q('#sum').innerHTML = `<div class="note warn">解析失败：${esc(e.message)}</div>`; }
        });
      }
      bindDrop(q('#drop'), q('#file'), load);
    }
  });

  /* ==================== 4. PNG 宽高修复 ==================== */
  TOOLS.push({
    id: 'png-repair', name: 'PNG 宽高修复 / 结构', cat: 'forensics', icon: '🖼️', badge: 'misc6',
    desc: '解析 PNG 分块，查看并修改 IHDR 宽高、重算 CRC 后导出；同时检查 IEND 后附加数据',
    tags: ['PNG', 'IHDR', 'CRC', 'width', 'height'], keywords: 'png 宽高 修复 crc ihdr 图片 misc6',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('海丰杯 misc6 的“图片打不开/只显示一半”通常就是 IHDR 宽高被改。载入图片后看实际尺寸，改回正确宽高，重算 CRC 导出即可。') +
        T.card('载入 PNG', `<input type="file" id="file" accept=".png" style="display:none">
          <div class="drop" id="drop">点击或拖入 .png 文件</div><div id="sum" style="margin-top:12px"></div>`) +
        T.card('修复', `<div class="form-row"><label>宽</label><input type="number" id="w" style="max-width:130px">
          <label>高</label><input type="number" id="h" style="max-width:130px">
          <button class="btn primary" id="fix">重新计算 CRC 并导出</button></div><div id="chunks"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      let parsed = null;
      bindDrop(q('#drop'), q('#file'), file => {
        readFile(file, false, bytes => {
          try {
            parsed = Forensics.parsePng(bytes);
            q('#w').value = parsed.width; q('#h').value = parsed.height;
            q('#sum').innerHTML = `<div class="stat-grid"><div class="stat"><b>${parsed.width}</b><span>宽</span></div><div class="stat"><b>${parsed.height}</b><span>高</span></div><div class="stat"><b>${parsed.chunks.length}</b><span>分块</span></div><div class="stat"><b>${parsed.trailing.length}</b><span>IEND 后字节</span></div></div>` +
              (parsed.trailing.length ? `<div class="note warn">IEND 后还有 ${parsed.trailing.length} 字节，通常藏了 zip/文本。 <button class="btn sm" id="dlTrail">导出尾部数据</button></div>` : '');
            q('#chunks').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>类型</th><th>长度</th><th>CRC</th></tr></thead><tbody>` +
              parsed.chunks.map(c => `<tr><td>${c.type}</td><td>${c.length}</td><td>0x${c.crc.toString(16).padStart(8, '0')}</td></tr>`).join('') + '</tbody></table></div>';
            if (parsed.trailing.length) q('#dlTrail').onclick = () => downloadBytes('png_trailing.bin', parsed.trailing);
          } catch (e) { q('#sum').innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
        });
      });
      q('#fix').onclick = () => {
        if (!parsed) return App.toast('请先载入 PNG', 'err');
        const w = parseInt(q('#w').value, 10), h = parseInt(q('#h').value, 10);
        if (!w || !h) return App.toast('宽高必须是正整数', 'err');
        const out = Forensics.buildPng(parsed, w, h);
        downloadBytes(`fixed_${w}x${h}.png`, out);
        App.toast('已修复并导出，CRC 已重算', 'ok');
      };
    }
  });

  /* ==================== 5. Brainfuck / Ook ==================== */
  TOOLS.push({
    id: 'esolang', name: 'Brainfuck / Ook 解释器', cat: 'misc', icon: '🧠',
    desc: '离线运行 Brainfuck、Ook! 深奥语言，支持输入字符，Misc 签到/编码题常用',
    tags: ['Brainfuck', 'Ook', 'esolang'], keywords: 'brainfuck ook 深奥 语言 解释器 misc',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('输入', `<div class="form-row"><label>语言</label><select id="lang" style="max-width:150px"><option value="bf">Brainfuck</option><option value="ook">Ook!</option></select>
          <button class="btn primary" id="run">运行</button><button class="btn" id="clear">清空</button></div>
          <div class="io-grid"><div class="io-box"><div class="io-label">代码</div><textarea id="code" rows="9" placeholder="++++++++[>++++++++<-]>+."></textarea></div>
          <div class="io-box"><div class="io-label">输入（可选，逐字符喂给 ,）</div><textarea id="inp" rows="9"></textarea></div></div>`) +
        T.card('输出', `<textarea id="out" rows="8" readonly></textarea><div id="meta" class="note"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      q('#run').onclick = () => {
        try {
          let code = q('#code').value;
          if (q('#lang').value === 'ook') code = CTF.ookToBf(code);
          const r = CTF.brainfuck(code, q('#inp').value);
          q('#out').value = r.output;
          q('#meta').textContent = `执行 ${r.steps} 步，输出 ${r.output.length} 字符`;
        } catch (e) { q('#out').value = '错误：' + e.message; }
      };
      q('#clear').onclick = () => { q('#code').value = ''; q('#inp').value = ''; q('#out').value = ''; q('#meta').textContent = ''; };
    }
  });

  /* ==================== 6. 核心价值观 / 数字 ==================== */
  TOOLS.push({
    id: 'values', name: '核心价值观 / 中文数字 / 罗马数字', cat: 'misc', icon: '🇨🇳', badge: 'misc4',
    desc: '社会主义核心价值观编码解码（海丰杯 misc4）、中文数字与罗马数字互转',
    tags: ['核心价值观', '中文数字', '罗马数字'], keywords: '核心价值观 编码 解码 中文数字 罗马数字 古代 数字 misc4',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('核心价值观编码', `<div class="io-grid"><div class="io-box"><div class="io-label">明文 / 编码串</div><textarea id="vin" rows="6"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="vout" rows="6"></textarea></div></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="venc">编码</button><button class="btn primary" id="vdec">解码</button><button class="btn" id="vcp">复制结果</button></div>`) +
        T.card('数字转换', `<div class="form-row"><label>阿拉伯数字</label><input type="text" id="num" placeholder="1234" style="max-width:150px">
          <button class="btn" id="toCn">→ 中文</button><button class="btn" id="toRoman">→ 罗马</button></div>
          <div class="form-row" style="margin-top:10px"><label>中文/罗马</label><input type="text" id="txt" placeholder="一千二百三十四 / MCMXCIV" style="flex:1">
          <button class="btn" id="fromCn">中文→数字</button><button class="btn" id="fromRoman">罗马→数字</button></div>
          <div id="numOut" class="note" style="margin-top:10px">—</div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      q('#venc').onclick = () => { try { q('#vout').value = CTF.valuesEncode(q('#vin').value); } catch (e) { App.toast(e.message, 'err'); } };
      q('#vdec').onclick = () => { try { q('#vout').value = CTF.valuesDecode(q('#vin').value); } catch (e) { App.toast(e.message, 'err'); } };
      q('#vcp').onclick = () => App.copy(q('#vout').value);
      q('#toCn').onclick = () => q('#numOut').textContent = '中文：' + CTF.numberToCn(q('#num').value);
      q('#toRoman').onclick = () => { try { q('#numOut').textContent = '罗马：' + CTF.numberToRoman(q('#num').value); } catch (e) { q('#numOut').textContent = e.message; } };
      q('#fromCn').onclick = () => q('#numOut').textContent = '数字：' + CTF.cnToNumber(q('#txt').value);
      q('#fromRoman').onclick = () => { try { q('#numOut').textContent = '数字：' + CTF.romanToNumber(q('#txt').value); } catch (e) { q('#numOut').textContent = e.message; } };
    }
  });

})();
