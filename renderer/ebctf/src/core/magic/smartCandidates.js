import { computeSignals } from "./signals.js";

// Local-only adapter. Neither options nor decoded text are persisted here.
export function literalMatcher(crib) {
  if (typeof crib !== "string" || !crib || crib.length > 200) return null;
  return { test: text => computeSignals(text, { crib }).signals.some(s => s.label === "crib 命中") };
}

export function candidateSignals(text, opts = {}) {
  return computeSignals(text, {
    targets: Array.isArray(opts.targets) ? opts.targets : [],
    crib: typeof opts.crib === "string" ? opts.crib : "",
  });
}

// Group only proven single-step candidates; unknown/multilayer records stay separate.
export function groupSingleCandidates(candidates) {
  const groups = [], byOp = new Map();
  for (const c of candidates) {
    const chain = Array.isArray(c.chain) ? c.chain : null;
    const steps = Array.isArray(c.steps) ? c.steps : null;
    const single = (!chain || chain.length === 1) && (!steps || steps.length === 1)
      && (chain || steps || c.baseOpId);
    const label = chain?.[0] || c.opId || "";
    const base = single ? (steps?.[0]?.opId || c.baseOpId || label.split(/[(:]/)[0]) : null;
    if (!base) { groups.push({ base: null, items: [c] }); continue; }
    let group = byOp.get(base);
    if (!group) { group = { base, items: [] }; byOp.set(base, group); groups.push(group); }
    group.items.push(c);
  }
  return groups;
}
