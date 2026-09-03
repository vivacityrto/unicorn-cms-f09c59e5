import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolioTimeline } from '@/hooks/usePortfolioTimeline';
import { groupedEventHref } from '@/hooks/portfolioTimelineGrouping';
import { EVENT_TYPE_FILTERS } from '@/hooks/useClientManagementData';
import { FILTER_OPTIONS } from '@/components/client/ClientTimelineTab';
import { EVENT_ICON_MAP, EVENT_COLOR_MAP } from '@/components/client/TimelineEventCard';
import { MultiSelect, type MultiSelectOption } from '@/components/documents/bulk-generate/MultiSelect';
import {
  TenantFilterDialog,
  type TenantFilterOption,
  type TenantStatusOption,
  type CscOption,
} from '@/components/tenant-users/TenantFilterDialog';
import { useCscAssignments } from '@/hooks/useCscAssignments';
import type { TimelineEventType } from '@/types/timeline';
import { useAuth } from '@/hooks/useAuth';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clientAvatarColor, clientInitials } from '@/lib/clientAvatarColor';
import { Activity, Building2, Loader2, Search, Radio } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek } from 'date-fns';

interface BasicTenant {
  id: number;
  name: string;
  status: string | null;
}

async function fetchTenants(): Promise<BasicTenant[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, status')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

async function fetchTenantStatusOptions(): Promise<TenantStatusOption[]> {
  const { data, error } = await supabase
    .from('dd_status')
    .select('value, description')
    .gte('code', 100)
    .order('code');
  if (error) throw error;
  return data ?? [];
}

async function fetchCscFilterOptions(): Promise<CscOption[]> {
  const { data, error } = await supabase
    .from('users')
    .select('user_uuid, first_name, last_name, staff_teams, staff_team, archived')
    .eq('disabled', false)
    .order('archived', { ascending: true })
    .order('first_name', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((u) => u.staff_teams?.includes('client_success') || u.staff_team === 'client_success')
    .map((u) => ({
      user_uuid: u.user_uuid,
      first_name: u.first_name,
      last_name: u.last_name,
      archived: u.archived || false,
    }));
}

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

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [tenantFilterDialogOpen, setTenantFilterDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: tenants = [] } = useQuery({
    queryKey: ['client-activity-feed-tenants'],
    queryFn: fetchTenants,
    staleTime: 5 * 60_000,
  });
  const { data: tenantStatusOptions = [] } = useQuery({
    queryKey: ['client-activity-feed-tenant-status-options'],
    queryFn: fetchTenantStatusOptions,
    staleTime: 5 * 60_000,
  });
  const { data: cscFilterOptions = [] } = useQuery({
    queryKey: ['client-activity-feed-csc-options'],
    queryFn: fetchCscFilterOptions,
    staleTime: 5 * 60_000,
  });

  const tenantIdsForCsc = useMemo(() => tenants.map((t) => t.id), [tenants]);
  const cscQuery = useCscAssignments(tenantIdsForCsc);

  // CSC/status are tenant-level attributes needed by the "Filter by Tenant"
  // dialog to narrow its ~400-row list before selection — same enrichment
  // TenantUsers.tsx does for the identical dialog.
  const enrichedTenants: TenantFilterOption[] = useMemo(() => {
    const cscMap = cscQuery.data || {};
    return tenants.map((t) => ({
      ...t,
      csc_user_id: cscMap[t.id]?.csc_user_id ?? null,
    }));
  }, [tenants, cscQuery.data]);

  const categoryOptions: MultiSelectOption[] = useMemo(
    () =>
      FILTER_OPTIONS
        .filter((opt) => (opt.value !== 'microsoft' && !opt.staffOnly) || isVivacityTeam)
        .map((opt) => ({ value: opt.value, label: opt.label })),
    [isVivacityTeam]
  );

  const eventTypes = useMemo(() => {
    if (selectedCategories.length === 0) return null;
    const union = new Set<string>();
    for (const cat of selectedCategories) {
      for (const type of EVENT_TYPE_FILTERS[cat] ?? []) union.add(type);
    }
    return [...union];
  }, [selectedCategories]);

  const tenantIds = useMemo(
    () => (selectedTenantIds.length > 0 ? selectedTenantIds.map(Number) : null),
    [selectedTenantIds]
  );

  const { events, hasMore, isLoading } = usePortfolioTimeline({ limit, eventTypes, tenantIds, search });

  const resetPaging = () => setLimit(PAGE_SIZE);

  const dateGroups = useMemo(() => groupByDate(events), [events]);

  return (
    <Fragment>
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
          <CardHeader className="pb-5">
            <div className="flex items-center justify-between pb-4 mb-1 border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity Feed
              </CardTitle>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <MultiSelect
                options={categoryOptions}
                values={selectedCategories}
                onChange={(v) => { setSelectedCategories(v); resetPaging(); }}
                placeholder="All categories"
                searchPlaceholder="Search categories..."
                emptyText="No categories found."
                className="w-[220px]"
              />
              <Button
                variant="outline"
                onClick={() => setTenantFilterDialogOpen(true)}
                className={cn(
                  'w-[220px] justify-between font-normal min-w-0',
                  selectedTenantIds.length === 0 && 'text-muted-foreground',
                )}
              >
                <span className="truncate">
                  {selectedTenantIds.length === 0
                    ? 'All Clients'
                    : selectedTenantIds.length === 1
                      ? tenants.find((t) => t.id.toString() === selectedTenantIds[0])?.name ?? '1 client'
                      : `${selectedTenantIds.length} clients selected`}
                </span>
                <Building2 className="h-4 w-4 shrink-0 opacity-50 ml-2" />
              </Button>
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search activity..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    resetPaging();
                  }}
                  className="pl-9 h-10"
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
                              onClick={() =>
                                navigate(groupedEventHref(event) ?? `/tenant/${event.tenant_id}?tab=timeline`)
                              }
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
                                    {event.group_count && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">×{event.group_count}</Badge>
                                    )}
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

      <TenantFilterDialog
        open={tenantFilterDialogOpen}
        onOpenChange={setTenantFilterDialogOpen}
        tenants={enrichedTenants}
        statusOptions={tenantStatusOptions}
        cscOptions={cscFilterOptions}
        selected={selectedTenantIds}
        onApply={(ids) => { setSelectedTenantIds(ids); resetPaging(); }}
      />
    </Fragment>
  );
}
