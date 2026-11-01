/* 目标正则有界匹配引擎 · 浏览器宿主（ESM）：专用 Worker + 父级绝对时限真终止 + 自动重建
 * 契约：接口契约.md §2-§4。主线程绝无 RegExp.exec（本文件除编译校验外不含正则执行）。
 * 落位：src/ui/（UI 层，非 core；core 要求零 DOM 依赖）。Worker = ./targetRegexWorker.js（经典 Worker）。
 */
export const DEFAULT_LIMITS = Object.freeze({
  budgetMs: 500,
  maxInputLen: 100000,
  maxPatternLen: 256,
  maxMatchesPerTarget: 5000,
  maxTargets: 64,
});

export function createRegexEngine(options) {
  const defaults = Object.freeze({ ...DEFAULT_LIMITS, ...(options || {}) });
  let worker = null;
  let jobId = 0;
  let pending = null;   // { id, resolve, reject, timer, onAbort, signal }
  let disposed = false;

  const killWorker = () => {
    if (worker) { worker.terminate(); worker = null; }
  };

  const ensureWorker = () => {
    if (worker) return worker;
    if (disposed) throw new Error("engine disposed");
    worker = new Worker(new URL("./targetRegexWorker.js", import.meta.url));
    worker.onmessage = (e) => {
      const msg = e.data;
      if (!pending || msg.jobId !== pending.id) return; // 失效结果丢弃（旧作业/已取消）
      const p = pending; settlePending(null);
      clearTimeout(p.timer);
      // 作业已完成：解除 abort 监听，避免其残留闭包在后续 abort 时误杀新作业的 worker。
      if (p.signal && p.onAbort) p.signal.removeEventListener("abort", p.onAbort);
      if (msg.error) p.reject(msg.error);
      else p.resolve({ ok: true, jobId: msg.jobId, results: msg.results });
    };
    return worker;
  };

  const settlePending = (next) => { pending = next; };

  const fail = (p, err) => {
    clearTimeout(p.timer);
    if (p.signal && p.onAbort) p.signal.removeEventListener("abort", p.onAbort);
    p.reject(err);
  };

  function match(text, targets, opts) {
    if (disposed) return Promise.reject({ code: "E_WORKER", message: "engine disposed" });
    const limits = { ...defaults, ...((opts && opts.limits) || {}) };
    // 上一作业在途：立即取消（terminate），新作业前重建
    if (pending) {
      const old = pending; settlePending(null);
      killWorker();
      fail(old, { code: "E_CANCELLED", message: "被新作业取代", jobId: old.id });
    }
    const id = ++jobId;
    text = String(text == null ? "" : text);
    const active = (targets || []).filter((t) => t && t.enabled !== false);
    const limErr =
      text.length > limits.maxInputLen ? { code: "E_LIMIT_INPUT", message: "输入长度 " + text.length + " 超上限 " + limits.maxInputLen } :
      active.length > limits.maxTargets ? { code: "E_LIMIT_TARGETS", message: "启用目标数超上限 " + limits.maxTargets } :
      null;
    if (limErr) return Promise.reject({ ...limErr, jobId: id });
    return new Promise((resolve, reject) => {
      const p = { id, resolve, reject, timer: null, signal: null, onAbort: null };
      settlePending(p);
      p.timer = setTimeout(() => {
        killWorker();                       // 父级真终止，非同线程软超时
        const cur = pending && pending.id === id ? pending : null;
        settlePending(null);
        fail(p, { code: "E_TIMEOUT", message: "匹配超过绝对时限 " + limits.budgetMs + "ms，worker 已终止并将在下次作业前重建", jobId: id });
        void cur;
      }, limits.budgetMs);
      if (opts && opts.signal) {
        p.signal = opts.signal;
        if (p.signal.aborted) {
          killWorker(); settlePending(null);
          fail(p, { code: "E_CANCELLED", message: "已取消", jobId: id });
          return;
        }
        p.onAbort = () => {
          // 核作业归属：仅当本作业仍是当前在途作业时才终止 worker；
          // 已完成作业的 abort 不得杀掉正在服务新作业的同一 worker。
          if (pending && pending.id === id) { killWorker(); settlePending(null); }
          fail(p, { code: "E_CANCELLED", message: "已取消", jobId: id });
        };
        p.signal.addEventListener("abort", p.onAbort);
      }
      ensureWorker().postMessage({ jobId: id, text, targets: active, limits });
    });
  }

  return {
    match,
    dispose() { disposed = true; killWorker(); if (pending) fail(pending, { code: "E_CANCELLED", message: "engine disposed", jobId: pending.id }), settlePending(null); },
    get alive() { return !!worker; },
  };
}

/* 参考高亮切片器（纯函数，无 HTML）：消费方渲染必须走 textContent/Range 的契约 §5 示范。
 * 返回 [{ text, hit }] 段数组；span 合并、排序、越界裁剪；绝不拼接 HTML 字符串。
 */
export function highlightSegments(text, spansPerTargets) {
  // spansPerTargets: Array<Array<[start,end]>> —— 多目标并集，重叠合并
  const all = [];
  for (const spans of spansPerTargets || []) for (const [s, e] of spans) {
    if (e > s) all.push([s, e]);           // 零长 span 不参与高亮（契约 §4 允许返回，渲染忽略）
  }
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of all) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) { if (e > last[1]) last[1] = e; }
    else merged.push([s, e]);
  }
  const out = [];
  let pos = 0;
  const str = String(text);
  for (const [s, e] of merged) {
    const st = Math.max(0, Math.min(s, str.length));
    const en = Math.max(st, Math.min(e, str.length));
    if (st > pos) out.push({ text: str.slice(pos, st), hit: false });
    out.push({ text: str.slice(st, en), hit: true });
    pos = en;
  }
  if (pos < str.length) out.push({ text: str.slice(pos), hit: false });
  return out;
}
