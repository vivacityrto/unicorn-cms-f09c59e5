import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RtoTip {
  id: string;
  title: string;
  details: string;
  category: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: {
    user_uuid: string;
    email: string;
    first_name: string;
    last_name: string;
    unicorn_role: string;
  };
}

export const useRtoTips = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tips, isLoading } = useQuery({
    queryKey: ["rto-tips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rto_tips")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch creator details for all unique creator IDs
      const creatorIds = Array.from(
        new Set((data || []).map((tip: any) => tip.created_by).filter(Boolean))
      ) as string[];

      let creatorsById: Record<string, RtoTip["creator"]> = {};

      if (creatorIds.length > 0) {
        const { data: creators, error: creatorsError } = await supabase
          .from("users")
          .select("user_uuid, email, first_name, last_name, unicorn_role")
          .in("user_uuid", creatorIds);

        if (creatorsError) throw creatorsError;

        creatorsById = (creators || []).reduce(
          (acc: Record<string, RtoTip["creator"]>, user: any) => {
            acc[user.user_uuid] = {
              user_uuid: user.user_uuid,
              email: user.email,
              first_name: user.first_name,
              last_name: user.last_name,
              unicorn_role: user.unicorn_role,
            };
            return acc;
          },
          {}
        );
      }

      const tipsWithCreators = (data || []).map((tip: any) => ({
        ...tip,
        creator: tip.created_by ? creatorsById[tip.created_by] : undefined,
      })) as RtoTip[];

      return tipsWithCreators;
    },
  });

  const createTip = useMutation({
    mutationFn: async (newTip: {
      title: string;
      details: string;
      category: string;
      status?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("rto_tips")
        .insert({
          ...newTip,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rto-tips"] });
      toast({
        title: "Success",
        description: "RTO tip created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create tip: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateTip = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RtoTip> & { id: string }) => {
      const { data, error } = await supabase
        .from("rto_tips")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rto-tips"] });
      toast({
        title: "Success",
        description: "Tip updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update tip: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteTip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rto_tips")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rto-tips"] });
      toast({
        title: "Success",
        description: "Tip deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete tip: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    tips: tips || [],
    isLoading,
    createTip,
    updateTip,
    deleteTip,
  };
};
