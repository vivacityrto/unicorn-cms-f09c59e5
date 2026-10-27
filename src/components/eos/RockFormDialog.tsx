import { useState, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
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
import { useAuth } from '@/hooks/useAuth';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { useVivacityTeamUsers, VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Plus, X, ListChecks, GitBranch, Building2, Users, UserCircle, Info } from 'lucide-react';
import { DB_ROCK_STATUS, getStatusOptions } from '@/utils/rockStatusUtils';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';
import { toast } from '@/hooks/use-toast';
import type { EosRock, EosRockMilestone, RockLevel } from '@/types/eos';
import type { Json } from '@/integrations/supabase/types';

interface RockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rock?: EosRock | null;
}

interface Milestone {
  id: string;
  text: string;
  completed: boolean;
  owner_id: string | null;
  due_date: string;
  priority: EosRockMilestone['priority'];
  status: EosRockMilestone['status'];
  exit_criteria: string;
  evidence_url: string;
  linked_company_milestone_ids: string[];
}

const getMilestoneId = (id?: string) =>
  id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id
    : crypto.randomUUID();

export function RockFormDialog({ open, onOpenChange, rock }: RockFormDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: vivacityUsers } = useVivacityTeamUsers();

  // RPC-based mutation for save with auto-parenting
  const upsertRock = useMutation({
    mutationFn: async ({ payload, milestonesToSave }: { payload: Json; milestonesToSave: Milestone[] }) => {
      const { data, error } = await supabase.rpc('upsert_rock_with_parenting', {
        p_payload: payload,
      });
      if (error) throw error;
      const rockResult = data as { id: string; parent_rock_id: string | null; action: string };
      const rockPayload = payload as { tenant_id: number; rock_level: string };
      const activeMilestones = milestonesToSave.filter(milestone => milestone.text.trim());
      const nextIds = activeMilestones.map(milestone => milestone.id);

      try {
        const { data: existing, error: existingError } = await supabase
          .from('eos_rock_milestones')
          .select('id')
          .eq('rock_id', rockResult.id);
        if (existingError) {
          if (isRockMilestoneSchemaUnavailable(existingError)) return rockResult;
          throw existingError;
        }

        if (activeMilestones.length > 0) {
          const rows = activeMilestones.map((milestone, index) => ({
            id: milestone.id,
            tenant_id: rockPayload.tenant_id,
            rock_id: rockResult.id,
            title: milestone.text.trim(),
            owner_id: milestone.owner_id || null,
            due_date: milestone.due_date || null,
            priority: milestone.priority,
            status: milestone.status,
            exit_criteria: milestone.exit_criteria.trim() || null,
            evidence_url: milestone.evidence_url.trim() || null,
            sort_order: index,
          }));
          const { error: saveError } = await supabase
            .from('eos_rock_milestones')
            .upsert(rows, { onConflict: 'id' });
          if (saveError) throw saveError;
        }

        const obsoleteIds = (existing || []).map(row => row.id).filter(id => !nextIds.includes(id));
        if (obsoleteIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('eos_rock_milestones')
            .delete()
            .in('id', obsoleteIds);
          if (deleteError) throw deleteError;
        }

        if (rockPayload.rock_level === 'individual') {
          const links = activeMilestones.flatMap(milestone =>
            milestone.linked_company_milestone_ids.map(companyMilestoneId => ({
              tenant_id: rockPayload.tenant_id,
              company_milestone_id: companyMilestoneId,
              individual_milestone_id: milestone.id,
            }))
          );
          for (const milestone of activeMilestones) {
            const desiredCompanyIds = milestone.linked_company_milestone_ids;
            const removeStaleLinks = supabase
              .from('eos_rock_milestone_links')
              .delete()
              .eq('individual_milestone_id', milestone.id);
            const { error: clearLinksError } = desiredCompanyIds.length > 0
              ? await removeStaleLinks.not('company_milestone_id', 'in', `(${desiredCompanyIds.join(',')})`)
              : await removeStaleLinks;
            if (clearLinksError) throw clearLinksError;
          }
          if (links.length > 0) {
            const { error: linkError } = await supabase
              .from('eos_rock_milestone_links')
              .upsert(links, {
                onConflict: 'company_milestone_id,individual_milestone_id',
                ignoreDuplicates: true,
              });
            if (linkError) throw linkError;
          }
        }
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : 'Unknown error';
        throw new Error(`Rock was saved, but milestone details could not be synchronized: ${message}`);
      }

      return rockResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rock-milestones'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rock-milestone-progress'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rock-milestone-links'] });
      toast({ title: data.action === 'created' ? 'Rock created' : 'Rock updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving rock', description: error.message, variant: 'destructive' });
    },
  });
  
  // Form state
  const [rockLevel, setRockLevel] = useState<RockLevel>(rock?.rock_level || 'company');
  const [title, setTitle] = useState(rock?.title || '');
  const [description, setDescription] = useState(rock?.description || '');
  const [issue, setIssue] = useState(rock?.issue || '');
  const [problemSolved, setProblemSolved] = useState(rock?.outcome || '');

  const descriptionRef = useAutoResizeTextarea<HTMLTextAreaElement>(description, 400);
  const issueRef = useAutoResizeTextarea<HTMLTextAreaElement>(issue, 400);
  const problemSolvedRef = useAutoResizeTextarea<HTMLTextAreaElement>(problemSolved, 400);
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    const savedMilestones = rock?.milestones;
    if (Array.isArray(savedMilestones)) {
      return (savedMilestones as unknown as Partial<Milestone>[]).map(m => ({
        id: getMilestoneId(m.id),
        text: m.text || '',
        completed: !!m.completed,
        owner_id: m.owner_id || null,
        due_date: m.due_date || '',
        priority: m.priority || 'medium',
        status: m.status || (m.completed ? 'complete' : 'not_started'),
        exit_criteria: m.exit_criteria || '',
        evidence_url: m.evidence_url || '',
        linked_company_milestone_ids: m.linked_company_milestone_ids || [],
      }));
    }
    return [];
  });
  const [clientId, setClientId] = useState<string>(rock?.client_tenant_id ? String(rock.client_tenant_id) : '');
  const [functionId, setFunctionId] = useState(rock?.function_id || '');
  const [ownerId, setOwnerId] = useState(rock?.owner_id || '');
  const [parentRockId, setParentRockId] = useState(rock?.parent_rock_id || '');
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
        setIssue(rock?.issue || '');
        setProblemSolved(rock?.outcome || '');
        const savedMilestones = rock?.milestones;
        if (Array.isArray(savedMilestones)) {
          setMilestones((savedMilestones as unknown as Partial<Milestone>[]).map(m => ({
            id: getMilestoneId(m.id),
            text: m.text || '',
            completed: !!m.completed,
            owner_id: m.owner_id || null,
            due_date: m.due_date || '',
            priority: m.priority || 'medium',
            status: m.status || (m.completed ? 'complete' : 'not_started'),
            exit_criteria: m.exit_criteria || '',
            evidence_url: m.evidence_url || '',
            linked_company_milestone_ids: m.linked_company_milestone_ids || [],
          })));
        } else {
          setMilestones([]);
        }
        setClientId(rock.client_tenant_id ? String(rock.client_tenant_id) : '');
        setFunctionId(rock?.function_id || '');
        setOwnerId(rock?.owner_id || '');
        setParentRockId(rock?.parent_rock_id || '');
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
  }, [rock?.id, open, rock, isInitialized]);

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
    queryKey: ['parent-rocks', VIVACITY_TENANT_ID, rockLevel, functionId, clientId, quarterYear, quarterNumber],
    queryFn: async () => {
      let parentLevels: string[] = [];
      if (rockLevel === 'team') parentLevels = ['company'];
      else if (rockLevel === 'individual') parentLevels = ['company', 'team'];
      if (parentLevels.length === 0) return [];

      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, rock_level, parent_rock_id, quarter_year, quarter_number, function_id, client_tenant_id')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .in('rock_level', parentLevels)
        .is('archived_at', null)
        .order('title');
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open && rockLevel !== 'company',
  });

  const companyParentId = useMemo(() => {
    if (rockLevel !== 'individual' || !parentRockId) return null;
    const parent = parentRocks?.find(candidate => candidate.id === parentRockId);
    if (parent?.rock_level === 'company') return parent.id;
    if (parent?.rock_level === 'team') {
      const companyParent = parentRocks?.find(candidate => candidate.id === parent.parent_rock_id);
      return companyParent?.rock_level === 'company' ? companyParent.id : null;
    }
    return null;
  }, [rockLevel, parentRockId, parentRocks]);

  const normalizedMilestonesQuery = useQuery({
    queryKey: ['eos-rock-milestones', rock?.id],
    queryFn: async () => {
      if (!rock?.id) return [];
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('*')
        .eq('rock_id', rock.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open && !!rock?.id,
  });
  const normalizedMilestones = normalizedMilestonesQuery.data;

  const normalizedMilestoneIds = useMemo(
    () => (normalizedMilestones || []).map(milestone => milestone.id),
    [normalizedMilestones]
  );
  const milestoneLinksQuery = useQuery({
    queryKey: ['eos-rock-milestone-links', rock?.id, normalizedMilestoneIds],
    queryFn: async () => {
      if (normalizedMilestoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from('eos_rock_milestone_links')
        .select('company_milestone_id, individual_milestone_id')
        .in('individual_milestone_id', normalizedMilestoneIds);
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open && rockLevel === 'individual' && normalizedMilestoneIds.length > 0,
  });
  const milestoneLinks = milestoneLinksQuery.data;

  const companyMilestonesQuery = useQuery({
    queryKey: ['eos-rock-company-milestones', companyParentId],
    queryFn: async () => {
      if (!companyParentId) return [];
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('id, title, status, due_date')
        .eq('rock_id', companyParentId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile && open && !!companyParentId,
  });
  const companyMilestones = companyMilestonesQuery.data;
  const isMilestoneDataLoading =
    (!!rock?.id && normalizedMilestonesQuery.isLoading) ||
    (rockLevel === 'individual' && milestoneLinksQuery.isLoading) ||
    (!!companyParentId && companyMilestonesQuery.isLoading);

  useEffect(() => {
    if (!open || !rock?.id || !normalizedMilestones) return;
    if (normalizedMilestones.length === 0) return;
    const linksByIndividual = new Map<string, string[]>();
    for (const link of milestoneLinks || []) {
      const ids = linksByIndividual.get(link.individual_milestone_id) || [];
      ids.push(link.company_milestone_id);
      linksByIndividual.set(link.individual_milestone_id, ids);
    }
    setMilestones(normalizedMilestones.map(milestone => ({
      id: milestone.id,
      text: milestone.title,
      completed: milestone.status === 'complete',
      owner_id: milestone.owner_id,
      due_date: milestone.due_date || '',
      priority: milestone.priority as EosRockMilestone['priority'],
      status: milestone.status as EosRockMilestone['status'],
      exit_criteria: milestone.exit_criteria || '',
      evidence_url: milestone.evidence_url || '',
      linked_company_milestone_ids: linksByIndividual.get(milestone.id) || [],
    })));
  }, [open, rock?.id, normalizedMilestones, milestoneLinks]);

  useEffect(() => {
    if (rockLevel !== 'individual') return;
    if (!parentRocks) return;
    if (companyParentId && !companyMilestones) return;
    const validCompanyMilestoneIds = new Set((companyMilestones || []).map(milestone => milestone.id));
    setMilestones(current => current.map(milestone => ({
      ...milestone,
      linked_company_milestone_ids: milestone.linked_company_milestone_ids.filter(id =>
        validCompanyMilestoneIds.has(id)
      ),
    })));
  }, [rockLevel, parentRocks, companyParentId, companyMilestones]);

  // Track whether user has manually changed parent
  const [parentManuallySet, setParentManuallySet] = useState(false);

  // Auto-suggest parent rock for individual rocks
  useEffect(() => {
    if (rockLevel !== 'individual' || !parentRocks || parentManuallySet || rock?.id) return;

    // Priority 1: team rock matching team + quarter + client
    if (functionId && clientId) {
      const match = parentRocks.find(
        r => r.rock_level === 'team' &&
          r.function_id === functionId &&
          r.client_tenant_id === Number(clientId) &&
          r.quarter_year === quarterYear &&
          r.quarter_number === quarterNumber
      );
      if (match) { setParentRockId(match.id); return; }
    }

    // Priority 2: team rock matching team + quarter (no client)
    if (functionId) {
      const match = parentRocks.find(
        r => r.rock_level === 'team' &&
          r.function_id === functionId &&
          r.client_tenant_id == null &&
          r.quarter_year === quarterYear &&
          r.quarter_number === quarterNumber
      );
      if (match) { setParentRockId(match.id); return; }
    }

    // No suggestion
    setParentRockId('');
  }, [rockLevel, functionId, clientId, quarterYear, quarterNumber, parentRocks, parentManuallySet, rock?.id]);

  // Reset manual parent flag when scope changes
  useEffect(() => {
    setParentManuallySet(false);
  }, [rockLevel]);

  const eligibleParentRocks = parentRocks?.filter((candidate) => {
    // Keep a legacy current parent visible during edits even when its stored
    // quarter/client scope is inconsistent; only offer new same-scope choices.
    if (candidate.id === rock?.parent_rock_id) return true;
    if (candidate.quarter_year !== quarterYear || candidate.quarter_number !== quarterNumber) return false;
    if (rockLevel === 'team') return candidate.rock_level === 'company';
    if (rockLevel !== 'individual') return false;
    return candidate.client_tenant_id === (clientId ? Number(clientId) : null);
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
    setMilestones([...milestones, {
      id: crypto.randomUUID(),
      text: '',
      completed: false,
      owner_id: ownerId || null,
      due_date: dueDate,
      priority: 'medium',
      status: 'not_started',
      exit_criteria: '',
      evidence_url: '',
      linked_company_milestone_ids: [],
    }]);
  };
  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setMilestones(milestones.map(m => m.id === id ? { ...m, ...updates } : m));
  };
  const removeMilestone = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const rockData: Record<string, Json | undefined> = {
      title,
      description: description || null,
      issue: issue || null,
      outcome: problemSolved || null,
      milestones: milestones.filter(m => m.text.trim()).length > 0
        ? (milestones.filter(m => m.text.trim()).map(m => ({
            id: m.id,
            text: m.text,
            completed: m.status === 'complete',
          })) as unknown as Json)
        : null,
      client_tenant_id: clientId ? Number(clientId) : null,
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
        rockData.id = rock.id;
      }
      await upsertRock.mutateAsync({ payload: rockData as Json, milestonesToSave: milestones });
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
    setParentManuallySet(false);
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
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto scrollbar-thin">
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
                onValueChange={(v) => {
                  setParentRockId(v === 'none' ? '' : v);
                  setParentManuallySet(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to parent rock..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (no parent)</SelectItem>
                  {eligibleParentRocks?.map((pr) => (
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
              {rockLevel === 'individual' && parentRockId && !parentManuallySet && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Auto-suggested based on team and quarter. You can change or remove it.
                </p>
              )}
              {rockLevel === 'individual' && clientId && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Links to a team-level Client Rock for this quarter. One will be created automatically if needed.
                </p>
              )}
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
              ref={descriptionRef}
              id="description"
              placeholder="Details about this rock..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none overflow-hidden"
            />
          </div>

          {/* Issue this rock addresses */}
          <div className="space-y-2">
            <Label htmlFor="issue">Issue This Rock Addresses</Label>
            <Textarea
              ref={issueRef}
              id="issue"
              placeholder="What issue or challenge does this rock address?"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={2}
              className="resize-none overflow-hidden"
            />
          </div>

          {/* The Problem This Solves */}
          <div className="space-y-2">
            <Label htmlFor="problem">The Problem This Solves</Label>
            <Textarea
              ref={problemSolvedRef}
              id="problem"
              placeholder="What outcome will be achieved when this rock is complete?"
              value={problemSolved}
              onChange={(e) => setProblemSolved(e.target.value)}
              rows={2}
              className="resize-none overflow-hidden"
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
                <div key={milestone.id} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                    <Input
                      placeholder={`Milestone ${index + 1}`}
                      value={milestone.text}
                      onChange={(e) => updateMilestone(milestone.id, { text: e.target.value })}
                      className={cn("flex-1", milestone.status === 'complete' && "line-through text-muted-foreground")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMilestone(milestone.id)}
                      className="h-8 w-8"
                      aria-label={`Remove milestone ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Owner</Label>
                      <Select
                        value={milestone.owner_id || 'rock-owner'}
                        onValueChange={(value) => updateMilestone(milestone.id, {
                          owner_id: value === 'rock-owner' ? null : value,
                        })}
                      >
                        <SelectTrigger><SelectValue placeholder="Use Rock owner" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rock-owner">Use Rock owner</SelectItem>
                          {vivacityUsers?.map((user) => {
                            const info = getUserInfo(user.user_uuid);
                            return <SelectItem key={user.user_uuid} value={user.user_uuid}>{info?.name}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Due date</Label>
                      <Input
                        type="date"
                        value={milestone.due_date}
                        onChange={(event) => updateMilestone(milestone.id, { due_date: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Priority</Label>
                      <Select
                        value={milestone.priority}
                        onValueChange={(value) => updateMilestone(milestone.id, {
                          priority: value as EosRockMilestone['priority'],
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(['critical', 'high', 'medium', 'low'] as const).map(value => (
                            <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Select
                        value={milestone.status}
                        onValueChange={(value) => updateMilestone(milestone.id, {
                          status: value as EosRockMilestone['status'],
                          completed: value === 'complete',
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {([
                            ['not_started', 'Not started'],
                            ['in_progress', 'In progress'],
                            ['blocked', 'Blocked'],
                            ['off_track', 'Off track'],
                            ['complete', 'Complete'],
                            ['deferred', 'Deferred'],
                          ] as const).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Exit criteria</Label>
                    <Textarea
                      value={milestone.exit_criteria}
                      onChange={(event) => updateMilestone(milestone.id, { exit_criteria: event.target.value })}
                      placeholder="What must be true to mark this milestone complete?"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Evidence link</Label>
                    <Input
                      type="url"
                      value={milestone.evidence_url}
                      onChange={(event) => updateMilestone(milestone.id, { evidence_url: event.target.value })}
                      placeholder="https://…"
                    />
                  </div>
                  {rockLevel === 'individual' && (companyMilestones?.length || 0) > 0 && (
                    <div className="space-y-2 rounded bg-muted/40 p-2">
                      <Label className="text-xs">Supports Company milestones</Label>
                      {companyMilestones?.map(companyMilestone => (
                        <label key={companyMilestone.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={milestone.linked_company_milestone_ids.includes(companyMilestone.id)}
                            onChange={(event) => {
                              const links = new Set(milestone.linked_company_milestone_ids);
                              if (event.target.checked) links.add(companyMilestone.id);
                              else links.delete(companyMilestone.id);
                              updateMilestone(milestone.id, { linked_company_milestone_ids: [...links] });
                            }}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          <span>{companyMilestone.title}</span>
                          <Badge variant="outline" className="ml-auto text-[10px]">{companyMilestone.status.replace('_', ' ')}</Badge>
                        </label>
                      ))}
                    </div>
                  )}
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
            disabled={!canSubmit || upsertRock.isPending || isMilestoneDataLoading}
          >
            {rock ? 'Update' : 'Create'} Rock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
