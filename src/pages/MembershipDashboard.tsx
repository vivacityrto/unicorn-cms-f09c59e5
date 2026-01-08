import { useState } from 'react';
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Clients Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Manage all clients • {memberships.length} active packages across clients
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs">
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

      {/* Main Content */}
      <div className="flex">
        {/* Left Panel - Main Dashboard */}
        <div className="flex-1 p-6 space-y-6">
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

        {/* Right Panel - Activity Feed */}
        <div className="w-80 border-l bg-muted/20 p-4">
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
