import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface UseStageCertificationResult {
  updateCertification: (stageId: number, isCertified: boolean, certifiedNotes?: string) => Promise<boolean>;
  isUpdating: boolean;
}

/**
 * Hook for updating stage certification via RPC (SuperAdmin only)
 */
export function useStageCertification(): UseStageCertificationResult {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateCertification = async (
    stageId: number, 
    isCertified: boolean, 
    certifiedNotes?: string
  ): Promise<boolean> => {
    // Client-side check for immediate feedback
    if (!isSuperAdmin()) {
      toast({
        title: 'Permission Denied',
        description: 'Only SuperAdmin can update stage certification.',
        variant: 'destructive'
      });
      return false;
    }

    setIsUpdating(true);
    try {
      const { data, error } = await supabase.rpc('update_stage_certification', {
        p_stage_id: stageId,
        p_is_certified: isCertified,
        p_certified_notes: certifiedNotes || null
      });

      if (error) {
        // Handle permission error from server
        if (error.message.includes('Permission denied')) {
          toast({
            title: 'Permission Denied',
            description: 'Only SuperAdmin can update stage certification.',
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update certification',
            variant: 'destructive'
          });
        }
        return false;
      }

      toast({
        title: 'Certification Updated',
        description: isCertified ? 'Stage marked as certified.' : 'Certification removed.'
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update certification',
        variant: 'destructive'
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    updateCertification,
    isUpdating
  };
}
