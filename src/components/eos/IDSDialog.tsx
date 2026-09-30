import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, CheckCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { ClientBadge } from './ClientBadge';
import { cn } from '@/lib/utils';
import { useEosStatusTransitions, isValidStatusTransition, getAllowedStatusTransitions } from '@/hooks/useEosOptions';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import type { EosIssue } from '@/types/eos';
import {
  IssueEditConflictError,
  createIssueTodos,
  fetchIssueTextField,
  mergeConflictingText,
  saveIssueTextField,
  shouldAdoptRemoteText,
  type IssueTextField,
} from '@/lib/eosIssueEdit';

interface IDSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: EosIssue | null;
  meetingId?: string;
  /** Called after the issue changes (status, notes, solution) - used to broadcast the change to other live-meeting attendees */
  onIssueChanged?: () => void;
  /** Called after to-dos are created from this issue - used to refresh the To-Do List for every attendee */
  onTodosChanged?: () => void;
}

interface TodoItem {
  title: string;
  owner_id: string;
  due_date: string;
}

export function IDSDialog({ open, onOpenChange, issue, meetingId, onIssueChanged, onTodosChanged }: IDSDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('identify');
  const [solution, setSolution] = useState(issue?.solution || '');
  const [discussionNotes, setDiscussionNotes] = useState('');
  // To-dos saved from this issue during this session (they are created immediately, not staged).
  const [addedTodos, setAddedTodos] = useState<TodoItem[]>([]);
  // Last value of each shared text field as loaded from / saved to the server. Used to tell whether
  // the local text has unsaved edits, and as the expected value when saving (conflict detection).
  const notesBaseline = useRef<string | null>(null);
  const solutionBaseline = useRef<string | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoOwner, setNewTodoOwner] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState<Date>();
  
  // Load status transitions for validation
  const { data: statusTransitions } = useEosStatusTransitions();

  // Fetch Vivacity Team users for owner selection (EOS is internal-only)
  const { data: vivacityUsers } = useVivacityTeamUsers();
  const users = vivacityUsers?.map(u => ({
    user_uuid: u.user_uuid,
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email,
  }));

  // Fetch linked rock details (title) when present
  const { data: linkedRock } = useQuery({
    queryKey: ['eos-rock-linked', issue?.linked_rock_id],
    enabled: !!issue?.linked_rock_id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, status')
        .eq('id', issue!.linked_rock_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Map status to IDS tab - auto-sync tab with issue status
  const getTabFromStatus = (status: string): string => {
    switch (status) {
      case 'Discussing':
        return 'discuss';
      case 'Solved':
      case 'Closed':
        return 'solve';
      default:
        return 'identify';
    }
  };

  // Opening the dialog (or switching to another issue) loads that issue's text fresh.
  useEffect(() => {
    if (issue && open) {
      notesBaseline.current = issue.outcome_note ?? null;
      solutionBaseline.current = issue.solution ?? null;
      setDiscussionNotes(issue.outcome_note || '');
      setSolution(issue.solution || '');
      setAddedTodos([]);
    }
    // Deliberately keyed on id/open only: a background refetch that returns a new object for the
    // same issue must not reset a field out from under an in-progress edit. Live changes from
    // other attendees are folded in by the effect below, which respects unsaved local text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, open]);

  // The tab follows the issue's status (Open -> Identify, Discussing -> Discuss, Solved -> Solve),
  // so when anyone moves the issue along, everyone's dialog follows.
  useEffect(() => {
    if (issue && open) {
      setActiveTab(getTabFromStatus(issue.status));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, issue?.status, open]);

  // Live updates: when another attendee saves notes/solution, show their text - but only if this
  // user has no unsaved edits in that field (otherwise their draft is reconciled when they save).
  useEffect(() => {
    if (!issue || !open) return;
    const remoteNotes = issue.outcome_note ?? '';
    const remoteSolution = issue.solution ?? '';
    setDiscussionNotes((local) => {
      if (!shouldAdoptRemoteText(local, notesBaseline.current ?? '', remoteNotes)) return local;
      notesBaseline.current = issue.outcome_note ?? null;
      return remoteNotes;
    });
    setSolution((local) => {
      if (!shouldAdoptRemoteText(local, solutionBaseline.current ?? '', remoteSolution)) return local;
      solutionBaseline.current = issue.solution ?? null;
      return remoteSolution;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.outcome_note, issue?.solution]);

  // Saves a shared text field. If someone else changed the same field since this user loaded it,
  // both versions are merged and kept (never a silent overwrite).
  const saveSharedField = async (field: IssueTextField, value: string) => {
    if (!issue) return;
    const baselineRef = field === 'outcome_note' ? notesBaseline : solutionBaseline;
    const setLocal = field === 'outcome_note' ? setDiscussionNotes : setSolution;
    try {
      await saveIssueTextField(issue.id, field, value, baselineRef.current);
      baselineRef.current = value;
    } catch (error) {
      if (!(error instanceof IssueEditConflictError)) throw error;
      const latest = await fetchIssueTextField(issue.id, field);
      const merged = mergeConflictingText(latest ?? '', value);
      await saveIssueTextField(issue.id, field, merged, latest);
      baselineRef.current = merged;
      setLocal(merged);
      toast({
        title: 'Someone else edited this at the same time',
        description: 'Both versions were kept - please check the text.',
      });
    }
  };

  // Save discussion notes mutation
  const saveDiscussionNotes = useMutation({
    mutationFn: (notes: string) => saveSharedField('outcome_note', notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
      onIssueChanged?.();
      toast({ title: 'Discussion notes saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving notes', description: error.message, variant: 'destructive' });
    },
  });

  // Save the solution draft (shared with everyone; the status change to Solved is separate)
  const saveSolutionDraft = useMutation({
    mutationFn: (text: string) => saveSharedField('solution', text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
      onIssueChanged?.();
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving solution', description: error.message, variant: 'destructive' });
    },
  });

  // Set issue status mutation with auto-tab-advance
  const setStatus = useMutation({
    mutationFn: async ({ status, solutionText, autoAdvanceTab = true, fromStatus }: { 
      status: string; 
      solutionText?: string;
      autoAdvanceTab?: boolean;
      fromStatus?: string;
    }) => {
      // Validate transition before calling RPC - use explicit fromStatus if provided
      const effectiveFrom = fromStatus ?? issue?.status ?? 'Open';
      if (!isValidStatusTransition(statusTransitions, effectiveFrom, status)) {
        const allowed = getAllowedStatusTransitions(statusTransitions, effectiveFrom);
        throw new Error(
          `Cannot transition from "${effectiveFrom}" to "${status}". ` +
          `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}`
        );
      }
      
      const { error } = await supabase.rpc('set_issue_status', {
        p_issue_id: issue!.id,
        p_status: status,
        p_solution_text: solutionText || null,
      });
      
      if (error) throw error;
      
      return { status, autoAdvanceTab };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
      onIssueChanged?.();

      // Auto-advance tab after successful status change
      if (result?.autoAdvanceTab) {
        const newTab = getTabFromStatus(result.status);
        setActiveTab(newTab);
      }

      toast({ title: 'Issue status updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    },
  });

  // Create a to-do from this issue right away (linked to the meeting), so it shows in the To-Do List
  // for everyone - not held back until the issue is marked solved.
  const createTodo = useMutation({
    mutationFn: (todo: TodoItem) =>
      createIssueTodos(issue!.id, issue?.meeting_id || meetingId || null, [todo]),
    onSuccess: (_result, todo) => {
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-todos'] });
      setAddedTodos((prev) => [...prev, todo]);
      setNewTodoTitle('');
      setNewTodoOwner('');
      setNewTodoDueDate(undefined);
      onTodosChanged?.();
      toast({ title: 'To-do added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding to-do', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddTodo = () => {
    if (!newTodoTitle.trim() || !newTodoOwner || !newTodoDueDate) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    createTodo.mutate({
      title: newTodoTitle.trim(),
      owner_id: newTodoOwner,
      due_date: format(newTodoDueDate, 'yyyy-MM-dd'),
    });
  };

  // Auto-save discussion notes / solution when the field loses focus
  const handleDiscussionNotesBlur = () => {
    if (issue && discussionNotes !== (notesBaseline.current ?? '')) {
      saveDiscussionNotes.mutate(discussionNotes);
    }
  };

  const handleSolutionBlur = () => {
    if (issue && solution !== (solutionBaseline.current ?? '')) {
      saveSolutionDraft.mutate(solution);
    }
  };

  const handleSolve = async () => {
    if (!solution.trim()) {
      toast({ title: 'Please enter a solution', variant: 'destructive' });
      return;
    }

    try {
      // Save shared text first (merging with anyone else's concurrent edit), then solve with the saved text
      if (discussionNotes !== (notesBaseline.current ?? '')) {
        await saveDiscussionNotes.mutateAsync(discussionNotes);
      }
      if (solution !== (solutionBaseline.current ?? '')) {
        await saveSolutionDraft.mutateAsync(solution);
      }
      const solutionText = solutionBaseline.current ?? solution;

      const currentStatus = issue?.status || 'Open';

      // If status is Open, we need to transition through Discussing first
      if (currentStatus === 'Open') {
        await setStatus.mutateAsync({
          status: 'Discussing',
          fromStatus: 'Open',
          autoAdvanceTab: false
        });
        // Now transition to Solved - use explicit fromStatus since prop hasn't updated yet
        await setStatus.mutateAsync({
          status: 'Solved',
          fromStatus: 'Discussing',
          solutionText
        });
      } else {
        // Already in Discussing or another valid state
        await setStatus.mutateAsync({
          status: 'Solved',
          fromStatus: currentStatus,
          solutionText
        });
      }

      onOpenChange(false);
    } catch (error) {
      // Error already handled by mutation onError
    }
  };

  if (!issue) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>IDS: {issue.title}</span>
            <ClientBadge clientId={issue.client_id} />
            {issue.priority && (
              <Badge variant="outline">{issue.priority}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="identify">Identify</TabsTrigger>
            <TabsTrigger value="discuss">Discuss</TabsTrigger>
            <TabsTrigger value="solve">Solve</TabsTrigger>
          </TabsList>

          <TabsContent value="identify" className="space-y-4">
            <div className="space-y-2">
              <Label>Issue Title</Label>
              <p className="text-sm font-medium">{issue.title}</p>
            </div>
            
            {issue.description && (
              <div className="space-y-2">
                <Label>Description</Label>
                <p className="text-sm text-muted-foreground">{issue.description}</p>
              </div>
            )}

            {issue.linked_rock_id && (
              <div className="space-y-2">
                <Label>Linked Rock</Label>
                <div>
                  <Link
                    to={`/eos/rocks?rock=${issue.linked_rock_id}`}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {linkedRock?.title ?? `Rock ${issue.linked_rock_id.slice(0, 8)}`}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {linkedRock?.status && (
                    <Badge variant="secondary" className="ml-2">{linkedRock.status}</Badge>
                  )}
                </div>
              </div>
            )}

            {issue.status === 'Open' && (
              <Button
                onClick={() => setStatus.mutate({ status: 'Discussing', fromStatus: issue.status })}
                className="w-full"
              >
                Start Discussing
              </Button>
            )}
          </TabsContent>

          <TabsContent value="discuss" className="space-y-4">
            <div className="space-y-2">
              <Label>Discussion Notes</Label>
              <Textarea
                placeholder="Add discussion notes..."
                value={discussionNotes}
                onChange={(e) => setDiscussionNotes(e.target.value)}
                onBlur={handleDiscussionNotesBlur}
                rows={8}
              />
              {saveDiscussionNotes.isPending && (
                <p className="text-xs text-muted-foreground">Saving...</p>
              )}
            </div>

            {(issue.status === 'Discussing' || issue.status === 'Open') && (
              <Button
                onClick={() => {
                  // Save notes before moving to solve
                  if (discussionNotes && discussionNotes !== (notesBaseline.current ?? '')) {
                    saveDiscussionNotes.mutate(discussionNotes);
                  }
                  // Transition to Discussing if still Open
                  if (issue.status === 'Open') {
                    setStatus.mutate({ status: 'Discussing', fromStatus: 'Open', autoAdvanceTab: false });
                  }
                  setActiveTab('solve');
                }}
                className="w-full"
              >
                Move to Solve
              </Button>
            )}
          </TabsContent>

          <TabsContent value="solve" className="space-y-4">
            <div className="space-y-2">
              <Label>Solution *</Label>
              <Textarea
                placeholder="Describe the solution..."
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                onBlur={handleSolutionBlur}
                rows={4}
              />
              {saveSolutionDraft.isPending && (
                <p className="text-xs text-muted-foreground">Saving...</p>
              )}
            </div>

            <div className="border-t pt-4">
              <Label className="mb-1 block">To-Dos from this issue</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Saved as soon as you add them, and shown in the To-Do List for everyone.
              </p>
              
              {/* Add todo form */}
              <div className="space-y-3 mb-4">
                <Input
                  placeholder="To-do title"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select value={newTodoOwner} onValueChange={setNewTodoOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder="Owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => (
                        <SelectItem key={user.user_uuid} value={user.user_uuid}>
                          {user.first_name} {user.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !newTodoDueDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newTodoDueDate ? format(newTodoDueDate, 'PP') : 'Due date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newTodoDueDate}
                        onSelect={setNewTodoDueDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button onClick={handleAddTodo} size="sm" variant="outline" className="w-full" disabled={createTodo.isPending}>
                  <Plus className="h-4 w-4 mr-1" />
                  {createTodo.isPending ? 'Adding...' : 'Add To-Do'}
                </Button>
              </div>

              {/* To-dos added from this issue */}
              {addedTodos.length > 0 && (
                <div className="space-y-2">
                  {addedTodos.map((todo, index) => (
                    <Card key={index} className="p-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{todo.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Due: {format(new Date(todo.due_date), 'PP')} - saved
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {activeTab === 'solve' && (
          <DialogFooter className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Current status: <Badge variant="outline">{issue.status}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSolve}
                disabled={!solution.trim() || setStatus.isPending || saveSolutionDraft.isPending || saveDiscussionNotes.isPending}
              >
                {setStatus.isPending ? 'Processing...' : 'Mark as Solved'}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
