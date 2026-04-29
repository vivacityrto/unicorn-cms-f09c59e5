// Shared helpers for the AI Drafting Insights dashboard.

export type WindowDays = 7 | 30 | 90 | 3650; // 3650 ≈ "All time"

export const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 3650, label: "All time" },
];

export type OutcomeBucket =
  | "pending"
  | "accepted_unchanged"
  | "accepted_light_edit"
  | "accepted_moderate_edit"
  | "accepted_heavy_edit"
  | "rejected";

export const OUTCOME_LABEL: Record<OutcomeBucket, string> = {
  pending: "Pending",
  accepted_unchanged: "Accepted (no edit)",
  accepted_light_edit: "Accepted (light edit)",
  accepted_moderate_edit: "Accepted (moderate edit)",
  accepted_heavy_edit: "Accepted (heavy edit)",
  rejected: "Rejected",
};

// Calm, ops-grade colour story: best (cyan/green) → worst (amber/red),
// with grey for pending. Driven by Tailwind utility classes that resolve
// to design-system tokens.
export const OUTCOME_BG: Record<OutcomeBucket, string> = {
  pending: "bg-muted",
  accepted_unchanged: "bg-emerald-500",
  accepted_light_edit: "bg-cyan-500",
  accepted_moderate_edit: "bg-yellow-500",
  accepted_heavy_edit: "bg-orange-500",
  rejected: "bg-red-500",
};

export const OUTCOME_CHIP: Record<OutcomeBucket, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  accepted_unchanged: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accepted_light_edit: "bg-cyan-50 text-cyan-700 border-cyan-200",
  accepted_moderate_edit: "bg-yellow-50 text-yellow-800 border-yellow-200",
  accepted_heavy_edit: "bg-orange-50 text-orange-800 border-orange-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export const CONFIDENCE_CHIP: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-yellow-50 text-yellow-800 border-yellow-200",
  low: "bg-red-50 text-red-700 border-red-200",
};

export function formatTokens(prompt: number | null, completion: number | null): string {
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  return `${fmt(prompt ?? 0)} → ${fmt(completion ?? 0)}`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  // dd/MM/yyyy per project memory
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Naive Levenshtein-based similarity for per-field edit distance in the
// drill-down. Same family as the function used in record-finding-decision,
// applied here client-side to compare individual fields.
export function editDistancePct(a: string | null, b: string | null): number | null {
  if (a == null || b == null) return null;
  const s1 = a.trim();
  const s2 = b.trim();
  if (s1.length === 0 && s2.length === 0) return 0;
  const m = s1.length;
  const n = s2.length;
  if (m === 0 || n === 0) return 100;
  // Bounded DP — cap at 4000 chars to keep the drill-down responsive.
  const A = s1.slice(0, 4000);
  const B = s2.slice(0, 4000);
  const lm = A.length;
  const ln = B.length;
  const prev = new Array(ln + 1);
  const curr = new Array(ln + 1);
  for (let j = 0; j <= ln; j++) prev[j] = j;
  for (let i = 1; i <= lm; i++) {
    curr[0] = i;
    for (let j = 1; j <= ln; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= ln; j++) prev[j] = curr[j];
  }
  const dist = prev[ln];
  return Math.round((dist / Math.max(lm, ln)) * 100);
}
