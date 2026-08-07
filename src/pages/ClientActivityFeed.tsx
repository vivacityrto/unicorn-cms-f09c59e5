import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { usePortfolioTimeline } from '@/hooks/usePortfolioTimeline';
import { EVENT_TYPE_FILTERS } from '@/hooks/useClientManagementData';
import { FILTER_OPTIONS } from '@/components/client/ClientTimelineTab';
import { EVENT_ICON_MAP, EVENT_COLOR_MAP } from '@/components/client/TimelineEventCard';
import type { TimelineEventType } from '@/types/timeline';
import { useAuth } from '@/hooks/useAuth';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clientAvatarColor, clientInitials } from '@/lib/clientAvatarColor';
import { Activity, Loader2, Search, Radio } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek } from 'date-fns';

interface DateGroup {
  label: string;
  events: ReturnType<typeof usePortfolioTimeline>['events'];
}

function groupByDate(events: ReturnType<typeof usePortfolioTimeline>['events']): DateGroup[] {
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const d = new Date(event.occurred_at || event.created_at);
    let label: string;
    if (isToday(d)) label = 'Today';
    else if (isYesterday(d)) label = 'Yesterday';
    else if (isThisWeek(d)) label = 'This week';
    else label = 'Older';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(event);
  }
  const ordered: DateGroup[] = [];
  for (const label of ['Today', 'Yesterday', 'This week', 'Older']) {
    const items = groups.get(label);
    if (items && items.length > 0) ordered.push({ label, events: items });
  }
  return ordered;
}

const PAGE_SIZE = 30;

export default function ClientActivityFeed() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isVivacityTeam = isVivacityStaffRole(profile?.unicorn_role);

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const eventTypes = filter !== 'all' ? EVENT_TYPE_FILTERS[filter] ?? null : null;
  const { events, isLoading } = usePortfolioTimeline({ limit, eventTypes, search });

  const dateGroups = useMemo(() => groupByDate(events), [events]);
  const hasMore = events.length === limit;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Client Activity</h1>
            <p className="text-xs text-muted-foreground">
              Live activity across every client — updates automatically as it happens
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity Feed
              </CardTitle>
            </div>

            {/* Filter chips */}
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS
                  .filter((opt) => (opt.value !== 'microsoft' && !opt.staffOnly) || isVivacityTeam)
                  .map((opt) => {
                    const FilterIcon = opt.icon;
                    return (
                      <Button
                        key={opt.value}
                        variant={filter === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setFilter(opt.value);
                          setLimit(PAGE_SIZE);
                        }}
                        className="h-7 text-xs"
                      >
                        <FilterIcon className="h-3 w-3 mr-1" />
                        {opt.label}
                      </Button>
                    );
                  })}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search activity..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading && events.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No activity found</p>
                <p className="text-sm mt-1">Try a different filter or search term.</p>
              </div>
            ) : (
              <div className="relative">
                {dateGroups.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 z-20 bg-card py-1.5 mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {group.label}
                      </span>
                    </div>

                    <ul className="divide-y divide-border -my-1 mb-2">
                      {group.events.map((event) => {
                        const eventKey = event.event_type as TimelineEventType;
                        const Icon = EVENT_ICON_MAP[eventKey] ?? Activity;
                        const colorClass = EVENT_COLOR_MAP[eventKey] ?? 'bg-muted text-muted-foreground';
                        const av = clientAvatarColor(event.tenant_id);
                        return (
                          <li key={event.id}>
                            <button
                              type="button"
                              onClick={() => navigate(`/tenant/${event.tenant_id}?tab=timeline`)}
                              className="w-full py-2.5 flex items-start gap-3 text-left hover:bg-muted/40 rounded-md px-1 -mx-1 transition-colors"
                            >
                              <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${colorClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div
                                className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0 ${av.solid}`}
                                title={event.tenant_name}
                              >
                                {clientInitials(event.tenant_name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm font-medium text-foreground truncate">{event.tenant_name}</span>
                                    {isVivacityTeam && event.visibility === 'internal' && (
                                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Internal</Badge>
                                    )}
                                  </div>
                                  <span
                                    className="text-[11px] text-muted-foreground shrink-0"
                                    title={format(new Date(event.occurred_at || event.created_at), 'PPpp')}
                                  >
                                    {formatDistanceToNow(new Date(event.occurred_at || event.created_at), { addSuffix: true })}
                                  </span>
                                </div>
                                <div className="text-sm text-muted-foreground truncate mt-0.5">{event.title}</div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLimit((l) => l + PAGE_SIZE)}
                      disabled={isLoading}
                    >
                      {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
