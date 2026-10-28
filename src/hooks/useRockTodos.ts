import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { RockTodo, TodoRockLinkInfo } from '@/utils/rockTodos';

/** Everything that shows a To-Do, a Rock's To-Dos or a milestone's progress refreshes when a link or To-Do changes. */
const REFRESH = [
  ['eos-rock-todos'],
  ['eos-todo-rock-links'],
  ['eos-rock-overdue-todos'],
  ['eos-linkable-todos'],
  ['meeting-todos'],
  ['eos-todos'],
];

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const inAWeek = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
export { inAWeek as defaultTodoDueDate };

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

async function namesFor(ids: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  if (ids.length === 0) return names;
  const { data } = await supabase.from('users').select('user_uuid, first_name, last_name').in('user_uuid', ids);
  for (const person of data ?? []) {
    names[person.user_uuid] = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Team member';
  }
  return names;
}

/** The To-Dos linked to a Rock or to any of its milestones, with live status, due date and owner. */
export function useRockTodos(rockId: string | undefined, enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-todos', rockId],
    queryFn: async (): Promise<RockTodo[]> => {
      const { data: links, error } = await supabase
        .from('eos_rock_todo_links')
        .select('id, todo_id, rock_id, milestone_id')
        .eq('rock_id', rockId!);
      if (error) throw error;
      if (!links || links.length === 0) return [];
      const { data: todos, error: todosError } = await supabase
        .from('eos_todos')
        .select('id, title, status, due_date, owner_id')
        .in('id', links.map(l => l.todo_id));
      if (todosError) throw todosError;
      const byId = new Map((todos ?? []).map(t => [t.id, t]));
      const names = await namesFor(Array.from(new Set((todos ?? []).map(t => t.owner_id).filter((id): id is string => !!id))));
      return links.flatMap(link => {
        const todo = byId.get(link.todo_id);
        // A To-Do the viewer cannot read is left out rather than shown half-empty.
        if (!todo) return [];
        return [{
          todoId: todo.id,
          linkId: link.id,
          rockId: link.rock_id,
          milestoneId: link.milestone_id,
          title: todo.title,
          status: todo.status,
          dueDate: todo.due_date,
          ownerId: todo.owner_id,
          ownerName: todo.owner_id ? names[todo.owner_id] ?? null : null,
        }];
      });
    },
    enabled: !!profile && enabled && !!rockId,
  });
}

/** For a list of To-Dos: which Rock (and milestone) each one is for, if any. */
export function useTodoRockLinks(todoIds: readonly string[], enabled = true) {
  const { profile } = useAuth();
  const key = [...todoIds].sort();
  return useQuery({
    queryKey: ['eos-todo-rock-links', key],
    queryFn: async (): Promise<Record<string, TodoRockLinkInfo>> => {
      const result: Record<string, TodoRockLinkInfo> = {};
      if (key.length === 0) return result;
      const { data: links, error } = await supabase.from('eos_rock_todo_links').select('todo_id, rock_id, milestone_id').in('todo_id', key);
      if (error) throw error;
      if (!links || links.length === 0) return result;
      const rockIds = Array.from(new Set(links.map(l => l.rock_id)));
      const milestoneIds = Array.from(new Set(links.map(l => l.milestone_id).filter((id): id is string => !!id)));
      const [rocks, milestones] = await Promise.all([
        supabase.from('eos_rocks').select('id, title').in('id', rockIds),
        milestoneIds.length > 0 ? supabase.from('eos_rock_milestones').select('id, title').in('id', milestoneIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (rocks.error) throw rocks.error;
      if (milestones.error) throw milestones.error;
      const rockTitle = new Map((rocks.data ?? []).map(r => [r.id, r.title]));
      const milestoneTitle = new Map((milestones.data ?? []).map(m => [m.id, m.title]));
      for (const link of links) {
        result[link.todo_id] = {
          rockId: link.rock_id,
          rockTitle: rockTitle.get(link.rock_id) ?? 'A Rock',
          milestoneId: link.milestone_id,
          milestoneTitle: link.milestone_id ? milestoneTitle.get(link.milestone_id) ?? null : null,
        };
      }
      return result;
    },
    enabled: !!profile && enabled && key.length > 0,
  });
}

/** Active Rocks a To-Do can be pointed at, newest quarter first. */
export function useLinkableRocks(enabled: boolean) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-linkable-rocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, quarter_year, quarter_number, rock_level')
        .is('archived_at', null)
        .order('quarter_year', { ascending: false })
        .order('quarter_number', { ascending: false })
        .order('title', { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile && enabled,
  });
}

/** Open To-Dos that are not linked to anything yet, for the "link an existing To-Do" picker. */
export function useLinkableTodos(enabled: boolean) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-linkable-todos'],
    queryFn: async () => {
      const { data: todos, error } = await supabase
        .from('eos_todos')
        .select('id, title, due_date')
        .eq('status', 'Open')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      if (!todos || todos.length === 0) return [];
      const { data: links, error: linksError } = await supabase.from('eos_rock_todo_links').select('todo_id').in('todo_id', todos.map(t => t.id));
      if (linksError) throw linksError;
      const linked = new Set((links ?? []).map(l => l.todo_id));
      return todos.filter(t => !linked.has(t.id));
    },
    enabled: !!profile && enabled,
  });
}

