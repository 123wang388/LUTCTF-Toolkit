/* ============================================================
   registry3.js — 工具注册表 (Part 3: 杂项 / 应急响应 / 外部工具 / 关于)
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;
  const esc = App.esc;

  /* ============================ 杂项 ============================ */
  TOOLS.push({
    id: 'misc-time', name: '时间戳与编码换算', cat: 'misc', icon: '⏱️',
    desc: 'Unix 时间戳 ↔ 北京时间/UTC、秒/毫秒自动识别、当前时间实时刷新',
    tags: ['Timestamp', 'Unix', '时区'], keywords: '时间戳 unix time 毫秒 时区',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('时间转换', `
          <div class="form-row"><label>输入</label><input type="text" id="vin" placeholder="时间戳 或 2024-01-01 00:00:00" style="flex:2">
            <button class="btn primary" id="go">换算</button></div>
          <div class="btn-row"><button class="btn sm" id="nowSec">填入当前秒级</button><button class="btn sm" id="nowMs">填入当前毫秒级</button></div>
          <div id="r" style="margin-top:12px"></div>`) +
        T.card('实时时间', `<div class="result" id="live" style="font-size:15px">—</div>`);
      host.appendChild(d);
      const r = d.querySelector('#r');
      const convert = () => {
        try {
          const date = Misc.Time.parse(d.querySelector('#vin').value);
          r.innerHTML = `<div class="result ok"><div class="kv">
            <dt>本地时间</dt><dd><b>${Misc.Time.fmt(date)}</b></dd>
            <dt>UTC 时间</dt><dd>${Misc.Time.fmt(date, 'utc')}</dd>
            <dt>Unix 秒级</dt><dd>${Math.floor(date.getTime() / 1000)}</dd>
            <dt>Unix 毫秒级</dt><dd>${date.getTime()}</dd>
            <dt>ISO 8601</dt><dd>${date.toISOString()}</dd></div></div>`;
        } catch (e) { App.toast(e.message, 'err'); }
      };
      d.querySelector('#go').onclick = convert;
      d.querySelector('#nowSec').onclick = () => { d.querySelector('#vin').value = Misc.Time.now(); convert(); };
      d.querySelector('#nowMs').onclick = () => { d.querySelector('#vin').value = Misc.Time.nowMs(); convert(); };
      const tick = () => {
        const n = new Date();
        d.querySelector('#live').innerHTML = `当前 <b style="color:var(--accent)">${Misc.Time.fmt(n)}</b> · Unix ${Math.floor(n.getTime() / 1000)} · UTC ${Misc.Time.fmt(n, 'utc')}`;
      };
      tick();
      host._timer = setInterval(tick, 1000);
    }
  });

  TOOLS.push({
    id: 'misc-regex', name: '正则表达式测试', cat: 'misc', icon: '🧩',
    desc: '实时匹配测试、常用正则模板（flag 格式、手机号、内网 IP 等）、常见分组提取',
    tags: ['Regex', '正则', '匹配'], keywords: '正则 regex 匹配 提取 flag',
    render(host) {
      const d = document.createElement('div');
      const presets = {
        'CTF flag 常见格式': '(flag|FLAG)\\{[^}]{1,60}\\}',
        'IPv4 地址': '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
        '内网 IP': '\\b(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)\\d{1,3}\\.\\d{1,3}',
        '手机号': '1[3-9]\\d{9}',
        '身份证': '\\d{17}[\\dXx]',
        '邮箱': '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
        'Base64 串': '[A-Za-z0-9+/]{16,}={0,2}',
        'MD5/SHA1 hex': '\\b[a-f0-9]{32}\\b|\\b[a-f0-9]{40}\\b',
        'URL': 'https?://[^\\s]+',
        'JWT': 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+',
        '私钥 PEM': '-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----'
      };
      d.innerHTML =
        T.card('测试', `
          <div class="form-row"><label>正则</label><select id="preset" style="max-width:200px">
            ${T.opt('', '— 自定义 —')}${Object.keys(presets).map(k => T.opt(k, k)).join('')}</select></div>
          <div class="form-row"><label>表达式</label><input type="text" id="re" placeholder="(flag|FLAG)\\{[^}]+\\}" style="flex:2">
            <label>标志</label><input type="text" id="fl" value="gi" style="max-width:70px"></div>
          <div class="io-box"><div class="io-label">待匹配文本</div><textarea id="txt" rows="6"></textarea></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="run">执行匹配</button></div>
          <div id="r" style="margin-top:12px"></div>`);
      host.appendChild(d);
      d.querySelector('#preset').onchange = e => {
        if (presets[e.target.value]) d.querySelector('#re').value = presets[e.target.value];
      };
      d.querySelector('#run').onclick = () => {
        const src = d.querySelector('#txt').value;
        let re;
        try { re = new RegExp(d.querySelector('#re').value, d.querySelector('#fl').value); }
        catch (e) { return App.toast('正则错误: ' + e.message, 'err'); }
        const groups = /\(/.test(d.querySelector('#re').value);
        let out = [], m;
        let guard = 0;
        while ((m = re.exec(src)) !== null && guard++ < 5000) {
          out.push(groups ? (m[1] !== undefined ? m[1] : m[0]) : m[0]);
          if (!re.global) break;
          if (m[0] === '') re.lastIndex++;
        }
        d.querySelector('#r').innerHTML = out.length
          ? T.tbl(['#', '匹配结果'], out.map((v, i) => [i + 1, `<code>${esc(String(v))}</code>`]))
          : '<div class="result">无匹配结果</div>';
        App.toast('匹配到 ' + out.length + ' 项', 'ok');
      };
    }
  });

  TOOLS.push({
    id: 'misc-gen', name: '密码 / 字典生成器', cat: 'misc', icon: '🎲',
    desc: '强随机口令生成、UUID v4、按关键词生成变形字典（大小写/Leet/前后缀爆破组合）',
    tags: ['密码', '字典', 'UUID', '随机数'], keywords: '密码生成 字典 uuid 随机 rockyou leet',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('口令生成', `<div class="form-row">
            <label>长度</label><input type="number" id="len" value="16" style="max-width:90px">
            <label class="chk"><input type="checkbox" id="o1" checked> 小写</label>
            <label class="chk"><input type="checkbox" id="o2" checked> 大写</label>
            <label class="chk"><input type="checkbox" id="o3" checked> 数字</label>
            <label class="chk"><input type="checkbox" id="o4" checked> 符号</label>
            <label>数量</label><input type="number" id="cnt" value="10" style="max-width:80px">
            <button class="btn primary" id="gp">生成</button></div>
          <textarea id="pwOut" rows="8" style="margin-top:10px"></textarea>
          <div class="btn-row" style="margin-top:8px"><button class="btn sm" id="cpPw">复制</button><button class="btn sm" id="dlPw">导出</button></div>`) +
        T.card('UUID v4', `<div class="form-row"><label>数量</label><input type="number" id="uc" value="5" style="max-width:80px">
          <button class="btn primary" id="gu">生成</button><button class="btn sm" id="cpU">复制</button></div>
          <textarea id="uOut" rows="4" style="margin-top:10px"></textarea>`) +
        T.card('字典变形生成', `<div class="note">输入关键词（每行一个），自动生成常见弱口令变体。适合社工题、校内靶场、zip 爆破。</div>
          <div class="io-box"><div class="io-label">关键词（每行一个）</div><textarea id="words" rows="5" placeholder="lut&#10;lzgydx&#10;haifeng&#10;k4l0ng"></textarea></div>
          <div class="form-row" style="margin-top:10px">
            <label class="chk"><input type="checkbox" id="caseV" checked> 大小写变体</label>
            <label class="chk"><input type="checkbox" id="leet" checked> Leet (a→4)</label>
            <label class="chk"><input type="checkbox" id="sfx" checked> 常见后缀 (123/!等)</label>
            <label class="chk"><input type="checkbox" id="pfx"> 常见前缀</label>
            <button class="btn primary" id="gd">生成字典</button></div>
          <div class="result" id="dinfo" style="margin-top:10px">—</div>
          <textarea id="dOut" rows="8" style="margin-top:10px"></textarea>
          <div class="btn-row" style="margin-top:8px"><button class="btn sm" id="dlD">导出字典</button><button class="btn sm" id="addWeak">追加常见弱口令</button></div>`);
      host.appendChild(d);
      d.querySelector('#gp').onclick = () => {
        const n = +d.querySelector('#cnt').value || 1;
        const len = +d.querySelector('#len').value || 12;
        const opts = { lower: d.querySelector('#o1').checked, upper: d.querySelector('#o2').checked, num: d.querySelector('#o3').checked, sym: d.querySelector('#o4').checked };
        let out = [];
        try { for (let i = 0; i < n; i++) out.push(Misc.Rand.password(len, opts)); }
        catch (e) { return App.toast(e.message, 'err'); }
        d.querySelector('#pwOut').value = out.join('\n');
      };
      d.querySelector('#cpPw').onclick = () => App.copy(d.querySelector('#pwOut').value);
      d.querySelector('#dlPw').onclick = () => App.download('passwords.txt', d.querySelector('#pwOut').value);
      d.querySelector('#gu').onclick = () => {
        const n = +d.querySelector('#uc').value || 1;
        d.querySelector('#uOut').value = Array.from({ length: n }, () => Misc.Rand.uuid()).join('\n');
      };
      d.querySelector('#cpU').onclick = () => App.copy(d.querySelector('#uOut').value);
      d.querySelector('#gd').onclick = () => {
        const words = d.querySelector('#words').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!words.length) return App.toast('请输入至少一个关键词', 'err');
        const list = Misc.Dict.mutations(words, {
          caseVariants: d.querySelector('#caseV').checked, leet: d.querySelector('#leet').checked,
          suffix: d.querySelector('#sfx').checked, prefix: d.querySelector('#pfx').checked
        });
        d.querySelector('#dOut').value = list.join('\n');
        d.querySelector('#dinfo').textContent = `生成 ${list.length} 条候选`;
        App.toast('生成 ' + list.length + ' 条', 'ok');
      };
      d.querySelector('#dlD').onclick = () => App.download('wordlist.txt', d.querySelector('#dOut').value);
      d.querySelector('#addWeak').onclick = () => {
        const cur = d.querySelector('#dOut').value.trim();
        d.querySelector('#dOut').value = (cur ? cur + '\n' : '') + Misc.Dict.weakTop.join('\n');
        App.toast('已追加 ' + Misc.Dict.weakTop.length + ' 条常见弱口令', 'ok');
      };
    }
  });

  TOOLS.push({
    id: 'misc-cheat', name: '流量 / 逆向速查', cat: 'misc', icon: '📚',
    desc: 'Wireshark/tshark 语法、内存取证、逆向静态+动态调试命令速查，国 diff 一键复制',
    tags: ['Wireshark', '逆向', '取证', '速查'], keywords: 'wireshark tshark 逆向 gdb ida 速查 命令',
    render(host) {
      const d = document.createElement('div');
      const renderGroup = (list) => list.map(g =>
        T.card(g.t, `<div class="result" style="font-size:12px">${g.c.map(c =>
          `<div style="cursor:pointer;padding:1px 0" onclick="App.copy(${JSON.stringify(c)})">${esc(c)}</div>`).join('')}</div>`)).join('');
      d.innerHTML =
        T.note('点击任意命令行即复制到剪贴板。') +
        `<div class="sec-title">流量分析</div>${renderGroup(Misc.Checklist.traffic)}` +
        `<div class="sec-title">逆向 / PWN</div>${renderGroup(Misc.Checklist.re)}`;
      host.appendChild(d);
    }
  });

  /* ============================ 应急响应 ============================ */
  function checklistTool(id, name, icon, key, desc) {
    TOOLS.push({
      id, name, cat: 'blue', icon, desc,
      tags: ['应急响应', '排查', '加固'], keywords: '应急响应 排查 checklist 加固 后门 日志',
      render(host) {
        const d = document.createElement('div');
        d.innerHTML = T.note('逐项执行并勾选，比赛「应急响应」模块通常要求先发现后门、定位入侵时间线、清除持久化并给出加固建议。') +
          Misc.Checklist[key].map(g =>
            T.card(g.t, `<div class="result" style="font-size:12px">${g.c.map(c =>
              `<div style="cursor:pointer;padding:1px 0" onclick="App.copy(${JSON.stringify(c)})">${esc(c)}</div>`).join('')}</div>`)).join('') +
          T.card('处置流程建议', `<div class="result">
            <b>① 隔离：</b>断网但不关机，保留内存；<br>
            <b>② 排查：</b>账户 → 进程 → 网络 → 持久化 → 日志，形成时间线；<br>
            <b>③ 清除：</b>杀进程、删恶意文件与服务项、清理计划任务/ssh key；<br>
            <b>④ 加固：</b>改口令、打补丁、关闭高危端口、限制后台访问、开启日志审计；<br>
            <b>⑤ 报告：</b>入侵途径、影响范围、处置动作、改进建议（评分常看报告质量）。
          </div>`);
        host.appendChild(d);
      }
    });
  }
  checklistTool('blue-linux', 'Linux 应急响应', '🐧', 'linux', 'Linux 主机入侵排查：账户/进程/网络/持久化/日志/Webshell 全量命令');
  checklistTool('blue-win', 'Windows 应急响应', '🪟', 'windows', 'Windows 主机入侵排查：账户/进程/网络/计划任务/注册表/日志');

  TOOLS.push({
    id: 'blue-triage', name: '应急响应报告模板', cat: 'blue', icon: '📝',
    desc: '一键生成应急响应报告骨架，比赛提交物/课程作业直接套用',
    tags: ['报告', '模板'], keywords: '报告 模板 应急响应 提交',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        T.card('填写基本信息', `
          <div class="form-row"><label>单位/队伍</label><input type="text" id="org" value="兰州理工大学 K4L0NG 战队" style="flex:1">
            <label>事件时间</label><input type="text" id="tm" style="flex:1"></div>
          <div class="form-row"><label>受害主机</label><input type="text" id="host" placeholder="IP / 主机名" style="flex:1">
            <label>系统</label><input type="text" id="os" placeholder="CentOS 7 / Windows Server 2016" style="flex:1"></div>
          <div class="io-box"><div class="io-label">异常发现（每行一条）</div><textarea id="find" rows="5" placeholder="2024-xx-xx 03:12 发现异常SSH登录来源 x.x.x.x&#10;发现 /tmp/.x 可疑ELF文件"></textarea></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="gen">生成报告</button>
            <button class="btn sm" id="cp">复制</button><button class="btn sm" id="dl">导出 Markdown</button></div>`) +
        T.card('报告预览', `<textarea id="out" rows="18"></textarea>`);
      host.appendChild(d);
      d.querySelector('#tm').value = new Date().toLocaleString('zh-CN');
      d.querySelector('#gen').onclick = () => {
        const finds = d.querySelector('#find').value.split('\n').filter(Boolean);
        const report =
          `# 网络安全应急响应报告\n\n` +
          `**处置单位：** ${d.querySelector('#org').value}\n` +
          `**报告时间：** ${d.querySelector('#tm').value}\n` +
          `**受害主机：** ${d.querySelector('#host').value || '（待填）'}\n` +
          `**操作系统：** ${d.querySelector('#os').value || '（待填）'}\n\n` +
          `## 一、事件概述\n\n` +
          `（描述事件发现经过、初始现象与影响范围）\n\n` +
          `## 二、检测与分析\n\n` +
          `### 2.1 异常现象\n\n` +
          (finds.length ? finds.map(f => `- ${f}`).join('\n') : '- （待补充）') + `\n\n` +
          `### 2.2 排查过程\n\n` +
          `- **账户排查**：未发现异常新增账户 / 发现 XXX\n` +
          `- **进程排查**：发现可疑进程 PID XXX，路径 /tmp/xxx\n` +
          `- **网络连接**：发现与 X.X.X.X 的异常外连\n` +
          `- **持久化**：发现计划任务 / crontab 项 XXX\n` +
          `- **日志分析**：Auth.log 中出现 N 次失败登录\n` +
          `- **恶意文件**：MD5 XXXX，判定为 XXX 家族木马\n\n` +
          `### 2.3 时间线\n\n` +
          `| 时间 | 事件 |\n| --- | --- |\n| （待填） | 首次异常访问 |\n| （待填） | 植入恶意文件 |\n| （待填） | 发现并告警 |\n\n` +
          `## 三、处置措施\n\n` +
          `1. 隔离受影响主机，阻断对外连接\n` +
          `2. 终止恶意进程并清除持久化项\n` +
          `3. 重置相关账户口令与密钥\n` +
          `4. 修补漏洞并进行全盘木马查杀\n\n` +
          `## 四、加固建议\n\n` +
          `- 关闭非必要端口，限制管理后台访问来源\n` +
          `- 开启集中日志审计与文件完整性监控\n` +
          `- 定期更新补丁，最小化服务与权限分配\n` +
          `- 部署主机入侵检测（HIDS）与定期演练\n\n` +
          `## 五、结论\n\n` +
          `（总结入侵根源、已造成的影响、后续改进方向）\n`;
        d.querySelector('#out').value = report;
        App.toast('报告已生成', 'ok');
      };
      d.querySelector('#cp').onclick = () => App.copy(d.querySelector('#out').value);
      d.querySelector('#dl').onclick = () => App.download('应急响应报告.md', d.querySelector('#out').value);
    }
  });

  /* ============================ 外部工具 ============================ */
  TOOLS.push({
    id: 'ext-local', name: '本机工具箱', cat: 'ext', icon: '🧰',
    desc: '整合 sqlmap / nmap / binwalk / hashcat 等外部工具的启动命令，检测本机安装情况并一键拉起终端',
    tags: ['外部工具', 'sqlmap', 'nmap', 'hashcat'], keywords: '外部工具 sqlmap nmap binwalk exiftool 终端',
    render(host) {
      const d = document.createElement('div');
      const groups = [...new Set(ExtLib.LOCAL.map(x => x.g))];
      d.innerHTML =
        T.note('若工具已加入 PATH，可<b>一键打开终端并预填命令</b>；未安装则显示官方地址供下载。<br>建议在 Kali / WSL 环境下使用，本机为 Windows 时请先确认 PATH。') +
        T.card('筛选', `<div class="form-row"><label>类别</label><select id="g" style="max-width:160px">
            ${T.opt('', '全部')}${groups.map(x => T.opt(x, x)).join('')}</select>
            <label>搜索</label><input type="text" id="q" placeholder="工具名 / 用途…" style="flex:1">
            <button class="btn" id="detect">检测本机已安装</button></div>`) +
        `<div id="list" style="margin-top:14px"></div>`;
      host.appendChild(d);
      const list = d.querySelector('#list');
      const installed = new Set();
      function render() {
        const g = d.querySelector('#g').value, q = d.querySelector('#q').value.trim().toLowerCase();
        const items = ExtLib.LOCAL.filter(x => (!g || x.g === g) && (!q || (x.name + x.desc).toLowerCase().includes(q)));
        list.innerHTML = T.card(`工具列表（${items.length}）`, T.tbl(['工具', '类别', '状态', '用途', '操作'],
          items.map(x => [`<code>${esc(x.name)}</code>`, x.g,
            installed.has(x.name) ? '<span style="color:var(--ok)">✔ 已安装</span>' : '<span style="color:var(--fg-mute)">未知</span>',
            esc(x.desc),
            `<button class="btn sm" data-run="${esc(x.cmd)}">启动</button> ${x.url ? `<button class="btn sm ghost" data-url="${esc(x.url)}">官网</button>` : ''}`])));
        list.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
          App.ipc.runCmd(b.dataset.run);
          App.toast('已尝试拉起终端：' + b.dataset.run.slice(0, 40), 'ok');
        });
        list.querySelectorAll('[data-url]').forEach(b => b.onclick = () => App.ipc.openExternal(b.dataset.url));
      }
      d.querySelector('#g').onchange = render;
      d.querySelector('#q').oninput = render;
      d.querySelector('#detect').onclick = async () => {
        if (!window.api || !window.api.scanTool) return App.toast('仅在桌面客户端内支持检测', 'warn');
        App.toast('正在检测…');
        for (const x of ExtLib.LOCAL) {
          const ok = await window.api.scanTool(x.name);
          if (ok) installed.add(x.name);
        }
        render();
        App.toast(`检测完成，已安装 ${installed.size} 个工具`, 'ok');
      };
      render();
    }
  });

  TOOLS.push({
    id: 'ext-online', name: '在线资源导航', cat: 'ext', icon: '🌍',
    desc: '解题平台、Writeup 站点、密码查询、NEWS-Cert व्यवस्था footprint 国内外常用资源索引',
    tags: ['平台', 'Writeup', '资源'], keywords: '平台 buu adworld nssctf ctftime 资源 导航',
    render(host) {
      const d = document.createElement('div');
      const groups = [...new Set(ExtLib.ONLINE.map(x => x.g))];
      d.innerHTML = T.note('点击卡片跳转到对应网站。<b>断网比赛时使用本工具内置的离线模块即可。</b>') +
        groups.map(g => T.card(g, `<div class="grid-cards">${ExtLib.ONLINE.filter(x => x.g === g).map(x =>
          `<div class="tcard" data-url="${esc(x.url)}"><h4>${esc(x.name)}</h4><p>${esc(x.desc)}</p></div>`).join('')}</div>`)).join('');
      host.appendChild(d);
      d.querySelectorAll('[data-url]').forEach(el => el.onclick = () => App.ipc.openExternal(el.dataset.url));
    }
  });

  TOOLS.push({
    id: 'ext-learn', name: '海丰杯备战指南', cat: 'ext', icon: '🎓', badge: '奇点',
    desc: '按甘肃省「海丰杯」高校网络安全技能大赛官方赛点拆解，附奇点战队分工与比赛节奏建议',
    tags: ['海丰杯', '考点', '奇点'], keywords: '海丰杯 考点 奇点 备战 分工',
    render(host) {
      const d = document.createElement('div');
      const groups = [...new Set(ExtLib.LEARN.map(x => x.g))];
      d.innerHTML =
        `<div class="w-hero"><h1>甘肃省「海丰杯」高校网络安全技能大赛</h1>
          <p>面向 LUT 信息安全协会 · 奇点战队的针对性备战地图。大赛采用解题模式 CTF 赛制，综合考察
          <b>国产商用密码应用、工业信息安全、网络攻防渗透、数据取证逆向、应急响应</b> 五大方向。</p></div>` +
        groups.map(g => T.card(g, `<div class="grid-cards">${ExtLib.LEARN.filter(x => x.g === g).map(x =>
          `<div class="tcard"><h4>${esc(x.name)}</h4><p>${esc(x.desc)}</p></div>`).join('')}</div>`)).join('') +
        T.card('奇点战队', `<div class="result">
          <b>战队</b>：奇点（Singularity）<br>
          <b>方向</b>：Web / Crypto / Misc / Reverse / Pwn / 应急响应<br>
          <b>备战</b>：按个人方向选择工具，赛前统一环境、字典和提交格式；赛中按题目节奏分工，不虚构荣誉，成绩以实际比赛为准。<br>
          <span style="color:var(--fg-mute)">※ 建议新人先从 Web + Misc 入门，配合本工具的「工具启动台」与「在线资源」循序渐进。</span>
        </div>`);
      host.appendChild(d);
    }
  });

  TOOLS.push({
    id: 'about', name: '关于本工具', cat: 'ext', icon: 'ℹ️',
    desc: '版本信息、技术说明、免责声明',
    tags: ['关于', '版本'], keywords: '关于 about 版本 说明',
    render(host) {
      const d = document.createElement('div');
      d.innerHTML =
        `<div class="w-hero">
          <h1>LUTCTF 工具合集 <span style="font-size:13px;color:var(--fg-mute);font-weight:400">v2.2.1</span></h1>
          <p>LUT 信息安全协会 · 奇点战队（Singularity）专用 · 为甘肃省「海丰杯」高校网络安全技能大赛打造的一体化解题工作台。</p>
        </div>` +
        T.card('设计原则', `<div class="result">
          <b>① 完全离线</b> —— 所有算法本地实现（含 MD5 / SM3 / SM4 / RSA / AES / LSB / FFT），不依赖任何外部 API，比赛断网可用；<br><br>
          <b>② 数据不外传</b> —— 除「在线资源导航」「HTTP 构造器」由你主动触发外，应用不做任何网络请求，输入输出均在本机；<br><br>
          <b>③ 零安装依赖</b> —— 核心能力为纯 JS 实现，无需 Python/Java 环境即可完成绝大多数 Misc / Crypto 题；<br><br>
          <b>④ 贴合赛点</b> —— 针对海丰杯「国产商用密码」考点内置 SM3/SM4，针对「数据取证逆向」内置文件结构与 ZIP 伪加密分析。
        </div>`) +
        T.card('知识域覆盖', `<div class="result">
          • <b>编码转换</b>：Base 全族、URL/HTML/Unicode、摩斯/培根/猪圈、进制比特<br>
          • <b>古典密码</b>：凯撒、维吉尼亚（自动破译）、栅栏、列移位、Playfair、仿射、爬山法替换破解<br>
          • <b>现代密码</b>：MD5/SHA/NTLM/SM3/CRC32/HMAC、AES/RC4/SM4、RSA 全套攻击<br>
          • <b>隐写取证</b>：LSB/位平面/通道变换、文件头扫描、PNG/JPEG 结构、strings、频谱图、ZIP 伪加密<br>
          • <b>Web 安全</b>：Payload 字典、JWT 伪造、HTTP 构造、WAF 绕过<br>
          • <b>杂项辅助</b>：时间戳、正则、字典生成、流量与逆向速查<br>
          • <b>应急响应</b>：Linux/Windows 排查清单、报告模板<br>
          • <b>外部整合</b>：本机工具箱一键唤起、在线资源导航、海丰杯备战指南
        </div>`) +
        T.card('第三方组件', `<div class="result">
          <b>EBCTFCodeBox</b> · Apache-2.0 · 878 函数 · <a href="#" id="ebNotice" style="color:var(--accent)">上游 GitHub</a><br>
          <b>jsQR</b> · MIT · 离线二维码识别<br>
          <b>Electron / electron-builder</b> · MIT · 运行时与打包<br>
          完整来源、版本和修改说明见项目根目录 <code>THIRD_PARTY_NOTICES.md</code>。
        </div>`) +
        T.card('免责声明', `<div class="result" style="border-color:var(--warn)">
          本工具仅供<b>网络安全学习、授权测试与正式竞赛</b>使用。请在法律允许范围内使用，<br>
          禁止用于未经授权的系统渗透、破坏或任何违法活动。作者不承担因滥用造成的任何责任。
        </div>`) +
        T.card('快捷键', `<div class="result">
          <code>Ctrl + K</code> —— 打开全局搜索（支持工具名、算法、考点关键词）<br>
          <code>Esc</code> —— 关闭搜索浮层<br>
          左上角 ⇅ 按钮 —— 窗口置顶（方便边做题边看资料）
        </div>`);
      host.appendChild(d);
      const ebNotice = d.querySelector('#ebNotice');
      if (ebNotice) ebNotice.onclick = e => { e.preventDefault(); App.ipc.openExternal('https://github.com/Henglie/EBCTFCodeBox'); };
    }
  });

})();
