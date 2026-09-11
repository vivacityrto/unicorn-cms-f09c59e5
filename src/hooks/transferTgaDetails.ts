import type { TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export interface TgaDetailsSummaryInput {
  legal_name?: string | null;
  trading_name?: string | null;
  abn?: string | null;
  acn?: string | null;
  web_address?: string | null;
  organisation_type?: string | null;
}

function decodeHtmlEntities(text: string | null | undefined): string | null {
  if (!text) return null;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Transfers TGA summary details into the tenant profile. The caller owns
 * guards, loading/toast state, and dialog state; this adapter preserves the
 * existing field normalization and conditional tenant-name update.
 */
export async function transferTgaDetails(
  tenantId: number,
  userId: string,
  summary: TgaDetailsSummaryInput
): Promise<void> {
  const updates: TablesInsert<"tenant_profile"> = {
    tenant_id: tenantId,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (summary.legal_name) updates.legal_name = decodeHtmlEntities(summary.legal_name);
  if (summary.trading_name) updates.trading_name = decodeHtmlEntities(summary.trading_name);
  if (summary.abn) updates.abn = summary.abn;
  if (summary.acn) updates.acn = summary.acn;
  if (summary.web_address) updates.website = summary.web_address;
  if (summary.organisation_type) updates.org_type = summary.organisation_type.toLowerCase().replace(/\s+/g, "_");

  const { error } = await supabase
    .from("tenant_profile")
    .upsert(updates, { onConflict: "tenant_id" });
  if (error) throw error;

  // The existing flow intentionally ignores errors from this secondary name update.
  if (summary.legal_name) {
    await supabase
      .from("tenants")
      .update({ name: decodeHtmlEntities(summary.legal_name), updated_at: new Date().toISOString() })
      .eq("id", tenantId);
  }
}
