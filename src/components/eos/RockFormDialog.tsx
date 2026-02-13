import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useEosRocks } from '@/hooks/useEos';
import { useAuth } from '@/hooks/useAuth';
import { useVivacityTeamUsers, VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Armchair, User, Plus, X, ListChecks, GitBranch } from 'lucide-react';
import { DB_ROCK_STATUS, getStatusOptions, dbToUiStatus, uiToDbStatus } from '@/utils/rockStatusUtils';
import type { EosRock } from '@/types/eos';

interface RockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rock?: EosRock | null;
}

interface SeatWithOwner {
  id: string;
  seat_name: string;
  function_name: string;
  primary_owner_id: string | null;
  primary_owner_name: string | null;
}

interface Milestone {
  id: string;
  text: string;
  completed: boolean;
}

export function RockFormDialog({ open, onOpenChange, rock }: RockFormDialogProps) {
  const { profile } = useAuth();
  const { createRock, updateRock } = useEosRocks();
  const { data: vivacityUsers } = useVivacityTeamUsers();
  
  const [title, setTitle] = useState(rock?.title || '');
  const [description, setDescription] = useState(rock?.description || '');
  const [issue, setIssue] = useState((rock as any)?.issue || '');
  const [problemSolved, setProblemSolved] = useState((rock as any)?.outcome || '');
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    // Initialize milestones with proper deep copies
    const savedMilestones = (rock as any)?.milestones;
    if (Array.isArray(savedMilestones)) {
      return savedMilestones.map(m => ({ ...m, id: m.id || crypto.randomUUID() }));
    }
    return [];
  });
  const [clientId, setClientId] = useState(rock?.client_id || '');
  const [seatId, setSeatId] = useState(rock?.seat_id || '');
  const [ownerId, setOwnerId] = useState((rock as any)?.owner_id || '');
  const [parentRockId, setParentRockId] = useState((rock as any)?.parent_rock_id || '');
  const [status, setStatus] = useState(rock?.status || DB_ROCK_STATUS.ON_TRACK);
  const [priority, setPriority] = useState(rock?.priority || 1);
  const [quarterNumber, setQuarterNumber] = useState(
    rock?.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3)
  );
  const [quarterYear, setQuarterYear] = useState(rock?.quarter_year || new Date().getFullYear());
  const [dueDate, setDueDate] = useState(rock?.due_date ? rock.due_date.split('T')[0] : '');

  // Helper function to calculate quarter end date
  const getQuarterEndDate = (year: number, quarter: number): string => {
    const quarterEndDates: Record<number, { month: number; day: number }> = {
      1: { month: 3, day: 31 },   // March 31
      2: { month: 6, day: 30 },   // June 30
      3: { month: 9, day: 30 },   // September 30
      4: { month: 12, day: 31 }, // December 31
    };
    const { month, day } = quarterEndDates[quarter];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Auto-update due date when quarter or year changes
  const handleQuarterChange = (newQuarter: number) => {
    setQuarterNumber(newQuarter);
    setDueDate(getQuarterEndDate(quarterYear, newQuarter));
  };

  const handleYearChange = (newYear: number) => {
    setQuarterYear(newYear);
    setDueDate(getQuarterEndDate(newYear, quarterNumber));
  };
  
  // Determine rock level for conditional fields
  const rockLevel = (rock as any)?.rock_level;

  // Initialization tracking to prevent duplicate state syncs
  const [isInitialized, setIsInitialized] = useState(false);
  const previousRockId = useRef<string | null>(null);

  // Initialize form only when rock ID changes or dialog opens fresh
  useEffect(() => {
    const rockId = rock?.id ?? null;
    
    // Only reinitialize if rock ID actually changed or dialog just opened
    if (rockId !== previousRockId.current || (open && !isInitialized)) {
      previousRockId.current = rockId;
      
      if (rock) {
        setTitle(rock.title || '');
        setDescription(rock.description || '');
        setIssue((rock as any)?.issue || '');
        setProblemSolved((rock as any)?.outcome || '');
        // Parse milestones from JSON - create deep copies with proper IDs
        const savedMilestones = (rock as any)?.milestones;
        if (Array.isArray(savedMilestones)) {
          setMilestones(savedMilestones.map(m => ({
            id: m.id || crypto.randomUUID(),
            text: m.text || '',
            completed: !!m.completed,
          })));
        } else {
          setMilestones([]);
        }
        setClientId(rock.client_id || '');
        setSeatId(rock.seat_id || '');
        setOwnerId((rock as any)?.owner_id || '');
        setParentRockId((rock as any)?.parent_rock_id || '');
        setStatus(rock.status || DB_ROCK_STATUS.ON_TRACK);
        setPriority(rock.priority || 1);
        setQuarterNumber(rock.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3));
        setQuarterYear(rock.quarter_year || new Date().getFullYear());
        setDueDate(rock.due_date ? rock.due_date.split('T')[0] : '');
      } else {
        resetForm();
      }
      
      setIsInitialized(true);
    }
  }, [rock?.id, open]);

  // Reset initialization state when dialog closes
  useEffect(() => {
    if (!open) {
      setIsInitialized(false);
      previousRockId.current = null;
    }
  }, [open]);

  // Fetch seats with their primary owners
  const { data: seats, isLoading: seatsLoading } = useQuery({
    queryKey: ['seats-for-rocks', VIVACITY_TENANT_ID],
    queryFn: async () => {
      // Get all seats
      const { data: seatsData, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID);
      
      if (seatsError) throw seatsError;

      // Get primary assignments
      const { data: assignments, error: assignError } = await supabase
        .from('accountability_seat_assignments')
        .select('seat_id, user_id')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('assignment_type', 'Primary')
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString());
      
      if (assignError) throw assignError;

      // Get user names
      const userIds = [...new Set(assignments?.map(a => a.user_id) || [])];
      const { data: users } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', userIds);

      const userMap = new Map(users?.map(u => [u.user_uuid, `${u.first_name || ''} ${u.last_name || ''}`.trim()]) || []);
      const assignmentMap = new Map(assignments?.map(a => [a.seat_id, a.user_id]) || []);

      return seatsData?.map((seat): SeatWithOwner => ({
        id: seat.id,
        seat_name: seat.seat_name,
        function_name: (seat.accountability_functions as any)?.name || '',
        primary_owner_id: assignmentMap.get(seat.id) || null,
        primary_owner_name: assignmentMap.get(seat.id) ? userMap.get(assignmentMap.get(seat.id)!) || 'Unknown' : null,
      })) || [];
    },
    enabled: !!profile && open,
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-for-rocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients_legacy')
        .select('id, companyname, contactname')
        .order('companyname');
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open,
  });

  // Fetch Company Rocks for parent rock selection (for Team rocks)
  const { data: companyRocks } = useQuery({
    queryKey: ['company-rocks-for-parent', VIVACITY_TENANT_ID, quarterYear, quarterNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, quarter_year, quarter_number')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('rock_level', 'company')
        .is('archived_at', null)
        .order('title');
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open && rockLevel === 'team',
  });

  // Get selected seat info
  const selectedSeat = useMemo(() => 
    seats?.find(s => s.id === seatId), 
    [seats, seatId]
  );

  // Get user info helper
  const getUserInfo = (userId: string) => {
    const user = vivacityUsers?.find(u => u.user_uuid === userId);
    if (!user) return null;
    return {
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
      initials: [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?',
      avatarUrl: user.avatar_url,
      role: user.unicorn_role
    };
  };

  // Validation states
  const seatHasNoOwner = selectedSeat && !selectedSeat.primary_owner_id;
  const isExistingRockWithoutSeat = rock && !rock.seat_id && !seatId;
  const canSubmit = title.trim() && dueDate && seatId && !seatHasNoOwner;

  // Milestone handlers
  const addMilestone = () => {
    setMilestones([...milestones, { id: crypto.randomUUID(), text: '', completed: false }]);
  };

  const updateMilestone = (id: string, text: string) => {
    setMilestones(milestones.map(m => m.id === id ? { ...m, text } : m));
  };

  const removeMilestone = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const rockData: Record<string, any> = {
      title,
      description: description || null,
      issue: issue || null,
      outcome: problemSolved || null,
      milestones: milestones.filter(m => m.text.trim()).length > 0 
        ? milestones.filter(m => m.text.trim()) 
        : null,
      client_id: clientId || null,
      seat_id: seatId || null,
      owner_id: ownerId || null,
      status,
      priority,
      quarter_number: quarterNumber,
      quarter_year: quarterYear,
      due_date: dueDate,
      tenant_id: VIVACITY_TENANT_ID,
    };

    // Include parent_rock_id for team rocks
    if (rockLevel === 'team') {
      rockData.parent_rock_id = parentRockId || null;
    }

    if (rock?.id) {
      await updateRock.mutateAsync({ id: rock.id, ...rockData });
    } else {
      await createRock.mutateAsync(rockData);
    }
    
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setIssue('');
    setProblemSolved('');
    setMilestones([]);
    setClientId('');
    setSeatId('');
    setOwnerId('');
    setParentRockId('');
    setStatus(DB_ROCK_STATUS.ON_TRACK);
    setPriority(1);
    setQuarterNumber(Math.ceil((new Date().getMonth() + 1) / 3));
    setQuarterYear(new Date().getFullYear());
    setDueDate('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rock ? 'Edit Rock' : 'Create New Rock'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Warning for existing rocks without seat */}
          {isExistingRockWithoutSeat && (
            <Alert variant="default" className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                This Rock is not linked to an Accountability Seat. 
                Select a seat to ensure proper ownership and tracking.
              </AlertDescription>
            </Alert>
          )}

          {/* Parent Company Rock (for Team rocks only) */}
          {rockLevel === 'team' && (
            <div className="space-y-2">
              <Label htmlFor="parent-rock" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Parent Company Rock
              </Label>
              <Select 
                value={parentRockId || "none"} 
                onValueChange={(v) => setParentRockId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select parent company rock..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (no parent)</SelectItem>
                  {companyRocks?.map((companyRock) => (
                    <SelectItem key={companyRock.id} value={companyRock.id}>
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[350px]">{companyRock.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Q{companyRock.quarter_number} {companyRock.quarter_year}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This Team Rock cascades from the selected Company Rock.
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="90-day goal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Details about this rock..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Issue this rock addresses */}
          <div className="space-y-2">
            <Label htmlFor="issue">Issue This Rock Addresses</Label>
            <Textarea
              id="issue"
              placeholder="What issue or challenge does this rock address?"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={2}
            />
          </div>

          {/* The Problem This Solves */}
          <div className="space-y-2">
            <Label htmlFor="problem">The Problem This Solves</Label>
            <Textarea
              id="problem"
              placeholder="What outcome will be achieved when this rock is complete?"
              value={problemSolved}
              onChange={(e) => setProblemSolved(e.target.value)}
              rows={2}
            />
          </div>

          {/* Milestones */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Milestones
            </Label>
            <div className="space-y-2">
              {milestones.map((milestone, index) => (
                <div key={milestone.id} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                  <Input
                    placeholder={`Milestone ${index + 1}`}
                    value={milestone.text}
                    onChange={(e) => updateMilestone(milestone.id, e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMilestone(milestone.id)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMilestone}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Milestone
              </Button>
            </div>
          </div>

          {/* Seat Selection - Required */}
          <div className="space-y-2">
            <Label htmlFor="seat" className="flex items-center gap-2">
              <Armchair className="h-4 w-4" />
              Accountability Seat *
            </Label>
            <Select value={seatId || "none"} onValueChange={(v) => setSeatId(v === "none" ? "" : v)}>
              <SelectTrigger className={!seatId ? 'border-amber-300' : ''}>
                <SelectValue placeholder="Select accountability seat..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select a seat...</SelectItem>
                {seats?.map((seat) => (
                  <SelectItem key={seat.id} value={seat.id}>
                    <div className="flex items-center gap-2">
                      <span>{seat.seat_name}</span>
                      <Badge variant="outline" className="text-[10px]">{seat.function_name}</Badge>
                      {seat.primary_owner_name && (
                        <span className="text-muted-foreground text-xs">
                          — {seat.primary_owner_name}
                        </span>
                      )}
                      {!seat.primary_owner_id && (
                        <Badge variant="destructive" className="text-[10px]">No Owner</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Seat owner display */}
            {selectedSeat && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                {selectedSeat.primary_owner_name ? (
                  <span className="text-sm">
                    Seat Owner: <strong>{selectedSeat.primary_owner_name}</strong>
                  </span>
                ) : (
                  <span className="text-sm text-destructive">
                    This seat has no primary owner. Assign a seat owner before creating Rocks.
                  </span>
                )}
              </div>
            )}

            {seatHasNoOwner && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cannot save Rock until this seat has a primary owner assigned.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Team Member Responsible */}
          <div className="space-y-2">
            <Label htmlFor="owner" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Team Member Responsible
            </Label>
            <Select 
              value={ownerId || "none"} 
              onValueChange={(v) => {
                const newOwnerId = v === "none" ? "" : v;
                setOwnerId(newOwnerId);
                
                // Auto-select the seat this user occupies (as primary owner)
                if (newOwnerId && seats) {
                  const userSeat = seats.find(s => s.primary_owner_id === newOwnerId);
                  if (userSeat) {
                    setSeatId(userSeat.id);
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team member..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use seat owner</SelectItem>
                {vivacityUsers?.map((user) => {
                  const info = getUserInfo(user.user_uuid);
                  return (
                    <SelectItem key={user.user_uuid} value={user.user_uuid}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={info?.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">{info?.initials}</AvatarFallback>
                        </Avatar>
                        <span>{info?.name}</span>
                        {info?.role && (
                          <Badge variant="outline" className="text-[10px]">{info.role}</Badge>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {ownerId && getUserInfo(ownerId) && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={getUserInfo(ownerId)?.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">{getUserInfo(ownerId)?.initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm">
                  Assigned to: <strong>{getUserInfo(ownerId)?.name}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quarter">Quarter *</Label>
              <div className="flex gap-2">
                <Select value={String(quarterNumber)} onValueChange={(v) => handleQuarterChange(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Year"
                  value={quarterYear}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-date">Due Date *</Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Client (Optional)</Label>
            <Combobox
              options={[
                { value: "none", label: "None" },
                ...(clients?.map((client) => ({
                  value: client.id,
                  label: client.companyname || client.contactname || client.id,
                })) || []),
              ]}
              value={clientId || "none"}
              onValueChange={(v) => setClientId(v === "none" ? "" : v)}
              placeholder="Search clients..."
              searchPlaceholder="Type to filter clients..."
              emptyText="No clients found."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getStatusOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority: {priority}</Label>
            <Slider
              value={[priority]}
              onValueChange={(v) => setPriority(v[0])}
              min={1}
              max={5}
              step={1}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low (1)</span>
              <span>Critical (5)</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createRock.isPending || updateRock.isPending}
          >
            {rock ? 'Update' : 'Create'} Rock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
