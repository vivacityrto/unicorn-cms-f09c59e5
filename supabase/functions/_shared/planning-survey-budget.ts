/** Best-effort per-isolate ingress budget. No IP, cookie, token or campaign keys.
 * This is not a distributed gateway limit and must not be represented as one.
 */
export function createSurveyIngressBudget(limit: number, windowMs: number, clock: () => number) {
  let start = -Infinity; let used = 0;
  return () => {
    const now = clock();
    if (!Number.isFinite(now) || !Number.isInteger(limit) || limit <= 0 || !Number.isFinite(windowMs) || windowMs <= 0) return false;
    if (now < start || now - start >= windowMs) { start = now; used = 0; }
    if (used >= limit) return false;
    used += 1; return true;
  };
}
