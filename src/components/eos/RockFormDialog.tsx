import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useEosRocks } from '@/hooks/useEos';
import { useAuth } from '@/hooks/useAuth';
import { useVivacityTeamUsers, VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Plus, X, ListChecks, GitBranch, Building2, Users, UserCircle } from 'lucide-react';
import { DB_ROCK_STATUS, getStatusOptions } from '@/utils/rockStatusUtils';
import type { EosRock, RockLevel } from '@/types/eos';

interface RockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rock?: EosRock | null;
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
  
  // Form state
  const [rockLevel, setRockLevel] = useState<RockLevel>(rock?.rock_level || 'company');
  const [title, setTitle] = useState(rock?.title || '');
  const [description, setDescription] = useState(rock?.description || '');
  const [issue, setIssue] = useState((rock as any)?.issue || '');
  const [problemSolved, setProblemSolved] = useState((rock as any)?.outcome || '');
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    const savedMilestones = (rock as any)?.milestones;
    if (Array.isArray(savedMilestones)) {
      return savedMilestones.map(m => ({ ...m, id: m.id || crypto.randomUUID() }));
    }
    return [];
  });
  const [clientId, setClientId] = useState<string>(rock?.client_id ? String(rock.client_id) : '');
  const [functionId, setFunctionId] = useState((rock as any)?.function_id || '');
  const [ownerId, setOwnerId] = useState((rock as any)?.owner_id || '');
  const [parentRockId, setParentRockId] = useState((rock as any)?.parent_rock_id || '');
  const [status, setStatus] = useState(rock?.status || DB_ROCK_STATUS.ON_TRACK);
  const [priority, setPriority] = useState(rock?.priority || 1);
  const [quarterNumber, setQuarterNumber] = useState(
    rock?.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3)
  );
  const [quarterYear, setQuarterYear] = useState(rock?.quarter_year || new Date().getFullYear());
  const [dueDate, setDueDate] = useState(rock?.due_date ? rock.due_date.split('T')[0] : '');

  // Quarter end date helper
  const getQuarterEndDate = (year: number, quarter: number): string => {
    const quarterEndDates: Record<number, { month: number; day: number }> = {
      1: { month: 3, day: 31 },
      2: { month: 6, day: 30 },
      3: { month: 9, day: 30 },
      4: { month: 12, day: 31 },
    };
    const { month, day } = quarterEndDates[quarter];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const handleQuarterChange = (newQuarter: number) => {
    setQuarterNumber(newQuarter);
    setDueDate(getQuarterEndDate(quarterYear, newQuarter));
  };

  const handleYearChange = (newYear: number) => {
    setQuarterYear(newYear);
    setDueDate(getQuarterEndDate(newYear, quarterNumber));
  };

  // Initialization tracking
  const [isInitialized, setIsInitialized] = useState(false);
  const previousRockId = useRef<string | null>(null);

  useEffect(() => {
    const rockId = rock?.id ?? null;
    if (rockId !== previousRockId.current || (open && !isInitialized)) {
      previousRockId.current = rockId;
      if (rock) {
        setRockLevel(rock.rock_level || 'company');
        setTitle(rock.title || '');
        setDescription(rock.description || '');
        setIssue((rock as any)?.issue || '');
        setProblemSolved((rock as any)?.outcome || '');
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
        setClientId(rock.client_id ? String(rock.client_id) : '');
        setFunctionId((rock as any)?.function_id || '');
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

  useEffect(() => {
    if (!open) {
      setIsInitialized(false);
      previousRockId.current = null;
    }
  }, [open]);

  // When scope changes, clear fields that don't apply
  const handleScopeChange = (newLevel: RockLevel) => {
    setRockLevel(newLevel);
    if (newLevel === 'company') {
      setFunctionId('');
      // Owner is optional for company rocks
    }
    if (newLevel === 'individual') {
      setFunctionId(''); // optional for individual
    }
    // Don't auto-clear owner — let the user decide
    setParentRockId(''); // Reset parent when scope changes
  };

  // Fetch accountability functions (used as "Teams" for team rocks)
  const { data: functions } = useQuery({
    queryKey: ['accountability-functions-for-rocks', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_functions')
        .select('id, name')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open,
  });

  // Fetch tenants for client dropdown
  const { data: clients } = useQuery({
    queryKey: ['tenants-for-rocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .neq('id', VIVACITY_TENANT_ID)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open,
  });

  // Fetch potential parent rocks (company and team rocks in same tenant)
  const { data: parentRocks } = useQuery({
    queryKey: ['parent-rocks', VIVACITY_TENANT_ID, rockLevel],
    queryFn: async () => {
      // Determine which levels can be parents
      let parentLevels: string[] = [];
      if (rockLevel === 'team') parentLevels = ['company'];
      else if (rockLevel === 'individual') parentLevels = ['company', 'team'];
      // Company rocks have no parent
      if (parentLevels.length === 0) return [];

      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, rock_level, quarter_year, quarter_number')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .in('rock_level', parentLevels)
        .is('archived_at', null)
        .order('title');
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open && rockLevel !== 'company',
  });

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

  // Validation
  const canSubmit = useMemo(() => {
    if (!title.trim() || !dueDate) return false;
    if (rockLevel === 'team' && (!functionId || !ownerId)) return false;
    if (rockLevel === 'individual' && !ownerId) return false;
    return true;
  }, [title, dueDate, rockLevel, functionId, ownerId]);

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
      client_id: clientId ? Number(clientId) : null,
      rock_level: rockLevel,
      function_id: rockLevel === 'team' ? functionId : (rockLevel === 'individual' && functionId ? functionId : null),
      owner_id: ownerId || null,
      parent_rock_id: parentRockId || null,
      status,
      priority,
      quarter_number: quarterNumber,
      quarter_year: quarterYear,
      due_date: dueDate,
      tenant_id: VIVACITY_TENANT_ID,
    };

    try {
      if (rock?.id) {
        await updateRock.mutateAsync({ id: rock.id, ...rockData });
      } else {
        await createRock.mutateAsync(rockData);
      }
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Rock save failed:', error);
    }
  };

  const resetForm = () => {
    setRockLevel('company');
    setTitle('');
    setDescription('');
    setIssue('');
    setProblemSolved('');
    setMilestones([]);
    setClientId('');
    setFunctionId('');
    setOwnerId('');
    setParentRockId('');
    setStatus(DB_ROCK_STATUS.ON_TRACK);
    setPriority(1);
    setQuarterNumber(Math.ceil((new Date().getMonth() + 1) / 3));
    setQuarterYear(new Date().getFullYear());
    setDueDate('');
  };

  const scopeIcons: Record<RockLevel, typeof Building2> = {
    company: Building2,
    team: Users,
    individual: UserCircle,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rock ? 'Edit Rock' : 'Create New Rock'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">

          {/* Scope Selector */}
          <div className="space-y-2">
            <Label>Scope *</Label>
            <RadioGroup
              value={rockLevel}
              onValueChange={(v) => handleScopeChange(v as RockLevel)}
              className="flex gap-4"
            >
              {(['company', 'team', 'individual'] as RockLevel[]).map((level) => {
                const Icon = scopeIcons[level];
                return (
                  <div key={level} className="flex items-center space-x-2">
                    <RadioGroupItem value={level} id={`scope-${level}`} />
                    <Label htmlFor={`scope-${level}`} className="flex items-center gap-1.5 cursor-pointer capitalize">
                      <Icon className="h-4 w-4" />
                      {level}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Team selector (for team rocks, optional for individual) */}
          {(rockLevel === 'team' || rockLevel === 'individual') && (
            <div className="space-y-2">
              <Label htmlFor="function" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team {rockLevel === 'team' ? '*' : '(Optional)'}
              </Label>
              <Select
                value={functionId || 'none'}
                onValueChange={(v) => setFunctionId(v === 'none' ? '' : v)}
              >
                <SelectTrigger className={rockLevel === 'team' && !functionId ? 'border-amber-300' : ''}>
                  <SelectValue placeholder="Select team..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{rockLevel === 'team' ? 'Select team...' : 'None'}</SelectItem>
                  {functions?.map((fn) => (
                    <SelectItem key={fn.id} value={fn.id}>{fn.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Owner selector (required for team + individual, optional for company) */}
          <div className="space-y-2">
            <Label htmlFor="owner" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Owner {rockLevel !== 'company' ? '*' : '(Optional)'}
            </Label>
            <Select
              value={ownerId || 'none'}
              onValueChange={(v) => setOwnerId(v === 'none' ? '' : v)}
            >
              <SelectTrigger className={rockLevel !== 'company' && !ownerId ? 'border-amber-300' : ''}>
                <SelectValue placeholder="Select owner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{rockLevel !== 'company' ? 'Select owner...' : 'None'}</SelectItem>
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
          </div>

          {/* Parent Rock (for team and individual only) */}
          {rockLevel !== 'company' && (
            <div className="space-y-2">
              <Label htmlFor="parent-rock" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Parent Rock (Optional)
              </Label>
              <Select
                value={parentRockId || 'none'}
                onValueChange={(v) => setParentRockId(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to parent rock..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (no parent)</SelectItem>
                  {parentRocks?.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">{pr.rock_level}</Badge>
                        <span className="truncate max-w-[300px]">{pr.title}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Q{pr.quarter_number} {pr.quarter_year}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                { value: 'none', label: 'None' },
                ...(clients?.map((client) => ({
                  value: String(client.id),
                  label: client.name || String(client.id),
                })) || []),
              ]}
              value={clientId || 'none'}
              onValueChange={(v) => setClientId(v === 'none' ? '' : v)}
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
