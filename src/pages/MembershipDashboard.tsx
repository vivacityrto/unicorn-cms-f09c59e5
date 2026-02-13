import { useState, useRef } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useMembershipDashboard } from '@/hooks/useMembershipDashboard';
import { MembershipCommandBar } from '@/components/membership/MembershipCommandBar';
import { MembershipKPITiles } from '@/components/membership/MembershipKPITiles';
import { MembershipGrid } from '@/components/membership/MembershipGrid';
import { MembershipActivityFeed } from '@/components/membership/MembershipActivityFeed';
import { LogConsultDialog, AddNoteDialog, CreateTaskDialog } from '@/components/membership/MembershipDialogs';
import { MembershipWithDetails } from '@/types/membership';
import { MyWorkWidget } from '@/components/dashboard/MyWorkWidget';
import { TimeInboxWidget } from '@/components/dashboard/TimeInboxWidget';
 import { ProcessesWidget } from '@/components/dashboard/ProcessesWidget';
import { ConsultantCapacityTable } from '@/components/capacity/ConsultantCapacityTable';
import { MomentumPanel } from '@/components/dashboard/MomentumPanel';
import { WeeklyWinTracker } from '@/components/dashboard/WeeklyWinTracker';
import { WinBanner } from '@/components/dashboard/WinBanner';

export default function MembershipDashboard() {
  const { profile } = useAuth();
  const {
    loading,
    memberships,
    allMemberships,
    activities,
    tasks,
    staffUsers,
    kpiStats,
    searchQuery,
    setSearchQuery,
    savedView,
    setSavedView,
    selectedTier,
    setSelectedTier,
    selectedState,
    setSelectedState,
    selectedCSC,
    setSelectedCSC,
    updateCSC,
    logConsultHours,
    addNote,
    createTask,
    refresh,
  } = useMembershipDashboard();

  // Dialog states
  const [logConsultOpen, setLogConsultOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<MembershipWithDetails | null>(null);
  const winsRef = useRef<HTMLDivElement>(null);

  const handleSelectMembership = (membership: MembershipWithDetails) => {
    setSelectedMembership(membership);
  };

  const handleLogConsult = () => {
    setLogConsultOpen(true);
  };

  const handleAddNote = () => {
    setAddNoteOpen(true);
  };

  const handleCreateTask = () => {
    setCreateTaskOpen(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 min-h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-foreground truncate">Clients Dashboard</h1>
                <p className="text-sm text-muted-foreground truncate">
                  Manage all clients • {memberships.length} active packages
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                {profile?.first_name} {profile?.last_name}
              </Badge>
              <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - responsive layout */}
      <div className="flex flex-col lg:flex-row w-full min-w-0">
        {/* Left Panel - Main Dashboard */}
        <div className="flex-1 min-w-0 p-4 md:p-6 space-y-6">
          {/* Engagement Region: Momentum + Weekly Wins */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <MomentumPanel userUuid={profile?.user_uuid ?? null} className="lg:col-span-2" />
            <div ref={winsRef}>
              <WeeklyWinTracker userUuid={profile?.user_uuid ?? null} />
            </div>
          </div>

          {/* Win Banner */}
          <WinBanner
            userUuid={profile?.user_uuid ?? null}
            onScrollToWins={() => winsRef.current?.scrollIntoView({ behavior: 'smooth' })}
          />

          {/* KPI Tiles */}
          <MembershipKPITiles 
            stats={kpiStats} 
            activeView={savedView}
            onViewChange={setSavedView}
          />

          {/* My Work Widget */}
          <MyWorkWidget />

          {/* Time Inbox Widget */}
          <TimeInboxWidget />
 
           {/* Processes Widget */}
           <ProcessesWidget />

           {/* Consultant Capacity Overview */}
           <ConsultantCapacityTable />

          {/* Command Bar */}
          <MembershipCommandBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            savedView={savedView}
            onSavedViewChange={setSavedView}
            selectedTier={selectedTier}
            onTierChange={setSelectedTier}
            selectedState={selectedState}
            onStateChange={setSelectedState}
            selectedCSC={selectedCSC}
            onCSCChange={setSelectedCSC}
            staffUsers={staffUsers}
            onLogConsult={handleLogConsult}
            onAddNote={handleAddNote}
            onCreateTask={handleCreateTask}
          />

          {/* Membership Grid */}
          <MembershipGrid
            memberships={memberships}
            onSelectMembership={handleSelectMembership}
            onCSCChange={updateCSC}
            staffUsers={staffUsers}
          />
        </div>

        {/* Right Panel - Activity Feed - hidden on mobile, fixed width on desktop */}
        <div className="hidden lg:block w-80 shrink-0 border-l bg-muted/20 p-4">
          <MembershipActivityFeed
            activities={activities}
            tasks={tasks}
            currentUserId={profile?.user_uuid}
            onCreateTask={handleCreateTask}
            onDraftEmail={() => {}}
            onLogFollowUp={handleAddNote}
          />
        </div>
      </div>

      {/* Dialogs */}
      <LogConsultDialog
        open={logConsultOpen}
        onOpenChange={setLogConsultOpen}
        memberships={allMemberships}
        selectedMembership={selectedMembership}
        onSubmit={logConsultHours}
      />

      <AddNoteDialog
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        memberships={allMemberships}
        selectedMembership={selectedMembership}
        onSubmit={addNote}
      />

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        memberships={allMemberships}
        selectedMembership={selectedMembership}
        onSubmit={createTask}
      />
    </div>
  );
}
