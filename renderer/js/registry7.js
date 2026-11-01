/* ============================================================
   registry7.js — EBCTFCodeBox 函数库（原生合并，不再嵌入上游 UI）
   上游核心：https://github.com/Henglie/EBCTFCodeBox （Apache-2.0）
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  TOOLS.push({
    id: 'ebctf-ops', name: 'EBCTF 函数库（878）', cat: 'crypto', icon: '🧪', badge: '878',
    desc: '把 EBCTFCodeBox 的 878 个编解码/密码学/隐写/分析函数原生合并进本工具，按分类和搜索直接调用；不再显示上游工具箱界面',
    tags: ['EBCTF', '878 函数', '原生合并', 'Apache-2.0'], keywords: 'ebctf 恒烈 密码学 878 函数库 编解码 原生',
    render(host) {
      host.innerHTML = `
        <div class="eb-native">
          <div class="eb-toolbar">
            <input id="ebSearch" class="wsearch" placeholder="搜索 878 个函数：base / aes / 隐写 / pcap…">
            <select id="ebCat" style="max-width:220px"></select>
            <span id="ebCount" class="hint"></span>
          </div>
          <div class="eb-layout">
            <div class="eb-list" id="ebList"><div class="note">正在加载 878 个函数（首次约 10–20 秒，请稍候）…</div></div>
            <div class="eb-detail" id="ebDetail"><div class="note">从左侧选择一个函数。</div></div>
          </div>
          <div class="note" style="margin-top:12px">函数核心来自 <b>EBCTFCodeBox</b>（Apache-2.0，上游 v0.1.12）；已移除其工具箱外壳，只保留算法引擎。完整许可见 <code>renderer/ebctf/LICENSE</code>。</div>
        </div>
        <iframe id="ebEngine" src="${(window.api && window.api.ebctfUrl) ? window.api.ebctfUrl() : ''}" style="display:none" title="EBCTF engine"></iframe>`;
      const q = s => host.querySelector(s);
      const frame = q('#ebEngine');
      if (!frame.src) {
        q('#ebList').innerHTML = '<div class="note warn">EBCTF 本地引擎未启动，请重启应用。</div>';
        return;
      }
      let ops = [], cats = [], ready = false, selected = null, reqId = 0;
      const pending = new Map();
      function downloadBytes(name, bytes, mime) {
        const blob = new Blob([Uint8Array.from(bytes)], { type: mime || 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      window.addEventListener('message', e => {
        if (e.source !== frame.contentWindow) return;
        const m = e.data || {};
        if (m.type === 'eb-engine-ready') {
          ready = true; ops = m.ops || []; cats = m.cats || [];
          buildCats(); renderList();
        } else if (m.type === 'eb-engine-result' && pending.has(m.reqId)) {
          const { resolve } = pending.get(m.reqId); pending.delete(m.reqId); resolve(m);
        }
      });
      setTimeout(() => {
        if (!ready) q('#ebList').innerHTML = '<div class="note warn">引擎加载超时。请点右上角“重新加载”，或重启应用。</div>';
      }, 30000);

      function buildCats() {
        const counts = {};
        ops.forEach(o => counts[o.cat] = (counts[o.cat] || 0) + 1);
        q('#ebCat').innerHTML = `<option value="all">全部分类（${ops.length}）</option>` +
          cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}（${counts[c.id] || 0}）</option>`).join('');
        q('#ebCat').onchange = renderList;
      }
      function renderList() {
        if (!ready) return;
        const query = q('#ebSearch').value.trim().toLowerCase();
        const cat = q('#ebCat').value;
        const list = ops.filter(o => (cat === 'all' || o.cat === cat) &&
          (!query || (o.name + ' ' + o.desc + ' ' + o.id).toLowerCase().includes(query)));
        q('#ebCount').textContent = `${list.length} / ${ops.length} 个函数`;
        const view = list.slice(0, 250);
        q('#ebList').innerHTML = view.length ? view.map(o => {
          const cn = (cats.find(c => c.id === o.cat) || {}).name || o.cat;
          return `<div class="eb-row ${selected === o.id ? 'on' : ''}" data-id="${esc(o.id)}">
            <div class="eb-row-name">${esc(o.name)}</div>
            <div class="eb-row-meta"><span>${esc(cn)}</span><span>${esc(o.id)}</span></div>
          </div>`;
        }).join('') + (list.length > view.length ? `<div class="note">仅显示前 250 个，继续输入关键词缩小范围。</div>` : '')
          : '<div class="note">没有匹配的函数。</div>';
        q('#ebList').querySelectorAll('[data-id]').forEach(row => row.onclick = () => { selected = row.dataset.id; renderList(); renderDetail(selected); });
      }
      function paramHtml(p, i) {
        const id = `ebp${i}`;
        if (p.type === 'bool') return `<label class="chk"><input type="checkbox" id="${id}" ${p.default ? 'checked' : ''}> ${esc(p.label)}</label>`;
        if (p.type === 'select') {
          const opts = (p.options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(p.default) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
          return `<div class="eb-param"><label>${esc(p.label)}</label><select id="${id}">${opts}</select></div>`;
        }
        const type = p.type === 'number' ? 'number' : 'text';
        return `<div class="eb-param"><label>${esc(p.label)}</label><input type="${type}" id="${id}" value="${esc(p.default ?? '')}" placeholder="${esc(p.placeholder || '')}"></div>`;
      }
      function renderDetail(id) {
        const op = ops.find(o => o.id === id);
        if (!op) return;
        const dirs = [];
        if (op.hasDecode) dirs.push(['decode', '解码 / 反向']);
        if (op.hasEncode) dirs.push(['encode', '编码 / 正向']);
        if (op.hasRun) dirs.push(['run', '运行']);
        const d = q('#ebDetail');
        d.innerHTML = `<div class="eb-detail-head">
            <div><h3>${esc(op.name)}</h3><div class="p-desc">${esc(op.desc || '')}</div></div>
            <span class="tag">${esc(op.id)}</span></div>
          ${dirs.length > 1 ? `<div class="form-row"><label>方向</label><select id="ebDir">${dirs.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>` : `<input type="hidden" id="ebDir" value="${dirs.length ? dirs[0][0] : 'run'}">`}
          <div class="eb-params">${op.params.length ? op.params.map(paramHtml).join('') : '<div class="note">该函数没有参数。</div>'}</div>
          ${op.acceptsBytes ? `<div class="form-row"><label>文件（可选）</label><input type="file" id="ebFile"></div>` : ''}
          <div class="io-box" style="margin-top:10px"><div class="io-label">输入<div class="spacer"></div><button class="btn sm" id="ebRun">运行</button></div><textarea id="ebInput" rows="7" placeholder="输入文本；需要文件时选择上方文件"></textarea></div>
          <div class="io-box" style="margin-top:10px"><div class="io-label">输出<div class="spacer"></div><button class="btn sm" id="ebCopy">复制</button></div><textarea id="ebOutput" rows="7" readonly></textarea></div>
          <div id="ebFiles" class="note"></div>`;
        d.querySelector('#ebCopy').onclick = () => App.copy(d.querySelector('#ebOutput').value);
        d.querySelector('#ebRun').onclick = async () => {
          const btn = d.querySelector('#ebRun'); btn.disabled = true; btn.textContent = '运行中…';
          try {
            const params = {};
            op.params.forEach((p, i) => {
              const el = d.querySelector(`#ebp${i}`);
              if (!el) return;
              params[p.key] = p.type === 'bool' ? el.checked : p.type === 'number' ? Number(el.value) : el.value;
            });
            const fileEl = d.querySelector('#ebFile');
            let fileBytes = null, fileName = '', mime = '';
            if (fileEl && fileEl.files[0]) {
              const f = fileEl.files[0]; fileName = f.name; mime = f.type;
              fileBytes = Array.from(new Uint8Array(await f.arrayBuffer()));
            }
            const rid = ++reqId;
            const p = new Promise(resolve => pending.set(rid, { resolve }));
            frame.contentWindow.postMessage({
              type: 'eb-engine-run', reqId: rid, id: op.id,
              dir: d.querySelector('#ebDir').value, text: d.querySelector('#ebInput').value,
              params, fileBytes, fileName, mime
            }, '*');
            const r = await p;
            if (!r.ok) throw new Error(r.error || '执行失败');
            d.querySelector('#ebOutput').value = r.text || '';
            const fh = d.querySelector('#ebFiles');
            fh.innerHTML = (r.files || []).map((f, i) => `<button class="btn sm" data-file="${i}">下载 ${esc(f.name)}</button>`).join(' ');
            fh.querySelectorAll('[data-file]').forEach(b => b.onclick = () => {
              const f = r.files[+b.dataset.file];
              if (f.bytes) downloadBytes(f.name, f.bytes, f.mime);
            });
            App.toast('执行完成', 'ok');
          } catch (e) {
            d.querySelector('#ebOutput').value = '错误：' + e.message;
            App.toast(e.message, 'err');
          } finally { btn.disabled = false; btn.textContent = '运行'; }
        };
      }
      q('#ebSearch').oninput = renderList;
    }
  });
})();
