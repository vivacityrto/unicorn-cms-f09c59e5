import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OutcomeType = 
  | 'no_ids_required' 
  | 'no_todos_required' 
  | 'no_actions_required' 
  | 'no_decisions_required' 
  | 'no_risks_required' 
  | 'alignment_achieved' 
  | 'all_rocks_closed' 
  | 'flight_plan_confirmed' 
  | 'vto_reviewed' 
  | 'annual_priorities_set';

export interface OutcomeConfirmation {
  id: string;
  meeting_id: string;
  outcome_type: OutcomeType;
  justification: string;
  confirmed_by: string;
  confirmed_at: string;
}

export interface MeetingRating {
  id: string;
  meeting_id: string;
  user_id: string;
  rating: number;
  created_at: string;
}

export interface ValidationResult {
  is_valid: boolean;
  error?: string;
  unmet_requirements?: string[];
  meeting_type?: string;
  todos_count?: number;
  issues_discussed?: number;
  ratings_count?: number;
}

export interface CloseResult {
  success?: boolean;
  is_valid?: boolean;
  error?: string;
  message?: string;
  unmet_requirements?: string[];
  validation_errors?: string[];
  validation?: ValidationResult;
}

export const useMeetingOutcomes = (meetingId: string | undefined) => {
  const queryClient = useQueryClient();

  // Fetch outcome confirmations with error handling
  const { data: confirmations, isLoading: confirmationsLoading } = useQuery({
    queryKey: ['meeting-outcome-confirmations', meetingId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('eos_meeting_outcome_confirmations')
          .select('*')
          .eq('meeting_id', meetingId!);
        
        if (error) {
          console.error('Error fetching outcome confirmations:', error);
          return [];
        }
        return data as OutcomeConfirmation[];
      } catch (e) {
        console.error('Exception fetching outcome confirmations:', e);
        return [];
      }
    },
    enabled: !!meetingId,
  });

  // Fetch meeting ratings with error handling
  const { data: ratings, isLoading: ratingsLoading } = useQuery({
    queryKey: ['meeting-ratings', meetingId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('eos_meeting_ratings')
          .select('*')
          .eq('meeting_id', meetingId!);
        
        if (error) {
          console.error('Error fetching meeting ratings:', error);
          return [];
        }
        return data as MeetingRating[];
      } catch (e) {
        console.error('Exception fetching meeting ratings:', e);
        return [];
      }
    },
    enabled: !!meetingId,
  });

  // Validate meeting close
  const validateClose = useMutation({
    mutationFn: async (): Promise<ValidationResult> => {
      const { data, error } = await supabase.rpc('validate_meeting_close', {
        p_meeting_id: meetingId,
      });
      
      if (error) throw error;
      return data as unknown as ValidationResult;
    },
  });

  // Close meeting with validation
  const closeMeeting = useMutation({
    mutationFn: async (force: boolean = false): Promise<CloseResult> => {
      const { data, error } = await supabase.rpc('close_meeting_with_validation', {
        p_meeting_id: meetingId,
        p_force: force,
      });
      
      if (error) throw error;
      return data as unknown as CloseResult;
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['eos-meeting', meetingId] });
        queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
        toast.success('Meeting closed successfully');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to close meeting: ${error.message}`);
    },
  });

  // Save outcome confirmation
  const saveConfirmation = useMutation({
    mutationFn: async ({ outcomeType, justification }: { outcomeType: OutcomeType; justification: string }) => {
      const { data, error } = await supabase.rpc('save_outcome_confirmation', {
        p_meeting_id: meetingId,
        p_outcome_type: outcomeType,
        p_justification: justification,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-outcome-confirmations', meetingId] });
      toast.success('Confirmation saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save confirmation: ${error.message}`);
    },
  });

  // Remove outcome confirmation
  const removeConfirmation = useMutation({
    mutationFn: async (outcomeType: OutcomeType) => {
      const { error } = await supabase
        .from('eos_meeting_outcome_confirmations')
        .delete()
        .eq('meeting_id', meetingId!)
        .eq('outcome_type', outcomeType);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-outcome-confirmations', meetingId] });
    },
  });

  // Save meeting rating
  const saveRating = useMutation({
    mutationFn: async (rating: number) => {
      const { data, error } = await supabase.rpc('save_meeting_rating', {
        p_meeting_id: meetingId,
        p_rating: rating,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-ratings', meetingId] });
      toast.success('Rating saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save rating: ${error.message}`);
    },
  });

  // Check if a specific outcome type is confirmed
  const hasConfirmation = (outcomeType: OutcomeType): boolean => {
    return confirmations?.some(c => c.outcome_type === outcomeType) ?? false;
  };

  // Get user's rating
  const getUserRating = (userId: string): number | undefined => {
    return ratings?.find(r => r.user_id === userId)?.rating;
  };

  return {
    confirmations,
    ratings,
    isLoading: confirmationsLoading || ratingsLoading,
    validateClose,
    closeMeeting,
    saveConfirmation,
    removeConfirmation,
    saveRating,
    hasConfirmation,
    getUserRating,
  };
};
