/* ============================================================
   main.js — Electron 主进程
   奇点战队 · CTF 工具合集
   ============================================================ */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

/* 某些宿主（VS Code / Electron 宿主 / 终端）会遗留 ELECTRON_RUN_AS_NODE=1，
   这会让 electron.exe 以纯 Node 模式运行，界面永远不出现。
   在 require('electron') 之前就检测并重新拉起一个干净实例。 */
if (process.env.ELECTRON_RUN_AS_NODE) {
  try {
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    env.LUTCTF_RELAUNCHED = '1';
    const args = (process.defaultApp && process.argv[1]) ? [process.argv[1]] : [];
    spawn(process.execPath, args, { env, detached: true, stdio: 'ignore', cwd: __dirname }).unref();
  } catch (e) { /* 忽略，下面仍会尽快退出 */ }
  process.exit(0);
}

/* ------------------------------------------------------------
   自愈启动
   如果进程继承了 ELECTRON_RUN_AS_NODE=1（VS Code、各类 Electron 宿主、
   部分终端都会留下这个变量），electron.exe 会以「纯 Node 模式」运行，
   require('electron') 只返回一个路径字符串，拿不到 app，启动即崩溃：
     TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')
   现象就是「双击没反应」。这里先清掉该变量，再把自身重新拉起一次。
   ------------------------------------------------------------ */
const electron = require('electron');
if (!electron || !electron.app) {
  if (!process.env.LUTCTF_RELAUNCHED) {
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    env.LUTCTF_RELAUNCHED = '1';
    try {
      const relaunchArgs = (process.defaultApp && process.argv[1]) ? [process.argv[1]] : [];
      spawn(process.execPath, relaunchArgs, {
        env,
        detached: true,
        stdio: 'ignore',
        cwd: __dirname
      }).unref();
    } catch (e) { /* 拉起失败就直接退出，避免死循环 */ }
  }
  process.exit(0);
}

const { app, BrowserWindow, ipcMain, shell, dialog } = electron;

let win;

/* ============================================================
   EBCTFCodeBox 本地静态服务（Apache-2.0 第三方模块）
   ES module / WASM / Service Worker 需要 http(s) 环境，这里只绑定
   127.0.0.1 的随机端口，不对外网开放，也不上传任何数据。
   ============================================================ */
const EBCTF_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json', '.zip': 'application/zip', '.bin': 'application/octet-stream'
};
let ebctfPort = 0;

function startEbctfServer() {
  return new Promise(resolve => {
    const root = path.join(__dirname, 'renderer', 'ebctf');
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        let p = decodeURIComponent(u.pathname);
        if (p === '/' || p === '') p = '/index.html';
        if (p.endsWith('/')) p += 'index.html';
        const file = path.normalize(path.join(root, p));
        const rel = path.relative(root, file);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden'); return;
        }
        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found'); return;
          }
          res.writeHead(200, {
            'Content-Type': EBCTF_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
          });
          if (req.method === 'HEAD') res.end(); else res.end(data);
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error');
      }
    });
    server.on('error', () => { ebctfPort = 0; resolve(); });
    server.listen(0, '127.0.0.1', () => {
      ebctfPort = server.address().port;
      resolve();
    });
  });
}

ipcMain.on('ebctf-url', (e) => {
  e.returnValue = ebctfPort ? `http://127.0.0.1:${ebctfPort}/index.html` : '';
});

/* 兼容性加固：虚拟机 / 远程桌面 / 显卡驱动异常的环境下，
   GPU 进程崩溃会导致整个应用退出，这里主动关闭硬件加速以保证稳定启动 */
try {
  /* 关闭独立 GPU 进程与沙箱：部分环境（虚拟机 / 远程桌面 / 驱动异常）
     下 GPU 子进程启动即崩溃，会连带整个应用退出 */
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('no-sandbox');
  app.disableHardwareAcceleration();
} catch (e) { /* 某些平台可能不支持，忽略即可 */ }

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b1220',
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  /* 兜底：部分虚拟机 / 远程桌面环境下 ready-to-show 可能永远不触发，
     导致「进程在跑、界面不出来」。8 秒后强制显示窗口。 */
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 8000);

  win.on('closed', () => { win = null; });

  /* 开发环境快捷键（可选） */
  win.webContents.on('did-finish-load', () => {
    win.setTitle('奇点 CTF 工具合集 · 奇点战队');
  });

  /* 加载失败兜底：避免出现「进程在跑但没有窗口」的黑洞情况 */
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[load-fail]', code, desc, url);
    dialog.showErrorBox('界面加载失败',
      `错误码：${code}\n${desc}\n\n路径：${url}\n\n请确认 renderer 目录完整。`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-gone]', JSON.stringify(details));
  });
}

