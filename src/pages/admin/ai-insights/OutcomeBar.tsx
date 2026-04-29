import { OUTCOME_BG, OUTCOME_LABEL, type OutcomeBucket } from "./lib";

interface Props {
  pending: number;
  accepted_unchanged: number;
  accepted_light_edit: number;
  accepted_moderate_edit: number;
  accepted_heavy_edit: number;
  rejected: number;
}

const ORDER: OutcomeBucket[] = [
  "accepted_unchanged",
  "accepted_light_edit",
  "accepted_moderate_edit",
  "accepted_heavy_edit",
  "rejected",
  "pending",
];

export function OutcomeBar(props: Props) {
  const counts: Record<OutcomeBucket, number> = {
    pending: props.pending,
    accepted_unchanged: props.accepted_unchanged,
    accepted_light_edit: props.accepted_light_edit,
    accepted_moderate_edit: props.accepted_moderate_edit,
    accepted_heavy_edit: props.accepted_heavy_edit,
    rejected: props.rejected,
  };
  const total = ORDER.reduce((s, k) => s + counts[k], 0);

  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No drafts in this window yet.
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-3 w-full rounded overflow-hidden border border-border">
        {ORDER.map((k) => {
          const pct = (counts[k] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={k}
              className={OUTCOME_BG[k]}
              style={{ width: `${pct}%` }}
              title={`${OUTCOME_LABEL[k]}: ${counts[k]} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
        {ORDER.map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-sm ${OUTCOME_BG[k]}`} />
            <span>
              {OUTCOME_LABEL[k]}: <span className="text-foreground tabular-nums">{counts[k]}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
