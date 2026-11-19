import { differenceInCalendarDays, parseISO } from 'date-fns';
import { BLOCKER_CATEGORIES } from '@/components/client/package-dashboard/checkins';

/** What get_tenant_checkins_overview returns. Names only: no email, no user id. */
export interface TenantCheckinsOverview {
  packages: Array<{
    package_instance_id: number;
    package_name: string;
    people: Array<{
      name: string;
      pulses: Array<{ score: number; created_at: string }> | null;
      confidence: { score: number; created_at: string } | null;
    }>;
    blockers: Array<{ category: string; comment: string | null; created_at: string; name: string }>;
  }>;
}

type Pkg = TenantCheckinsOverview['packages'][number];
type Person = Pkg['people'][number];

/** A pulse of this or lower counts as low. */
export const LOW_PULSE = 2;

/** True when a person's last two pulses are both low: the rule for flagging them to the consultant. */
export function hasLowStreak(person: Pick<Person, 'pulses'>): boolean {
  const p = person.pulses ?? [];
  return p.length >= 2 && p[p.length - 1].score <= LOW_PULSE && p[p.length - 2].score <= LOW_PULSE;
}

export interface PackageFlags {
  lowStreakNames: string[];
  blockerCount: number;
  /** Nobody on this package has answered anything yet. Unknown is shown as unknown, never as fine. */
  noAnswers: boolean;
  needsAttention: boolean;
}

export function packageFlags(pkg: Pkg): PackageFlags {
  const lowStreakNames = pkg.people.filter(hasLowStreak).map((p) => p.name);
  const noAnswers = pkg.people.length === 0 && pkg.blockers.length === 0;
  return { lowStreakNames, blockerCount: pkg.blockers.length, noAnswers, needsAttention: lowStreakNames.length > 0 || pkg.blockers.length > 0 };
}

export interface OverviewSummary {
  blockers: number;
  lowStreakPeople: number;
  packagesWithAnswers: number;
  totalPackages: number;
  sentence: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One sentence for the top of the card, in the same words the flags use. */
export function summariseOverview(o: TenantCheckinsOverview): OverviewSummary {
  const flags = o.packages.map(packageFlags);
  const blockers = flags.reduce((n, f) => n + f.blockerCount, 0);
  const lowStreakPeople = flags.reduce((n, f) => n + f.lowStreakNames.length, 0);
  const packagesWithAnswers = flags.filter((f) => !f.noAnswers).length;
  let sentence: string;
  if (o.packages.length === 0) sentence = 'This client has no live packages.';
  else if (packagesWithAnswers === 0) sentence = 'Nobody has answered a check-in yet.';
  else if (blockers === 0 && lowStreakPeople === 0) sentence = 'Nothing flagged. Answers are shown below.';
  else {
    const parts: string[] = [];
    if (blockers > 0) parts.push(`${plural(blockers, 'blocker')} flagged in the last 30 days`);
    if (lowStreakPeople > 0) parts.push(`${plural(lowStreakPeople, 'person has', 'people have')} given two low pulses in a row`);
    sentence = `${parts.join(' and ')}.`;
  }
  return { blockers, lowStreakPeople, packagesWithAnswers, totalPackages: o.packages.length, sentence };
}

export const categoryLabel = (value: string) => BLOCKER_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

/** How long ago a person last answered a pulse, in whole days, or null if never. */
export function daysSinceLastPulse(person: Pick<Person, 'pulses'>, today: Date = new Date()): number | null {
  const p = person.pulses ?? [];
  if (p.length === 0) return null;
  return Math.max(0, differenceInCalendarDays(today, parseISO(p[p.length - 1].created_at)));
}
