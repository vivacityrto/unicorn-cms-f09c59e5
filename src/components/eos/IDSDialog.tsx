import { useState } from 'react';
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
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { ClientBadge } from './ClientBadge';
import { cn } from '@/lib/utils';
import type { EosIssue } from '@/types/eos';

interface IDSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: EosIssue | null;
  isFacilitator: boolean;
}

interface TodoItem {
  title: string;
  owner_id: string;
  due_date: string;
}

export function IDSDialog({ open, onOpenChange, issue, isFacilitator }: IDSDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('identify');
  const [solution, setSolution] = useState(issue?.solution || '');
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoOwner, setNewTodoOwner] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState<Date>();

  // Fetch users for owner selection
  const { data: users } = useQuery({
    queryKey: ['users', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email')
        .eq('tenant_id', profile?.tenant_id!)
        .order('first_name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id && open,
  });

  // Set issue status mutation
  const setStatus = useMutation({
    mutationFn: async ({ status, solutionText }: { status: string; solutionText?: string }) => {
      const { error } = await supabase.rpc('set_issue_status', {
        p_issue_id: issue!.id,
        p_status: status,
        p_solution_text: solutionText || null,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
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

      const { error } = await supabase.rpc('create_todos_from_issue', {
        p_issue_id: issue!.id,
        p_todos: todos as any,
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

  const handleSolve = async () => {
    if (!solution.trim()) {
      toast({ title: 'Please enter a solution', variant: 'destructive' });
      return;
    }

    // Use exact enum value (case-sensitive)
    await setStatus.mutateAsync({ status: 'Solved', solutionText: solution });
    
    if (todos.length > 0) {
      await createTodos.mutateAsync();
    }

    onOpenChange(false);
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
                <Badge variant="secondary">Rock ID: {issue.linked_rock_id.slice(0, 8)}</Badge>
              </div>
            )}

            {isFacilitator && issue.status === 'Open' && (
              <Button
                onClick={() => setStatus.mutate({ status: 'Discussing' })}
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
                rows={8}
                className="resize-none"
                disabled={!isFacilitator && issue.status !== 'discussing'}
              />
            </div>

            {isFacilitator && issue.status === 'Discussing' && (
              <Button
                onClick={() => setActiveTab('solve')}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSolve}
              disabled={!solution.trim() || setStatus.isPending || createTodos.isPending}
            >
              Mark as Solved
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
