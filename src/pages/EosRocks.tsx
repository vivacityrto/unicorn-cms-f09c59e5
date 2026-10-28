import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer, Section, ResponsiveGrid } from '@/components/layout';
import { 
  Plus, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  Filter,
  Building2,
  Users,
  User,
  Search,
  GitBranch,
  ChevronDown,
  Archive
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOverflowTabs } from '@/hooks/useOverflowTabs';
import { cn } from '@/lib/utils';
import { useEosRocksHierarchy } from '@/hooks/useEosRocksHierarchy';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { useEosRockOwnerFilter } from '@/hooks/useEosRockOwnerFilter';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { RockCard } from '@/components/eos/rocks/RockCard';
import { RockCascadeView } from '@/components/eos/rocks/RockCascadeView';
import { RockEditorSheet } from '@/components/eos/rockEditor/RockEditorSheet';
import { copyToNewLevel } from '@/utils/rockEditor/defaults';
import { ArchivedRocksPanel } from '@/components/eos/rocks/ArchivedRocksPanel';
import { RockLifecycleDialog, type LifecycleMode } from '@/components/eos/rocks/RockLifecycleDialog';
import { RockDetailSheet } from '@/components/eos/rocks/RockDetailSheet';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import { dbToUiStatus } from '@/utils/rockStatusUtils';
import { getCurrentQuarter, formatQuarter } from '@/utils/rockRollup';
import type { RockLevel, RockWithHierarchy } from '@/types/eos';
import type { RockEditorValues } from '@/utils/rockEditor/types';

export default function EosRocks() {
  return <RocksHierarchyContent />;
}

