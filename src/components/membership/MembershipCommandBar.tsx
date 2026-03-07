import { useState } from 'react';
import { useMembershipStateOptions } from '@/hooks/useMembershipStateOptions';
import { Search, Plus, FileText, MessageSquare, ListTodo, User, Filter, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { SavedView, MEMBERSHIP_TIERS } from '@/types/membership';

interface MembershipCommandBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  savedView: SavedView;
  onSavedViewChange: (view: SavedView) => void;
  selectedTier: string | null;
  onTierChange: (tier: string | null) => void;
  selectedState: string | null;
  onStateChange: (state: string | null) => void;
  selectedCSC: string | null;
  onCSCChange: (csc: string | null) => void;
  staffUsers: Array<{ user_uuid: string; first_name: string; last_name: string }>;
  onLogConsult: () => void;
  onAddNote: () => void;
  onCreateTask: () => void;
}

export function MembershipCommandBar({
  searchQuery,
  onSearchChange,
  savedView,
  onSavedViewChange,
  selectedTier,
  onTierChange,
  selectedState,
  onStateChange,
  selectedCSC,
  onCSCChange,
  staffUsers,
  onLogConsult,
  onAddNote,
  onCreateTask,
}: MembershipCommandBarProps) {
  const savedViews: { value: SavedView; label: string }[] = [
    { value: 'all', label: 'All Memberships' },
    { value: 'my_memberships', label: 'My Memberships' },
    { value: 'overdue_actions', label: 'Overdue Actions' },
    { value: 'hours_at_risk', label: 'Hours at Risk' },
    { value: 'obligations_due', label: 'Obligations Due' },
  ];

  const membershipStates = [
    { value: null, label: 'All States' },
    { value: 'active', label: 'Active' },
    { value: 'at_risk', label: 'At Risk' },
    { value: 'paused', label: 'Paused' },
    { value: 'exiting', label: 'Exiting' },
  ];

  const activeFiltersCount = [selectedTier, selectedState, selectedCSC].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 p-4 bg-card rounded-lg border border-border/50 shadow-sm">
      {/* Top row: Search + Quick Actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search client, CSC, or package..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>

        {/* Saved Views */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <User className="h-4 w-4" />
              {savedViews.find(v => v.value === savedView)?.label || 'All'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {savedViews.map(view => (
              <DropdownMenuItem
                key={view.value}
                onClick={() => onSavedViewChange(view.value)}
                className={savedView === view.value ? 'bg-accent' : ''}
              >
                {view.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Package Tier</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onTierChange(null)} className={!selectedTier ? 'bg-accent' : ''}>
              All Tiers
            </DropdownMenuItem>
            {Object.entries(MEMBERSHIP_TIERS).map(([key, tier]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onTierChange(key)}
                className={selectedTier === key ? 'bg-accent' : ''}
              >
                <span className={tier.color}>{tier.fullText}</span>
              </DropdownMenuItem>
            ))}
            
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Membership State</DropdownMenuLabel>
            {membershipStates.map(state => (
              <DropdownMenuItem
                key={state.value || 'all'}
                onClick={() => onStateChange(state.value)}
                className={selectedState === state.value ? 'bg-accent' : ''}
              >
                {state.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>CSC</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onCSCChange(null)} className={!selectedCSC ? 'bg-accent' : ''}>
              All CSCs
            </DropdownMenuItem>
            {staffUsers.map(user => (
              <DropdownMenuItem
                key={user.user_uuid}
                onClick={() => onCSCChange(user.user_uuid)}
                className={selectedCSC === user.user_uuid ? 'bg-accent' : ''}
              >
                {user.first_name} {user.last_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" onClick={onLogConsult} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Log Consult
          </Button>
          <Button size="sm" variant="outline" onClick={onAddNote} className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Add Note
          </Button>
          <Button size="sm" variant="outline" onClick={onCreateTask} className="gap-1.5">
            <ListTodo className="h-3.5 w-3.5" />
            Create Task
          </Button>
        </div>
      </div>

      {/* Active filters badges */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {selectedTier && (
            <Badge variant="secondary" className="gap-1">
              {MEMBERSHIP_TIERS[selectedTier]?.fullText}
              <button onClick={() => onTierChange(null)} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          {selectedState && (
            <Badge variant="secondary" className="gap-1 capitalize">
              {selectedState.replace('_', ' ')}
              <button onClick={() => onStateChange(null)} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          {selectedCSC && (
            <Badge variant="secondary" className="gap-1">
              {staffUsers.find(u => u.user_uuid === selectedCSC)?.first_name || 'CSC'}
              <button onClick={() => onCSCChange(null)} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          <button 
            onClick={() => { onTierChange(null); onStateChange(null); onCSCChange(null); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