/* 单实例锁定 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(async () => { await startEbctfServer(); createWindow(); });
}

app.on('window-all-closed', () => { app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* ---------------- IPC ---------------- */
ipcMain.on('win-min', () => win && win.minimize());
ipcMain.on('win-max', () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('win-close', () => win && win.close());

ipcMain.handle('win-pin', () => {
  if (!win) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next);
  return next;
});

ipcMain.handle('app-version', () => app.getVersion());

/* HTTP 请求（主进程发起，绕过浏览器 CORS 限制） */
ipcMain.handle('aes-cbc', (_e, opts = {}) => {
  try {
    const crypto = require('crypto');
    const key = Buffer.from(opts.key || []);
    const iv = Buffer.from(opts.iv || []);
    const data = Buffer.from(opts.data || []);
    if (![16, 24, 32].includes(key.length)) throw new Error('key 必须是 16/24/32 字节');
    if (iv.length !== 16) throw new Error('iv 必须是 16 字节');
    if (!data.length || data.length % 16) throw new Error('data 长度必须是 16 的倍数');
    const alg = key.length === 16 ? 'aes-128-cbc' : key.length === 24 ? 'aes-192-cbc' : 'aes-256-cbc';
    const op = opts.op === 'encrypt' ? 'createCipheriv' : 'createDecipheriv';
    const c = crypto[op](alg, key, iv);
    c.setAutoPadding(false);
    const out = Buffer.concat([c.update(data), c.final()]);
    return { ok: true, base64: out.toString('base64'), hex: out.toString('hex') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('http-request', async (_e, opts = {}) => {
  const { net } = require('electron');
  const startTime = Date.now();
  return new Promise((resolve) => {
    let url;
    try { url = new URL(opts.url); } catch (err) {
      return resolve({ ok: false, error: 'URL 无效: ' + err.message });
    }
    const method = (opts.method || 'GET').toUpperCase();
    try {
      const req = net.request({
        method,
        url: url.toString(),
        headers: opts.headers || {},
        redirect: 'manual'
      });
      let finished = false;
      req.on('response', (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          if (finished) return;
          finished = true;
          const bodyText = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
          resolve({
            ok: true,
            status: res.statusCode,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: bodyText,
            ms: Date.now() - startTime
          });
        });
      });
      req.on('error', (err) => {
        if (finished) return;
        finished = true;
        resolve({ ok: false, error: err.message, ms: Date.now() - startTime });
      });
      if (opts.body && !['GET', 'HEAD'].includes(method)) req.write(opts.body);
      req.end();
      setTimeout(() => {
        if (!finished) { finished = true; resolve({ ok: false, error: '请求超时', ms: Date.now() - startTime }); }
      }, opts.timeout || 15000);
    } catch (err) {
      resolve({ ok: false, error: err.message, ms: Date.now() - startTime });
    }
  });
});

/* 检测本机是否安装了某命令行工具 */
const { exec } = require('child_process');
ipcMain.handle('scan-tool', (name) => new Promise((resolve) => {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return resolve(false);
  const cmd = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
  try {
    exec(cmd, { timeout: 4000 }, (err) => resolve(!err));
  } catch (err) {
    resolve(false);
  }
}));

ipcMain.on('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

/* 外部命令行工具启动：仅用于打开终端，命令来自内置工具清单 */
ipcMain.on('run-cmd', (_e, cmd) => {
  if (typeof cmd !== 'string' || !cmd.trim()) return;
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/k', cmd], { detached: true, stdio: 'ignore', cwd: app.getPath('home') }).unref();
    } else if (process.platform === 'darwin') {
      spawn('osascript', ['-e', 'tell app "Terminal" to do script ' + JSON.stringify(cmd)], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('x-terminal-emulator', ['-e', 'bash', '-c', cmd + '; exec bash'], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.error('run-cmd failed:', err.message);
  }
});

/* 文件另存为 */
ipcMain.handle('save-file', async (_e, { name, data }) => {
  if (!win) return null;
  const res = await dialog.showSaveDialog(win, {
    title: '导出文件',
    defaultPath: path.join(app.getPath('desktop'), name || 'export.txt'),
    filters: [{ name: '所有文件', extensions: ['*'] }]
  });
  if (res.canceled || !res.filePath) return null;
  const fs = require('fs');
  try {
    fs.writeFileSync(res.filePath, data, 'utf8');
    return res.filePath;
  } catch (err) {
    console.error(err.message);
    return null;
  }
});
