/* ============================================================
   registry6.js — v2：一把梭 / 配方链 / 字符显示器 / 工具启动台 / BaseX
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  /* ==================== Base36 / 45 / 62 ==================== */
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  function bytesToBig(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    return n;
  }
  function bigToBytes(n) {
    if (n === 0n) return Uint8Array.from([0]);
    const out = [];
    while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
    return Uint8Array.from(out);
  }
  function bigEncode(text, alphabet) {
    let n = bytesToBig(Codec.toBytes(text));
    if (n === 0n) return alphabet[0];
    let out = '';
    const base = BigInt(alphabet.length);
    while (n > 0n) { out = alphabet[Number(n % base)] + out; n /= base; }
    return out;
  }
  function bigDecode(s, alphabet) {
    let n = 0n;
    const base = BigInt(alphabet.length);
    for (const c of s.trim()) {
      const v = alphabet.indexOf(c);
      if (v < 0) throw new Error('非法字符: ' + c);
      n = n * base + BigInt(v);
    }
    return Codec.fromBytes(bigToBytes(n));
  }
  function b45enc(text) {
    const b = Codec.toBytes(text); let out = '';
    for (let i = 0; i < b.length; i += 2) {
      if (i + 1 < b.length) {
        const n = b[i] * 256 + b[i + 1];
        out += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
      } else {
        const n = b[i];
        out += B45[n % 45] + B45[Math.floor(n / 45)];
      }
    }
    return out;
  }
  function b45dec(s) {
    s = s.trim().replace(/\s/g, '');
    const out = [];
    for (let i = 0; i < s.length; i += 3) {
      const n = B45.indexOf(s[i]) + (B45.indexOf(s[i + 1]) * 45) + (i + 2 < s.length ? B45.indexOf(s[i + 2]) * 2025 : 0);
      if (i + 2 < s.length) { out.push((n >> 8) & 255, n & 255); }
      else out.push(n & 255);
    }
    return Codec.fromBytes(Uint8Array.from(out));
  }
  function basexDecode(s, alg) {
    if (alg === 'b36') return bigDecode(s, B36);
    if (alg === 'b62') return bigDecode(s, B62);
    if (alg === 'b45') return b45dec(s);
    throw new Error('未知 BaseX');
  }
  function basexEncode(s, alg) {
    if (alg === 'b36') return bigEncode(s, B36);
    if (alg === 'b62') return bigEncode(s, B62);
    if (alg === 'b45') return b45enc(s);
    throw new Error('未知 BaseX');
  }

  /* ==================== 1. 一把梭智能解码 ==================== */
  function scoreText(s) {
    if (!s) return -999;
    const len = [...s].length;
    let printable = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 0x7f) || (c >= 0x4e00 && c <= 0x9fff)) printable++;
    }
    let score = (printable / len) * 12;
    if (/flag\s*\{|ctf\s*\{|key\s*\{|passwd|password|admin|http[s]?:\/\//i.test(s)) score += 40;
    if (/[\u4e00-\u9fff]/.test(s)) score += 4;
    if (len < 4) score -= 6;
    if (/^[A-Za-z0-9+/=]{16,}$/.test(s)) score -= 6;
    if (/�/.test(s)) score -= 20;
    return score;
  }
  const DECODERS = [
    ['Base64', s => Codec.B64.dec(s)],
    ['Base32', s => Codec.Base32.dec(s)],
    ['Base58', s => Codec.Base58.dec(s)],
    ['Base58Check?', s => Codec.Base58.dec(s)],
    ['Base91', s => Codec.Base91.dec(s)],
    ['Base85', s => Codec.Base85.dec(s)],
    ['Hex', s => Codec.Base16.dec(s)],
    ['URL', s => Codec.Url.dec(s)],
    ['HTML 实体', s => Codec.Html.dec(s)],
    ['Unicode 转义', s => Codec.Uni.unesc(s)],
    ['Quoted-Printable', s => Codec.QP.dec(s)],
    ['ROT13', s => Codec.Rot.rot13(s)],
    ['反转', s => [...s].reverse().join('')],
    ['核心价值观', s => CTF.valuesDecode(s)],
    ['Base36', s => bigDecode(s, B36)],
    ['Base62', s => bigDecode(s, B62)],
    ['Base45', s => b45dec(s)],
    ['Morse', s => Codec.Morse.decRaw(s)],
    ['Brainfuck', s => CTF.brainfuck(s).output]
  ];
  function autoDecode(input) {
    const start = String(input || '').trim();
    if (!start) return { best: null, list: [] };
    const seen = new Set([start]);
    let frontier = [{ text: start, chain: [] }];
    let best = { text: start, chain: [], score: scoreText(start) };
    const all = [{ text: start, chain: [], score: best.score }];
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const [name, fn] of DECODERS) {
          let out;
          try { out = fn(node.text); } catch (e) { continue; }
          if (typeof out !== 'string' || !out || out === node.text || seen.has(out)) continue;
          if (out.length > 200000) continue;
          seen.add(out);
          const chain = node.chain.concat(name);
          const rec = { text: out, chain, score: scoreText(out) };
          all.push(rec);
          if (rec.score > best.score) best = rec;
          next.push(rec);
        }
      }
      next.sort((a, b) => b.score - a.score);
      frontier = next.slice(0, 12);
    }
    all.sort((a, b) => b.score - a.score);
    return { best, list: all.slice(0, 16) };
  }
  TOOLS.push({
    id: 'auto-decode', name: '一把梭 · 智能解码', cat: 'encode', icon: '🎯', badge: 'v2',
    desc: '自动尝试 Base64/32/58/85/91、Hex、URL、Unicode、QP、ROT13、核心价值观、Base36/45/62、Morse、Brainfuck，按可读性评分找最佳解码链',
    tags: ['自动解码', '一把梭', '智能识别'], keywords: '一把梭 自动 智能 解码 auto decode 未知编码',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('把未知字符串丢进来，工具会递归尝试常见编码，按“可打印度 + flag/password 关键词 + 中文”评分排序。多层编码会自动串成链，但不保证 100% 正确，请结合题目提示判断。') +
        T.card('输入', `<textarea id="in" rows="6" placeholder="粘贴密文，例如 ZmxhZ3t..."></textarea>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="go">开始智能解码</button><button class="btn" id="clr">清空</button></div>`) +
        T.card('最佳结果', `<div id="best" class="note">等待输入…</div><textarea id="out" rows="5" readonly></textarea>`) +
        T.card('候选结果', `<div id="list"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      q('#go').onclick = () => {
        const r = autoDecode(q('#in').value);
        if (!r.best) { q('#best').textContent = '没有结果'; return; }
        q('#out').value = r.best.text;
        q('#best').innerHTML = r.best.chain.length
          ? `<b style="color:var(--ok)">最佳链：</b>${esc(r.best.chain.join(' → '))} <span style="color:var(--fg-mute)">（评分 ${r.best.score.toFixed(1)}）</span>`
          : `<b>没有识别到进一步编码</b>（原样输出，评分 ${r.best.score.toFixed(1)}）`;
        q('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>解码链</th><th>评分</th><th>结果预览</th><th></th></tr></thead><tbody>` +
          r.list.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.chain.join(' → ') || '原文')}</td><td>${x.score.toFixed(1)}</td><td><code>${esc(x.text.slice(0, 100))}</code></td><td><button class="btn sm" data-i="${i}">复制</button></td></tr>`).join('') +
          `</tbody></table></div>`;
        q('#list').querySelectorAll('[data-i]').forEach(b => b.onclick = () => App.copy(r.list[+b.dataset.i].text));
      };
      q('#clr').onclick = () => { q('#in').value = ''; q('#out').value = ''; q('#best').textContent = '等待输入…'; q('#list').innerHTML = ''; };
    }
  });

  /* ==================== 2. 配方链 ==================== */
  const OPS = [
    { id: 'b64e', n: 'Base64 编码', f: s => Codec.B64.enc(s) },
    { id: 'b64d', n: 'Base64 解码', f: s => Codec.B64.dec(s) },
    { id: 'b32e', n: 'Base32 编码', f: s => Codec.Base32.enc(s) },
    { id: 'b32d', n: 'Base32 解码', f: s => Codec.Base32.dec(s) },
    { id: 'b58e', n: 'Base58 编码', f: s => Codec.Base58.enc(s) },
    { id: 'b58d', n: 'Base58 解码', f: s => Codec.Base58.dec(s) },
    { id: 'b91e', n: 'Base91 编码', f: s => Codec.Base91.enc(s) },
    { id: 'b91d', n: 'Base91 解码', f: s => Codec.Base91.dec(s) },
    { id: 'hexe', n: 'Hex 编码', f: s => Codec.Base16.enc(s) },
    { id: 'hexd', n: 'Hex 解码', f: s => Codec.Base16.dec(s) },
    { id: 'urle', n: 'URL 编码', f: s => Codec.Url.enc(s) },
    { id: 'urld', n: 'URL 解码', f: s => Codec.Url.dec(s) },
    { id: 'htmle', n: 'HTML 编码', f: s => Codec.Html.encNum(s) },
    { id: 'htmld', n: 'HTML 解码', f: s => Codec.Html.dec(s) },
    { id: 'unie', n: 'Unicode 转义', f: s => Codec.Uni.esc(s) },
    { id: 'unid', n: 'Unicode 还原', f: s => Codec.Uni.unesc(s) },
    { id: 'qpe', n: 'QP 编码', f: s => Codec.QP.enc(s) },
    { id: 'qpd', n: 'QP 解码', f: s => Codec.QP.dec(s) },
    { id: 'rot13', n: 'ROT13', f: s => Codec.Rot.rot13(s) },
    { id: 'rev', n: '字符串反转', f: s => [...s].reverse().join('') },
    { id: 'upper', n: '转大写', f: s => s.toUpperCase() },
    { id: 'lower', n: '转小写', f: s => s.toLowerCase() },
    { id: 'md5', n: 'MD5（输出 Hex）', f: s => Digest.md5(Codec.toBytes(s)) },
    { id: 'sm3', n: 'SM3（输出 Hex）', f: s => Digest.sm3(Codec.toBytes(s)) },
    { id: 'valuese', n: '核心价值观编码', f: s => CTF.valuesEncode(s) },
    { id: 'valuesd', n: '核心价值观解码', f: s => CTF.valuesDecode(s) }
  ];
  const RECIPE_KEY = 'lutctf-recipe';
  TOOLS.push({
    id: 'recipe', name: '配方链 · 编解码流水线', cat: 'misc', icon: '🔗', badge: 'v2',
    desc: '把多个编码/解码/哈希操作串成流水线，支持排序、删除、保存配方；类似 CyberChef Recipe',
    tags: ['Recipe', '流水线', '批量'], keywords: '配方链 流水线 recipe cyberchef 组合 编码 解码',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('按顺序执行操作，每一步的输出作为下一步输入。可以保存常用配方到本地（不联网）。') +
        T.card('输入 / 输出', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="input" rows="7">flag{test}</textarea></div>
          <div class="io-box"><div class="io-label">输出<div class="spacer"></div><button class="btn sm" id="cp">复制</button></div><textarea id="output" rows="7" readonly></textarea></div></div>`) +
        T.card('配方链', `<div class="form-row"><label>添加操作</label><select id="op" style="max-width:220px">${OPS.map(o => T.opt(o.id, o.n)).join('')}</select>
          <button class="btn primary" id="add">添加到链</button><button class="btn" id="run">执行配方</button><button class="btn" id="save">保存配方</button><button class="btn" id="load">读取配方</button><button class="btn" id="clear">清空链</button></div>
          <div id="chain" class="ops-list"></div>`) +
        T.card('说明', `<div class="note">示例：<code>Base64 解码 → Hex 解码 → ROT13</code>。保存的配方只存到本机 localStorage，不上传。</div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      let chain = [];
      try { chain = JSON.parse(localStorage.getItem(RECIPE_KEY) || '[]').filter(x => OPS.some(o => o.id === x)); } catch (e) { }
      function renderChain() {
        q('#chain').innerHTML = chain.length ? chain.map((id, i) => {
          const op = OPS.find(o => o.id === id);
          return `<div class="op-item"><span class="op-i">${i + 1}</span><b>${esc(op ? op.n : id)}</b>
            <button class="btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn sm" data-down="${i}" ${i === chain.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn sm" data-del="${i}">删除</button></div>`;
        }).join('') : '<div class="note">链是空的，先添加操作。</div>';
        q('#chain').querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [chain[i - 1], chain[i]] = [chain[i], chain[i - 1]]; renderChain(); });
        q('#chain').querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; [chain[i + 1], chain[i]] = [chain[i], chain[i + 1]]; renderChain(); });
        q('#chain').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { chain.splice(+b.dataset.del, 1); renderChain(); });
      }
      q('#add').onclick = () => { chain.push(q('#op').value); renderChain(); };
      q('#clear').onclick = () => { chain = []; renderChain(); };
      q('#run').onclick = () => {
        let s = q('#input').value;
        try {
          for (const id of chain) { const op = OPS.find(o => o.id === id); if (!op) continue; s = op.f(s); }
          q('#output').value = s;
          App.toast('配方执行完成', 'ok');
        } catch (e) { q('#output').value = '错误：' + e.message; App.toast(e.message, 'err'); }
      };
      q('#save').onclick = () => { localStorage.setItem(RECIPE_KEY, JSON.stringify(chain)); App.toast('配方已保存到本机', 'ok'); };
      q('#load').onclick = () => { try { chain = JSON.parse(localStorage.getItem(RECIPE_KEY) || '[]').filter(x => OPS.some(o => o.id === x)); renderChain(); } catch (e) { } };
      q('#cp').onclick = () => App.copy(q('#output').value);
      renderChain();
    }
  });

  /* ==================== 3. 字符显示器 ==================== */
  TOOLS.push({
    id: 'char-inspector', name: '字符显示器 / Unicode', cat: 'misc', icon: '🔤', badge: 'v2',
    desc: '逐字符查看 Unicode 码点、UTF-8/UTF-16 字节、HTML 实体、URL/Base64 编码，排查隐藏字符与全角混淆',
    tags: ['Unicode', 'UTF-8', '隐藏字符'], keywords: '字符 unicode 码点 utf8 utf16 隐藏字符 全角 不可见',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('输入文本', `<textarea id="in" rows="5">flag{test}　中文😀</textarea>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="run">解析</button><button class="btn" id="json">复制 JSON</button></div>`) +
        T.card('总览', `<div id="sum" class="stat-grid"></div>`) +
        T.card('逐字符', `<div id="tbl"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      let rows = [];
      function run() {
        const s = q('#in').value;
        const te = new TextEncoder();
        rows = [...s].map(ch => {
          const cp = ch.codePointAt(0);
          const u8 = te.encode(ch);
          return {
            ch, cp, hex: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
            dec: cp, utf8: [...u8].map(b => b.toString(16).padStart(2, '0')).join(' '),
            utf16: Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i).toString(16).padStart(4, '0')).join(' '),
            html: '&#' + cp + ';', url: encodeURIComponent(ch), b64: Codec.B64.enc(ch)
          };
        });
        const nonAscii = rows.filter(r => r.cp > 127).length;
        q('#sum').innerHTML = `<div class="stat"><b>${[...s].length}</b><span>字符数</span></div><div class="stat"><b>${new TextEncoder().encode(s).length}</b><span>UTF-8 字节</span></div><div class="stat"><b>${nonAscii}</b><span>非 ASCII</span></div>`;
        q('#tbl').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>字符</th><th>码点</th><th>十进制</th><th>UTF-8</th><th>UTF-16</th><th>HTML</th><th>URL</th><th>Base64</th></tr></thead><tbody>` +
          rows.slice(0, 300).map(r => `<tr><td><code>${r.ch === '\n' ? '\\n' : r.ch === '\t' ? '\\t' : esc(r.ch)}</code></td><td>${r.hex}</td><td>${r.dec}</td><td>${r.utf8}</td><td>${r.utf16}</td><td><code>${esc(r.html)}</code></td><td><code>${esc(r.url)}</code></td><td><code>${esc(r.b64)}</code></td></tr>`).join('') +
          `</tbody></table></div><div class="note">最多显示前 300 个字符；零宽字符、全角字符、组合字符都能在这里看出来。</div>`;
      }
      q('#run').onclick = run;
      q('#json').onclick = () => App.copy(JSON.stringify(rows.map(r => ({ char: r.ch, codePoint: r.hex, utf8: r.utf8, utf16: r.utf16, html: r.html, url: r.url, base64: r.b64 })), null, 2));
      run();
    }
  });

  /* ==================== 4. 外部工具启动台 ==================== */
  TOOLS.push({
    id: 'launcher', name: '工具启动台 · 外置工具仓库', cat: 'ext', icon: '🚀', badge: 'v2',
    desc: '按 Web/信息收集/密码/隐写/逆向/流量分类展示本机工具，检测安装状态并一键开终端，类似 Maye Lite / 科恩斑马的工具仓库',
    tags: ['Launcher', '外部工具', '终端'], keywords: '启动台 工具仓库 launcher 外部工具 终端 maye 科恩斑马',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('这里只负责<b>启动本机已安装的命令行工具</b>，不联网、不自动攻击。比赛期间请遵守规则：不攻击竞赛平台、不共享 Flag、不做破坏性操作。') +
        T.card('筛选', `<div class="form-row"><input type="text" id="q" placeholder="搜索工具 / 命令 / 描述…" style="flex:1">
          <button class="btn primary" id="scan">检测本机安装</button><button class="btn" id="all">全部</button></div>
          <div class="wchips" id="cats" style="margin-top:10px"></div>`) +
        T.card('工具仓库', `<div id="grid" class="launcher-grid"></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      const groups = ['全部', ...new Set(ExtLib.LOCAL.map(x => x.g))];
      let cur = '全部', query = '', status = {};
      function renderCats() {
        q('#cats').innerHTML = groups.map(g => `<button class="wchip ${cur === g ? 'active' : ''}" data-g="${esc(g)}">${esc(g)} <i>${g === '全部' ? ExtLib.LOCAL.length : ExtLib.LOCAL.filter(x => x.g === g).length}</i></button>`).join('');
        q('#cats').querySelectorAll('[data-g]').forEach(b => b.onclick = () => { cur = b.dataset.g; renderCats(); renderGrid(); });
      }
      function renderGrid() {
        const list = ExtLib.LOCAL.filter(x => (cur === '全部' || x.g === cur) && (!query || (x.name + ' ' + x.cmd + ' ' + x.desc).toLowerCase().includes(query)));
        q('#grid').innerHTML = list.map((x, i) => {
          const st = status[x.name];
          const cmdName = (x.cmd || '').split(/\s+/)[0] || '';
          return `<div class="launch-card">
            <div class="lc-top"><span class="lc-ico">${({ 'Web 渗透': '🌐', '信息收集': '📡', '密码破解': '🔑', '隐写取证': '🖼️', '逆向': '🧬', '流量分析': '📶' })[x.g] || '🧰'}</span>
              <span class="cc-status ${st === true ? 'ok' : st === false ? 'ext' : ''}">${st === true ? '已安装' : st === false ? '未检测到' : '未检测'}</span></div>
            <h4>${esc(x.name)}</h4><p>${esc(x.desc || x.cmd || '')}</p>
            <div class="lc-cmd"><code>${esc(x.cmd || '')}</code></div>
            <div class="btn-row"><button class="btn sm" data-run="${i}">启动</button><button class="btn sm" data-cp="${i}">复制</button>${x.url ? `<button class="btn sm" data-url="${i}">官网</button>` : ''}</div>
          </div>`;
        }).join('') || '<div class="note">没有匹配的工具。</div>';
        q('#grid').querySelectorAll('[data-run]').forEach(b => b.onclick = () => { const x = list[+b.dataset.run]; App.ipc.runCmd(x.cmd); App.toast('已打开终端：' + x.name, 'ok'); });
        q('#grid').querySelectorAll('[data-cp]').forEach(b => b.onclick = () => App.copy(list[+b.dataset.cp].cmd));
        q('#grid').querySelectorAll('[data-url]').forEach(b => b.onclick = () => App.ipc.openExternal(list[+b.dataset.url].url));
      }
      q('#q').oninput = () => { query = q('#q').value.trim().toLowerCase(); renderGrid(); };
      q('#all').onclick = () => { cur = '全部'; query = ''; q('#q').value = ''; renderCats(); renderGrid(); };
      q('#scan').onclick = async () => {
        if (!window.api || !window.api.scanTool) return App.toast('当前环境不支持检测', 'err');
        App.toast('开始检测本机工具…', 'ok');
        for (const x of ExtLib.LOCAL) {
          const name = (x.cmd || '').split(/\s+/)[0];
          if (!name) continue;
          try { status[x.name] = await window.api.scanTool(name); } catch (e) { status[x.name] = false; }
        }
        renderGrid();
        App.toast('检测完成', 'ok');
      };
      renderCats(); renderGrid();
    }
  });

  /* ==================== 5. Base36/45/62 ==================== */
  TOOLS.push({
    id: 'basex', name: 'Base36 / Base45 / Base62', cat: 'encode', icon: '🔢', badge: 'v2',
    desc: '补全 CTF 常见的非标准 Base 编码：Base36、Base45（QR 常用）、Base62，支持文本互转',
    tags: ['Base36', 'Base45', 'Base62'], keywords: 'base36 base45 base62 编码 解码 qr',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('转换', `<div class="form-row"><label>算法</label><select id="alg" style="max-width:130px"><option value="b36">Base36</option><option value="b45">Base45</option><option value="b62">Base62</option></select>
          <button class="btn primary" id="enc">编码</button><button class="btn primary" id="dec">解码</button></div>
          <div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="in" rows="8"></textarea></div>
          <div class="io-box"><div class="io-label">输出</div><textarea id="out" rows="8" readonly></textarea></div></div>`);
      host.appendChild(d);
      const q = s => d.querySelector(s);
      q('#enc').onclick = () => { try { q('#out').value = basexEncode(q('#in').value, q('#alg').value); } catch (e) { App.toast(e.message, 'err'); } };
      q('#dec').onclick = () => { try { q('#out').value = basexDecode(q('#in').value, q('#alg').value); } catch (e) { App.toast(e.message, 'err'); } };
    }
  });

})();
