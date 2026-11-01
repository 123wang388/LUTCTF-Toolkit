/* ============================================================
   registry.js — 工具注册表 (Part 1: 编码 / 古典 / 密码学)
   ============================================================ */
const TOOLS = [];
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  /* 通用：绑定一组按钮 */
  function utf16leBytes(s) {
    const arr = [];
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (cp > 0xFFFF) { const v = cp - 0x10000; const hi = 0xD800 + (v >> 10), lo = 0xDC00 + (v & 0x3FF); arr.push(hi & 255, (hi >> 8) & 255, lo & 255, (lo >> 8) & 255); }
      else arr.push(cp & 255, (cp >> 8) & 255);
    }
    return Uint8Array.from(arr);
  }

  /* ============================ 编码转换 ============================ */
  TOOLS.push({
    id: 'enc-base', name: 'Base 全家桶', cat: 'encode', icon: '🔡', badge: '16',
    desc: 'Base64 / Base32 / Base16 / Base58 / Base85 / Base91 / Base100 / URL-Safe / Base64 图片预览',
    tags: ['Base64', 'Base32', 'Base58', 'Base85', 'Base91'], keywords: 'base base64 base32 base58 base85 base91 编码 解码',
    render(host) {
      const algos = [
        ['b64', 'Base64'], ['b64url', 'Base64 URL-Safe'], ['b64img', 'Base64 ↔ 图片'], ['b32', 'Base32'],
        ['b32ext', 'Base32 Ext (Crockford)'], ['b16', 'Base16 (Hex)', ], ['b58', 'Base58 (Bitcoin)'],
        ['b85', 'Ascii85'], ['z85', 'Z85'], ['b91', 'Base91'], ['b100', 'Base100']
      ];
      const d = document.createElement('div');
      d.innerHTML =
        T.card('算法选择', `<div class="form-row"><label>算法</label><select id="algo">${algos.map(a => T.opt(a[0], a[1])).join('')}</select></div>`) +
        T.card('转换', `<div class="io-grid">
            <div class="io-box"><div class="io-label">明文 / 编码串</div><textarea id="in" rows="8" placeholder="输入内容…"></textarea></div>
            <div class="io-box"><div class="io-label">结果<div class="spacer"></div><button class="btn sm" id="cp">复制</button></div><textarea id="out" rows="8" placeholder="结果…"></textarea></div>
          </div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn primary" id="enc">编码 ▶</button>
            <button class="btn primary" id="dec">◀ 解码</button>
            <button class="btn" id="swap">⇅ 交换</button>
            <button class="btn sm" id="clr">清空</button>
          </div>
          <div id="imgbox" style="margin-top:12px;display:none"></div>`);
      host.appendChild(d);
      const algo = d.querySelector('#algo'), inp = d.querySelector('#in'), out = d.querySelector('#out');
      const run = (dir) => {
        const a = algo.value, s = inp.value.trim();
        try {
          if (a === 'b64') out.value = dir === 'enc' ? Codec.B64.enc(s) : Codec.B64.dec(s);
          else if (a === 'b64url') out.value = dir === 'enc' ? Codec.B64.encUrl(s) : Codec.B64.dec(s);
          else if (a === 'b64img') {
            if (dir === 'enc') {
              out.value = 'data:image/png;base64,' + s.replace(/^data:image\/\w+;base64,/, '');
              const box = d.querySelector('#imgbox'); box.style.display = 'block';
              box.innerHTML = `<div class="note">预览：</div><img src="${out.value}" style="max-width:320px;border:1px solid var(--border);border-radius:6px">`;
            } else {
              const data = s.replace(/^data:image\/\w+;base64,/, '');
              out.value = Codec.B64.dec(data); // 二进制可能乱码，改显式提示
              out.value = '[二进制数据，建议查看图片预览]';
              const box = d.querySelector('#imgbox'); box.style.display = 'block';
              box.innerHTML = `<div class="note">图片预览：</div><img src="${s.startsWith('data:') ? s : 'data:image/png;base64,' + s}" style="max-width:320px;border:1px solid var(--border);border-radius:6px"><div class="btn-row" style="margin-top:8px"><button class="btn sm" id="dlImg">下载图片</button></div>`;
              const dl = box.querySelector('#dlImg');
              if (dl) dl.onclick = () => {
                const href = s.startsWith('data:') ? s : 'data:image/png;base64,' + s;
                const a2 = document.createElement('a'); a2.href = href; a2.download = 'decoded.png'; a2.click();
              };
            }
          }
          else if (a === 'b32') out.value = dir === 'enc' ? Codec.Base32.enc(s) : Codec.Base32.dec(s);
          else if (a === 'b32ext') out.value = dir === 'enc' ? Codec.Base32.encExt(s) : Codec.Base32.decExt(s);
          else if (a === 'b16') out.value = dir === 'enc' ? Codec.Base16.enc(s) : Codec.Base16.dec(s);
          else if (a === 'b58') out.value = dir === 'enc' ? Codec.Base58.enc(s) : Codec.Base58.dec(s);
          else if (a === 'b85') out.value = dir === 'enc' ? Codec.Base85.enc(s) : Codec.Base85.dec(s);
          else if (a === 'z85') out.value = dir === 'enc' ? Codec.Base85.z85enc(s) : Codec.Base85.z85dec(s);
          else if (a === 'b91') out.value = dir === 'enc' ? Codec.Base91.enc(s) : Codec.Base91.dec(s);
          else if (a === 'b100') out.value = dir === 'enc' ? Codec.Base100.enc(s) : Codec.Base100.dec(s);
          App.toast('完成', 'ok');
        } catch (e) { out.value = '错误: ' + e.message; App.toast(e.message, 'err'); }
      };
      d.querySelector('#enc').onclick = () => run('enc');
      d.querySelector('#dec').onclick = () => run('dec');
      d.querySelector('#swap').onclick = () => { const t = inp.value; inp.value = out.value; out.value = t; };
      d.querySelector('#clr').onclick = () => { inp.value = ''; out.value = ''; };
      d.querySelector('#cp').onclick = () => App.copy(out.value);
    }
  });

  TOOLS.push({
    id: 'enc-url', name: 'URL / HTML / Unicode', cat: 'encode', icon: '🔗',
    desc: 'URL 编码、双重 URL 编码、HTML 实体、Unicode 转义、反斜杠 x 与八进制转义，支持多层自动解码',
    tags: ['URL', 'HTML', 'Unicode', '实体'], keywords: 'url html unicode 实体 entity 转义',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('编码 / 解码', `
          <div class="io-grid">
            <div class="io-box"><div class="io-label">输入<div class="spacer"></div><span class="tag">支持自动识别</span></div>
              <textarea id="in" rows="7" placeholder="输入内容…"></textarea></div>
            <div class="io-box"><div class="io-label">输出<div class="spacer"></div><button class="btn sm" id="cp">复制</button></div>
              <textarea id="out" rows="7"></textarea></div>
          </div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn primary" id="uEnc">URL 编码</button>
            <button class="btn primary" id="uDec">URL 解码</button>
            <button class="btn" id="uEnc2">双重 URL 编码</button>
            <button class="btn" id="hEnc">HTML 实体编码</button>
            <button class="btn" id="hEncN">HTML 实体(十进制)</button>
            <button class="btn" id="hDec">HTML 解码</button>
            <button class="btn" id="unEsc">Unicode 转义</button>
            <button class="btn" id="unDeesc">Unicode 反转义</button>
            <button class="btn warn" id="auto">🔍 自动多层解码</button>
            <button class="btn sm" id="clr">清空</button>
          </div>`) +
        T.card('自动解码结果', `<div class="result" id="chain">点击上方「自动多层解码」查看解码链</div>`);
      host.appendChild(d);
      const inp = d.querySelector('#in'), out = d.querySelector('#out'), chain = d.querySelector('#chain');
      const wrap = fn => { try { out.value = fn(inp.value); } catch (e) { out.value = '错误: ' + e.message; } };
      d.querySelector('#uEnc').onclick = () => wrap(s => Codec.Url.enc(s));
      d.querySelector('#uDec').onclick = () => wrap(s => Codec.Url.dec(s));
      d.querySelector('#uEnc2').onclick = () => wrap(s => Codec.Url.doubleEnc(s));
      d.querySelector('#hEnc').onclick = () => wrap(s => Codec.Html.enc(s));
      d.querySelector('#hEncN').onclick = () => wrap(s => Codec.Html.encNum(s));
      d.querySelector('#hDec').onclick = () => wrap(s => Codec.Html.dec(s));
      d.querySelector('#unEsc').onclick = () => wrap(s => Codec.Uni.esc(s));
      d.querySelector('#unDeesc').onclick = () => wrap(s => Codec.Uni.unesc(s));
      d.querySelector('#cp').onclick = () => App.copy(out.value);
      d.querySelector('#clr').onclick = () => { inp.value = ''; out.value = ''; chain.textContent = ''; };
      d.querySelector('#auto').onclick = () => {
        let cur = inp.value, steps = [];
        const decoders = [
          ['URL 解码', s => { const r = Codec.Url.dec(s); return r !== s ? r : null; }],
          ['Base64 解码', s => { try { const r = Codec.B64.dec(s); return /^[\x00-\x7F]*$/.test(r) && r.length > 0 ? r : null; } catch (e) { return null; } }],
          ['Base32 解码', s => { try { return Codec.Base32.dec(s); } catch (e) { return null; } }],
          ['Hex 解码', s => { if (/^[0-9a-fA-F]+$/.test(s.trim()) && s.trim().length % 2 === 0) { const r = Codec.fromBytes(Codec.hexToBytes(s)); return r !== s ? r : null; } return null; }],
          ['HTML 解码', s => { const r = Codec.Html.dec(s); return r !== s ? r : null; }],
          ['Unicode 反转义', s => { const r = Codec.Uni.unesc(s); return r !== s ? r : null; }],
          ['ROT13', s => Codec.Rot.rot13(s)],
          ['Base16(Hex) 大写输入解码', s => null]
        ];
        for (let round = 0; round < 6; round++) {
          let changed = false;
          for (const [nm, fn] of decoders) {
            let r; try { r = fn(cur); } catch (e) { r = null; }
            if (r && r !== cur) { steps.push(`<div class="kv"><dt>${nm}</dt><dd>${esc(r.slice(0, 300))}</dd></div>`); cur = r; changed = true; break; }
          }
          if (!changed) break;
        }
        chain.innerHTML = steps.length ? steps.join('') : '<span style="color:var(--fg-mute)">未检测到可解码层</span>';
        out.value = cur;
      };
    }
  });

  TOOLS.push({
    id: 'enc-morse', name: '摩斯 / 培根 / 敲击', cat: 'encode', icon: '📡',
    desc: '摩斯电码、培根密码(26/24字表)、猪圈密码、银河字母、敲击码(Tap Code)',
    tags: ['Morse', 'Bacon', 'Pigpen', '敲击码'], keywords: '摩斯 morse 电报 培根 bacon 猪圈 敲击',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('摩斯电码', `<div class="note">点(.) 划(-) 分隔字母用空格，单词用 <code>/</code> 或 <code>|</code></div>
          <div class="io-grid"><div class="io-box"><div class="io-label">文本 / 电码</div><textarea id="mi" rows="5"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="mo" rows="5"></textarea></div></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="me">编码 ▶</button><button class="btn primary" id="md">◀ 解码</button>
          <button class="btn" id="md2">宽松解码(无视分隔符)</button><button class="btn ghost" id="mtab">电码表</button></div>
          <div id="mt" style="display:none;margin-top:10px"></div>`) +
        T.card('培根密码', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="bi" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="bo" rows="4"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>字符 A</label><input type="text" id="ca" value="A" style="max-width:60px">
          <label>字符 B</label><input type="text" id="cb" value="B" style="max-width:60px">
          <button class="btn primary" id="be">编码</button><button class="btn primary" id="bd">解码(26字)</button><button class="btn" id="bd24">解码(24字 I/J V/U)</button></div>
          <div class="note">提示：若密文是大小写/字体/单词长短两种形态，先用替换（如 <code>粗体→A 正常→B</code>）转成纯 AB 串再解码。</div>`) +
        T.card('猪圈 / 银河字母 / 敲击码', `
          <div class="note">猪圈密码：按共济会九宫格图形 ⟩ ∨ # 方格改写；银河字母常见于《Miner》游戏；敲击码为 5×5 方阵坐标。</div>
          <div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="pi" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="po" rows="4"></textarea></div></div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn" id="tapE">敲击码编码</button><button class="btn" id="tapD">敲击码解码</button>
            <button class="btn ghost" id="galt">查看银河字母表</button></div>
          <div id="gtab" style="display:none;margin-top:10px"></div>`);
      host.appendChild(d);
      d.querySelector('#me').onclick = () => d.querySelector('#mo').value = Codec.Morse.enc(d.querySelector('#mi').value);
      d.querySelector('#md').onclick = () => d.querySelector('#mo').value = Codec.Morse.dec(d.querySelector('#mi').value);
      d.querySelector('#md2').onclick = () => d.querySelector('#mo').value = Codec.Morse.decRaw(d.querySelector('#mi').value);
      d.querySelector('#mtab').onclick = () => {
        const el = d.querySelector('#mt'); el.style.display = el.style.display === 'none' ? 'block' : 'none';
        el.innerHTML = T.tbl(['字符', '电码', '字符', '电码'], Object.entries({
          A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
          K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
          U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---',
          3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.'
        }).reduce((rows, ent, i) => { if (i % 2 === 0) rows.push([ent[0], ent[1]]); else rows[rows.length - 1].push(ent[0], ent[1]); return rows; }, []));
      };
      d.querySelector('#be').onclick = () => {
        const a = d.querySelector('#ca').value || 'A', b = d.querySelector('#cb').value || 'B';
        d.querySelector('#bo').value = Classical.Caesar.enc && BaconWrap(d.querySelector('#bi').value, a, b);
      };
      const BaconWrap = (s, a, b) => s.toUpperCase().replace(/[A-Z]/g, c => (c.charCodeAt(0) - 65).toString(2).padStart(5, '0').replace(/0/g, a).replace(/1/g, b));
      d.querySelector('#bd').onclick = () => d.querySelector('#bo').value = Codec.Bacon.dec(d.querySelector('#bi').value, d.querySelector('#ca').value || 'A', d.querySelector('#cb').value || 'B');
      d.querySelector('#bd24').onclick = () => d.querySelector('#bo').value = Codec.Bacon.dec24(d.querySelector('#bi').value, d.querySelector('#ca').value || 'A', d.querySelector('#cb').value || 'B');
      /* 敲击码 */
      const TAP = 'ABCDEFGHIKLMNOPQRSTUVWXYZ';
      d.querySelector('#tapE').onclick = () => {
        const s = d.querySelector('#pi').value.toUpperCase().replace(/J/g, 'I');
        d.querySelector('#po').value = Array.from(s).filter(c => /[A-Z]/.test(c))
          .map(c => { const i = TAP.indexOf(c); return '.'.repeat(Math.floor(i / 5) + 1) + ' ' + '.'.repeat(i % 5 + 1); }).join('  ');
      };
      d.querySelector('#tapD').onclick = () => {
        const groups = d.querySelector('#pi').value.trim().split(/\s{2,}/);
        d.querySelector('#po').value = groups.map(g => {
          const p = g.trim().split(/\s+/);
          if (p.length !== 2) return '?';
          return TAP[(p[0].replace(/\./g, '').length - 1) * 5 + (p[1].replace(/\./g, '').length - 1)] || '?';
        }).join('');
      };
      d.querySelector('#galt').onclick = () => {
        const el = d.querySelector('#gtab'); el.style.display = el.style.display === 'none' ? 'block' : 'none';
        el.innerHTML = '<div class="note">银河字母对照（常用版）：</div><div class="result">' +
          Object.entries(Codec.GALACTIC).map(([k, v]) => k + ' → ' + v).join('　') + '</div>';
      };
    }
  });

  TOOLS.push({
    id: 'enc-bits', name: '进制与比特串', cat: 'encode', icon: '🔢',
    desc: '任意进制互转（2~36）、二进制串↔文本、十六进制↔文本、全角半角转换',
    tags: ['进制', 'Binary', 'Hex', '全角'], keywords: '进制 binary hex bits 全角 半角 二进制',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('任意进制转换', `<div class="form-row">
            <label>原进制</label><select id="from" style="max-width:120px">${[2, 8, 10, 16, 32, 36].map(b => T.opt(b, b + ' 进制')).join('')}</select>
            <label>输入值</label><input type="text" id="val" placeholder="如 255">
            <label>目标进制</label><select id="to" style="max-width:120px">${[2, 8, 10, 16, 32, 36].map(b => T.opt(b, b + ' 进制', b === 16)).join('')}</select>
            <button class="btn primary" id="go">转换</button></div>
          <div class="result" id="allr">全部常用进制结果将显示在这里</div>`) +
        T.card('比特串 ↔ 文本', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="bi" rows="5" placeholder="二进制串 或 十六进制 或 文本"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="bo" rows="5"></textarea></div></div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn primary" id="tb">文本→比特</button>
            <button class="btn primary" id="bt">比特→文本</button>
            <button class="btn" id="th">文本→Hex</button>
            <button class="btn" id="ht">Hex→文本</button>
            <button class="btn" id="th8">文本→8位反转(面试/VRM题)</button></div>
          <div class="form-row" style="margin-top:8px"><label>比特位宽</label><select id="w" style="max-width:120px">
            ${T.opt(8, '8 位')}${T.opt(7, '7 位')}${T.opt(6, '6 位')}${T.opt(5, '5 位')}</select>
            <span class="tag">密文非 8 的倍数时改用 5/6/7 位</span></div>`) +
        T.card('全角 / 半角 / 大小写', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="wi" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="wo" rows="4"></textarea></div></div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn" id="f2h">全角→半角</button><button class="btn" id="h2f">半角→全角</button>
            <button class="btn" id="up">转大写</button><button class="btn" id="low">转小写</button>
            <button class="btn" id="rev">反转字符串</button></div>`);
      host.appendChild(d);
      d.querySelector('#go').onclick = () => {
        try {
          const r = Misc.Radix.convert(d.querySelector('#val').value, d.querySelector('#from').value, d.querySelector('#to').value);
          const all = Misc.Radix.toAll(d.querySelector('#val').value, d.querySelector('#from').value);
          d.querySelector('#allr').innerHTML = `<div class="kv">
            <dt>转换结果 (${d.querySelector('#to').value})</dt><dd><b style="color:var(--accent)">${esc(r)}</b></dd>
            ${Object.entries(all).map(([b, v]) => `<dt>${b} 进制</dt><dd>${esc(v)}</dd>`).join('')}</div>`;
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#tb').onclick = () => d.querySelector('#bo').value = Codec.Bits.enc(d.querySelector('#bi').value);
      d.querySelector('#bt').onclick = () => {
        try { d.querySelector('#bo').value = Codec.Bits.dec(d.querySelector('#bi').value, d.querySelector('#w').value); }
        catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#th').onclick = () => d.querySelector('#bo').value = Codec.Base16.enc(d.querySelector('#bi').value);
      d.querySelector('#ht').onclick = () => {
        try { d.querySelector('#bo').value = Codec.fromBytes(Codec.hexToBytes(d.querySelector('#bi').value)); }
        catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#th8').onclick = () => {
        const bits = Codec.Bits.enc(d.querySelector('#bi').value);
        d.querySelector('#bo').value = Codec.Bits.dec(bits, 'off');
      };
      d.querySelector('#f2h').onclick = () => d.querySelector('#wo').value = Codec.Wide.toHalf(d.querySelector('#wi').value);
      d.querySelector('#h2f').onclick = () => d.querySelector('#wo').value = Codec.Wide.toFull(d.querySelector('#wi').value);
      d.querySelector('#up').onclick = () => d.querySelector('#wo').value = d.querySelector('#wi').value.toUpperCase();
      d.querySelector('#low').onclick = () => d.querySelector('#wo').value = d.querySelector('#wi').value.toLowerCase();
      d.querySelector('#rev').onclick = () => d.querySelector('#wo').value = [...d.querySelector('#wi').value].reverse().join('');
    }
  });

  /* ============================ 古典密码 ============================ */
  TOOLS.push({
    id: 'cls-caesar', name: '凯撒 / ROT 穷举', cat: 'classical', icon: '🔄',
    desc: '凯撒移位加解密、ROT13/47/5、全部 25 种偏移穷举并按英文拟合度排序',
    tags: ['Caesar', 'ROT13', 'ROT47', '穷举'], keywords: '凯撒 caesar rot13 rot47 移位 穷举',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('加解密', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="ci" rows="5"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="co" rows="5"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>偏移量</label><input type="number" id="k" value="3" style="max-width:90px">
          <button class="btn primary" id="encEnc">加密 ▶</button><button class="btn primary" id="dec">◀ 解密</button>
          <button class="btn" id="r13">ROT13</button><button class="btn" id="r47">ROT47</button><button class="btn" id="r5">ROT5</button>
          <label class="chk"><input type="checkbox" id="keep" checked> 保留非字母</label></div>`) +
        T.card('25 种偏移穷举（χ² 越小越可能是明文）', `<div class="btn-row" style="margin-bottom:10px"><button class="btn primary" id="bf">开始穷举</button></div><div id="br"></div>`);
      host.appendChild(d);
      const inp = d.querySelector('#ci'), out = d.querySelector('#co');
      const kVal = () => parseInt(d.querySelector('#k').value) || 0;
      d.querySelector('#encEnc').onclick = () => out.value = Classical.Caesar.enc(inp.value, kVal());
      d.querySelector('#dec').onclick = () => out.value = Classical.Caesar.dec(inp.value, kVal());
      d.querySelector('#r13').onclick = () => out.value = Codec.Rot.rot13(inp.value);
      d.querySelector('#r47').onclick = () => out.value = Codec.Rot.rot47(inp.value);
      d.querySelector('#r5').onclick = () => out.value = Codec.Rot.rot5(inp.value);
      d.querySelector('#bf').onclick = () => {
        const rows = Classical.Caesar.brute(inp.value).map(r => [r.k, esc(r.text.slice(0, 90)), r.chi]);
        d.querySelector('#br').innerHTML = T.tbl(['偏移', '明文预览', 'χ²'], rows);
      };
    }
  });

  TOOLS.push({
    id: 'cls-vigenere', name: '维吉尼亚（含自动破译）', cat: 'classical', icon: '🗝️',
    desc: '维吉尼亚加解密 + IC 推断密钥长度 + χ² 自动破译；另含 Beaufort / Autokey 体制',
    tags: ['Vigenère', 'IC', 'χ²', 'Beaufort', 'Autokey'], keywords: '维吉尼亚 vigenere 密钥 破译 beaufort autokey',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('加解密', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="vi" rows="5"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="vo" rows="5"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>密钥</label><input type="text" id="vk" placeholder="KEY" style="max-width:150px">
          <label>体制</label><select id="scheme" style="max-width:150px">${T.opt('vig', '维吉尼亚')}${T.opt('beau', 'Beaufort')}${T.opt('auto', 'Autokey')}</select>
          <button class="btn primary" id="e">加密</button><button class="btn primary" id="dd">解密</button></div>`) +
        T.card('🔍 自动破译（无需密钥）', `<div class="note">原理：重合指数 IC 推断密钥长度 → 对每列做 χ² 频率分析 → 用英文单词/双字母得分挑最优。</div>
          <div class="btn-row"><button class="btn primary" id="crack">开始自动破译</button><button class="btn" id="lenAna">仅分析可能的密钥长度</button></div>
          <div id="cr" style="margin-top:10px"></div>`);
      host.appendChild(d);
      const inp = d.querySelector('#vi'), out = d.querySelector('#vo'), key = d.querySelector('#vk');
      const scheme = d.querySelector('#scheme');
      d.querySelector('#e').onclick = () => {
        try {
          const s = scheme.value;
          out.value = s === 'vig' ? Classical.Vigenere.enc(inp.value, key.value)
            : s === 'beau' ? Classical.Beaufort.enc(inp.value, key.value) : Classical.Autokey.enc(inp.value, key.value);
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#dd').onclick = () => {
        try {
          const s = scheme.value;
          out.value = s === 'vig' ? Classical.Vigenere.dec(inp.value, key.value)
            : s === 'beau' ? Classical.Beaufort.dec(inp.value, key.value) : Classical.Autokey.dec(inp.value, key.value);
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#crack').onclick = () => {
        try {
          const r = Classical.Vigenere.crack(inp.value);
          d.querySelector('#cr').innerHTML = `<div class="result ok">
            <div class="kv"><dt>推断密钥</dt><dd><b style="color:var(--accent);font-size:14px">${esc(r.key)}</b>（长度 ${r.len}）</dd>
            <dt>评分</dt><dd>${r.score}</dd></div></div>
            <div style="margin-top:10px"><div class="io-label">明文</div><textarea rows="6" id="pt">${esc(r.plain)}</textarea>
            <div class="btn-row" style="margin-top:8px"><button class="btn sm" id="useK">用该密钥填入上方</button></div></div>`;
          key.value = r.key;
          const uk = d.querySelector('#useK'); if (uk) uk.onclick = () => { key.value = r.key; App.toast('密钥已填入', 'ok'); };
        } catch (e) { d.querySelector('#cr').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
      d.querySelector('#lenAna').onclick = () => {
        const rows = Classical.Vigenere.keyLens(inp.value).slice(0, 10)
          .map(r => [r.len, r.ic, (Math.abs(r.ic - 0.0667) < 0.008 ? '✅ 接近英文(0.0667)' : '')]);
        d.querySelector('#cr').innerHTML = T.tbl(['密钥长度', '平均 IC', '判断'], rows);
      };
    }
  });

  TOOLS.push({
    id: 'cls-trans', name: '栅栏 / 列移位（含暴力）', cat: 'classical', icon: '📊',
    desc: '栅栏密码(W型与Z型)、列移位换位，支持穷举所有栏数并按 χ² 排序',
    tags: ['Railfence', 'Columnar', '换位'], keywords: '栅栏 rail fence 列移位 columnar 换位 穷举',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('栅栏密码', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="ri" rows="5"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="ro" rows="5"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>栏数</label><input type="number" id="rk" value="2" style="max-width:90px">
          <button class="btn primary" id="re">Z型加密</button><button class="btn primary" id="rd">Z型解密</button>
          <button class="btn" id="we">W型(按行)</button><button class="btn warn" id="rb">穷举所有栏数</button></div>
          <div id="rr" style="margin-top:10px"></div>`) +
        T.card('列移位换位', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="li" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="lo" rows="4"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>密钥词</label><input type="text" id="lk" value="KEY" style="max-width:130px">
          <button class="btn primary" id="le">加密</button><button class="btn primary" id="ld">解密</button></div>
          <div class="note">密钥词字母表序决定列读取顺序，重复字母按出现次序稳定排序。</div>`);
      host.appendChild(d);
      const ri = d.querySelector('#ri'), ro = d.querySelector('#ro');
      d.querySelector('#re').onclick = () => ro.value = Classical.Railfence.enc(ri.value, +d.querySelector('#rk').value);
      d.querySelector('#rd').onclick = () => ro.value = Classical.Railfence.dec(ri.value, +d.querySelector('#rk').value);
      d.querySelector('#we').onclick = () => ro.value = Classical.Railfence.wtype(ri.value, +d.querySelector('#rk').value);
      d.querySelector('#rb').onclick = () => {
        const rows = Classical.Railfence.brute(ri.value, 20).map(r => [r.rails, esc(r.text.slice(0, 80)), r.chi]);
        d.querySelector('#rr').innerHTML = T.tbl(['栏数', '明文预览', 'χ²'], rows);
      };
      d.querySelector('#le').onclick = () => d.querySelector('#lo').value = Classical.Columnar.enc(d.querySelector('#li').value, d.querySelector('#lk').value);
      d.querySelector('#ld').onclick = () => d.querySelector('#lo').value = Classical.Columnar.dec(d.querySelector('#li').value, d.querySelector('#lk').value);
    }
  });

  TOOLS.push({
    id: 'cls-sub', name: '替换 / Playfair / 自动破解', cat: 'classical', icon: '🎭',
    desc: '简单替换 + 爬山法全自动破译、Playfair、Polybius、ADFGX 密码',
    tags: ['Substitution', 'Playfair', 'Polybius', 'Hill-Climb'], keywords: '替换 substitution playfair 爬山 自动破译 adfgx polybius',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('🔓 简单替换自动破译（爬山法）', `<div class="note">仅需密文即可。原理：随机交换密钥 + 英文四/二元频率评分爬山。建议密文 ≥ 30 字母，越长越准。</div>
          <div class="io-grid"><div class="io-box"><div class="io-label">密文</div><textarea id="si" rows="4" placeholder="粘贴密文…"></textarea></div>
          <div class="io-box"><div class="io-label">推断明文</div><textarea id="so" rows="4"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>迭代</label><input type="number" id="it" value="6000" style="max-width:110px">
          <button class="btn primary" id="cr">开始破解（可多点几次取最佳）</button><span class="tag">若结果不佳，调高迭代或多次运行</span></div>
          <div id="smap" style="margin-top:10px"></div>`) +
        T.card('Playfair 密码', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="pi" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="po" rows="4"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>密钥</label><input type="text" id="pk" value="PLAYFAIR" style="max-width:160px">
          <button class="btn primary" id="pe">加密</button><button class="btn primary" id="pd">解密</button>
          <span class="tag">I/J 合并，重复字母插入 X</span></div>`) +
        T.card('Polybius / ADFGX', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="yi" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="yo" rows="4"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>密钥</label><input type="text" id="yk" value="KEY" style="max-width:140px">
          <button class="btn" id="ye">Polybius 加密</button><button class="btn" id="yd">Polybius 解密</button>
          <button class="btn" id="ae">ADFGX 加密</button></div>
          <div class="note">Polybius 输出 11~55 成对数字；ADFGX 需自行解密（可用 <code>cryptii.com</code> 或线下 —— 本面板持续增强中）。</div>`);
      host.appendChild(d);
      d.querySelector('#cr').onclick = () => {
        try {
          const r = Classical.Substitution.crack(d.querySelector('#si').value, +d.querySelector('#it').value);
          d.querySelector('#so').value = r.plain;
          d.querySelector('#smap').innerHTML = '<div class="io-label">推断密钥映射（密文→明文）</div><div class="result">' +
            Object.entries(r.map).map(([c, p]) => c + '→' + p).join('　') + '</div>';
          App.toast('破解完成，评分 ' + r.score, 'ok');
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#pe').onclick = () => d.querySelector('#po').value = Classical.Playfair.enc(d.querySelector('#pi').value, d.querySelector('#pk').value);
      d.querySelector('#pd').onclick = () => d.querySelector('#po').value = Classical.Playfair.dec(d.querySelector('#pi').value, d.querySelector('#pk').value);
      d.querySelector('#ye').onclick = () => d.querySelector('#yo').value = Classical.Polybius.enc(d.querySelector('#yi').value, d.querySelector('#yk').value);
      d.querySelector('#yd').onclick = () => d.querySelector('#yo').value = Classical.Polybius.dec(d.querySelector('#yi').value, d.querySelector('#yk').value);
      d.querySelector('#ae').onclick = () => {
        try { d.querySelector('#yo').value = Classical.ADFGX.enc(d.querySelector('#yi').value, d.querySelector('#yk').value, true); }
        catch (e) { App.toast(e.message, 'err'); }
      };
    }
  });

  TOOLS.push({
    id: 'cls-affine', name: '仿射 / Atbash / 暴力', cat: 'classical', icon: '🧮',
    desc: '仿射密码加解密（自动求逆元），Atbash 反字母表，含 312 种密钥全程穷举',
    tags: ['Affine', 'Atbash', '逆元'], keywords: '仿射 affine atbash 乘法逆元 穷举',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('仿射密码', `<div class="note">加密 <code>C = (a·P + b) mod 26</code>，要求 a 与 26 互素（合法 a：1,3,5,7,9,11,15,17,19,21,23,25）。</div>
          <div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="ai" rows="4"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="ao" rows="4"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>a</label><input type="number" id="aa" value="5" style="max-width:80px">
          <label>b</label><input type="number" id="ab" value="8" style="max-width:80px">
          <button class="btn primary" id="ae">加密</button><button class="btn primary" id="ad">解密</button>
          <button class="btn warn" id="bf">穷举 (a,b)</button></div><div id="ar" style="margin-top:10px"></div>`) +
        T.card('Atbash 反字母表', `<div class="io-grid"><div class="io-box"><div class="io-label">输入</div><textarea id="ti" rows="3"></textarea></div>
          <div class="io-box"><div class="io-label">A↔Z 映射结果</div><textarea id="to" rows="3"></textarea></div></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="tb">转换</button></div>`);
      host.appendChild(d);
      const ai = d.querySelector('#ai'), ao = d.querySelector('#ao');
      d.querySelector('#ae').onclick = () => {
        try { ao.value = Classical.Affine.enc(ai.value, +d.querySelector('#aa').value, +d.querySelector('#ab').value); }
        catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#ad').onclick = () => {
        try { ao.value = Classical.Affine.dec(ai.value, +d.querySelector('#aa').value, +d.querySelector('#ab').value); }
        catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#bf').onclick = () => {
        const rows = Classical.Affine.brute(ai.value).map(r => [r.a, r.b, esc(r.text.slice(0, 70)), r.chi]);
        d.querySelector('#ar').innerHTML = T.tbl(['a', 'b', '明文预览', 'χ²'], rows);
      };
      d.querySelector('#tb').onclick = () => d.querySelector('#to').value = Classical.Atbash(d.querySelector('#ti').value);
    }
  });

  TOOLS.push({
    id: 'xor-kit', name: 'XOR 工具箱', cat: 'classical', icon: '⊕',
    desc: '单字节/重复密钥异或、单字节爆破优选排序、已知明文头推密钥、Hex/文本互转',
    tags: ['XOR', '单字节爆破', '已知明文'], keywords: 'xor 异或 单字节 爆破 已知明文 hex',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('异或加解密', `<div class="io-grid"><div class="io-box"><div class="io-label">输入（支持 0x/纯 Hex 或文本）</div><textarea id="xi" rows="5" placeholder="例如：1a2b3c 或 hello"></textarea></div>
          <div class="io-box"><div class="io-label">结果</div><textarea id="xo" rows="5"></textarea></div></div>
          <div class="form-row" style="margin-top:10px"><label>密钥</label><input type="text" id="xk" placeholder="密钥字符或十六进制" style="max-width:180px">
          <button class="btn primary" id="go">异或</button>
          <button class="btn" id="toHex">输入转 Hex</button><button class="btn" id="toTxt">结果转文本</button></div>
          <div class="note">输入若符合十六进制特征会自动按字节处理，否则按文本字符处理。</div>`) +
        T.card('🔓 单字节爆破', `<div class="btn-row"><button class="btn primary" id="bf">爆破单字节密钥（按英文拟合度排序）</button></div>
          <div id="xr" style="margin-top:10px"></div>`) +
        T.card('已知明文推密钥', `<div class="form-row"><label>密文(Hex)</label><input type="text" id="gk1" placeholder="3a2b1c..." style="flex:2">
          <label>已知明文</label><input type="text" id="gk2" value="flag{" style="max-width:120px">
          <button class="btn primary" id="gkk">推断密钥</button></div>
          <div class="result" id="gov">—</div>`);
      host.appendChild(d);
      const isHex = s => /^(0x)?[0-9a-fA-F\s]+$/.test(s.trim()) && s.replace(/[\s0x]/g, '').length > 0 && s.replace(/[\s]/g, '').length % 2 === 0;
      d.querySelector('#go').onclick = () => {
        try {
          const inh = isHex(d.querySelector('#xi').value);
          d.querySelector('#xo').value = Classical.XorKits.repeat(d.querySelector('#xi').value, d.querySelector('#xk').value)
            && Classical.XorKits.repeatHex(d.querySelector('#xi').value, d.querySelector('#xk').value);
          App.toast(inh ? '按十六进制字节处理' : '按文本处理', 'ok');
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#toHex').onclick = () => {
        const v = d.querySelector('#xi').value;
        d.querySelector('#xo').value = isHex(v) ? Codec.fromBytes(Codec.hexToBytes(v)) : Codec.Base16.enc(v);
      };
      d.querySelector('#toTxt').onclick = () => {
        const v = d.querySelector('#xo').value;
        d.querySelector('#xo').value = isHex(v) ? Codec.fromBytes(Codec.hexToBytes(v)) : v;
      };
      d.querySelector('#bf').onclick = () => {
        const rows = Classical.XorKits.bruteSingle(d.querySelector('#xi').value, isHex(d.querySelector('#xi').value))
          .map(r => ['0x' + r.key.toString(16).padStart(2, '0'), esc(String.fromCharCode(r.key).replace(/[^\x20-\x7e]/g, '.')), esc(r.text.slice(0, 70))]);
        d.querySelector('#xr').innerHTML = T.tbl(['密钥', '字符', '解码结果'], rows);
      };
      d.querySelector('#gkk').onclick = () => {
        try {
          const k = Classical.XorKits.guessKey(d.querySelector('#gk1').value, d.querySelector('#gk2').value);
          d.querySelector('#gov').innerHTML = `<div class="kv"><dt>推断密钥</dt><dd><b>${esc(k)}</b></dd>
            <dt>密钥 Hex</dt><dd>${Codec.Base16.enc(k)}</dd></div>`;
        } catch (e) { App.toast(e.message, 'err'); }
      };
    }
  });

  /* ============================ 现代密码 ============================ */
  TOOLS.push({
    id: 'hash-lab', name: '哈希实验室', cat: 'crypto', icon: '#️⃣',
    desc: 'MD5 / SHA1 / SHA256 / SHA512 / SM3(国密) / NTLM / CRC32 / HMAC — 全部本地计算',
    tags: ['MD5', 'SHA', 'SM3', 'NTLM', 'CRC32', '国密'], keywords: '哈希 md5 sha256 sm3 国密 ntlm crc32 hmac',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('<b>为什么要有离线哈希：</b>比赛常断网，且在线查询会外传数据。<b>SM3</b> 是国产商用密码杂凑算法，海丰杯「国产商用密码」考点明确要求掌握。') +
        T.card('计算摘要', `<div class="io-box"><div class="io-label">输入文本</div><textarea id="hi" rows="4" placeholder="输入待哈希内容…"></textarea></div>
          <div class="form-row" style="margin-top:10px">
            <label>编码</label><select id="hm" style="max-width:150px">${T.opt('utf8', 'UTF-8')}${T.opt('hex', '十六进制解析')}</select>
            <label>HMAC 密钥</label><input type="text" id="hkey" placeholder="可选" style="max-width:160px">
            <button class="btn primary" id="hg">计算全部摘要</button></div>
          <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>算法</th><th>结果</th><th></th></tr></thead><tbody id="hb"></tbody></table></div>`) +
        T.card('彩虹表 / 明文反查建议', `<div class="result">
          <b>本地破解：</b><br>
          <code>hashcat -m 0 -a 0 hash.txt rockyou.txt</code>  (MD5)<br>
          <code>hashcat -m 1000 -a 0 ntlm.txt rockyou.txt</code>  (NTLM)<br>
          <code>hashcat -m 16500 -a 0 jwt.txt rockyou.txt</code>  (JWT HS256)<br>
          <code>john --wordlist=rockyou.txt hash.txt</code><br><br>
          <b>哈希长度扩展攻击</b>（常见于 <code>secret + data</code> 的 MD5/SHA1 校验场景）：
          <code>hashpump -s &lt;原签名&gt; --data &lt;数据&gt; -s &lt;追加&gt; -k &lt;密钥长度&gt;</code><br><br>
          <b>在线（注意不要提交敏感数据）：</b> cmd5.com / hashes.com
        </div>`);
      host.appendChild(d);
      const inp = d.querySelector('#hi');
      d.querySelector('#hg').onclick = async () => {
        let bytes;
        let s = inp.value;
        if (d.querySelector('#hm').value === 'hex') bytes = Codec.hexToBytes(s);
        else bytes = Codec.toBytes(s);
        const hkey = d.querySelector('#hkey').value;
        const rows = [];
        const add = (n, v) => rows.push(`<tr><td>${n}</td><td style="font-size:11.5px">${v}</td><td><button class="btn sm" data-c="${v}">复制</button></td></tr>`);
        add('MD5', Digest.md5(bytes));
        add('NTLM (MD4/UTF16LE)', Digest.md4(utf16leBytes(s)));
        add('SM3 (国密)', Digest.sm3(bytes));
        add('CRC32', Digest.CRC32.std(bytes));
        add('SHA-1', await Digest.subtleDigest('SHA-1', bytes));
        add('SHA-256', await Digest.subtleDigest('SHA-256', bytes));
        add('SHA-384', await Digest.subtleDigest('SHA-384', bytes));
        add('SHA-512', await Digest.subtleDigest('SHA-512', bytes));
        if (hkey) {
          const kb = Codec.toBytes(hkey);
          add('HMAC-MD5', Digest.md5(Codec.toBytes('')).length && md5hmac(kb, bytes));
          add('HMAC-SM3', Digest.sm3hmac(kb, bytes));
          add('HMAC-SHA256', await Digest.subtleHmac('SHA-256', kb, bytes));
        }
        d.querySelector('#hb').innerHTML = rows.join('');
        d.querySelectorAll('#hb [data-c]').forEach(b => b.onclick = () => App.copy(b.dataset.c));
        App.toast('计算完成', 'ok');
      };
      /* MD5-HMAC 手写 */
      function md5hmac(key, msg) {
        const B = 64;
        if (key.length > B) key = Codec.hexToBytes(Digest.md5(key));
        const pad = new Uint8Array(B); pad.set(key);
        const ipad = new Uint8Array(B), opad = new Uint8Array(B);
        for (let i = 0; i < B; i++) { ipad[i] = pad[i] ^ 0x36; opad[i] = pad[i] ^ 0x5c; }
        const inner = new Uint8Array(B + msg.length); inner.set(ipad); inner.set(msg, B);
        const h = Codec.hexToBytes(Digest.md5(inner));
        const outer = new Uint8Array(B + 16); outer.set(opad); outer.set(h, B);
        return Digest.md5(outer);
      }
    }
  });

  TOOLS.push({
    id: 'sym-crypto', name: '对称加密 (AES/RC4/SM4)', cat: 'crypto', icon: '🔐',
    desc: 'AES-CBC/CTR/GCM、RC4、国密 SM4 加解密，支持 Hex / Base64 / 文本三种出入格式',
    tags: ['AES', 'RC4', 'SM4', '国密', '对称'], keywords: 'aes rc4 sm4 国密 对称 加密 解密 cbc gcm',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('密钥长度：SM4 / AES-128 需 <b>16 字节</b>，AES-192 需 24，AES-256 需 32。<b>SM4</b> 为国产分组算法（分组/密钥均 128 位），海丰杯国密考点常见。') +
        T.card('加解密操作', `
          <div class="form-row">
            <label>算法</label><select id="alg" style="max-width:130px">${T.opt('sm4', 'SM4 (国密)')}${T.opt('aes', 'AES')}${T.opt('rc4', 'RC4')}</select>
            <label>模式</label><select id="mode" style="max-width:110px">${T.opt('ECB', 'ECB')}${T.opt('CBC', 'CBC', true)}${T.opt('CTR', 'CTR')}${T.opt('GCM', 'GCM')}</select>
            <label>输入格式</label><select id="ifm" style="max-width:110px">${T.opt('text', '文本')}${T.opt('hex', 'Hex')}${T.opt('b64', 'Base64')}</select>
            <label>输出格式</label><select id="ofm" style="max-width:110px">${T.opt('hex', 'Hex')}${T.opt('b64', 'Base64')}${T.opt('text', '文本')}</select>
          </div>
          <div class="form-row">
            <label>密钥</label><input type="text" id="key" placeholder="密钥，可用 hex: 或 b64: 前缀" style="flex:2">
            <label>IV</label><input type="text" id="iv" placeholder="CBC/CTR/GCM 需要" style="flex:1">
          </div>
          <div class="io-grid"><div class="io-box"><div class="io-label">明文 / 密文</div><textarea id="in" rows="6"></textarea></div>
            <div class="io-box"><div class="io-label">结果<div class="spacer"></div><button class="btn sm" id="cp">复制</button></div><textarea id="out" rows="6"></textarea></div></div>
          <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="enc">加密 ▶</button><button class="btn primary" id="dec">◀ 解密</button>
            <button class="btn sm" id="randKey">随机 16 字节密钥</button><button class="btn sm" id="randIv">随机 IV</button></div>`) +
        T.card('常见对称加密排查思路', `<div class="result">
          • 源码里找 <code>mcrypt_encrypt</code> / <code>openssl_encrypt</code> / <code>Crypto.Cipher.AES.new</code><br>
          • 密钥可能在注释、日志、图片元数据、另一个文件里<br>
          • ECB 模式特征：相同明文块密文相同 → 可用 ECB 企鹅图判断<br>
          • CBC 字节翻转：修改前一块 ciphertext 可控制明文，适合绕过加密参数<br>
          • Padding Oracle：观察报错差异逐字节解密（padbuster / PaddingOracleExploit）<br>
          • IV 可预测或被复用 → XOR 两张密文可还原明文关系
        </div>`);
      host.appendChild(d);
      const parseBytes = (s) => {
        s = s.trim();
        if (/^hex:/i.test(s)) s = s.slice(4);
        if (/^b64:/i.test(s)) return Codec.b64ToBytes(s.slice(4));
        if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0 && s.length >= 8) return Codec.hexToBytes(s);
        return Codec.toBytes(s);
      };
      const fmtOut = bytes => {
        const f = d.querySelector('#ofm').value;
        let s = ''; for (const b of bytes) s += String.fromCharCode(b);
        return f === 'hex' ? Codec.bytesToHex(bytes) : f === 'b64' ? btoa(s) : s;
      };
      const parseIn = () => {
        const f = d.querySelector('#ifm').value, v = d.querySelector('#in').value;
        if (f === 'hex') return Codec.hexToBytes(v);
        if (f === 'b64') return Codec.b64ToBytes(v.replace(/\s/g, ''));
        return Codec.toBytes(v);
      };
      const doOp = async (enc) => {
        const alg = d.querySelector('#alg').value, mode = d.querySelector('#mode').value;
        const keyB = parseBytes(d.querySelector('#key').value), data = parseIn();
        let ivB = parseBytes(d.querySelector('#iv').value || '');
        const out = d.querySelector('#out');
        try {
          if (alg === 'rc4') {
            if (!keyB.length) throw new Error('RC4 需要密钥');
            out.value = fmtOut(Digest.rc4(keyB, data));
          } else if (alg === 'sm4') {
            if (keyB.length !== 16) throw new Error('SM4 密钥必须 16 字节（当前 ' + keyB.length + '）');
            if (mode === 'CBC') {
              if (ivB.length !== 16) throw new Error('CBC 需 16 字节 IV');
              out.value = fmtOut(enc ? Digest.SM4.cbcEnc(keyB, data, ivB) : Digest.SM4.cbcDec(keyB, data, ivB));
            } else {
              out.value = fmtOut(enc ? Digest.SM4.ecbEnc(keyB, data) : Digest.SM4.ecbDec(keyB, data));
            }
          } else {
            if (![16, 24, 32].includes(keyB.length)) throw new Error('AES 密钥需 16/24/32 字节');
            if (mode !== 'ECB' && ivB.length !== 16) throw new Error(mode + ' 模式需 16 字节 IV');
            let input = data;
            if (enc) input = mode === 'GCM' || mode === 'CTR' ? data : Digest.pkcs7(data);
            const res = await Digest.aesOp(mode, keyB, input, ivB.length === 16 ? ivB : new Uint8Array(16), enc);
            if (!enc && (mode === 'CBC')) {
              try { out.value = fmtOut(Digest.unpkcs7(res)); } catch (e) { out.value = fmtOut(res); App.toast('填充校验失败，直接输出原始结果', 'warn'); }
            } else out.value = fmtOut(res);
          }
          App.toast('完成', 'ok');
        } catch (e) { out.value = '错误: ' + e.message; App.toast(e.message, 'err'); }
      };
      d.querySelector('#enc').onclick = () => doOp(true);
      d.querySelector('#dec').onclick = () => doOp(false);
      d.querySelector('#cp').onclick = () => App.copy(d.querySelector('#out').value);
      d.querySelector('#randKey').onclick = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); d.querySelector('#key').value = Codec.bytesToHex(b); };
      d.querySelector('#randIv').onclick = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); d.querySelector('#iv').value = Codec.bytesToHex(b); };
    }
  });

  TOOLS.push({
    id: 'rsa-lab', name: 'RSA 密码分析', cat: 'crypto', icon: '🔑', badge: '核心',
    desc: 'PEM 解析提取 n/e、小模数分解、共模攻击、广播攻击、Wiener、d 泄漏、批量 GCD',
    tags: ['RSA', 'PEM', 'Wiener', '共模', '广播'], keywords: 'rsa pem 公钥 分解 wiener 共模 广播 欧拉 phi',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('所有运算使用原生 BigInt 在本机完成，<b>不会上传到任何服务器</b>。n 超过 128 位左右建议改用 <code>factordb.com</code> 或本地 yafu/sage。') +
        T.card('① PEM / 公钥解析', `<div class="io-box"><div class="io-label">粘贴 pem 公钥（-----BEGIN PUBLIC KEY-----）</div><textarea id="pem" rows="5"></textarea></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="pp">解析出 n / e</button></div><div id="ppr" style="margin-top:10px"></div>`) +
        T.card('② 已知 p、q（或仅 p）解密', `<div class="form-row">
            <label>n</label><input type="text" id="n" placeholder="十进制或十六进制" style="flex:2">
            <label>e</label><input type="text" id="e" value="65537" style="max-width:110px">
            <label>c</label><input type="text" id="c" placeholder="密文，十进制" style="flex:1"></div>
          <div class="form-row"><label>p</label><input type="text" id="p" style="flex:1"><label>q</label><input type="text" id="q" placeholder="可留空自动计算 n/p" style="flex:1">
            <button class="btn primary" id="dec">解密</button></div><div id="dr" style="margin-top:10px"></div>`) +
        T.card('③ 分解 n（小素因子）', `<div class="form-row"><label>n</label><input type="text" id="fn" style="flex:2">
          <select id="fmethod" style="max-width:150px">${T.opt('rho', 'Pollard Rho + 试除')}${T.opt('fermat', 'Fermat (p≈q)')}</select>
          <button class="btn primary" id="fgo">分解</button></div>
          <div class="form-row"><label>多个 n（每行一个）</label><textarea id="mns" rows="3" placeholder="用于批量 GCD 共素数检测"></textarea>
          <button class="btn warn" id="gcd">批量 GCD 检测</button></div>
          <div id="fr" style="margin-top:10px"></div>`) +
        T.card('④ 攻击：Wiener / 泄漏 d / 共模 / 广播', `
          <div class="split">
            <div><div class="io-label"><b>Wiener 攻击</b>（e 很大时）</div>
              <div class="form-row"><input type="text" id="wn" placeholder="n" style="flex:2"><input type="text" id="we" placeholder="e" style="flex:1">
              <button class="btn primary" id="wgo">攻击</button></div><div id="wr"></div></div>
            <div><div class="io-label"><b>已知 n, e, d 求 p, q</b></div>
              <div class="form-row"><input type="text" id="dn" placeholder="n" style="flex:2"><input type="text" id="de" placeholder="e" style="flex:1"><input type="text" id="dd" placeholder="d" style="flex:1">
              <button class="btn primary" id="dgo">求因数</button></div><div id="der"></div></div>
          </div>
          <div style="margin-top:14px"><div class="io-label"><b>共模攻击</b>（同一 n，两个互素 e）</div>
            <div class="form-row"><input type="text" id="cn" placeholder="n" style="flex:2"><input type="text" id="ce1" placeholder="e1" style="flex:1"><input type="text" id="ce2" placeholder="e2" style="flex:1">
            <input type="text" id="cc1" placeholder="c1" style="flex:1"><input type="text" id="cc2" placeholder="c2" style="flex:1">
            <button class="btn primary" id="cgo">攻击</button></div><div id="cr"></div></div>
          <div style="margin-top:14px"><div class="io-label"><b>广播攻击</b>（同一明文，小 e，多组不同 n）</div>
            <div class="io-box"><div class="io-label">每行一组：n, e, c（逗号或空格分隔）</div><textarea id="brd" rows="3" placeholder="n1 e1 c1\nn2 e2 c2\nn3 e3 c3"></textarea></div>
            <div class="btn-row" style="margin-top:8px"><button class="btn primary" id="bgo">攻击</button></div><div id="brdr"></div></div>`);
      host.appendChild(d);
      const show = (box, kv) => box.innerHTML = '<div class="result ok"><div class="kv">' +
        Object.entries(kv).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</div></div>';
      d.querySelector('#pp').onclick = () => {
        try {
          const r = RSAkit.parsePublicKey(d.querySelector('#pem').value);
          show(d.querySelector('#ppr'), {
            'n (十进制)': r.n.toString(),
            'n (Hex)': '0x' + r.n.toString(16),
            'n 位数': r.bits + ' bit',
            'e': r.e.toString() + (r.e === 65537n ? ' (0x10001)' : ''),
            '全部 INTEGER': (r.all || []).slice(0, 6).map(x => x.toString().slice(0, 40) + '…').join('<br>')
          });
          d.querySelector('#fn').value = r.n.toString();
          d.querySelector('#n').value = r.n.toString();
          d.querySelector('#e').value = r.e.toString();
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#dec').onclick = () => {
        try {
          const n = RSAkit.parseBig(d.querySelector('#n').value), e = RSAkit.parseBig(d.querySelector('#e').value),
            c = RSAkit.parseBig(d.querySelector('#c').value);
          let p = d.querySelector('#p').value.trim() ? RSAkit.parseBig(d.querySelector('#p').value) : null;
          let q = d.querySelector('#q').value.trim() ? RSAkit.parseBig(d.querySelector('#q').value) : null;
          if (p && !q) q = n / p;
          if (!p && q) p = n / q;
          if (!p) throw new Error('需要 p 或 q');
          const r = RSAkit.decryptFromPQ(n, e, c, p, q);
          if (r.partial) {
            show(d.querySelector('#dr'), {
              '状态': '⚠️ e 与 φ(n) 不互素，无法直接求逆元',
              'p': r.p.toString(), 'q': r.q.toString(),
              'φ(n)': r.phi.toString(),
              '建议': '改用共模攻击或多解枚举脚本（SageMath: m^g ≡ c mod n 后开 g 次根）'
            });
            return;
          }
          show(d.querySelector('#dr'), {
            'p': r.p.toString(), 'q': r.q.toString(),
            'd': r.d ? r.d.toString() : '—',
            '明文整数 m': r.m.toString(),
            '明文 ASCII': '<b style="color:var(--accent)">' + esc(RSAkit.intToText(r.m)) + '</b>'
          });
        } catch (e) { d.querySelector('#dr').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
      d.querySelector('#fgo').onclick = () => {
        try {
          const n = RSAkit.parseBig(d.querySelector('#fn').value);
          const t0 = performance.now();
          const [p, q] = d.querySelector('#fmethod').value === 'fermat' ? RSAkit.fermatFactor(n) : RSAkit.factorize(n);
          show(d.querySelector('#fr'), {
            'p': p.toString(), 'q': q.toString(),
            '耗时': Math.round(performance.now() - t0) + ' ms',
            'φ(n)': ((p - 1n) * (q - 1n)).toString(),
            'p 十六进制': '0x' + p.toString(16), 'q 十六进制': '0x' + q.toString(16)
          });
        } catch (e) { d.querySelector('#fr').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
      d.querySelector('#gcd').onclick = () => {
        try {
          const ns = d.querySelector('#mns').value.trim().split(/[\s,]+/).filter(Boolean).map(RSAkit.parseBig);
          const hits = RSAkit.batchGCD(ns);
          d.querySelector('#fr').innerHTML = hits.length
            ? T.tbl(['#1', '#2', '公因子'], hits.map(h => [h.i, h.j, '<b>' + h.factor.toString() + '</b>']))
            : '<div class="result">未发现共享素因子</div>';
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#wgo').onclick = () => {
        try {
          const r = RSAkit.wiener(RSAkit.parseBig(d.querySelector('#wn').value), RSAkit.parseBig(d.querySelector('#we').value));
          show(d.querySelector('#wr'), { '私钥指数 d': r.d.toString(), 'p': r.p.toString(), 'q': r.q.toString() });
        } catch (e) { d.querySelector('#wr').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
      d.querySelector('#dgo').onclick = () => {
        try {
          const r = RSAkit.recoverPQfromD(RSAkit.parseBig(d.querySelector('#dn').value), RSAkit.parseBig(d.querySelector('#de').value), RSAkit.parseBig(d.querySelector('#dd').value));
          show(d.querySelector('#der'), { 'p': r.p.toString(), 'q': r.q.toString() });
        } catch (e) { d.querySelector('#der').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
      d.querySelector('#cgo').onclick = () => {
        try {
          const r = RSAkit.commonModulus(RSAkit.parseBig(d.querySelector('#cn').value), RSAkit.parseBig(d.querySelector('#ce1').value),
            RSAkit.parseBig(d.querySelector('#ce2').value), RSAkit.parseBig(d.querySelector('#cc1').value), RSAkit.parseBig(d.querySelector('#cc2').value));
          show(d.querySelector('#cr'), { '明文整数 m': r.m.toString(), '明文 ASCII': '<b style="color:var(--accent)">' + esc(RSAkit.intToText(r.m)) + '</b>' });
        } catch (e) { d.querySelector('#cr').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
      d.querySelector('#bgo').onclick = () => {
        try {
          const items = d.querySelector('#brd').value.trim().split('\n').filter(Boolean).map(l => {
            const parts = l.split(/[\s,]+/).filter(Boolean);
            return { n: RSAkit.parseBig(parts[0]), e: RSAkit.parseBig(parts[1]), c: RSAkit.parseBig(parts[2]) };
          });
          const r = RSAkit.broadcast(items);
          show(d.querySelector('#brdr'), { '明文整数 m': r.m.toString(), '明文 ASCII': '<b style="color:var(--accent)">' + esc(RSAkit.intToText(r.m)) + '</b>' });
        } catch (e) { d.querySelector('#brdr').innerHTML = '<div class="result err">' + esc(e.message) + '</div>'; }
      };
    }
  });

})();
