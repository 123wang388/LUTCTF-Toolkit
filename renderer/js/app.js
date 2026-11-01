/* ============================================================
   app.js — 应用主框架
   导航 / Tab / 全局搜索 / 主题 / 窗口控制 / Toast
   ============================================================ */
const App = (function () {
  'use strict';

  const state = { current: null, tabs: [], pins: new Set() };
  const $ = s => document.querySelector(s);

  /* ---------- 收藏（本地持久化） ---------- */
  const FAV_KEY = 'lutctf-favorites';
  let favSet = new Set();
  try { favSet = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { }
  function isFav(id) { return favSet.has(id); }
  function toggleFav(id) {
    if (favSet.has(id)) favSet.delete(id); else favSet.add(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...favSet])); } catch (e) { }
    return favSet.has(id);
  }

  /* ---------- Toast ---------- */
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toastWrap').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(30px)'; setTimeout(() => el.remove(), 260); }, 2600);
  }

  /* ---------- IPC 安全封装（浏览器环境下降级不报错） ---------- */
  const ipc = {
    min: () => window.api && window.api.min(),
    max: () => window.api && window.api.max(),
    close: () => window.api && window.api.close(),
    pin: () => window.api && window.api.pin(),
    openExternal: u => window.api ? window.api.openExternal(u) : window.open(u, '_blank'),
    runCmd: c => window.api && window.api.runCmd(c),
    saveFile: (name, data) => window.api && window.api.saveFile(name, data),
    readFile: () => window.api && window.api.readFile()
  };

  /* ---------- 分类元信息 ---------- */
  const CATS = [
    { id: 'encode', name: '编码转换', color: '#2f81f7', desc: 'Base 全族 / URL / Hex / Unicode / Morse' },
    { id: 'classical', name: '古典密码', color: '#a371f7', desc: '凯撒 / 维吉尼亚 / 栅栏 / 替换' },
    { id: 'crypto', name: '现代密码', color: '#ff7a2f', desc: '哈希 / AES / 国密 SM3·SM4 / RSA' },
    { id: 'stego', name: '隐写取证', color: '#39c5cf', desc: 'LSB / 位平面 / 文件结构 / 频谱' },
    { id: 'forensics', name: '流量/取证', color: '#56d4dd', desc: 'PCAP / PNG 修复 / 文件对象 / 流量' },
    { id: 'web', name: 'Web 安全', color: '#3fb950', desc: '注入 / XSS / JWT / 请求构造 / 爆破' },
    { id: 'pwn', name: '二进制 / Pwn', color: '#ff7b72', desc: 'ELF/PE / checksec / ROP / 模板' },
    { id: 'misc', name: '杂项辅助', color: '#d29922', desc: '进制 / 时间 / 正则 / 字典 / 深奥语言' },
    { id: 'blue', name: '应急响应', color: '#f85149', desc: '排查清单 / 命令速查 / 加固' },
    { id: 'ext', name: '外部工具', color: '#94a6c2', desc: '本机工具箱 / 在线资源 / 知识库' },
    { id: 'ctf', name: '题目实战', color: '#d2a8ff', desc: '海丰杯 2025 复盘 / 工具映射 / 自测' }
  ];
  const catMap = Object.fromEntries(CATS.map(c => [c.id, c]));

  /* ---------- 侧栏渲染 ---------- */
  function renderNav() {
    const host = $('#sideNav');
    host.innerHTML = '';
    CATS.forEach(cat => {
      const items = TOOLS.filter(t => t.cat === cat.id);
      if (!items.length) return;
      const g = document.createElement('div');
      g.className = 'nav-group';
      g.innerHTML =
        `<div class="nav-group-title"><span class="gdot" style="background:${cat.color}"></span>${cat.name}<span class="nav-count">${items.length}</span><span class="caret">▼</span></div>
         <div class="nav-items">` +
        items.map(t => `<div class="nav-item" data-id="${t.id}" title="${esc(t.desc || '')}">
            <span>${esc(t.name)}</span>${t.badge ? `<span class="badge">${t.badge}</span>` : ''}</div>`).join('') +
        `</div>`;
      g.querySelector('.nav-group-title').onclick = () => g.classList.toggle('collapsed');
      g.querySelectorAll('.nav-item').forEach(n => n.onclick = () => open(t => t, n.dataset.id));
      host.appendChild(g);
    });
  }

  /* ---------- 打开工具 ---------- */
  function open(_, id) { openTool(id); }
  function openTool(id) {
    const tool = TOOLS.find(t => t.id === id);
    if (!tool) return;
    if (!state.tabs.find(t => t.id === id)) {
      state.tabs.push({ id, name: tool.name, cat: tool.cat });
      if (state.tabs.length > 12) state.tabs.shift();
    }
    state.current = id;
    renderTabs();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.id === id));

    $('#workspace').classList.add('has-tab');
    const host = $('#panelHost');
    host.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const color = catMap[tool.cat] ? catMap[tool.cat].color : '#2f81f7';
    panel.innerHTML =
      `<div class="p-head">
        <div class="p-title"><div class="pico" style="color:${color}">${tool.icon || '⚙'}</div>${esc(tool.name)}
          ${tool.cat ? `<span class="tag">${esc(catMap[tool.cat] ? catMap[tool.cat].name : tool.cat)}</span>` : ''}
          <button class="fav ${isFav(tool.id) ? 'on' : ''}" data-fav="${tool.id}" title="收藏这个工具">★</button></div>
        ${tool.desc ? `<div class="p-desc">${tool.desc}</div>` : ''}
        ${tool.tags ? `<div class="p-tags">${tool.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    host.appendChild(panel);
    const favBtn = panel.querySelector('[data-fav]');
    if (favBtn) favBtn.onclick = () => favBtn.classList.toggle('on', toggleFav(tool.id));
    try {
      tool.render(panel);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'result err';
      err.textContent = '渲染失败: ' + e.message;
      panel.appendChild(err);
      console.error(e);
    }
    $('#workspace').scrollTop = 0;
  }
  function closeTab(id) {
    state.tabs = state.tabs.filter(t => t.id !== id);
    if (state.current === id) {
      state.current = state.tabs.length ? state.tabs[state.tabs.length - 1].id : null;
      if (state.current) openTool(state.current);
      else { $('#workspace').classList.remove('has-tab'); $('#panelHost').innerHTML = ''; renderTabs(); }
    } else renderTabs();
    renderTabs();
  }
  function renderTabs() {
    $('#tabs').innerHTML = state.tabs.map(t =>
      `<div class="tab ${t.id === state.current ? 'active' : ''}" data-id="${t.id}">
        <span class="tdot" style="background:${catMap[t.cat] ? catMap[t.cat].color : '#888'}"></span>
        <span>${esc(t.name)}</span><span class="tx" data-close="${t.id}">×</span></div>`).join('');
    $('#tabs').querySelectorAll('.tab').forEach(el => {
      el.onclick = e => {
        if (e.target.dataset.close) { closeTab(e.target.dataset.close); return; }
        openTool(el.dataset.id);
      };
    });
  }

  /* ---------- 欢迎页：工具总览 ---------- */
  let welcomeCat = 'all';
  let welcomeQuery = '';

  function toolHay(t) {
    return (t.name + ' ' + (t.desc || '') + ' ' + (t.tags || []).join(' ') + ' ' + (t.keywords || [])).toLowerCase();
  }

  function renderWelcome() {
    const cats = CATS.filter(c => TOOLS.some(t => t.cat === c.id));
    const total = TOOLS.length;
    const favCount = TOOLS.filter(t => isFav(t.id)).length;
    $('#welcome').innerHTML =
      `<div class="welcome-inner">
        <div class="welcome-head">
          <div class="wh-main">
            <div class="eyebrow">LUTCTF · K4L0NG</div>
            <h1>工具合集 <span>v2.0</span></h1>
            <p>面向兰州理工大学 K4L0NG 战队与甘肃省“海丰杯”的离线解题工作台。收录编解码、密码学、隐写、取证、Web、二进制与应急响应，全部本地运行。</p>
          </div>
          <div class="welcome-stats">
            <div class="w-stat"><b>${total}</b><span>内置工具</span></div>
            <div class="w-stat"><b>${cats.length}</b><span>知识域</span></div>
            <div class="w-stat"><b>${favCount}</b><span>已收藏</span></div>
            <div class="w-stat"><b>100%</b><span>离线可用</span></div>
          </div>
        </div>
        <div class="welcome-toolbar">
          <div class="wchips" id="welcomeChips">
            <button class="wchip ${welcomeCat === 'all' ? 'active' : ''}" data-cat="all">全部 <i>${total}</i></button>
            <button class="wchip ${welcomeCat === 'fav' ? 'active' : ''}" data-cat="fav">★ 收藏 <i>${favCount}</i></button>
            ${cats.map(c => `<button class="wchip ${welcomeCat === c.id ? 'active' : ''}" data-cat="${c.id}">${esc(c.name)} <i>${TOOLS.filter(t => t.cat === c.id).length}</i></button>`).join('')}
          </div>
          <input id="welcomeSearch" class="wsearch" placeholder="在合集里筛选，如 base / RSA / 隐写…" value="${esc(welcomeQuery)}">
        </div>
        <div class="welcome-grid" id="welcomeGrid"></div>
      </div>`;

    $('#welcomeChips').querySelectorAll('.wchip').forEach(b => b.onclick = () => {
      welcomeCat = b.dataset.cat;
      $('#welcomeChips').querySelectorAll('.wchip').forEach(x => x.classList.toggle('active', x === b));
      renderWelcomeGrid();
    });
    const inp = $('#welcomeSearch');
    inp.oninput = () => { welcomeQuery = inp.value; renderWelcomeGrid(); };
    renderWelcomeGrid();
  }

  function renderWelcomeGrid() {
    const host = $('#welcomeGrid');
    if (!host) return;
    const q = welcomeQuery.trim().toLowerCase();
    const list = TOOLS.filter(t => {
      if (welcomeCat === 'fav' && !isFav(t.id)) return false;
      if (welcomeCat !== 'all' && welcomeCat !== 'fav' && t.cat !== welcomeCat) return false;
      return !q || toolHay(t).includes(q);
    });
    if (!list.length) {
      host.innerHTML = `<div class="welcome-empty">没有匹配的工具，换个关键词试试${welcomeCat === 'fav' ? '，或先点卡片右上角 ★ 收藏' : ''}。</div>`;
      return;
    }
    host.innerHTML = list.map(t => {
      const cat = catMap[t.cat] || { color: '#888', name: '' };
      return `<div class="tcard" data-open="${t.id}">
        <div class="tc-top"><div class="tci" style="background:${hexA(cat.color)};color:${cat.color}">${t.icon || '⚙'}</div>
        <div class="tc-right"><button class="fav ${isFav(t.id) ? 'on' : ''}" data-fav="${t.id}" title="收藏">★</button>
        <span class="tcat" style="color:${cat.color};border-color:${hexA(cat.color)}">${esc(cat.name)}</span></div></div>
        <h4>${esc(t.name)}</h4>
        <p>${esc(t.desc || '')}</p>
      </div>`;
    }).join('');
    host.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openTool(el.dataset.open));
    host.querySelectorAll('[data-fav]').forEach(btn => btn.onclick = e => {
      e.stopPropagation();
      const on = toggleFav(btn.dataset.fav);
      btn.classList.toggle('on', on);
      renderWelcomeGrid();
    });
  }
  function goHome() {
    state.tabs = [];
    state.current = null;
    renderTabs();
    $('#workspace').classList.remove('has-tab');
    $('#panelHost').innerHTML = '';
    welcomeCat = 'all';
    welcomeQuery = '';
    renderWelcome();
    $('#workspace').scrollTop = 0;
    $('#sideNav').scrollTop = 0;
  }

  function hexA(hex) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.substr(0, 2), 16)},${parseInt(h.substr(2, 2), 16)},${parseInt(h.substr(4, 2), 16)},.14)`;
  }

  /* ---------- 全局搜索 ---------- */
  const omni = {
    idx: -1, list: [],
    build() {
      return TOOLS.map(t => ({
        t, hay: (t.name + ' ' + (t.desc || '') + ' ' + (t.tags || []).join(' ') + ' ' + (t.keywords || []).join(' ')).toLowerCase()
      }));
    },
    open() { $('#omni').hidden = false; $('#omniInput').value = ''; this.query(''); setTimeout(() => $('#omniInput').focus(), 20); },
    close() { $('#omni').hidden = true; },
    query(q) {
      const all = this.build();
      q = q.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      this.list = (!q ? all : all.filter(x => words.every(w => x.hay.includes(w)))).slice(0, 40);
      this.idx = this.list.length ? 0 : -1;
      this.render();
    },
    render() {
      $('#omniList').innerHTML = this.list.map((x, i) => {
        const cat = catMap[x.t.cat];
        return `<div class="omni-item ${i === this.idx ? 'sel' : ''}" data-id="${x.t.id}">
          <div class="oi-ico" style="background:${hexA(cat ? cat.color : '#888')};color:${cat ? cat.color : '#888'}">${x.t.icon || '⚙'}</div>
          <div class="oi-t"><b>${esc(x.t.name)}</b><span>${esc(x.t.desc || '')}</span></div>
          <div class="oi-c">${cat ? esc(cat.name) : ''}</div></div>`;
      }).join('') || '<div style="padding:20px;text-align:center;color:var(--fg-mute);font-size:12.5px">没有匹配的工具</div>';
      $('#omniList').querySelectorAll('.omni-item').forEach(el => {
        el.onclick = () => { this.close(); openTool(el.dataset.id); };
        el.onmouseenter = () => { this.idx = +el.dataset.i || 0; };
      });
      const sel = $('#omniList').querySelector('.sel');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    },
    move(d) {
      if (!this.list.length) return;
      this.idx = (this.idx + d + this.list.length) % this.list.length;
      this.render();
    },
    enter() { if (this.list[this.idx]) { this.close(); openTool(this.list[this.idx].t.id); } }
  };

  /* ---------- 主题 ---------- */
  function initTheme() {
    const saved = localStorage.getItem('lutctf-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }

  /* ---------- 启动 ---------- */
  function init() {
    initTheme();
    renderNav();
    renderWelcome();
    const resetScroll = () => {
      const ws = $('#workspace'); if (ws) ws.scrollTop = 0;
      const sn = $('#sideNav'); if (sn) sn.scrollTop = 0;
    };
    resetScroll();
    setTimeout(resetScroll, 80);

    $('#btnTheme').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('lutctf-theme', cur);
    };
    $('#btnPin').onclick = e => { ipc.pin(); e.currentTarget.classList.toggle('on'); };
    $('#btnHome').onclick = goHome;
    $('#logo').onclick = goHome;
    $('#btnMin').onclick = ipc.min;
    $('#btnMax').onclick = ipc.max;
    $('#btnClose').onclick = ipc.close;
    $('#btnAbout').onclick = () => openTool('about');
    $('#btnExt').onclick = () => openTool('ext-local');

    const gs = $('#searchBtn') || $('#globalSearch');
    if (gs) gs.onclick = omni.open.bind(omni);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); omni.open(); }
      if (e.key === 'Escape') omni.close();
    });
    $('#omniInput').oninput = e => omni.query(e.target.value);
    $('#omniInput').onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); omni.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); omni.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); omni.enter(); }
    };
    $('#omni').onclick = e => { if (e.target.id === 'omni') omni.close(); };
  }

  /* ---------- 工具面板通用构件 ---------- */
  const T = {
    card(title, body, extra) {
      return `<div class="card"><div class="card-head"><span class="cdot"></span>${title}<div class="spacer"></div>${extra || ''}</div><div class="card-body">${body}</div></div>`;
    },
    note(text, cls) { return `<div class="note ${cls || ''}">${text}</div>`; },
    io(label, id, placeholder, rows) {
      return `<div class="io-box"><div class="io-label">${label}<div class="spacer"></div></div>
        <textarea id="${id}" rows="${rows || 5}" placeholder="${placeholder || ''}"></textarea></div>`;
    },
    btn(id, text, cls) { return `<button class="btn ${cls || ''}" id="${id}">${text}</button>`; },
    opt(v, label, sel) { return `<option value="${v}" ${sel ? 'selected' : ''}>${label}</option>`; },
    tbl(headers, rows) {
      return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copy = text => {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板', 'ok'));
    else toast('复制失败', 'err');
  };
  const download = (name, text) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已导出 ' + name, 'ok');
  };
  /* 尝试把任意文本解成 UTF-8 字符串（十六进制则先转字节） */
  const tryDecode = s => {
    try {
      if (/^[0-9a-fA-F\s]+$/.test(s.trim()) && s.replace(/\s/g, '').length % 2 === 0)
        return Codec.fromBytes(Codec.hexToBytes(s));
    } catch (e) { }
    return s;
  };

  document.addEventListener('DOMContentLoaded', init);
  return { toast, copy, download, openTool, ipc, T, esc, catMap, state, tryDecode, closeTab, isFav, toggleFav };
})();
