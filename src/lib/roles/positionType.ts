/**
 * Position type helper — `tenant_users.position_type`, backed by the
 * `dd_position_type` lookup table. Unlike relationship role, options are
 * NOT hardcoded here — they're fetched live from `dd_position_type` so new
 * position types can be added without a frontend deploy.
 */

export type PositionTypeOption = {
  value: string;
  label: string;
  sort_order: number;
};

export function positionTypeLabel(
  value: string | null | undefined,
  options: PositionTypeOption[],
): string {
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? value;
}
