/*
 * primeInspector.js — 素数判定与筛选（cat:'radix'，单向 run）。
 *
 * 与 primeGen（大素数生成）/ primeTest（素性检验）配套：
 *  - judge 档：对单个 n 输出 7 档判定依据报告——梅森（Lucas-Lehmer）/孪生/索菲·热尔曼/
 *    安全/费马/强素数/p±1 B-光滑 + 概率素数口径说明。输出句式示例：
 *    「是索菲·热尔曼素数：2p + 1 = 47 亦为素数」。
 *  - filterRange 档：区间 [lo, hi] 扫描 + 条件勾选（孪生/热尔曼/安全/强素数/p±1 光滑 B），
 *    勾梅森/费马自动切换特形枚举（随机扫描命中概率≈0，不能糊弄）。
 *  - filterBits 档：指定位数随机生成素数（复用 primeGen 的 CSPRNG + Miller-Rabin 例程）
 *    + 条件勾选。
 *  - mersenne 档：指数 1..maxExp 逐个 Lucas-Lehmer，输出梅森素数表 + 判定依据。
 *  - fermat 档：F_0..F_maxK（≤32）状态表（已知素数 / 已知合数含最小素因子 / 未知）。
 *
 * 长任务红线（与显式触发白名单 / Worker 通道配合）：
 *  - 所有筛选档带 maxMs 时间预算（超时即停并如实标「截断」）+ maxResults 上限；
 *  - shouldStop() 钩子留给 Worker 通道 terminate / 未来分片接线；
 *  - 本 op 建议加入显式触发白名单（区间大 / 位数高时同步计算秒级起步）。
 *
 * 红线：core 层零 UI / i18n / main 依赖（仅 registry）；零外发；纯本地计算。
 * 分解预算耗尽如实标「过大未分解 / 光滑性无法判定」，绝不冒充素性或光滑结论。
 * 已知表（费马因子等）仅在对拍脚本逐项验证整除后才可信，验证不过自动降级不采信。
 */
import { register } from "./registry.js";
import {
  judgeAll, filterRange, filterBits, mersenneSweep, fermatSweep, COND_DEFS,
} from "./primeInspectorCore.js";

const BOOL_PARAMS = COND_DEFS.map((c) => ({
  key: c.key, label: c.label, type: "bool", default: false,
}));

