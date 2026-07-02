/**
 * Deterministic avatar colour rotation for client tenants in the messaging UI.
 * Rotates through brand-purple, brand-aqua, brand-fuchsia, brand-macaron, brand-acai
 * so avatar tiles wrap consistently across sessions for the same tenant id.
 *
 * Class strings are hard-coded (not template-interpolated) so Tailwind picks
 * them up at build time.
 */

const PALETTE = [
  { bg: "bg-brand-purple-100", text: "text-brand-purple-700", solid: "bg-brand-purple-600 text-white" },
  { bg: "bg-brand-aqua-100", text: "text-brand-aqua-700", solid: "bg-brand-aqua-500 text-white" },
  { bg: "bg-brand-fuchsia-100", text: "text-brand-fuchsia-700", solid: "bg-brand-fuchsia-600 text-white" },
  { bg: "bg-brand-macaron-100", text: "text-brand-macaron-800", solid: "bg-brand-macaron-500 text-brand-acai-700" },
  { bg: "bg-brand-acai-100", text: "text-brand-acai-700", solid: "bg-brand-acai-700 text-white" },
] as const;

export function clientAvatarColor(key: string | number | null | undefined) {
  const k = String(key ?? "");
  let hash = 0;
  for (let i = 0; i < k.length; i++) {
    hash = (hash * 31 + k.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function clientInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