/** How many open To-Dos linked to each Rock are past due, for flagging Rocks in the Discuss view. One query set for the deck. */
export function useOverdueTodoCountsByRock(rockIds: readonly string[], enabled: boolean) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-overdue-todos', rockIds],
    queryFn: async (): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {};
      if (rockIds.length === 0) return counts;
      const { data: links, error } = await supabase.from('eos_rock_todo_links').select('todo_id, rock_id').in('rock_id', [...rockIds]);
      if (error) throw error;
      if (!links || links.length === 0) return counts;
      const { data: overdue, error: todosError } = await supabase
        .from('eos_todos')
        .select('id')
        .in('id', links.map(l => l.todo_id))
        .eq('status', 'Open')
        .lt('due_date', todayIso());
      if (todosError) throw todosError;
      const late = new Set((overdue ?? []).map(t => t.id));
      for (const link of links) {
        if (late.has(link.todo_id)) counts[link.rock_id] = (counts[link.rock_id] ?? 0) + 1;
      }
      return counts;
    },
    enabled: !!profile && enabled && rockIds.length > 0,
  });
}

export interface AddRockTodoInput {
  rockId: string;
  milestoneId?: string;
  title: string;
  dueDate?: string;
  meetingId?: string;
}

/** Creates a To-Do for a Rock or one of its milestones, owned by the caller, in one step. */
export function useAddRockTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddRockTodoInput) => {
      const { data, error } = await supabase.rpc('add_rock_todo', {
        p_rock_id: input.rockId,
        p_title: input.title,
        p_milestone_id: input.milestoneId,
        p_due_date: input.dueDate,
        p_meeting_id: input.meetingId,
      });
      if (error) throw error;
      return data as { todo_id: string; link_id: string; duplicate: boolean };
    },
    onSuccess: () => REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey })),
    onError: error => toast({ title: 'Could not add the To-Do', description: messageOf(error, 'Nothing was added.'), variant: 'destructive' }),
  });
}

/** Links an existing (or standalone) To-Do to a Rock or milestone, moving it if it was linked elsewhere. */
export function useLinkTodoToRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { todoId: string; rockId: string; milestoneId?: string | null }) => {
      const { data, error } = await supabase.rpc('link_todo_to_rock', {
        p_todo_id: input.todoId,
        p_rock_id: input.rockId,
        p_milestone_id: input.milestoneId ?? undefined,
      });
      if (error) throw error;
      return data as { link_id: string; moved: boolean };
    },
    onSuccess: () => REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey })),
    onError: error => toast({ title: 'Could not link the To-Do', description: messageOf(error, 'Nothing was changed.'), variant: 'destructive' }),
  });
}

/** Removes the link only. The To-Do itself is untouched. */
export function useUnlinkTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (todoId: string) => {
      const { error } = await supabase.rpc('unlink_todo_from_rock', { p_todo_id: todoId });
      if (error) throw error;
    },
    onSuccess: () => REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey })),
    onError: error => toast({ title: 'Could not remove the link', description: messageOf(error, 'Nothing was changed.'), variant: 'destructive' }),
  });
}

/** Marks a To-Do done or open again, with the same fields the To-Do list writes. */
export function useSetTodoDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { todoId: string; done: boolean }) => {
      const { error } = await supabase
        .from('eos_todos')
        .update(
          input.done
            ? { status: 'Complete', completed_date: todayIso(), completed_at: new Date().toISOString() }
            : { status: 'Open', completed_date: null, completed_at: null },
        )
        .eq('id', input.todoId);
      if (error) throw error;
    },
    onSuccess: () => REFRESH.forEach(queryKey => queryClient.invalidateQueries({ queryKey })),
    onError: error => toast({ title: 'Could not update the To-Do', description: messageOf(error, 'Nothing was changed.'), variant: 'destructive' }),
  });
}
