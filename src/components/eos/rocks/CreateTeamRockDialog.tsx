import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Plus, X, GitBranch, AlertTriangle } from 'lucide-react';
import { useEosRocksHierarchy } from '@/hooks/useEosRocksHierarchy';
import { useVivacityTeamUsers, VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentQuarter } from '@/utils/rockRollup';
import type { RockWithHierarchy } from '@/types/eos';

interface CreateTeamRockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentRock?: RockWithHierarchy | null;
  onSuccess?: () => void;
}

export function CreateTeamRockDialog({ open, onOpenChange, parentRock, onSuccess }: CreateTeamRockDialogProps) {
  const { createRock, companyRocks, functions, teamRocksByFunction } = useEosRocksHierarchy();
  const { data: vivacityUsers } = useVivacityTeamUsers();
  const currentQuarter = getCurrentQuarter();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [issue, setIssue] = useState('');
  const [outcome, setOutcome] = useState('');
  const [parentRockId, setParentRockId] = useState(parentRock?.id || '');
  const [functionId, setFunctionId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [milestones, setMilestones] = useState<{ id: string; text: string; completed: boolean }[]>([]);

  // Sync parent rock when prop changes
  useEffect(() => {
    if (parentRock?.id) {
      setParentRockId(parentRock.id);
    }
  }, [parentRock?.id]);

  const selectedParent = companyRocks?.find(r => r.id === parentRockId);
  
  // Check if a team rock already exists for selected function and parent
  const existingTeamRock = functionId && parentRockId 
    ? teamRocksByFunction.get(functionId)?.find(r => r.parent_rock_id === parentRockId)
    : null;

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setIssue('');
    setOutcome('');
    if (!parentRock) setParentRockId('');
    setFunctionId('');
    setOwnerId('');
    setDueDate('');
    setMilestones([]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !dueDate || !parentRockId || !functionId || existingTeamRock) return;

    await createRock.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      issue: issue.trim() || undefined,
      outcome: outcome.trim() || undefined,
      milestones: milestones.filter(m => m.text.trim()).length > 0 
        ? milestones.filter(m => m.text.trim()) 
        : undefined,
      rock_level: 'team',
      parent_rock_id: parentRockId,
      function_id: functionId,
      owner_id: ownerId || undefined,
      quarter_year: selectedParent?.quarter_year || currentQuarter.year,
      quarter_number: selectedParent?.quarter_number || currentQuarter.quarter,
      due_date: dueDate,
      status: 'on_track',
    });

    resetForm();
    onOpenChange(false);
    onSuccess?.();
  };

  const addMilestone = () => {
    setMilestones([...milestones, { id: crypto.randomUUID(), text: '', completed: false }]);
  };

  const updateMilestone = (id: string, text: string) => {
    setMilestones(milestones.map(m => m.id === id ? { ...m, text } : m));
  };

  const removeMilestone = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const getUserInfo = (userId: string) => {
    const user = vivacityUsers?.find(u => u.user_uuid === userId);
    if (!user) return null;
    return {
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
      initials: [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?',
    };
  };

  const canSubmit = title.trim() && dueDate && parentRockId && functionId && !existingTeamRock;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Create Team Rock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Parent Company Rock */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Parent Company Rock *
            </Label>
            <Select 
              value={parentRockId || 'none'} 
              onValueChange={(v) => setParentRockId(v === 'none' ? '' : v)}
              disabled={!!parentRock}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select company rock..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select a company rock...</SelectItem>
                {companyRocks?.map((rock) => (
                  <SelectItem key={rock.id} value={rock.id}>
                    <div className="flex items-center gap-2">
                      <span>{rock.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        Q{rock.quarter_number} {rock.quarter_year}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedParent && (
              <div className="p-2 rounded-md bg-muted/50 text-sm">
                <span className="text-muted-foreground">This team rock will cascade from: </span>
                <span className="font-medium">{selectedParent.title}</span>
              </div>
            )}
          </div>

          {/* Function */}
          <div className="space-y-2">
            <Label>Accountability Function *</Label>
            <Select value={functionId || 'none'} onValueChange={(v) => setFunctionId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select function..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select a function...</SelectItem>
                {functions?.map((func) => {
                  const hasExisting = parentRockId && teamRocksByFunction.get(func.id)?.some(r => r.parent_rock_id === parentRockId);
                  return (
                    <SelectItem key={func.id} value={func.id} disabled={hasExisting}>
                      <div className="flex items-center gap-2">
                        <span>{func.name}</span>
                        {hasExisting && (
                          <Badge variant="secondary" className="text-[10px]">Already has rock</Badge>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Uniqueness warning */}
          {existingTeamRock && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This function already has a Team Rock for the selected Company Rock: "{existingTeamRock.title}"
              </AlertDescription>
            </Alert>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Team-level 90-day goal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="How will the team achieve this?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Issue */}
          <div className="space-y-2">
            <Label htmlFor="issue">Issue This Rock Addresses</Label>
            <Textarea
              id="issue"
              placeholder="What team-level problem does this solve?"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={2}
            />
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label htmlFor="outcome">Expected Outcome</Label>
            <Textarea
              id="outcome"
              placeholder="What will the team deliver?"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={2}
            />
          </div>

          {/* Milestones */}
          <div className="space-y-2">
            <Label>Milestones</Label>
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
              <Button type="button" variant="outline" size="sm" onClick={addMilestone} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Milestone
              </Button>
            </div>
          </div>

          {/* Owner */}
          <div className="space-y-2">
            <Label>Owner (Optional)</Label>
            <Select value={ownerId || 'none'} onValueChange={(v) => setOwnerId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Use function lead..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use function lead</SelectItem>
                {vivacityUsers?.map((user) => {
                  const info = getUserInfo(user.user_uuid);
                  return (
                    <SelectItem key={user.user_uuid} value={user.user_uuid}>
                      {info?.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>Due Date *</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || createRock.isPending}>
            {createRock.isPending ? 'Creating...' : 'Create Team Rock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
