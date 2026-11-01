/* ============================================================
   registry7.js — EBCTFCodeBox 完整密码学工具箱（Apache-2.0 第三方模块）
   上游：https://github.com/Henglie/EBCTFCodeBox
   ============================================================ */
(function () {
  'use strict';
  const T = App.T;

  TOOLS.push({
    id: 'ebctf', name: 'EBCTFCodeBox 完整密码学工具箱', cat: 'crypto', icon: '🧪', badge: '811',
    desc: '集成 EBCTFCodeBox（Apache-2.0）：800+ 编解码/密码学/隐写/分析函数，含一把梭、配方链、图形编码图鉴与全 Unicode 显示；完全本地运行',
    tags: ['EBCTFCodeBox', '811 函数', 'Apache-2.0'], keywords: 'ebctf 恒烈 密码学 811 完整 工具箱 编解码 配方链',
    render(host) {
      host.classList.add('module-panel');
      const url = (window.api && window.api.ebctfUrl) ? window.api.ebctfUrl() : '';
      if (!url) {
        host.innerHTML = `<div class="note warn" style="margin:16px">EBCTF 本地服务未启动，请重启应用后再试。</div>`;
        return;
      }
      host.innerHTML =
        `<div class="module-bar">
          <span class="mb-title">EBCTFCodeBox · 811 函数</span>
          <span class="mb-sub">v0.1.12 · Apache-2.0 · 本地离线</span>
          <span class="spacer"></span>
          <button class="btn sm" id="ebReload">重新加载</button>
          <button class="btn sm" id="ebRepo">上游 GitHub</button>
        </div>
        <iframe id="ebFrame" class="module-frame" src="${url}" title="EBCTFCodeBox" allow="clipboard-read; clipboard-write"></iframe>`;
      const frame = host.querySelector('#ebFrame');
      host.querySelector('#ebReload').onclick = () => { frame.src = frame.src; App.toast('正在重新加载 EBCTF…', 'ok'); };
      host.querySelector('#ebRepo').onclick = () => App.ipc.openExternal('https://github.com/Henglie/EBCTFCodeBox');
    }
  });
})();
