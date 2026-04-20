import { useState, useEffect } from 'react';
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
import { CalendarIcon, Plus, Trash2, ExternalLink } from 'lucide-react';
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

interface IDSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: EosIssue | null;
  isFacilitator: boolean;
  meetingId?: string;
}

interface TodoItem {
  title: string;
  owner_id: string;
  due_date: string;
}

export function IDSDialog({ open, onOpenChange, issue, isFacilitator, meetingId }: IDSDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('identify');
  const [solution, setSolution] = useState(issue?.solution || '');
  const [discussionNotes, setDiscussionNotes] = useState('');
  const [todos, setTodos] = useState<TodoItem[]>([]);
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

  // Auto-advance tab when issue status changes or dialog opens
  useEffect(() => {
    if (issue && open) {
      const appropriateTab = getTabFromStatus(issue.status);
      setActiveTab(appropriateTab);
      setSolution(issue.solution || '');
      // Load existing discussion notes from outcome_note field
      setDiscussionNotes(issue.outcome_note || '');
    }
  }, [issue?.id, issue?.status, open]);

  // Save discussion notes mutation
  const saveDiscussionNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase
        .from('eos_issues')
        .update({ outcome_note: notes })
        .eq('id', issue!.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
      toast({ title: 'Discussion notes saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving notes', description: error.message, variant: 'destructive' });
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

  // Create todos mutation
  const createTodos = useMutation({
    mutationFn: async () => {
      if (todos.length === 0) return;

      // Pass meeting_id explicitly to ensure todos are linked to the meeting
      const effectiveMeetingId = issue?.meeting_id || meetingId || null;
      
      const { error } = await supabase.rpc('create_todos_from_issue', {
        p_issue_id: issue!.id,
        p_todos: todos as any,
        p_meeting_id: effectiveMeetingId,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-todos'] });
      toast({ title: 'To-dos created successfully' });
      setTodos([]);
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating to-dos', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddTodo = () => {
    if (!newTodoTitle.trim() || !newTodoOwner || !newTodoDueDate) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    setTodos([
      ...todos,
      {
        title: newTodoTitle,
        owner_id: newTodoOwner,
        due_date: format(newTodoDueDate, 'yyyy-MM-dd'),
      },
    ]);

    setNewTodoTitle('');
    setNewTodoOwner('');
    setNewTodoDueDate(undefined);
  };

  const handleRemoveTodo = (index: number) => {
    setTodos(todos.filter((_, i) => i !== index));
  };

  // Auto-save discussion notes on blur
  const handleDiscussionNotesBlur = () => {
    if (issue && discussionNotes !== (issue.outcome_note || '')) {
      saveDiscussionNotes.mutate(discussionNotes);
    }
  };

  const handleSolve = async () => {
    if (!solution.trim()) {
      toast({ title: 'Please enter a solution', variant: 'destructive' });
      return;
    }

    try {
      // Save discussion notes first if changed
      if (discussionNotes && discussionNotes !== (issue.outcome_note || '')) {
        await saveDiscussionNotes.mutateAsync(discussionNotes);
      }

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
          solutionText: solution 
        });
      } else {
        // Already in Discussing or another valid state
        await setStatus.mutateAsync({ 
          status: 'Solved', 
          fromStatus: currentStatus,
          solutionText: solution 
        });
      }
      
      if (todos.length > 0) {
        await createTodos.mutateAsync();
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

            {isFacilitator && issue.status === 'Open' && (
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
                disabled={!isFacilitator && issue.status !== 'Discussing'}
              />
              {saveDiscussionNotes.isPending && (
                <p className="text-xs text-muted-foreground">Saving...</p>
              )}
            </div>

            {isFacilitator && (issue.status === 'Discussing' || issue.status === 'Open') && (
              <Button
                onClick={() => {
                  // Save notes before moving to solve
                  if (discussionNotes && discussionNotes !== (issue.outcome_note || '')) {
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
                rows={4}
                disabled={!isFacilitator}
              />
            </div>

            <div className="border-t pt-4">
              <Label className="mb-3 block">Create To-Dos from Solution</Label>
              
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
                <Button onClick={handleAddTodo} size="sm" variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Add To-Do
                </Button>
              </div>

              {/* Todos list */}
              {todos.length > 0 && (
                <div className="space-y-2">
                  {todos.map((todo, index) => (
                    <Card key={index} className="p-2 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{todo.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Due: {format(new Date(todo.due_date), 'PP')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTodo(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {isFacilitator && activeTab === 'solve' && (
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
                disabled={!solution.trim() || setStatus.isPending || createTodos.isPending}
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
