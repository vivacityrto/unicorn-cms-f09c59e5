import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export interface LifecycleDropdownItem {
  id: number;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface LifecycleTemplate {
  id: string;
  lifecycle_type: string;
  category: string;
  step_title: string;
  description: string | null;
  responsible_role: string | null;
  default_assignee_id: string | null;
  external_link: string | null;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LifecycleInstance {
  id: string;
  template_id: string;
  lifecycle_type: string;
  tenant_id: number | null;
  target_user_id: string | null;
  package_instance_id: number | null;
  assigned_to: string | null;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

type LifecycleDropdownTable = "dd_lifecycle_type" | "dd_lifecycle_responsible_role" | "dd_lifecycle_category";

const fetchDropdown = async (table: LifecycleDropdownTable): Promise<LifecycleDropdownItem[]> => {
  const { data, error } = await supabase
    .from(table)
    .select("id, code, label, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as LifecycleDropdownItem[];
};

export function useLifecycleDropdowns() {
  const lifecycleTypes = useQuery({
    queryKey: ["lifecycle-dropdown", "dd_lifecycle_type"],
    queryFn: () => fetchDropdown("dd_lifecycle_type"),
    staleTime: 5 * 60 * 1000,
  });

  const responsibleRoles = useQuery({
    queryKey: ["lifecycle-dropdown", "dd_lifecycle_responsible_role"],
    queryFn: () => fetchDropdown("dd_lifecycle_responsible_role"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useQuery({
    queryKey: ["lifecycle-dropdown", "dd_lifecycle_category"],
    queryFn: () => fetchDropdown("dd_lifecycle_category"),
    staleTime: 5 * 60 * 1000,
  });

  return {
    lifecycleTypes: lifecycleTypes.data ?? [],
    responsibleRoles: responsibleRoles.data ?? [],
    categories: categories.data ?? [],
    isLoading: lifecycleTypes.isLoading || responsibleRoles.isLoading || categories.isLoading,
  };
}

export function useLifecycleTemplates(lifecycleType?: string) {
  const queryClient = useQueryClient();
  const queryKey = ["lifecycle-templates", lifecycleType ?? "all"];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("lifecycle_checklist_templates")
        .select("*")
        .order("category")
        .order("sort_order", { ascending: true });

      if (lifecycleType) {
        query = query.eq("lifecycle_type", lifecycleType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Tables<'lifecycle_checklist_templates'>[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Partial<LifecycleTemplate>) => {
      const insertPayload = template as TablesInsert<'lifecycle_checklist_templates'>;
      const { data, error } = await supabase
        .from("lifecycle_checklist_templates")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return data as LifecycleTemplate;
    },
    onSuccess: () => {
      toast({ title: "Template step created" });
      queryClient.invalidateQueries({ queryKey: ["lifecycle-templates"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create step", description: err.message, variant: "destructive" });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LifecycleTemplate> & { id: string }) => {
      const updatePayload = updates as TablesUpdate<'lifecycle_checklist_templates'>;
      const { data, error } = await supabase
        .from("lifecycle_checklist_templates")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as LifecycleTemplate;
    },
    onSuccess: () => {
      toast({ title: "Template step updated" });
      queryClient.invalidateQueries({ queryKey: ["lifecycle-templates"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update step", description: err.message, variant: "destructive" });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lifecycle_checklist_templates")
        .update({ is_active: false } satisfies TablesUpdate<'lifecycle_checklist_templates'>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template step deactivated" });
      queryClient.invalidateQueries({ queryKey: ["lifecycle-templates"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to deactivate step", description: err.message, variant: "destructive" });
    },
  });

  return {
    templates: data ?? [],
    loading: isLoading,
    error,
    refetch,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
