import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface DocumentAcknowledgement {
  id: string;
  document_id: number;
  tenant_id: number;
  user_id: string;
  acknowledged_at: string;
}

export function useDocumentAcknowledgements(tenantId: number | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: acknowledgements = [], isLoading } = useQuery({
    queryKey: ["document-acknowledgements", tenantId],
    queryFn: async (): Promise<DocumentAcknowledgement[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("document_acknowledgements" as any)
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!tenantId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ documentId, tenantId }: { documentId: number; tenantId: number }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("document_acknowledgements" as any)
        .insert({
          document_id: documentId,
          tenant_id: tenantId,
          user_id: user.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-acknowledgements", tenantId] });
      toast.success("Document acknowledged");
    },
    onError: (err: any) => {
      if (err?.message?.includes("duplicate")) {
        toast.info("Already acknowledged");
      } else {
        toast.error("Failed to acknowledge document");
      }
    },
  });

  const isAcknowledged = (documentId: number): boolean => {
    if (!user) return false;
    return acknowledgements.some(
      (a) => a.document_id === documentId && a.user_id === user.id
    );
  };

  const getAcknowledgements = (documentId: number): DocumentAcknowledgement[] => {
    return acknowledgements.filter((a) => a.document_id === documentId);
  };

  return {
    acknowledgements,
    isLoading,
    acknowledge: acknowledgeMutation.mutate,
    isAcknowledging: acknowledgeMutation.isPending,
    isAcknowledged,
    getAcknowledgements,
  };
}
