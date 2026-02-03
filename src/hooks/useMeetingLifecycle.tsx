import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CarryForwardResult {
  success: boolean;
  next_meeting_id: string | null;
  carried_issues: number;
  carried_todos: number;
}

interface MeetingChain {
  id: string;
  previous_meeting_id: string | null;
  next_meeting_id: string | null;
  status: string;
  scheduled_date: string;
  quorum_status: string | null;
}

export function useMeetingLifecycle(meetingId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Complete meeting with carry-forward
  const completeMeetingWithCarryForward = useMutation({
    mutationFn: async (): Promise<CarryForwardResult> => {
      if (!meetingId) throw new Error('Meeting ID required');
      
      const { data, error } = await supabase.rpc('complete_meeting_with_carry_forward', {
        p_meeting_id: meetingId,
      });
      
      if (error) throw error;
      return data as unknown as CarryForwardResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-chain', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meeting', meetingId] });
      
      const parts = [];
      if (data.carried_issues > 0) parts.push(`${data.carried_issues} issues`);
      if (data.carried_todos > 0) parts.push(`${data.carried_todos} to-dos`);
      
      toast({
        title: 'Meeting completed',
        description: parts.length > 0 
          ? `Carried forward ${parts.join(' and ')} to next meeting`
          : 'Meeting closed successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to complete meeting',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get meeting chain (previous/next links)
  const { data: meetingChain, isLoading: isLoadingChain } = useQuery({
    queryKey: ['meeting-chain', meetingId],
    queryFn: async (): Promise<MeetingChain | null> => {
      if (!meetingId) return null;
      
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('id, previous_meeting_id, next_meeting_id, status, scheduled_date, quorum_status')
        .eq('id', meetingId)
        .single();
      
      if (error) throw error;
      return data as MeetingChain;
    },
    enabled: !!meetingId,
  });

  // Get open items that would be carried forward
  const { data: carryForwardPreview } = useQuery({
    queryKey: ['carry-forward-preview', meetingId],
    queryFn: async () => {
      if (!meetingId) return { issues: [], todos: [] };
      
      // Get open todos for this meeting
      const { data: todos } = await supabase
        .from('eos_todos')
        .select('id, title, assigned_to, status')
        .eq('meeting_id', meetingId)
        .not('status', 'in', '("complete","cancelled")');
      
      // Get unresolved issues for this meeting
      const { data: issues } = await supabase
        .from('eos_issues')
        .select('id, title, status, priority')
        .eq('meeting_id', meetingId)
        .not('status', 'in', '("solved","dropped")');
      
      return {
        issues: issues || [],
        todos: todos || [],
      };
    },
    enabled: !!meetingId && meetingChain?.status !== 'closed' && meetingChain?.status !== 'completed',
  });

  return {
    completeMeetingWithCarryForward,
    meetingChain,
    isLoadingChain,
    carryForwardPreview,
    isCompleted: meetingChain?.status === 'closed' || meetingChain?.status === 'completed',
    hasCarryForwardItems: (carryForwardPreview?.issues?.length || 0) + (carryForwardPreview?.todos?.length || 0) > 0,
  };
}
