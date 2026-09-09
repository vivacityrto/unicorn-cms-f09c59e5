import type { Tables } from "@/integrations/supabase/types";

/**
 * UI-facing lifecycle lookup rows share the same generated shape across the
 * type, category, and responsible-role tables.
 */
export type LifecycleDropdownItem = Tables<"dd_lifecycle_type">;

export type LifecycleTemplate = Tables<"lifecycle_checklist_templates">;

export type LifecycleInstance = Tables<"lifecycle_checklist_instances">;