function RocksHierarchyContent() {
  const { profile } = useAuth();
  const currentQuarter = getCurrentQuarter();
  const [quarterYear, setQuarterYear] = useState(currentQuarter.year);
  const [quarterNumber, setQuarterNumber] = useState(currentQuarter.quarter);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'company' | 'team' | 'individual' | 'cascade' | 'archived'>('company');
  
  // Dialog states
  // Where a new Rock starts: its level, and the Rock it serves when opened from one.
  const [creating, setCreating] = useState<{ level: RockLevel; parentId: string | null; prefill?: Partial<RockEditorValues> } | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [lifecycle, setLifecycle] = useState<{ mode: LifecycleMode; rockId: string } | null>(null);
  const [editingRock, setEditingRock] = useState<RockWithHierarchy | null>(null);
  const [viewingRockId, setViewingRockId] = useState<string | null>(null);
  const [cascadeRock, setCascadeRock] = useState<RockWithHierarchy | null>(null);

  const {
    rocks,
    companyRocks,
    teamRocks,
    individualRocks,
    functions,
    isLoading,
  } = useEosRocksHierarchy({ quarterYear, quarterNumber });
  
  const { data: vivacityUsers } = useVivacityTeamUsers();
  const { filter: effectiveUserFilter, setFilter: setUserFilter } =
    useEosRockOwnerFilter(profile?.user_uuid, vivacityUsers);
  const canCreateCompanyRock = usePermission('eos.rocks.company.create');
  const canManageOwnRocks = usePermission('eos.rocks.own.manage');
  const canCreateRocks = () => canCreateCompanyRock || canManageOwnRocks;

  // Helper functions
  const getUserName = (userId: string): string | null => {
    const user = vivacityUsers?.find(u => u.user_uuid === userId);
    if (!user) return null;
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
  };

  const getUserInfo = (userId: string) => {
    const user = vivacityUsers?.find(u => u.user_uuid === userId);
    if (!user) return null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
    const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
    return {
      name,
      initials,
      avatarUrl: user.avatar_url,
    };
  };

  const getFunctionName = (functionId: string): string | null => {
    const func = functions?.find(f => f.id === functionId);
    return func?.name || null;
  };

  const getSeatName = (seatId: string): string | null => {
    // This would need a seats query, for now return null
    return null;
  };

  // Filter rocks
  const filterRocks = (rockList: RockWithHierarchy[] | undefined) => {
    if (!rockList) return [];
    return rockList.filter(rock => {
      const status = dbToUiStatus(rock.rollupStatus || rock.status);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesSearch = !searchQuery || 
        rock.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rock.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUser = effectiveUserFilter === 'all' || rock.owner_id === effectiveUserFilter;
      return matchesStatus && matchesSearch && matchesUser;
    });
  };

  const filteredCompanyRocks = filterRocks(companyRocks);
  const filteredTeamRocks = filterRocks(teamRocks);
  const filteredIndividualRocks = filterRocks(individualRocks);

  const ROCKS_TABS = [
    { key: 'company', label: 'Company', icon: Building2, count: filteredCompanyRocks.length },
    { key: 'team', label: 'Team', icon: Users, count: filteredTeamRocks.length },
    { key: 'individual', label: 'Individual', icon: User, count: filteredIndividualRocks.length },
    { key: 'cascade', label: 'Cascade', icon: GitBranch, count: 0 },
    { key: 'archived', label: 'Archived', icon: Archive, count: 0 },
  ] as const;
  const { containerRef: tabsContainerRef, itemRef: tabItemRef, moreMeasureRef: tabsMoreMeasureRef, activeMoreMeasureRef: tabsActiveMoreMeasureRef, visibleCount: visibleTabCount } = useOverflowTabs(ROCKS_TABS.length, 0);
  const visibleRocksTabs = ROCKS_TABS.slice(0, visibleTabCount);
  const moreRocksTabs = ROCKS_TABS.slice(visibleTabCount);
  const activeMoreRocksTab = moreRocksTabs.find((t) => t.key === activeTab);

  // Stats
  const stats = {
    total: rocks?.length || 0,
    onTrack: rocks?.filter(r => dbToUiStatus(r.status) === 'on_track').length || 0,
    // Off track only: at risk is a different status, and this tile filters to Off Track when clicked.
    offTrack: rocks?.filter(r => dbToUiStatus(r.rollupStatus || r.status) === 'off_track').length || 0,
    complete: rocks?.filter(r => dbToUiStatus(r.status) === 'complete').length || 0,
  };

  // Handlers
  const handleCreateTeamRock = (parentRock: RockWithHierarchy) => {
    setCreating({ level: 'team', parentId: parentRock.id });
  };

  const handleCreateIndividualRock = (parentRock: RockWithHierarchy) => {
    setCreating({ level: 'individual', parentId: parentRock.id });
  };

  const handleEditRock = (rock: RockWithHierarchy) => {
    setViewingRockId(null);
    setEditingRock(rock);
    setShowEditDialog(true);
  };

  const handleOpenRock = (rock: RockWithHierarchy) => {
    setViewingRockId(rock.id);
  };

  /**
   * Open any Rock by id. The list only holds the quarter on screen, so a Rock in another
   * quarter (the far side of a carryover, say) switches the quarter first.
   */
  const openRockById = async (rockId: string) => {
    if (rocks?.some(r => r.id === rockId)) {
      setViewingRockId(rockId);
      return;
    }
    const { data, error } = await supabase
      .from('eos_rocks')
      .select('quarter_year, quarter_number, archived_at')
      .eq('id', rockId)
      .maybeSingle();
    if (error || !data) {
      toast({ title: 'That Rock could not be opened', description: 'It may have been removed, or you may not have access.', variant: 'destructive' });
      return;
    }
    if (data.archived_at) {
      toast({ title: 'That Rock is archived', description: 'Restore it from the Archived tab to open it.' });
      return;
    }
    setQuarterYear(data.quarter_year);
    setQuarterNumber(data.quarter_number);
    setViewingRockId(rockId);
  };

  // Resolve from the live list so the panel reflects edits and status changes after a refetch.
  const viewingRock = viewingRockId ? rocks?.find(r => r.id === viewingRockId) ?? null : null;
  const viewingParent = viewingRock?.parent_rock_id
    ? rocks?.find(r => r.id === viewingRock.parent_rock_id) ?? null
    : null;
  const viewingChildren = viewingRock ? (rocks ?? []).filter(r => r.parent_rock_id === viewingRock.id) : [];

  const handleViewCascade = (rock: RockWithHierarchy) => {
    setCascadeRock(rock);
    setActiveTab('cascade');
  };

  const handleArchiveRock = (rock: RockWithHierarchy) => setLifecycle({ mode: 'archive', rockId: rock.id });
  const handleDeleteRock = (rock: RockWithHierarchy) => setLifecycle({ mode: 'delete', rockId: rock.id });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading rocks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - using PageHeader for responsive typography */}
      <PageHeader
        title="Rocks (90-Day Goals)"
        description="Company → Team → Individual rock hierarchy"
        icon={Target}
        actions={
          <PermissionTooltip permission="rocks:create" action="create rocks">
            <Button
              disabled={!canCreateRocks()}
              onClick={() => setCreating({ level: activeTab === 'team' || activeTab === 'individual' ? activeTab : 'company', parentId: null })}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Rock
            </Button>
          </PermissionTooltip>
        }
      />

      {/* Stats Cards - responsive grid */}
      <ResponsiveGrid cols={{ default: 2, md: 4 }} gap="md">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Total Rocks</p>
                <p className="text-xl md:text-2xl font-bold">{stats.total}</p>
              </div>
              <Target className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('on_track')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">On Track</p>
                <p className="text-xl md:text-2xl font-bold text-green-600">{stats.onTrack}</p>
              </div>
              <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-green-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('off_track')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Off Track</p>
                <p className="text-xl md:text-2xl font-bold text-red-600">{stats.offTrack}</p>
              </div>
              <TrendingDown className="w-6 h-6 md:w-8 md:h-8 text-red-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('complete')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Complete</p>
                <p className="text-xl md:text-2xl font-bold text-blue-600">{stats.complete}</p>
              </div>
              <CheckCircle className="w-6 h-6 md:w-8 md:h-8 text-blue-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </ResponsiveGrid>

      {/* Filters - responsive wrap */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Year selector */}
          <Select 
            value={String(quarterYear)} 
            onValueChange={(v) => setQuarterYear(Number(v))}
          >
            <SelectTrigger className="w-24 sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => currentQuarter.year - 2 + i).map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Quarter selector */}
          <Select 
            value={String(quarterNumber)} 
            onValueChange={(v) => setQuarterNumber(Number(v))}
          >
            <SelectTrigger className="w-20 sm:w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map(q => (
                <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="on_track">On Track</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="off_track">Off Track</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
           </Select>

          {/* User filter */}
          <Select 
            value={effectiveUserFilter} 
            onValueChange={(v) => setUserFilter(v)}
          >
            <SelectTrigger className="w-36 sm:w-44">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {vivacityUsers?.map((user) => {
                const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
                return (
                  <SelectItem key={user.user_uuid} value={user.user_uuid}>
                    {name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Search - full width on mobile */}
        <div className="relative w-full sm:flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {(statusFilter !== 'all' || searchQuery || effectiveUserFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setSearchQuery('');
              setUserFilter('all');
            }}
            className="self-start sm:self-auto"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Tabs - as many as fit render directly; the rest collapse into a
          "More" dropdown, measured dynamically - never via horizontal
          scroll (see useOverflowTabs / feedback_no_tab_scroll). */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'company' | 'team' | 'individual' | 'cascade' | 'archived')}>
        <div ref={tabsContainerRef} className="flex items-center gap-0 min-w-0">
          <TabsList>
            {visibleRocksTabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.key} value={t.key} className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {!!t.count && <Badge variant="secondary" className="text-xs ml-1">{t.count}</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {moreRocksTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'ml-1 inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all shrink-0',
                    activeMoreRocksTab
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {activeMoreRocksTab ? (
                    <>
                      <activeMoreRocksTab.icon className="h-4 w-4" />
                      {activeMoreRocksTab.label}
                      {!!activeMoreRocksTab.count && (
                        <Badge variant="secondary" className="text-xs ml-1">{activeMoreRocksTab.count}</Badge>
                      )}
                    </>
                  ) : (
                    'More'
                  )}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {moreRocksTabs.map((t) => {
                  const Icon = t.icon;
                  return (
                    <DropdownMenuItem
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={cn('gap-1.5', activeTab === t.key && 'font-semibold bg-accent')}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                      {!!t.count && <Badge variant="secondary" className="text-xs ml-auto">{t.count}</Badge>}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Hidden measurement clones — never shown, kept in sync with the
              real markup above so the width-measurement effect stays accurate. */}
          <div aria-hidden className="absolute invisible h-0 overflow-hidden flex items-center gap-0 pointer-events-none">
            {ROCKS_TABS.map((t, i) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  ref={tabItemRef(i) as React.Ref<HTMLButtonElement>}
                  type="button"
                  tabIndex={-1}
                  className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap"
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {!!t.count && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
                </button>
              );
            })}
            <button
              ref={tabsMoreMeasureRef as React.Ref<HTMLButtonElement>}
              type="button"
              tabIndex={-1}
              className="ml-1 inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap"
            >
              More <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {ROCKS_TABS.map((t, i) => {
              const Icon = t.icon;
              return (
                <button
                  key={`more-${t.key}`}
                  ref={tabsActiveMoreMeasureRef(i) as React.Ref<HTMLButtonElement>}
                  type="button"
                  tabIndex={-1}
                  className="ml-1 inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap"
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {!!t.count && <span className="text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Company Rocks Tab */}
        <TabsContent value="company" className="mt-6">
          {filteredCompanyRocks.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Company Rocks</h3>
              <p className="text-muted-foreground mb-4">
                Create 3-7 company-wide priorities for {formatQuarter(quarterYear, quarterNumber)}
              </p>
              <Button onClick={() => setCreating({ level: 'company', parentId: null })}>
                <Plus className="h-4 w-4 mr-2" />
                Create Company Rock
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredCompanyRocks.map(rock => (
                <RockCard
                  key={rock.id}
                  rock={rock}
                  onOpen={handleOpenRock}
                  onOpenRockById={openRockById}
                  onEdit={handleEditRock}
                  onArchive={handleArchiveRock}
                  onDelete={handleDeleteRock}
                  onViewCascade={handleViewCascade}
                  getUserName={getUserName}
                  getUserInfo={getUserInfo}
                  getSeatName={getSeatName}
                  showChildren={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Team Rocks Tab */}
        <TabsContent value="team" className="mt-6">
          {filteredTeamRocks.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Team Rocks</h3>
              <p className="text-muted-foreground mb-4">
                Create team rocks that cascade from company rocks
              </p>
              {companyRocks && companyRocks.length > 0 && (
                <Button onClick={() => setCreating({ level: 'team', parentId: null })}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Team Rock
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Group by function */}
              {functions?.map(func => {
                const functionRocks = filteredTeamRocks.filter(r => r.function_id === func.id);
                if (functionRocks.length === 0) return null;
                
                return (
                  <div key={func.id}>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Badge variant="outline">{func.name}</Badge>
                      <span className="text-muted-foreground text-sm">
                        ({functionRocks.length} rock{functionRocks.length !== 1 ? 's' : ''})
                      </span>
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {functionRocks.map(rock => (
                        <RockCard
                          key={rock.id}
                          rock={rock}
                          onOpen={handleOpenRock}
                          onOpenRockById={openRockById}
                          onEdit={handleEditRock}
                  onArchive={handleArchiveRock}
                  onDelete={handleDeleteRock}
                          onViewCascade={handleViewCascade}
                          getUserName={getUserName}
                          getUserInfo={getUserInfo}
                          getSeatName={getSeatName}
                          showParent={true}
                          showChildren={true}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Individual Rocks Tab */}
        <TabsContent value="individual" className="mt-6">
          {filteredIndividualRocks.length === 0 ? (
            <Card className="p-8 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Individual Rocks</h3>
              <p className="text-muted-foreground mb-4">
                Create individual Rocks that cascade directly from a Company Rock or through a Team Rock
              </p>
              {(companyRocks?.length || 0) + (teamRocks?.length || 0) > 0 && (
                <Button onClick={() => setCreating({ level: 'individual', parentId: null })}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Individual Rock
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredIndividualRocks.map(rock => (
                <RockCard
                  key={rock.id}
                  rock={rock}
                  onOpen={handleOpenRock}
                  onOpenRockById={openRockById}
                  onEdit={handleEditRock}
                  onArchive={handleArchiveRock}
                  onDelete={handleDeleteRock}
                  getUserName={getUserName}
                  getUserInfo={getUserInfo}
                  getSeatName={getSeatName}
                  showParent={true}
                  showChildren={false}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Cascade View Tab */}
        <TabsContent value="cascade" className="mt-6">
          {cascadeRock ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Cascade View: {cascadeRock.title}
                </h3>
                <Button variant="outline" size="sm" onClick={() => setCascadeRock(null)}>
                  View All
                </Button>
              </div>
              <RockCascadeView
                rock={cascadeRock}
                allRocks={rocks || []}
                onCreateTeamRock={handleCreateTeamRock}
                onCreateIndividualRock={handleCreateIndividualRock}
                onOpenRock={handleOpenRock}
                getUserName={getUserName}
                getUserInfo={getUserInfo}
                getFunctionName={getFunctionName}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Full Hierarchy</h3>
              {filteredCompanyRocks.length === 0 ? (
                <Card className="p-8 text-center">
                  <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Rocks to Display</h3>
                  <p className="text-muted-foreground">
                    Create company rocks to see the cascade hierarchy
                  </p>
                </Card>
              ) : (
                filteredCompanyRocks.map(rock => (
                  <RockCascadeView
                    key={rock.id}
                    rock={rock}
                    allRocks={rocks || []}
                    onCreateTeamRock={handleCreateTeamRock}
                    onCreateIndividualRock={handleCreateIndividualRock}
                    onOpenRock={handleOpenRock}
                    getUserName={getUserName}
                    getUserInfo={getUserInfo}
                    getFunctionName={getFunctionName}
                  />
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-6">
          <ArchivedRocksPanel
            onRestore={rockId => setLifecycle({ mode: 'restore', rockId })}
            onDelete={rockId => setLifecycle({ mode: 'delete', rockId })}
            getUserName={getUserName}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RockEditorSheet
        open={creating !== null}
        onOpenChange={open => { if (!open) setCreating(null); }}
        initialLevel={creating?.level}
        initialParentId={creating?.parentId}
        prefill={creating?.prefill}
      />

      <RockLifecycleDialog
        mode={lifecycle?.mode ?? null}
        rockId={lifecycle?.rockId ?? null}
        onClose={() => setLifecycle(null)}
        onDone={mode => { if (mode !== 'restore') setViewingRockId(null); }}
      />

      <RockDetailSheet
        rock={viewingRock}
        open={viewingRockId !== null}
        onOpenChange={(open) => {
          if (!open) setViewingRockId(null);
        }}
        parentRock={viewingParent}
        childRocks={viewingChildren}
        onEdit={handleEditRock}
        onViewCascade={handleViewCascade}
        getUserInfo={getUserInfo}
        onOpenRock={openRockById}
      />

      <RockEditorSheet
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingRock(null);
        }}
        rock={editingRock}
        onCopyToLevel={(level, values) => {
          setShowEditDialog(false);
          setEditingRock(null);
          setCreating({ level, parentId: null, prefill: copyToNewLevel(values) });
        }}
      />
    </div>
  );
}
