import { aimText, formatValue, gapText, STATUS_LABEL, type Measure } from './scorecardView';

type AimMeasure = Pick<Measure, 'unit' | 'target' | 'direction' | 'value' | 'status'>;

/** How close to the aim still counts as "nearly there": within this share of the aim. Matches calculateStatus. */
export const NEARLY_SHARE = 0.1;

export interface AimLadder {
  onTrack: string;
  nearly: string;
  offTrack: string;
}

/** The three bands for one measure, in the measure's own numbers, so the room can see exactly where the lines are. */
export function aimLadder(m: Pick<Measure, 'unit' | 'target' | 'direction'>): AimLadder {
  const f = (n: number) => formatValue(m.unit, n);
  const t = m.target;
  const band = Math.abs(t) * NEARLY_SHARE;
  if (m.direction === 'lower_is_better') {
    if (t === 0) return { onTrack: aimText(m), nearly: 'No in-between: the aim is zero.', offTrack: `more than ${f(t)}` };
    return { onTrack: aimText(m), nearly: `more than ${f(t)}, up to ${f(t + band)}`, offTrack: `more than ${f(t + band)}` };
  }
  if (m.direction === 'equals_target') {
    if (t === 0) return { onTrack: aimText(m), nearly: 'No in-between: the aim is zero.', offTrack: `anything other than ${f(t)}` };
    return { onTrack: aimText(m), nearly: `within ${f(band)} of ${f(t)}`, offTrack: `more than ${f(band)} away from ${f(t)}` };
  }
  if (t === 0) return { onTrack: aimText(m), nearly: 'No in-between: the aim is zero.', offTrack: `under ${f(t)}` };
  return { onTrack: aimText(m), nearly: `${f(t - band)}, up to just under ${f(t)}`, offTrack: `under ${f(t - band)}` };
}

/** One plain sentence on which way is good. */
export function directionSentence(m: Pick<Measure, 'direction'>): string {
  if (m.direction === 'lower_is_better') return 'Lower is better. The aim is a limit: at it or under it is on track.';
  if (m.direction === 'equals_target') return 'This one has an exact aim. Hitting it is on track; being off either side is not.';
  return 'Higher is better. The aim is a floor: at it or above it is on track.';
}

/** Where the measure stands against the aim right now, in words. */
export function standingSentence(m: AimMeasure): string {
  if (m.value === null) return 'There is no number for this week yet, so there is no status.';
  return `This week is ${formatValue(m.unit, m.value)}. That is ${gapText(m).toLowerCase()}, so it is ${STATUS_LABEL[m.status].toLowerCase()}.`;
}
