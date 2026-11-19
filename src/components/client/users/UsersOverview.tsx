import { Clock, Mail, UserCheck, Users as UsersIcon } from 'lucide-react';
import { InsightCards, SegmentBar, type InsightCardItem } from '@/components/client/insight/InsightCards';
import type { UserCapacity } from '@/hooks/useUserCapacity';
import type { UserFilter, UserSummary } from './userInsights';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function UsersBanner({ summary, capacity, action }: { summary: UserSummary; capacity?: UserCapacity; action: React.ReactNode }) {
  const seats = !capacity ? null : capacity.isUnlimited ? 'Unlimited seats' : `${capacity.used} of ${capacity.limit} seats used`;
  return (
    <section aria-label="Users summary" className="brand-surface flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-white/80">People with access to your portal. Manage who can see your packages, documents, and Vivacity Academy.</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="User totals">
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.active} active</li>
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{summary.invited} pending {plural(summary.invited, 'invite', 'invites')}</li>
          {seats && <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{seats}</li>}
        </ul>
      </div>
      <div className="shrink-0">{action}</div>
    </section>
  );
}

export function UserFilterCards({ summary, active, onSelect }: { summary: UserSummary; active: UserFilter; onSelect: (f: UserFilter) => void }) {
  const expiry = summary.soonestInviteExpiryDays;
  const items: InsightCardItem<UserFilter>[] = [
    { key: 'all', label: 'Everyone', value: summary.total, insight: 'Active people and pending invites', icon: UsersIcon },
    {
      key: 'active',
      label: 'Active',
      value: summary.active,
      insight: summary.active === 0 ? 'Nobody has joined yet' : `${summary.recent} seen in the last 7 days`,
      icon: UserCheck,
      tone: 'good',
    },
    {
      key: 'invited',
      label: 'Pending invites',
      value: summary.invited,
      insight:
        summary.invited === 0 ? 'No invites waiting' : expiry === null ? 'Waiting to be accepted' : expiry < 0 ? 'At least one has expired' : expiry === 0 ? 'One expires today' : `Soonest expires in ${expiry} ${plural(expiry, 'day', 'days')}`,
      icon: Mail,
      tone: summary.invited > 0 && expiry !== null && expiry <= 1 ? 'warn' : 'neutral',
    },
    {
      key: 'quiet',
      label: 'Quiet',
      value: summary.quiet,
      insight: summary.quiet === 0 ? 'Everyone has been in this month' : 'Not seen in 30 days, or never signed in',
      icon: Clock,
      tone: summary.quiet > 0 ? 'warn' : 'good',
    },
  ];
  return <InsightCards items={items} active={active} onSelect={onSelect} label="Filter users" />;
}

export function UsersInsightPanel({ summary }: { summary: UserSummary }) {
  if (summary.active === 0) return null;
  const roleClass = { user: 'bg-primary', academy_user: 'bg-cyan-500', other: 'bg-zinc-400' } as const;
  const activityClass = { week: 'bg-emerald-500', month: 'bg-sky-500', older: 'bg-amber-500', never: 'bg-zinc-400' } as const;
  return (
    <section aria-label="User insights" className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Who has what access</h2>
        <SegmentBar label="Active users by access" segments={summary.byRole.filter((r) => r.key !== 'other' || r.count > 0).map((r) => ({ ...r, className: roleClass[r.key] }))} />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">When people were last seen</h2>
        <SegmentBar label="Active users by last seen" segments={summary.byActivity.map((r) => ({ ...r, className: activityClass[r.key] }))} />
      </div>
    </section>
  );
}