register({
  id: "primeInspector", cat: "radix", name: "素数判定与筛选",
  desc: "对大整数输出 8 档判定依据报告（梅森 Lucas-Lehmer/孪生/索菲·热尔曼/安全/费马/2^(2^e)−1 形「P素数」/强素数/p±1 B-光滑），或按区间·位数+条件勾选筛选素数（梅森/费马走特形枚举；限时+上限，可取消）",
  params: [
    { key: "mode", label: "档位", type: "select", default: "judge",
      options: [
        { value: "judge", label: "判定报告（单数 n，8 档逐项依据）" },
        { value: "filterRange", label: "区间筛选（[lo, hi] + 条件勾选）" },
        { value: "filterBits", label: "位数筛选（随机生成 + 条件勾选）" },
        { value: "mersenne", label: "梅森素数表（Lucas-Lehmer，指数 1..maxExp）" },
        { value: "fermat", label: "费马素数状态表（F_0..F_maxK）" },
      ] },
    { key: "n", label: "n（十进制大整数，判定档）", type: "text", ui: "bigText", rows: 3, default: "",
      placeholder: "如 2305843009213693951（2^61−1）或 23" },
    { key: "lo", label: "区间下界 lo（区间筛选档）", type: "text", default: "1" },
    { key: "hi", label: "区间上界 hi（区间筛选档）", type: "text", default: "1000" },
    { key: "bits", label: "位数（位数筛选档）", type: "number", default: 32, placeholder: "2..1024" },
    { key: "count", label: "要找几个（位数筛选档）", type: "number", default: 5 },
    { key: "maxExp", label: "梅森指数上限 maxExp（梅森表档）", type: "number", default: 64, placeholder: "≤ 4096" },
    { key: "maxK", label: "费马 k 上限 maxK（费马表档）", type: "number", default: 12, placeholder: "0..32" },
    ...BOOL_PARAMS,
    { key: "smoothB", label: "光滑界 B（p±1 光滑档 / 判定档）", type: "number", default: 1000000, placeholder: "如 1000000" },
    { key: "maxResults", label: "结果数上限", type: "number", default: 20, placeholder: "1..500" },
    { key: "maxMs", label: "时间预算（毫秒，超时如实截断）", type: "number", default: 10000, placeholder: "≤ 120000" },
  ],
  run: (_text, p) => {
    const mode = String(p?.mode || "judge");
    const conds = {};
    for (const c of COND_DEFS) conds[c.key] = !!p?.[c.key];
    const smoothB = Math.max(1, Math.floor(Number(p?.smoothB) || 1000000));
    const maxResults = Math.max(1, Math.min(500, Math.floor(Number(p?.maxResults) || 20)));
    const maxMs = Math.max(1, Math.min(120000, Math.floor(Number(p?.maxMs) || 10000)));

    const joinFilterResult = (r) => {
      const lines = [];
      lines.push(`候选来源：${r.source}`);
      lines.push(r.truncated
        ? `（预算内未扫完/未收满，结果已如实截断：用时 ${r.elapsedMs} ms${r.stopped ? "，被外部取消" : ""}）`
        : `用时 ${r.elapsedMs} ms${r.stopped ? "（被外部取消）" : ""}`);
      if (!r.results.length) {
        lines.push("未找到满足全部勾选条件的素数（预算内）。可放宽条件 / 缩小区间 / 调大时间预算。");
        return lines.join("\n");
      }
      lines.push(`命中 ${r.results.length} 条：`);
      r.results.forEach((item, i) => {
        lines.push(`${i + 1}) 素数 ${item.n}：${item.lines.join("；")}`);
      });
      return lines.join("\n");
    };

    if (mode === "judge") {
      const raw = String(p?.n ?? "").trim();
      if (!raw) throw new Error("判定档需要参数 n（十进制大整数）");
      const cleaned = raw.replace(/[\s,　_]/g, "");
      if (!/^[+-]?\d+$/.test(cleaned)) throw new Error(`n 不是合法十进制整数：${raw.slice(0, 64)}`);
      return judgeAll(BigInt(cleaned), { smoothB }).join("\n");
    }
    if (mode === "filterRange") {
      const lo = BigInt(String(p?.lo ?? "1").trim().replace(/[\s,　_]/g, "") || "1");
      const hi = BigInt(String(p?.hi ?? "1000").trim().replace(/[\s,　_]/g, "") || "1000");
      const r = filterRange({ lo, hi, conds, B: smoothB, maxResults, maxMs });
      return joinFilterResult(r);
    }
    if (mode === "filterBits") {
      const r = filterBits({
        bits: p?.bits, count: p?.count, conds, B: smoothB, maxResults, maxMs,
      });
      return joinFilterResult(r);
    }
    if (mode === "mersenne") {
      const r = mersenneSweep({ maxExp: p?.maxExp, conds, B: smoothB, maxResults, maxMs });
      return joinFilterResult(r);
    }
    if (mode === "fermat") {
      const r = fermatSweep({ maxK: p?.maxK, conds, B: smoothB, maxResults });
      const lines = [];
      lines.push(`候选来源：${r.source}`);
      lines.push("F_k 状态表（判定依据逐行）：");
      lines.push(...r.allLines.map((s) => "· " + s));
      if (r.results.length) {
        lines.push(`其中为素数且满足其余勾选条件 ${r.results.length} 条：`);
        r.results.forEach((item, i) => lines.push(`${i + 1}) 素数 ${item.n}：${item.lines.join("；")}`));
      }
      return lines.join("\n");
    }
    throw new Error(`未知档位：${mode}（合法值：judge/filterRange/filterBits/mersenne/fermat）`);
  },
});
