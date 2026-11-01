/* 目标正则有界匹配 Worker 内核（浏览器经典 Worker 与 Node worker_threads 双模式）
 *
 * 职责：按接口契约执行一批目标的匹配，限额内的部分结果即时返回；
 *       单条 exec 无法逐步中断 —— 超时由父级 terminate 真杀（契约 §4）。
 * 纯计算：无 DOM、无 fetch、无 import、无存储。字面目标走 indexOf，绝不过 RegExp。
 */
(function () {
  "use strict";
  var isNode = typeof self === "undefined" && typeof require === "function";
  var parent = null;
  if (isNode) parent = require("worker_threads").parentPort;

  var MAX_ZERO_LEN_STEPS = 1000000; // 空匹配推进保险丝：正常永远达不到，防理论死循环

  // ECMAScript AdvanceStringIndex(S, index, unicode)（ES2024 §22.2.7.3）：
  // unicode(u) 标志下按 Unicode code point 前进——代理对（高 D800-DBFF + 低 DC00-DFFF）一次跨 2 个
  // code unit，其余 +1；非 unicode 标志按 code unit +1。必须与 String.prototype.matchAll 的推进一致，
  // 否则零长匹配会停在代理对中间、RegExp 反复回到同一 code point，漏掉后续命中。
  function advanceStringIndex(text, index, unicode) {
    if (!unicode) return index + 1;
    if (index + 1 >= text.length) return index + 1;
    var first = text.charCodeAt(index);
    if (first < 0xD800 || first > 0xDBFF) return index + 1;
    var second = text.charCodeAt(index + 1);
    if (second < 0xDC00 || second > 0xDFFF) return index + 1;
    return index + 2;
  }

  function post(msg) {
    if (isNode) parent.postMessage(msg);
    else self.postMessage(msg);
  }

  function literalSpans(text, needle, maxMatches) {
    var spans = [];
    if (!needle) return { spans: spans, truncated: false };
    var i = text.indexOf(needle);
    while (i !== -1) {
      spans.push([i, i + needle.length]);
      if (spans.length >= maxMatches) return { spans: spans, truncated: true };
      i = text.indexOf(needle, i + needle.length); // 允许重叠命中（同 indexOf 语义链）
    }
    return { spans: spans, truncated: false };
  }

  function regexSpans(text, source, flags, maxMatches) {
    var unicode = flags.indexOf("u") >= 0;
    var re = new RegExp(source, flags.indexOf("g") >= 0 ? flags : flags + "g");
    var spans = [];
    var m;
    var guard = 0;
    while ((m = re.exec(text)) !== null) {
      // 命中 span 由 RegExp 自身给出完整 [m.index, m.index+m[0].length]（UTF-16 code unit 契约）。
      spans.push([m.index, m.index + m[0].length]);
      if (spans.length >= maxMatches) return { spans: spans, truncated: true };
      // 零长匹配：按 AdvanceStringIndex 前进，保证与 matchAll 一致且必然推进。
      if (m[0] === "") {
        // 保险丝触发必须如实报截断（限额），不得伪装成正常完成。
        if (++guard > MAX_ZERO_LEN_STEPS) return { spans: spans, truncated: true };
        re.lastIndex = advanceStringIndex(text, re.lastIndex, unicode);
      }
    }
    return { spans: spans, truncated: false };
  }

  function onMessage(job) {
    var text = job.text;
    var targets = job.targets || [];
    var limits = job.limits || {};
    var maxMatches = limits.maxMatchesPerTarget || 5000;
    var maxPatternLen = limits.maxPatternLen || 256;
    var results = [];
    for (var t = 0; t < targets.length; t++) {
      var tg = targets[t];
      if (tg.enabled === false) continue;
      var expr = String(tg.expression == null ? "" : tg.expression);
      if (expr.length > maxPatternLen) {
        post({ jobId: job.jobId, error: { code: "E_LIMIT_PATTERN", message: "目标 " + tg.id + " 表达式超长", jobId: job.jobId } });
        return;
      }
      if (tg.mode === "regex") {
        var flags = tg.flags || "";
        if (!/^[imsu]*$/.test(flags)) {
          post({ jobId: job.jobId, error: { code: "E_FLAG", message: "目标 " + tg.id + " flags 非法: " + flags, jobId: job.jobId } });
          return;
        }
        var re;
        try { re = new RegExp(expr, flags); } catch (e) {
          post({ jobId: job.jobId, error: { code: "E_SYNTAX", message: "目标 " + tg.id + " 正则语法错误: " + e.message, jobId: job.jobId } });
          return;
        }
        void re; // 编译校验；真正执行在 regexSpans 内重新编译带 g
      }
    }
    for (t = 0; t < targets.length; t++) {
      tg = targets[t];
      if (tg.enabled === false) continue;
      var r = tg.mode === "regex"
        ? regexSpans(text, String(tg.expression), tg.flags || "", maxMatches)
        : literalSpans(text, String(tg.expression), maxMatches);
      results.push({ id: tg.id, mode: tg.mode, spans: r.spans, count: r.spans.length, truncated: r.truncated });
    }
    post({ jobId: job.jobId, ok: true, results: results });
  }

  if (isNode) parent.on("message", onMessage);
  else self.onmessage = function (e) { onMessage(e.data); };
})();
