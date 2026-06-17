export function rowBorderClass(
  responseDueAt: string | null,
  slaBreached: boolean
) {
  if (slaBreached) return "border-l-4 border-destructive";
  if (!responseDueAt) return "";
  const ms = new Date(responseDueAt).getTime() - Date.now();
  if (ms > 0 && ms <= 60 * 60 * 1000) return "border-l-4 border-amber-500";
  return "";
}
