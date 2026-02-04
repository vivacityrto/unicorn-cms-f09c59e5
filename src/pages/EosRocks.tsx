import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  GitBranch
} from 'lucide-react';
import { useEosRocksHierarchy } from '@/hooks/useEosRocksHierarchy';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuth } from '@/hooks/useAuth';
import { RockCard } from '@/components/eos/rocks/RockCard';
import { RockCascadeView } from '@/components/eos/rocks/RockCascadeView';
import { CreateCompanyRockDialog } from '@/components/eos/rocks/CreateCompanyRockDialog';
import { CreateTeamRockDialog } from '@/components/eos/rocks/CreateTeamRockDialog';
import { CreateIndividualRockDialog } from '@/components/eos/rocks/CreateIndividualRockDialog';
import { RockFormDialog } from '@/components/eos/RockFormDialog';
import { PermissionTooltip } from '@/components/eos/PermissionTooltip';
import { DashboardLayout } from '@/components/DashboardLayout';
import { dbToUiStatus } from '@/utils/rockStatusUtils';
import { getCurrentQuarter, formatQuarter } from '@/utils/rockRollup';
import type { RockWithHierarchy } from '@/types/eos';

export default function EosRocks() {
  return (
    <DashboardLayout>
      <RocksHierarchyContent />
    </DashboardLayout>
  );
}

function RocksHierarchyContent() {
  const currentQuarter = getCurrentQuarter();
  const [quarterYear, setQuarterYear] = useState(currentQuarter.year);
  const [quarterNumber, setQuarterNumber] = useState(currentQuarter.quarter);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'company' | 'team' | 'individual' | 'cascade'>('company');
  
  // Dialog states
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [showIndividualDialog, setShowIndividualDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedParentRock, setSelectedParentRock] = useState<RockWithHierarchy | null>(null);
  const [editingRock, setEditingRock] = useState<RockWithHierarchy | null>(null);
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
  const { canCreateRocks } = useRBAC();

  // Helper functions
  const getUserName = (userId: string): string | null => {
    const user = vivacityUsers?.find(u => u.user_uuid === userId);
    if (!user) return null;
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
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
      return matchesStatus && matchesSearch;
    });
  };

  const filteredCompanyRocks = filterRocks(companyRocks);
  const filteredTeamRocks = filterRocks(teamRocks);
  const filteredIndividualRocks = filterRocks(individualRocks);

  // Stats
  const stats = {
    total: rocks?.length || 0,
    onTrack: rocks?.filter(r => dbToUiStatus(r.status) === 'on_track').length || 0,
    offTrack: rocks?.filter(r => ['off_track', 'at_risk'].includes(dbToUiStatus(r.status))).length || 0,
    complete: rocks?.filter(r => dbToUiStatus(r.status) === 'complete').length || 0,
  };

  // Handlers
  const handleCreateTeamRock = (parentRock: RockWithHierarchy) => {
    setSelectedParentRock(parentRock);
    setShowTeamDialog(true);
  };

  const handleCreateIndividualRock = (parentRock: RockWithHierarchy) => {
    setSelectedParentRock(parentRock);
    setShowIndividualDialog(true);
  };

  const handleEditRock = (rock: RockWithHierarchy) => {
    setEditingRock(rock);
    setShowEditDialog(true);
  };

  const handleViewCascade = (rock: RockWithHierarchy) => {
    setCascadeRock(rock);
    setActiveTab('cascade');
  };

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="w-8 h-8" />
            Rocks (90-Day Goals)
          </h1>
          <p className="text-muted-foreground mt-2">
            Company → Team → Individual rock hierarchy
          </p>
        </div>
        <PermissionTooltip permission="rocks:create" action="create rocks">
          <Button 
            onClick={() => setShowCompanyDialog(true)}
            disabled={!canCreateRocks()}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Company Rock
          </Button>
        </PermissionTooltip>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Rocks</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Target className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('on_track')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">On Track</p>
                <p className="text-2xl font-bold text-green-600">{stats.onTrack}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('off_track')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Off Track</p>
                <p className="text-2xl font-bold text-red-600">{stats.offTrack}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('complete')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Complete</p>
                <p className="text-2xl font-bold text-blue-600">{stats.complete}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        {/* Quarter selector */}
        <Select 
          value={`${quarterYear}-${quarterNumber}`} 
          onValueChange={(v) => {
            const [y, q] = v.split('-').map(Number);
            setQuarterYear(y);
            setQuarterNumber(q);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[-1, 0, 1, 2].map(offset => {
              const q = currentQuarter.quarter + offset;
              const adjustedQ = ((q - 1) % 4 + 4) % 4 + 1;
              const adjustedY = currentQuarter.year + Math.floor((currentQuarter.quarter + offset - 1) / 4);
              return (
                <SelectItem key={`${adjustedY}-${adjustedQ}`} value={`${adjustedY}-${adjustedQ}`}>
                  Q{adjustedQ} {adjustedY}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="on_track">On Track</SelectItem>
            <SelectItem value="off_track">Off Track</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {(statusFilter !== 'all' || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setSearchQuery('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company
            <Badge variant="secondary" className="text-xs">{filteredCompanyRocks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team
            <Badge variant="secondary" className="text-xs">{filteredTeamRocks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="individual" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Individual
            <Badge variant="secondary" className="text-xs">{filteredIndividualRocks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cascade" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Cascade
          </TabsTrigger>
        </TabsList>

        {/* Company Rocks Tab */}
        <TabsContent value="company" className="mt-6">
          {filteredCompanyRocks.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Company Rocks</h3>
              <p className="text-muted-foreground mb-4">
                Create 3-7 company-wide priorities for {formatQuarter(quarterYear, quarterNumber)}
              </p>
              <Button onClick={() => setShowCompanyDialog(true)}>
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
                  onEdit={handleEditRock}
                  onViewCascade={handleViewCascade}
                  getUserName={getUserName}
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
                <Button onClick={() => {
                  setSelectedParentRock(companyRocks[0]);
                  setShowTeamDialog(true);
                }}>
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
                          onEdit={handleEditRock}
                          onViewCascade={handleViewCascade}
                          getUserName={getUserName}
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
                Create individual rocks that cascade from team rocks
              </p>
              {teamRocks && teamRocks.length > 0 && (
                <Button onClick={() => {
                  setSelectedParentRock(teamRocks[0]);
                  setShowIndividualDialog(true);
                }}>
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
                  onEdit={handleEditRock}
                  getUserName={getUserName}
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
                onEditRock={handleEditRock}
                getUserName={getUserName}
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
                    onEditRock={handleEditRock}
                    getUserName={getUserName}
                    getFunctionName={getFunctionName}
                  />
                ))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateCompanyRockDialog
        open={showCompanyDialog}
        onOpenChange={setShowCompanyDialog}
      />

      <CreateTeamRockDialog
        open={showTeamDialog}
        onOpenChange={(open) => {
          setShowTeamDialog(open);
          if (!open) setSelectedParentRock(null);
        }}
        parentRock={selectedParentRock}
      />

      <CreateIndividualRockDialog
        open={showIndividualDialog}
        onOpenChange={(open) => {
          setShowIndividualDialog(open);
          if (!open) setSelectedParentRock(null);
        }}
        parentRock={selectedParentRock}
      />

      <RockFormDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingRock(null);
        }}
        rock={editingRock}
      />
    </div>
  );
}
