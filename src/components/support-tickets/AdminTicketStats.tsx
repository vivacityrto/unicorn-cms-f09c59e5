import { useMemo } from 'react';
import {
  Clock, Eye, Loader, CheckCircle, XCircle, AlertTriangle,
  UserX, Bug, Sparkles, Users,
} from 'lucide-react';
import type { AdminTicketRow } from './useAdminSupportTickets';

interface Props {
  rows: AdminTicketRow[];
}

export function AdminTicketStats({ rows }: Props) {
  const stats = useMemo(() => {
    const byStatus = (code: string) => rows.filter((r) => r.status?.code === code).length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const closedRecently = rows.filter(
      (r) => r.status?.code === 'closed' && new Date(r.created_at).getTime() >= sevenDaysAgo,
    ).length;
    const highCritical = rows.filter((r) => r.urgency === 'high' || r.urgency === 'critical').length;
    const unassigned = rows.filter((r) => !r.assigned_to).length;
    const bugs = rows.filter(
      (r) => r.item_type?.code === 'error' || r.item_type?.code === 'functionality_fail',
    ).length;
    const features = rows.filter((r) => r.item_type?.code === 'suggestion').length;
    const clients = new Set(rows.map((r) => r.tenant?.id).filter(Boolean)).size;

    return [
      { icon: Clock, value: byStatus('new'), label: 'New' },
      { icon: Eye, value: byStatus('triaged'), label: 'Under Review' },
      { icon: Loader, value: byStatus('in_progress'), label: 'In Progress' },
      { icon: CheckCircle, value: byStatus('resolved'), label: 'Resolved' },
      { icon: XCircle, value: closedRecently, label: 'Closed (7d)' },
      { icon: AlertTriangle, value: highCritical, label: 'High / Critical' },
      { icon: UserX, value: unassigned, label: 'Unassigned' },
      { icon: Bug, value: bugs, label: 'Bugs' },
      { icon: Sparkles, value: features, label: 'Feature Requests' },
      { icon: Users, value: clients, label: 'Clients' },
    ];
  }, [rows]);

  return (
    <div className="flex gap-3 overflow-x-auto py-4 px-6">
      {stats.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex-shrink-0 min-w-[130px] bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm"
        >
          <Icon className="w-5 h-5 text-[#23C0DD] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
