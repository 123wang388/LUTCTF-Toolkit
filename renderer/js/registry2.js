/* ============================================================
   registry2.js — 工具注册表 (Part 2: 隐写取证 / Web 安全)
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  /* 通用：读取本地文件为字节 */
  function readFileBytes(input) {
    return new Promise((resolve, reject) => {
      const f = input.files && input.files[0];
      if (!f) return reject(new Error('请先选择文件'));
      const fr = new FileReader();
      fr.onload = () => resolve({ bytes: new Uint8Array(fr.result), file: f });
      fr.onerror = () => reject(new Error('读取失败'));
      fr.readAsArrayBuffer(f);
    });
  }
  function readFileDataURL(input) {
    return new Promise((resolve, reject) => {
      const f = input.files && input.files[0];
      if (!f) return reject(new Error('请先选择文件'));
      const fr = new FileReader();
      fr.onload = () => resolve({ url: fr.result, file: f });
      fr.onerror = () => reject(new Error('读取失败'));
      fr.readAsDataURL(f);
    });
  }
  function downloadBytes(name, bytes) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    App.toast('已导出 ' + name, 'ok');
  }
  /* 预览二进制数据的文本部分 */
  function previewBytes(bytes, limit = 3000) {
    const sliced = bytes.subarray(0, limit);
    let text = '';
    try { text = Codec.fromBytes(sliced); } catch (e) { }
    const printable = [...text].filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126 || '\r\n\t'.includes(c)).join('');
    return { raw: text, printable, hex: Codec.bytesToHex(bytes.subarray(0, 64)) };
  }

  /* ============================ 隐写取证 ============================ */
  TOOLS.push({
    id: 'stego-img', name: '图片隐写分析台', cat: 'stego', icon: '🖼️', badge: 'LSB',
    desc: 'LSB 提取（可指定通道与位平面）、Stegsolve 式位平面渲染、通道变换、隐藏文件导出',
    tags: ['LSB', 'Stegsolve', '位平面', 'PNG'], keywords: '图片 lsb 隐写 stegsolve 位平面 通道 png',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('经典 LSB 套路：① 先看「通道变换」是否为图片肉眼可见信息 ② 查看各个「位平面」是否显示二维码/文字 ③ 用 LSB 提取得到字节流，注意 <code>flag{</code>、<code>PK\\x03\\x04</code>、<code>\\x89PNG</code> 之类的特征头。') +
        T.card('① 载入图片', `
          <div class="drop" id="drop">点击或拖入 PNG / BMP / JPG 图片</div>
          <input type="file" id="file" accept="image/*" style="display:none">
          <div id="info" style="margin-top:10px"></div>`) +
        T.card('② LSB 提取', `
          <div class="form-row">
            <label>通道</label>
            <label class="chk"><input type="checkbox" class="ch" value="R" checked> R</label>
            <label class="chk"><input type="checkbox" class="ch" value="G" checked> G</label>
            <label class="chk"><input type="checkbox" class="ch" value="B" checked> B</label>
            <label class="chk"><input type="checkbox" class="ch" value="A"> A</label>
            <label>位平面</label><select id="plane" style="max-width:80px">${[0, 1, 2, 3, 4, 5, 6, 7].map(p => T.opt(p, '第 ' + p + ' 位', p === 0)).join('')}</select>
            <label>顺序</label><select id="dir" style="max-width:100px">${T.opt('row', '按行 →')}${T.opt('col', '按列 ↓')}</select>
            <label>位序</label><select id="bo" style="max-width:100px">${T.opt('msb', 'MSB 优先')}${T.opt('lsb', 'LSB 优先')}</select>
          </div>
          <div class="btn-row"><button class="btn primary" id="ext">提取数据</button>
            <button class="btn sm" id="dlTxt">导出文本</button><button class="btn sm" id="dlBin">导出原始字节</button></div>
          <div class="io-box" style="margin-top:10px"><div class="io-label">提取结果（可打印部分）</div><textarea id="out" rows="8"></textarea></div>
          <div id="hint" style="margin-top:8px"></div>`) +
        T.card('③ 位平面渲染（Stegsolve 风格）', `
          <div class="form-row"><label>通道</label><select id="bpCh" style="max-width:100px">
            ${T.opt('R', 'R')}${T.opt('G', 'G')}${T.opt('B', 'B')}${T.opt('A', 'A')}</select>
            <label>平面</label><select id="bpP" style="max-width:80px">${[0, 1, 2, 3, 4, 5, 6, 7].map(p => T.opt(p, '第 ' + p + ' 位', p === 0)).join('')}</select>
            <button class="btn primary" id="bpGo">渲染位平面</button></div>
          <div id="bpBox" style="margin-top:10px"></div>`) +
        T.card('④ 通道变换', `
          <div class="btn-row">
            <button class="btn sm" id="op-normal">原图</button><button class="btn sm" id="op-invert">反色</button>
            <button class="btn sm" id="op-grayscale">灰度</button><button class="btn sm" id="op-red">R 通道</button>
            <button class="btn sm" id="op-green">G 通道</button><button class="btn sm" id="op-blue">B 通道</button>
            <button class="btn sm" id="op-diffRG">|R-G|</button><button class="btn sm" id="op-xorRG">R^G</button></div>
          <div id="opBox" style="margin-top:10px"></div>`);
      host.appendChild(d);

      let imgData = null;
      const fileInput = d.querySelector('#file'), drop = d.querySelector('#drop');
      drop.onclick = () => fileInput.click();
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => {
        e.preventDefault(); drop.classList.remove('over');
        fileInput.files = e.dataTransfer.files;
        load();
      };
      fileInput.onchange = load;

      function load() {
        readFileDataURL(fileInput).then(({ url, file }) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            imgData = ctx.getImageData(0, 0, img.width, img.height);
            d.querySelector('#info').innerHTML =
              `<div class="result ok"><div class="kv">
                <dt>文件名</dt><dd>${esc(file.name)}</dd>
                <dt>尺寸</dt><dd>${img.width} × ${img.height}（${(img.width * img.height).toLocaleString()} 像素）</dd>
                <dt>Magic</dt><dd>${Codec.bytesToHex(new Uint8Array([0x89, 0x50])).toUpperCase() === '8950' ? '—' : previewBytesHex(file)}</dd>
              </div>
              <img src="${url}" style="max-width:280px;margin-top:10px;border:1px solid var(--border);border-radius:6px"></div>`;
            App.toast('图片加载成功', 'ok');
          };
          img.src = url;
        }).catch(e => App.toast(e.message, 'err'));
      }
      function previewBytesHex() { return ''; }

      d.querySelector('#ext').onclick = () => {
        if (!imgData) return App.toast('请先载入图片', 'err');
        const chans = [...d.querySelectorAll('.ch:checked')].map(c => c.value);
        if (!chans.length) return App.toast('至少选择一个通道', 'err');
        const r = Stego.lsbExtractFromImage(imgData, {
          channels: chans, plane: +d.querySelector('#plane').value,
          direction: d.querySelector('#dir').value, bitOrder: d.querySelector('#bo').value
        });
        const pv = previewBytes(r.bytes, 6000);
        d.querySelector('#out').value = pv.printable || pv.raw;
        const findings = [];
        const hexHead = Codec.bytesToHex(r.bytes.subarray(0, 8));
        if (/89504e47/i.test(hexHead)) findings.push('检测到 PNG 文件头 → 可导出为 .png');
        if (/^504b0304/i.test(hexHead)) findings.push('检测到 ZIP 文件头 → 可导出为 .zip');
        if (/ffd8ff/i.test(hexHead)) findings.push('检测到 JPEG 文件头 → 可导出为 .jpg');
        if (/25504446/i.test(hexHead)) findings.push('检测到 PDF 文件头');
        if (pv.printable.includes('flag{') || pv.printable.includes('FLAG{')) findings.push('🎉 发现疑似 flag');
        d.querySelector('#hint').innerHTML = findings.length
          ? '<div class="note ok">' + findings.map(f => '• ' + f).join('<br>') + '</div>'
          : '<div class="note">提示：若结果乱码，尝试更换 <b>通道组合</b>（如只用 R）、<b>位平面</b>（1~7）或 <b>位序</b>（LSB 优先）。</div>';
        d.querySelector('#dlTxt').onclick = () => App.download('lsb_text.txt', d.querySelector('#out').value);
        const bin = r.bytes;
        d.querySelector('#dlBin').onclick = () => downloadBytes('lsb_raw.bin', bin);
      };

      d.querySelector('#bpGo').onclick = () => {
        if (!imgData) return App.toast('请先载入图片', 'err');
        const out = Stego.bitPlaneImage(imgData, d.querySelector('#bpCh').value, +d.querySelector('#bpP').value);
        const c = document.createElement('canvas');
        c.width = out.width; c.height = out.height;
        c.getContext('2d').putImageData(out, 0, 0);
        c.style.cssText = 'max-width:100%;border:1px solid var(--border);border-radius:6px;image-rendering:pixelated';
        const box = d.querySelector('#bpBox'); box.innerHTML = '';
        box.appendChild(c);
      };

      const opBox = d.querySelector('#opBox');
      ['normal', 'invert', 'grayscale', 'red', 'green', 'blue', 'diffRG', 'xorRG'].forEach(op => {
        d.querySelector('#op-' + op).onclick = () => {
          if (!imgData) return App.toast('请先载入图片', 'err');
          const out = Stego.applyChannelOp(imgData, op);
          const c = document.createElement('canvas');
          c.width = out.width; c.height = out.height;
          c.getContext('2d').putImageData(out, 0, 0);
          c.style.cssText = 'max-width:100%;border:1px solid var(--border);border-radius:6px';
          opBox.innerHTML = ''; opBox.appendChild(c);
        };
      });
    }
  });

  TOOLS.push({
    id: 'stego-file', name: '文件取证工作台', cat: 'stego', icon: '🔬',
    desc: '文件头扫描(mini binwalk)、PNG/JPEG 结构解析、strings 提取、Hex 查看、按偏移切片导出',
    tags: ['Binwalk', 'PNG', 'JPEG', 'strings', 'Hex'], keywords: '取证 binwalk strings hex png jpeg 分离 文件头',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('等同于把 <code>binwalk / foremost / strings / exiftool</code> 的核心能力搬到本地界面。若在某个偏移发现了 ZIP/PNG 等文件头，可直接切片导出。') +
        T.card('载入文件', `<div class="drop" id="drop">点击或拖入任意文件（图片 / 压缩包 / 固件 / 磁盘镜像）</div>
          <input type="file" id="file" style="display:none"><div id="info" style="margin-top:10px"></div>`) +
        T.card('文件头扫描 (Magic Scan)', `<div class="btn-row"><button class="btn primary" id="scan">扫描嵌入文件</button></div>
          <div id="scanR" style="margin-top:10px"></div>`) +
        T.card('图片结构解析', `<div class="btn-row"><button class="btn" id="pPNG">PNG 分块</button><button class="btn" id="pJPG">JPEG 段</button></div>
          <div id="structR" style="margin-top:10px"></div>`) +
        T.card('strings 字符串提取', `<div class="form-row"><label>最小长度</label><input type="number" id="slen" value="5" style="max-width:90px">
          <label>过滤</label><input type="text" id="sfilter" placeholder="如 flag" style="max-width:180px">
          <button class="btn primary" id="sgo">提取</button></div><div id="strR" style="margin-top:10px"></div>`) +
        T.card('Hex 查看', `<div class="form-row"><label>起始偏移</label><input type="text" id="hoff" value="0" style="max-width:120px">
          <label>长度</label><input type="number" id="hlen" value="512" style="max-width:110px">
          <button class="btn primary" id="hgo">查看</button></div>
          <div class="hex-view" id="hexR">—</div>`) +
        T.card('切片导出', `<div class="form-row"><label>起始(十进制)</label><input type="text" id="soff" value="0" style="max-width:130px">
          <label>结束(留空=到末尾)</label><input type="text" id="send" style="max-width:130px">
          <label>文件名</label><input type="text" id="sname" value="slice.bin" style="max-width:160px">
          <button class="btn primary" id="sexp">导出片段</button></div>`);
      host.appendChild(d);
      let bytes = null;
      const fileInput = d.querySelector('#file'), drop = d.querySelector('#drop');
      drop.onclick = () => fileInput.click();
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); fileInput.files = e.dataTransfer.files; load(); };
      fileInput.onchange = load;
      function load() {
        readFileBytes(fileInput).then(({ bytes: b, file }) => {
          bytes = b;
          const magics = Stego.MAGIC.filter(m => m.sig && b.length >= m.sig.length && m.sig.every((v, i) => b[i] === v));
          d.querySelector('#info').innerHTML = `<div class="result ok"><div class="kv">
            <dt>文件名</dt><dd>${esc(file.name)}</dd>
            <dt>大小</dt><dd>${b.length.toLocaleString()} 字节 (${(b.length / 1024).toFixed(1)} KB)</dd>
            <dt>识别类型</dt><dd>${magics.map(m => m.name).join(' / ') || '未知'}</dd>
            <dt>头部 16 字节</dt><dd>${Codec.bytesToHex(b.subarray(0, 16))}</dd>
            <dt>尾部 16 字节</dt><dd>${Codec.bytesToHex(b.subarray(Math.max(0, b.length - 16)))}</dd></div></div>`;
          App.toast('文件载入成功', 'ok');
        }).catch(e => App.toast(e.message, 'err'));
      }
      d.querySelector('#scan').onclick = () => {
        if (!bytes) return App.toast('请先载入文件', 'err');
        const hits = Stego.scanMagic(bytes);
        d.querySelector('#scanR').innerHTML = hits.length
          ? T.tbl(['偏移(十进制)', '偏移(Hex)', '类型', '说明', '操作'],
            hits.slice(0, 60).map(h => [h.offset, h.hex, h.ext, h.name,
              `<button class="btn sm" data-off="${h.offset}">切片导出</button>`]))
          : '<div class="result">未发现已知文件头</div>';
        d.querySelectorAll('#scanR [data-off]').forEach(btn => btn.onclick = () => {
          const off = +btn.dataset.off;
          const slice = Stego.sliceBySignature(bytes, off);
          downloadBytes('slice_' + off + '.bin', slice);
        });
      };
      d.querySelector('#pPNG').onclick = () => {
        if (!bytes) return App.toast('请先载入文件', 'err');
        try {
          const chunks = Stego.parsePngChunks(bytes);
          d.querySelector('#structR').innerHTML =
            T.tbl(['#', '类型', '长度', '偏移', '内容预览'],
              chunks.map((c, i) => [i, c.type, c.len, c.offset,
                c.type === 'IDAT' ? '(图像数据)' : esc(Codec.fromBytes(c.data.subarray(0, 40)).replace(/[^\x20-\x7E]/g, '.'))])) +
            (Stego.chunkText(chunks).length ? '<div class="note ok" style="margin-top:10px">发现文本分块：</div>' +
              T.tbl(['类型', '长度', '文本'], Stego.chunkText(chunks).map(t => [t.type, t.len, esc(t.text)])) : '');
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#pJPG').onclick = () => {
        if (!bytes) return App.toast('请先载入文件', 'err');
        try {
          const segs = Stego.parseJpegSegments(bytes);
          d.querySelector('#structR').innerHTML = T.tbl(['标记', '名称', '偏移', '长度'], segs.map(s => [s.marker, s.name, s.offset, s.len]));
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#sgo').onclick = () => {
        if (!bytes) return App.toast('请先载入文件', 'err');
        const min = +d.querySelector('#slen').value || 4;
        const filter = d.querySelector('#sfilter').value.trim().toLowerCase();
        let list = Stego.strings(bytes, min);
        if (filter) list = list.filter(s => s.text.toLowerCase().includes(filter));
        list = list.slice(0, 400);
        d.querySelector('#strR').innerHTML = list.length
          ? T.tbl(['类型', '偏移', '字符串'], list.map(s => [s.type, s.offset, `<span style="cursor:pointer" onclick="App.copy(${JSON.stringify(s.text).replace(/"/g, '&quot;')})">${esc(s.text.slice(0, 160))}</span>`]))
          : '<div class="result">未提取到符合条件的字符串</div>';
        App.toast('提取到 ' + list.length + ' 条', 'ok');
      };
      d.querySelector('#hgo').onclick = () => {
        if (!bytes) return App.toast('请先载入文件', 'err');
        const off = parseInt(d.querySelector('#hoff').value) || 0;
        const len = +d.querySelector('#hlen').value || 512;
        d.querySelector('#hexR').textContent = Stego.hexDump(bytes.subarray(off, off + len), len);
      };
      d.querySelector('#sexp').onclick = () => {
        if (!bytes) return App.toast('请先载入文件', 'err');
        const a = parseInt(d.querySelector('#soff').value) || 0;
        const bRaw = d.querySelector('#send').value.trim();
        const b = bRaw ? parseInt(bRaw) : bytes.length;
        if (b <= a) return App.toast('结束偏移必须大于起始', 'err');
        downloadBytes(d.querySelector('#sname').value || 'slice.bin', bytes.subarray(a, b));
      };
    }
  });

  TOOLS.push({
    id: 'stego-audio', name: '音频频谱 / 摩斯分析', cat: 'stego', icon: '🔊',
    desc: 'WAV 文件频谱图渲染（看字蛛）、包络分析（音频摩斯/敲击）',
    tags: ['Spectrogram', 'WAV', 'FFT', '摩斯'], keywords: '音频 频谱 spectrogram wav fft 摩斯 倒放',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('很多 Misc 音频题把 flag 画在频谱里。请先上传 <b>WAV</b>（若为 mp3/m4a 需先用 ffmpeg 转码：<code>ffmpeg -i a.mp3 -ar 44100 -ac 1 a.wav</code>）。') +
        T.card('载入 WAV', `<div class="drop" id="drop">点击或拖入 .wav 文件</div><input type="file" id="file" accept=".wav,audio/*" style="display:none">
          <div id="info" style="margin-top:10px"></div>`) +
        T.card('频谱图', `<div class="form-row"><label>FFT 窗口</label><select id="fs" style="max-width:110px">
            ${T.opt(512, '512')}${T.opt(1024, '1024', true)}${T.opt(2048, '2048')}</select>
          <label>频率上限(Hz)</label><input type="number" id="mf" value="8000" style="max-width:110px">
          <button class="btn primary" id="draw">渲染频谱图</button></div>
          <div id="canvasBox" style="margin-top:12px"></div>`) +
        T.card('包络分析（判断摩斯/敲击节奏）', `<div class="form-row"><label>窗口</label><input type="number" id="win" value="512" style="max-width:100px">
          <button class="btn primary" id="env">分析包络</button></div><div id="envR" style="margin-top:10px"></div>
          <div class="note">若看到规律的「短-长-短」能量块，多半是摩斯电码；把波形拉长后可秒判抄录 lub-coding 到「摩斯/培根」工具解码。</div>`);
      host.appendChild(d);
      let samples = null, rate = 44100;
      const fileInput = d.querySelector('#file'), drop = d.querySelector('#drop');
      drop.onclick = () => fileInput.click();
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); fileInput.files = e.dataTransfer.files; load(); };
      fileInput.onchange = load;
      function load() {
        readFileBytes(fileInput).then(({ bytes, file }) => {
          try {
            const r = Stego.wavToSamples(bytes);
            samples = r.samples; rate = r.rate;
            d.querySelector('#info').innerHTML = `<div class="result ok"><div class="kv">
              <dt>文件名</dt><dd>${esc(file.name)}</dd>
              <dt>采样率</dt><dd>${r.rate} Hz</dd>
              <dt>声道</dt><dd>${r.channels}</dd>
              <dt>位深</dt><dd>${r.bits} bit</dd>
              <dt>样本数</dt><dd>${r.samples.length.toLocaleString()}（${(r.samples.length / r.rate).toFixed(2)} 秒）</dd></div></div>`;
            App.toast('WAV 解析成功', 'ok');
          } catch (e) { App.toast(e.message, 'err'); }
        }).catch(e => App.toast(e.message, 'err'));
      }
      d.querySelector('#draw').onclick = () => {
        if (!samples) return App.toast('请先载入 WAV', 'err');
        const box = d.querySelector('#canvasBox'); box.innerHTML = '';
        const c = document.createElement('canvas');
        c.style.cssText = 'width:100%;border:1px solid var(--border);border-radius:8px;background:#000';
        box.appendChild(c);
        Stego.drawSpectrogram(c, samples, rate, +d.querySelector('#fs').value, +d.querySelector('#mf').value);
        App.toast('渲染完成，查看图中是否有文字', 'ok');
      };
      d.querySelector('#env').onclick = () => {
        if (!samples) return App.toast('请先载入 WAV', 'err');
        const env = Stego.envelope(samples, +d.querySelector('#win').value || 512);
        const max = Math.max(...env);
        const th = max * 0.25;
        let bars = '';
        const step = Math.max(1, Math.floor(env.length / 400));
        for (let i = 0; i < env.length; i += step) {
          const v = Math.min(100, env[i] / max * 100);
          bars += `<div style="display:inline-block;width:2px;height:${Math.max(1, v)}px;background:${env[i] > th ? 'var(--accent)' : 'var(--fg-mute)'};vertical-align:bottom;margin-right:1px"></div>`;
        }
        /* 生成粗略摩斯序列 */
        let code = '', run = 0, prev = false;
        for (const v of env) {
          const on = v > th;
          if (on === prev) run++;
          else {
            if (prev && run > 1) code += run > 8 ? '-' : '.';
            else if (!prev && run > 3) code += ' ';
            run = 1;
          }
          prev = on;
        }
        d.querySelector('#envR').innerHTML =
          `<div class="note">波形包络（蓝色为较高能量）：</div>
           <div style="height:120px;overflow:hidden;background:var(--bg-input);border:1px solid var(--border);border-radius:7px;padding:8px">${bars}</div>
           <div class="io-label" style="margin-top:12px">推测摩斯序列（仅供参考，复制到「摩斯/培根」工具解码）</div>
           <textarea rows="3">${esc(code.slice(0, 2000))}</textarea>`;
      };
    }
  });

  TOOLS.push({
    id: 'zip-lab', name: 'ZIP 结构与伪加密', cat: 'stego', icon: '🗜️',
    desc: '枚举 ZIP 条目、识别伪加密标志位、生成修复命令（无密码解压的关键一步）',
    tags: ['ZIP', '伪加密', '取证'], keywords: 'zip 伪加密 加密 标志 解压 crack',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('伪加密：ZIP 头部 <b>全局方式位标记</b> (offset 6-7) 被置为 <code>09 00</code>，区分 Scientist 加密其实无密码。WinRAR 会提示要密码，但修改标志位即可直接解压。') +
        T.card('载入 ZIP', `<div class="drop" id="drop">点击或拖入 .zip 文件</div><input type="file" id="file" accept=".zip" style="display:none">
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="go">分析</button></div>
          <div id="r" style="margin-top:10px"></div>`) +
        T.card('修复命令', `<div class="result">
          <b>Linux / macOS：</b><br>
          <code>zip -FF broken.zip --out fixed.zip</code><br>
          <code>python -c "d=open('a.zip','rb').read();d=d[:6]+b'\\x00\\x00'+d[8:];open('f.zip','wb').write(d)"</code><br><br>
          <b>Windows (PowerShell)：</b><br>
          <code>$b=[IO.File]::ReadAllBytes('a.zip');$b[6]=0;$b[7]=0;[IO.File]::WriteAllBytes('f.zip',$b)</code><br><br>
          <b>真加密爆破：</b><br>
          <code>fcrackzip -u -D -p rockyou.txt a.zip</code><br>
          <code>zip2john a.zip > h.txt && john h.txt</code><br>
          <code>hashcat -m 17200 hash.txt rockyou.txt</code><br><br>
          <b>明文攻击（已知包内一个文件）：</b><br>
          <code> ARCHPR / bkcrack -C enc.zip -c plain.txt -p known.txt</code>
        </div>`);
      host.appendChild(d);
      const fileInput = d.querySelector('#file'), drop = d.querySelector('#drop');
      drop.onclick = () => fileInput.click();
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); fileInput.files = e.dataTransfer.files; };
      d.querySelector('#go').onclick = () => {
        readFileBytes(fileInput).then(({ bytes }) => {
          const z = Stego.parseZip(bytes);
          if (!z) return d.querySelector('#r').innerHTML = '<div class="result err">未找到 ZIP 结尾记录（EOCD），可能不是标准 ZIP</div>';
          const encCount = z.entries.filter(e => e.encrypted).length;
          d.querySelector('#r').innerHTML =
            `<div class="result ${encCount ? 'ok' : ''}"><div class="kv">
              <dt>EOCD 偏移</dt><dd>${z.eocdOffset}</dd>
              <dt>声明条目数</dt><dd>${z.count}</dd>
              <dt>解析条目数</dt><dd>${z.entries.length}</dd>
              <dt>标记加密条目</dt><dd>${encCount}</dd></div></div>` +
            T.tbl(['文件名', '加密标志', '压缩方式', 'CRC32', '压缩后大小', '原大小'],
              z.entries.map(e => [esc(e.name), e.encrypted ? '🔒 是' : '否', e.method === 0 ? 'store' : e.method === 8 ? 'deflate' : e.method,
                ('00000000' + e.crc.toString(16)).slice(-8), e.csize, e.usize])) +
            (encCount ? '<div class="note warn" style="margin-top:10px">存在加密标记。若你<b>确定没有密码</b>，极可能是伪加密 —— 用上方「修复命令」把 offset 6-7 改为 00 00 即可解压。</div>' : '');
        }).catch(e => App.toast(e.message, 'err'));
      };
    }
  });

  /* ============================ Web 安全 ============================ */
  TOOLS.push({
    id: 'web-payload', name: 'Payload 速查字典', cat: 'web', icon: '💉', badge: '全',
    desc: 'SQLi / XSS / SSTI / SSRF / 上传 / 命令注入 / XXE / 反序列化 / 反序列化 全线 payload，点击即复制',
    tags: ['SQLi', 'XSS', 'SSTI', 'SSRF', 'Upload', 'RCE'], keywords: 'payload sqli xss ssti ssrf 上传 命令注入 xxe 字典',
    render(host) {
      const d = document.createElement('div');
      const cats = Object.keys(WebKit.Payloads);
      d.innerHTML =
        T.card('分类浏览', `<div class="form-row">
            <label>类别</label><select id="cat" style="max-width:170px">${cats.map(c => T.opt(c, c)).join('')}</select>
            <label>子项</label><select id="sub" style="max-width:220px"></select>
            <label>搜索</label><input type="text" id="q" placeholder="过滤 payload…" style="flex:1">
          </div>
          <div class="btn-row"><button class="btn sm" id="exp">导出当前列表</button></div>`) +
        `<div id="list" style="margin-top:14px"></div>`;
      host.appendChild(d);
      const catS = d.querySelector('#cat'), subS = d.querySelector('#sub'), qS = d.querySelector('#q'), list = d.querySelector('#list');
      function fillSubs() {
        const subs = Object.keys(WebKit.Payloads[catS.value] || {});
        subS.innerHTML = subs.map(s => T.opt(s, s)).join('');
        render();
      }
      function render() {
        const all = WebKit.Payloads[catS.value] || {};
        let items = all[subS.value] || [];
        const q = qS.value.trim().toLowerCase();
        if (q) { items = Object.values(all).flat().filter(p => p.toLowerCase().includes(q)); }
        list.innerHTML = T.card(subS.value || 'Payload 列表', items.length
          ? T.tbl(['#', 'Payload', ''], items.map((p, i) => [i + 1, `<code>${esc(p)}</code>`, '<button class="btn sm" data-i="' + i + '">复制</button>']))
          : '<div class="result">无匹配项</div>');
        list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => App.copy(items[+b.dataset.i]));
      }
      catS.onchange = fillSubs;
      subS.onchange = render;
      qS.oninput = render;
      d.querySelector('#exp').onclick = () => {
        let items = Object.values(WebKit.Payloads[catS.value] || {}).flat();
        App.download((catS.value) + '_payloads.txt', items.join('\n'));
      };
      fillSubs();
    }
  });

  TOOLS.push({
    id: 'jwt-lab', name: 'JWT 解析与伪造', cat: 'web', icon: '🎫',
    desc: '解析 Header/Payload、重新签名 (HS256/384/512)、alg=none 攻击、弱密钥爆破指引',
    tags: ['JWT', 'HS256', 'alg=none', '伪造'], keywords: 'jwt token 签名 伪造 hs256 none 爆破',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('<b>常见考点：</b>① <code>alg</code> 改为 <code>none</code> 删除签名 ② RS256 转 HS256 后用公钥当密钥 ③ <code>kid</code> 路径穿越/SQLi ④ 弱密钥字典爆破。') +
        T.card('解析 Token', `<div class="io-box"><div class="io-label">粘贴 JWT</div><textarea id="tok" rows="4" placeholder="eyJhbGciOi..."></textarea></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="pa">解析</button></div><div id="pr" style="margin-top:10px"></div>`) +
        T.card('伪造与重签', `
          <div class="io-grid"><div class="io-box"><div class="io-label">Header (JSON)</div><textarea id="hdr" rows="5"></textarea></div>
          <div class="io-box"><div class="io-label">Payload (JSON)</div><textarea id="pld" rows="5"></textarea></div></div>
          <div class="form-row" style="margin-top:10px">
            <label>算法</label><select id="alg" style="max-width:120px">${T.opt('HS256', 'HS256')}${T.opt('HS384', 'HS384')}${T.opt('HS512', 'HS512')}${T.opt('SM3', 'SM3-HMAC(国密)')}${T.opt('none', 'none')}</select>
            <label>密钥</label><input type="text" id="sec" placeholder="签名密钥" style="flex:1">
            <button class="btn primary" id="sg">生成 Token</button></div>
          <div class="io-box" style="margin-top:10px"><div class="io-label">结果<div class="spacer"></div><button class="btn sm" id="cp">复制</button></div>
            <textarea id="res" rows="4"></textarea></div>`) +
        T.card('弱密钥爆破', `<div class="result">
          把 token 存成 jwt.txt，然后：<br>
          <code>hashcat -m 16500 -a 0 jwt.txt rockyou.txt</code><br>
          <code>john --format=HMAC-SHA256 --wordlist=rockyou.txt jwt.txt</code><br>
          <b>常见弱密钥：</b> secret / 123456 / your-256-bit-secret / password / key / changeit
        </div>`);
      host.appendChild(d);
      d.querySelector('#pa').onclick = () => {
        const r = WebKit.JWT.parse(d.querySelector('#tok').value);
        d.querySelector('#pr').innerHTML = `<div class="result ${r.ok ? 'ok' : 'err'}"><div class="kv">
          <dt>分段数</dt><dd>${r.ok ? '3（正常）' : '异常'}</dd>
          <dt>Header</dt><dd><pre style="margin:0;white-space:pre-wrap">${esc(JSON.stringify(r.header, null, 2))}</pre></dd>
          <dt>Payload</dt><dd><pre style="margin:0;white-space:pre-wrap">${esc(JSON.stringify(r.payload, null, 2))}</pre></dd>
          <dt>Signature</dt><dd>${esc(r.signature || '—')}</dd></div></div>` +
          (r.payload && r.payload.exp ? `<div class="note">exp = ${r.payload.exp} → ${new Date(r.payload.exp * 1000).toLocaleString('zh-CN')}</div>` : '');
        if (r.headerRaw) d.querySelector('#hdr').value = r.headerRaw;
        if (r.payloadRaw) d.querySelector('#pld').value = r.payloadRaw;
      };
      d.querySelector('#sg').onclick = async () => {
        try {
          const hdr = JSON.parse(d.querySelector('#hdr').value);
          const pld = JSON.parse(d.querySelector('#pld').value);
          const alg = d.querySelector('#alg').value;
          const sec = d.querySelector('#sec').value;
          if (alg === 'none') {
            hdr.alg = 'none';
            d.querySelector('#res').value = WebKit.JWT.build(hdr, pld) + '.';
          } else if (alg === 'SM3') {
            hdr.alg = 'HS256';
            const body = WebKit.JWT.build(hdr, pld);
            const sig = await WebKit.JWT.signSM3HMAC(body, sec);
            d.querySelector('#res').value = body + '.' + sig;
          } else {
            hdr.alg = alg;
            const body = WebKit.JWT.build(hdr, pld);
            const sig = await WebKit.JWT.signHS(body, sec, alg);
            d.querySelector('#res').value = body + '.' + sig;
          }
          App.toast('已生成', 'ok');
        } catch (e) { App.toast('JSON 解析失败: ' + e.message, 'err'); }
      };
      d.querySelector('#cp').onclick = () => App.copy(d.querySelector('#res').value);
    }
  });

  TOOLS.push({
    id: 'http-lab', name: 'HTTP 请求构造器', cat: 'web', icon: '🌐',
    desc: '自定义方法/请求头/请求体发包并查看完整响应；一键生成 curl 与 Python 脚本（主进程发包，无视 CORS）',
    tags: ['HTTP', 'curl', '请求伪造'], keywords: 'http 请求 curl python header xff 伪造',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.note('比赛环境下常需伪造 <code>Referer</code>、<code>X-Forwarded-For</code>、<code>Cookie</code>、<code>User-Agent</code>。<b>本工具由应用主进程直接发包</b>，不受浏览器跨域限制。') +
        T.card('构造请求', `
          <div class="form-row"><label>方法</label><select id="m" style="max-width:110px">
            ${['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'].map(x => T.opt(x, x)).join('')}</select>
            <label>URL</label><input type="text" id="u" placeholder="http://target/path" style="flex:2">
            <button class="btn primary" id="send">发送</button></div>
          <div class="io-grid"><div class="io-box"><div class="io-label">请求头（每行 <code>Key: Value</code>）</div>
            <textarea id="h" rows="5" placeholder="User-Agent: Mozilla/5.0&#10;X-Forwarded-For: 127.0.0.1"></textarea></div>
          <div class="io-box"><div class="io-label">请求体 (Body)</div><textarea id="b" rows="5" placeholder="POST 数据…"></textarea></div></div>`) +
        T.card('响应', `<div id="resp" class="result" style="max-height:420px">—</div>`) +
        T.card('代码生成', `<div class="btn-row"><button class="btn" id="gCurl">生成 curl 命令</button><button class="btn" id="gPy">生成 Python 脚本</button></div>
          <textarea id="gen" rows="6" style="margin-top:10px"></textarea>`);
      host.appendChild(d);
      const gather = () => ({
        method: d.querySelector('#m').value, url: d.querySelector('#u').value.trim(),
        headers: WebKit.parseHeaders(d.querySelector('#h').value), body: d.querySelector('#b').value
      });
      d.querySelector('#send').onclick = async () => {
        const o = gather();
        if (!o.url) return App.toast('请填写 URL', 'err');
        d.querySelector('#resp').textContent = '请求中…';
        let r;
        if (window.api && window.api.http) r = await window.api.http(o);
        else r = await WebKit.httpRequest(o);
        const box = d.querySelector('#resp');
        if (!r.ok) { box.className = 'result err'; box.textContent = '请求失败: ' + r.error; return; }
        box.className = 'result ok';
        box.innerHTML = `<div class="kv">
          <dt>状态码</dt><dd><b style="color:${r.status < 400 ? 'var(--ok)' : 'var(--err)'}">${r.status} ${r.statusText || ''}</b></dd>
          <dt>耗时</dt><dd>${r.ms} ms</dd>
          <dt>响应头</dt><dd><pre style="margin:0;white-space:pre-wrap;font-size:11px">${esc(JSON.stringify(r.headers, null, 1))}</pre></dd>
        </div><div style="margin-top:10px"><div class="io-label">响应体</div><textarea rows="14" style="font-size:11.5px">${esc((r.body || '').slice(0, 8000))}</textarea></div>`;
      };
      d.querySelector('#gCurl').onclick = () => d.querySelector('#gen').value = WebKit.toCurl(gather());
      d.querySelector('#gPy').onclick = () => d.querySelector('#gen').value = WebKit.toPythonReq(gather());
    }
  });

  TOOLS.push({
    id: 'web-bypass', name: 'WAF / 请求头绕过备忘', cat: 'web', icon: '🛡️',
    desc: 'IP 伪造头、403 绕过、常见后台路径字典、搜索引擎语法，攻略 Web 题必备',
    tags: ['403绕过', 'XFF', '目录扫描', 'FOFA'], keywords: 'waf 绕过 xff 403 后台路径 fofa shodan 语法',
    render(host) {
      const d = document.createElement('div');
      const groups = Object.keys(WebKit.Payloads.headers);
      d.innerHTML =
        T.card('请求头伪造', groups.map(g =>
          `<div style="margin-bottom:14px"><div class="io-label">${g}</div>
            <div class="result" style="font-size:12px">${WebKit.Payloads.headers[g].map(h => `<div style="cursor:pointer" onclick="App.copy(${JSON.stringify(h)})">${esc(h)}</div>`).join('')}</div></div>`).join('') +
          '<div class="note">点击任意一行即复制。</div>') +
        T.card('常见后台 / 泄漏路径字典', `<div class="btn-row" style="margin-bottom:10px"><button class="btn sm" id="expPath">导出字典</button></div>
          <div class="result" style="max-height:260px;font-size:12px">${WebKit.Payloads.path.map(p => esc(p)).join('\n')}</div>`) +
        T.card('空间搜索语法', ['fofa', 'shodan', 'zoomeye', 'hunter', 'google'].map(k =>
          `<div style="margin-bottom:12px"><div class="io-label">${k.toUpperCase()}</div>
          <div class="result" style="font-size:12px">${Misc.SearchEngine[k].map(s => `<div style="cursor:pointer" onclick="App.copy(${JSON.stringify(s)})">${esc(s)}</div>`).join('')}</div></div>`).join(''));
      host.appendChild(d);
      d.querySelector('#expPath').onclick = () => App.download('paths.txt', WebKit.Payloads.path.join('\n'));
    }
  });

})();
