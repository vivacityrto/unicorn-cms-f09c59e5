import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface StaffProvisioningRule {
  id: number;
  role_code: string;
  location_code: string;
  m365_groups: string[];
  licenses: string[];
  software: string[];
  calendars: string[];
  notes: string | null;
  is_active: boolean;
}

export interface StaffLookup {
  id: number;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export function useStaffRoles() {
  return useQuery({
    queryKey: ["dd_staff_role"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dd_staff_role" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as StaffLookup[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStaffLocations() {
  return useQuery({
    queryKey: ["dd_staff_location"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dd_staff_location" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as StaffLookup[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useResolvedRule(roleCode: string | null, locationCode: string | null) {
  return useQuery({
    queryKey: ["staff_provisioning_rule", roleCode, locationCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_provisioning_rules" as any)
        .select("*")
        .eq("role_code", roleCode!)
        .eq("location_code", locationCode!)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as StaffProvisioningRule | null;
    },
    enabled: !!roleCode && !!locationCode,
  });
}

export function useStaffProvisioningRules() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["staff_provisioning_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_provisioning_rules" as any)
        .select("*")
        .order("role_code")
        .order("location_code");
      if (error) throw error;
      return (data ?? []) as unknown as StaffProvisioningRule[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (rule: Partial<StaffProvisioningRule>) => {
      const { data, error } = await supabase
        .from("staff_provisioning_rules" as any)
        .upsert(rule as any, { onConflict: "role_code,location_code" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff_provisioning_rules"] });
      toast({ title: "Rule saved" });
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return { rules: list.data ?? [], loading: list.isLoading, upsert };
}
