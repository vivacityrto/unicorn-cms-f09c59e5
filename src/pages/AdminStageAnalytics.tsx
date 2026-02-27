import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useStageAnalytics, exportToCSV, TopStageByUsage, CertifiedUnusedStage, HighRiskStage } from '@/hooks/useStageAnalytics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BarChart3, Layers, ShieldCheck, Archive, Package, Users, 
  AlertTriangle, Clock, RefreshCw, Download, ExternalLink, 
  TrendingUp, Activity
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { StageFrameworkBadges } from '@/components/stage/StageFrameworkSelector';

const STAGE_TYPE_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'support', label: 'Ongoing Support' },
  { value: 'offboarding', label: 'Offboarding' },
  { value: 'other', label: 'Other' }
];

const FRAMEWORK_OPTIONS = [
  { value: 'RTO', label: 'RTO' },
  { value: 'CRICOS', label: 'CRICOS' },
  { value: 'GTO', label: 'GTO' },
  { value: 'Membership', label: 'Membership' }
];

function formatActionName(action: string): string {
  return action
    .replace('stage.', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

export default function AdminStageAnalytics() {
  const { isSuperAdmin } = useRBAC();
  const [dateRangeDays, setDateRangeDays] = useState(30);
  const [frameworkFilter, setFrameworkFilter] = useState<string | null>(null);
  const [stageTypeFilter, setStageTypeFilter] = useState<string | null>(null);
  const [certifiedFilter, setCertifiedFilter] = useState<'all' | 'certified' | 'uncertified'>('all');

  const {
    kpis,
    kpisLoading,
    topStages,
    topStagesLoading,
    certifiedUnused,
    certifiedUnusedLoading,
    highRiskStages,
    highRiskLoading,
    activityFeed,
    activityLoading,
    refetchAll
  } = useStageAnalytics({
    dateRangeDays,
    frameworkFilter,
    stageTypeFilter,
    certifiedFilter
  });

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Access denied. SuperAdmin only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const handleExportTopStages = () => {
    const data = topStages.map(s => ({
      title: s.title,
      stage_type: s.stage_type,
      certified: s.is_certified ? 'Yes' : 'No',
      frameworks: s.frameworks?.join(', ') || '',
      packages_using: s.packageCount,
      active_clients: s.activeClientCount,
      last_updated: s.updated_at
    }));
    exportToCSV(data, `top-stages-by-usage-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleExportCertifiedUnused = () => {
    const data = certifiedUnused.map(s => ({
      title: s.title,
      version_label: s.version_label || '',
      certified_at: s.certified_at || '',
      updated_at: s.updated_at
    }));
    exportToCSV(data, `certified-unused-stages-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleExportHighRisk = () => {
    const data = highRiskStages.map(s => ({
      title: s.title,
      active_clients: s.activeClientCount,
      edits_last_period: s.editCount,
      last_edit: s.lastEditDate || '',
      top_editor: s.topEditor || ''
    }));
    exportToCSV(data, `high-risk-stages-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7" />
            <div>
              <h1 className="text-2xl font-bold">Stage Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Usage insights, risk signals, and cleanup opportunities
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {kpisLoading ? <Skeleton className="h-8 w-12" /> : kpis.totalStages}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Phases</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {kpisLoading ? <Skeleton className="h-8 w-12" /> : kpis.certifiedStages}
                  </p>
                  <p className="text-xs text-muted-foreground">Certified</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Archive className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {kpisLoading ? <Skeleton className="h-8 w-12" /> : kpis.archivedStages}
                  </p>
                  <p className="text-xs text-muted-foreground">Archived</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {kpisLoading ? <Skeleton className="h-8 w-12" /> : kpis.stagesInPackages}
                  </p>
                  <p className="text-xs text-muted-foreground">In Packages</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {kpisLoading ? <Skeleton className="h-8 w-12" /> : kpis.stagesWithActiveClients}
                  </p>
                  <p className="text-xs text-muted-foreground">Active Use</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Time Range:</span>
                <Select value={String(dateRangeDays)} onValueChange={v => setDateRangeDays(Number(v))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Framework:</span>
                <Select value={frameworkFilter || 'all'} onValueChange={v => setFrameworkFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Frameworks</SelectItem>
                    {FRAMEWORK_OPTIONS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Select value={stageTypeFilter || 'all'} onValueChange={v => setStageTypeFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {STAGE_TYPE_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Select value={certifiedFilter} onValueChange={v => setCertifiedFilter(v as any)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="certified">Certified</SelectItem>
                    <SelectItem value="uncertified">Uncertified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="top-usage" className="space-y-4">
          <TabsList>
            <TabsTrigger value="top-usage" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Top Usage
            </TabsTrigger>
            <TabsTrigger value="certified-unused" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              Certified Unused
            </TabsTrigger>
            <TabsTrigger value="high-risk" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              High Risk
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity Feed
            </TabsTrigger>
          </TabsList>

          {/* Top Stages by Usage */}
          <TabsContent value="top-usage">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Top Phases by Package Usage</CardTitle>
                  <CardDescription>Phases sorted by how many packages use them</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportTopStages}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {topStagesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : topStages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No stages found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phase</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Certified</TableHead>
                        <TableHead>Frameworks</TableHead>
                        <TableHead className="text-right">Packages</TableHead>
                        <TableHead className="text-right">Active Clients</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topStages.map(stage => (
                        <TableRow key={stage.id}>
                          <TableCell className="font-medium">{stage.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {STAGE_TYPE_OPTIONS.find(t => t.value === stage.stage_type)?.label || stage.stage_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {stage.is_certified ? (
                              <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StageFrameworkBadges frameworks={stage.frameworks} size="sm" />
                          </TableCell>
                          <TableCell className="text-right font-medium">{stage.packageCount}</TableCell>
                          <TableCell className="text-right">
                            {stage.activeClientCount > 0 ? (
                              <Badge variant="secondary">{stage.activeClientCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(stage.updated_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/admin/stages/${stage.id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Certified but Unused */}
          <TabsContent value="certified-unused">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Certified but Unused Phases</CardTitle>
                  <CardDescription>Certified phases not currently used in any package</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportCertifiedUnused}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {certifiedUnusedLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : certifiedUnused.length === 0 ? (
                  <div className="text-center py-8">
                    <ShieldCheck className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">All certified phases are in use!</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phase</TableHead>
                        <TableHead>Version Label</TableHead>
                        <TableHead>Certified At</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certifiedUnused.map(stage => (
                        <TableRow key={stage.id}>
                          <TableCell className="font-medium">{stage.title}</TableCell>
                          <TableCell>
                            {stage.version_label ? (
                              <Badge variant="outline">{stage.version_label}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {stage.certified_at 
                              ? format(new Date(stage.certified_at), 'dd MMM yyyy')
                              : 'Unknown'
                            }
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(stage.updated_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/admin/stages/${stage.id}`}>
                                Review
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* High-Risk Stages */}
          <TabsContent value="high-risk">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    High-Risk Phases
                  </CardTitle>
                  <CardDescription>
                    Phases edited in the last {dateRangeDays} days while used by active clients
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportHighRisk}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {highRiskLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : highRiskStages.length === 0 ? (
                  <div className="text-center py-8">
                    <ShieldCheck className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">No high-risk edits detected in this period</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phase</TableHead>
                        <TableHead className="text-right">Active Clients</TableHead>
                        <TableHead className="text-right">Edits ({dateRangeDays}d)</TableHead>
                        <TableHead>Last Edit</TableHead>
                        <TableHead>Top Editor</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {highRiskStages.map(stage => (
                        <TableRow key={stage.id}>
                          <TableCell className="font-medium">{stage.title}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{stage.activeClientCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={stage.editCount > 5 ? 'destructive' : 'outline'}>
                              {stage.editCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {stage.lastEditDate 
                              ? formatDistanceToNow(new Date(stage.lastEditDate), { addSuffix: true })
                              : '—'
                            }
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {stage.topEditor || '—'}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" asChild>
                                  <Link to={`/admin/stages/${stage.id}`}>
                                    Duplicate & Swap
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Open stage to duplicate and swap in packages
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Feed */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stage Change Activity</CardTitle>
                <CardDescription>Last 50 stage-related events in the past {dateRangeDays} days</CardDescription>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : activityFeed.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No activity in this period</p>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {activityFeed.map(event => (
                        <div key={event.id} className="flex items-start gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                          <div className="p-2 rounded-full bg-muted">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {formatActionName(event.action)}
                              </Badge>
                              {event.stage_title && (
                                <Link 
                                  to={`/admin/stages/${event.entity_id}`}
                                  className="text-sm font-medium hover:underline truncate"
                                >
                                  {event.stage_title}
                                </Link>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{format(new Date(event.created_at), 'dd MMM yyyy HH:mm')}</span>
                              {event.user_email && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{event.user_email}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
