import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSuggestItems, useReleasedSuggestItems } from '@/hooks/useSuggestItems';
import { useSuggestDropdowns } from '@/hooks/useSuggestDropdowns';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Plus, Lightbulb, Rocket, CalendarDays, User } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'outline',
  triaged: 'secondary',
  in_progress: 'secondary',
  blocked: 'destructive',
  resolved: 'default',
  closed: 'default',
};

function userName(user: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!user) return '—';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
}

export default function SuggestionRegister() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { data: items, isLoading } = useSuggestItems();
  const { data: releasedItems, isLoading: releasedLoading } = useReleasedSuggestItems();
  const dropdowns = useSuggestDropdowns();
  const { data: teamUsers } = useVivacityTeamUsers();

  const hasUnreleased = useMemo(() => {
    if (!items) return true; // still loading, assume yes
    return items.some(item => item.release_status?.code !== 'released');
  }, [items]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const resolvedTab = activeTab ?? (isLoading ? 'suggestions' : hasUnreleased ? 'suggestions' : 'released');

  const [search, setSearch] = useState('');
  const [releasedSearch, setReleasedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [releaseStatusFilter, setReleaseStatusFilter] = useState('not_released');

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(item => {
      if (search) {
        const q = search.toLowerCase();
        if (!item.title.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false;
      }
      if (typeFilter !== 'all' && item.item_type?.code !== typeFilter) return false;
      if (statusFilter !== 'all' && item.status?.code !== statusFilter) return false;
      if (priorityFilter !== 'all' && item.priority?.code !== priorityFilter) return false;
      if (categoryFilter !== 'all' && item.category?.code !== categoryFilter) return false;
      if (releaseStatusFilter === 'not_released') {
        if (item.release_status?.code === 'released') return false;
      } else if (releaseStatusFilter !== 'all' && item.release_status?.code !== releaseStatusFilter) return false;
      return true;
    });
  }, [items, search, typeFilter, statusFilter, priorityFilter, categoryFilter, releaseStatusFilter]);

  const filteredReleased = useMemo(() => {
    if (!releasedItems) return [];
    if (!releasedSearch) return releasedItems;
    const q = releasedSearch.toLowerCase();
    return releasedItems.filter(item =>
      item.title.toLowerCase().includes(q) ||
      (item.release_notes ?? '').toLowerCase().includes(q)
    );
  }, [releasedItems, releasedSearch]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Suggestion Register</h1>
              <p className="text-sm text-muted-foreground">Track suggestions, improvements, and issues</p>
            </div>
          </div>
          <Button onClick={() => navigate('/suggestions/new')} className="gap-2">
            <Plus className="h-4 w-4" />
            New Suggestion
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="suggestions" className="gap-2">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="released" className="gap-2">
              <Rocket className="h-4 w-4" />
              Released
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suggestions">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search title or description…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {dropdowns.itemTypes.map(t => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {dropdowns.statuses.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      {dropdowns.priorities.map(p => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {dropdowns.categories.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={releaseStatusFilter} onValueChange={setReleaseStatusFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Release" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Release</SelectItem>
                      <SelectItem value="not_released">Not Released</SelectItem>
                      {dropdowns.releaseStatuses.map(r => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {items?.length === 0 ? 'No suggestions yet. Click "New Suggestion" to get started.' : 'No items match your filters.'}
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[280px]">Title</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Release</TableHead>
                          <TableHead>Assigned To</TableHead>
                          <TableHead>Reported By</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(item => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/suggestions/${item.id}`)}
                          >
                            <TableCell className="font-medium">{item.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{item.item_type?.label ?? '—'}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={STATUS_VARIANT[item.status?.code ?? ''] ?? 'outline'} className="text-xs">
                                {item.status?.label ?? '—'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={PRIORITY_VARIANT[item.priority?.code ?? ''] ?? 'outline'} className="text-xs">
                                {item.priority?.label ?? '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{item.category?.label ?? '—'}</TableCell>
                            <TableCell>
                              <Badge variant={item.release_status?.code === 'released' ? 'default' : 'outline'} className="text-xs">
                                {item.release_status?.label ?? '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{userName(item.assigned_to_user)}</TableCell>
                            <TableCell className="text-sm">{userName(item.reported_by_user)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="released">
            <div className="space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search title or release notes…"
                  value={releasedSearch}
                  onChange={e => setReleasedSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {releasedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredReleased.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {releasedItems?.length === 0 ? 'No released items yet.' : 'No released items match your search.'}
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredReleased.map(item => (
                    <Card
                      key={item.id}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                      onClick={() => navigate(`/suggestions/${item.id}`)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground">{item.title}</h3>
                              <Badge variant="outline" className="text-xs">{item.item_type?.label ?? '—'}</Badge>
                              {item.release_version && (
                                <Badge variant="secondary" className="text-xs">v{item.release_version}</Badge>
                              )}
                            </div>
                            {item.release_notes && (
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {item.release_notes}
                              </p>
                            )}
                            <div className="flex items-center gap-5 text-xs text-muted-foreground pt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {userName(item.reported_by_user)}
                              </span>
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                Created {format(new Date(item.created_at), 'dd MMM yyyy')}
                              </span>
                              {item.released_at && (
                                <span className="flex items-center gap-1">
                                  <Rocket className="h-3 w-3" />
                                  Released {format(new Date(item.released_at), 'dd MMM yyyy')}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {userName(item.assigned_to_user)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
