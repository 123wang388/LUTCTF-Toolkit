/*
 * steghide.worker.js — steghide 0.5.1 WASM 单线程作业 Worker。
 * 每作业一个全新模块实例（上游进程级状态多，新实例同时带来全新 MEMFS）。
 * 上游从不 fclose 输出文件且 EXIT_RUNTIME=0 → 作业后必须显式 _fflush(0)。
 * 上游缺 -p 会永久阻塞 stdin → 所有调用强制带 -p（空口令也传空串）。
 * 取出 N 字节不代表口令已认证（无 MAC）。
 */
import createSteghideModule from "./steghide.js";

async function runJob(msg) {
  const log = [];
  const mod = await createSteghideModule({
    locateFile: (p) => new URL("./" + p, import.meta.url).href,
    noInitialRun: true,
    print: (s) => log.push(String(s)),
    printErr: (s) => log.push(String(s)),
  });
  const ext = msg.ext; // "jpg" | "wav"
  const inName = "/in." + ext;
  mod.FS.writeFile(inName, msg.carrier);
  let outName;
  // steghide CLI 语法：第一个参数必须是子命令（embed/extract），-p 只能跟在选项区。
  // 上游缺 -p 会永久阻塞 stdin → 两条子命令都强制带 -p（空口令也传空串）。
  let argv;
  if (msg.op === "embed") {
    mod.FS.writeFile("/payload.bin", msg.payload);
    outName = "/out." + ext;
    argv = ["embed", "-cf", inName, "-ef", "/payload.bin", "-sf", outName, "-f", "-p", msg.key == null ? "" : String(msg.key)];
  } else {
    outName = "/out.bin";
    argv = ["extract", "-sf", inName, "-xf", outName, "-p", msg.key == null ? "" : String(msg.key)];
  }
  let rc = 0, trapped = false;
  try {
    rc = mod.callMain(argv);
  } catch (e) {
    trapped = true;
    rc = e && typeof e.status === "number" ? e.status : "trap";
    log.push("callMain threw: " + String(e));
  }
  try { if (typeof mod._fflush === "function") mod._fflush(0); } catch {}
  let bytes = null;
  try { bytes = mod.FS.readFile(outName); } catch (e) { bytes = null; }
  const ok = !trapped && rc === 0 && bytes && bytes.length > 0;
  const result = { id: msg.id, ok: !!ok, rc, trapped, bytes: ok ? bytes : null, outBytes: bytes ? bytes.length : 0, log };
  return result;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    const res = await runJob(msg);
    if (res.bytes) self.postMessage(res, [res.bytes.buffer]);
    else self.postMessage(res);
  } catch (e) {
    self.postMessage({ id: msg && msg.id, ok: false, rc: null, trapped: false, bytes: null, outBytes: 0, log: [], error: String(e && e.stack ? e.stack : e) });
  }
};
