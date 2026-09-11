import { supabase } from "@/integrations/supabase/client";

export interface AppIntegrationSettings {
  sharepoint_site_url: string | null;
  staff_induction_video_url: string | null;
  staff_onboarding_workbook_url: string | null;
}

/**
 * Loads the single global app_settings row's integration-relevant fields.
 * The caller owns state seeding; this preserves the existing select/limit/
 * single query and its silent-on-no-row behavior (the original code only
 * set state for present fields, never cleared them for a missing row).
 */
export async function fetchAppIntegrationSettings(): Promise<AppIntegrationSettings | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("sharepoint_site_url, staff_induction_video_url, staff_onboarding_workbook_url")
    .limit(1)
    .single();
  return data ?? null;
}

/**
 * Saves the global SharePoint site URL (app_settings row id=1). The caller
 * owns loading/toast state; this preserves the existing trim-to-null and
 * error-throw contract.
 */
export async function saveSharepointSiteUrl(sharepointSiteUrl: string): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .update({ sharepoint_site_url: sharepointSiteUrl.trim() || null })
    .eq("id", 1);
  if (error) throw error;
}

/**
 * Saves the staff onboarding URLs (app_settings row id=1). The caller owns
 * loading/toast state; this preserves the existing trim-to-null and
 * error-throw contract for both fields.
 */
export async function saveStaffOnboardingUrls(
  inductionVideoUrl: string,
  workbookUrl: string
): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .update({
      staff_induction_video_url: inductionVideoUrl.trim() || null,
      staff_onboarding_workbook_url: workbookUrl.trim() || null,
    })
    .eq("id", 1);
  if (error) throw error;
}
