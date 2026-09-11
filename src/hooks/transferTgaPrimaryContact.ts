import type { TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export interface TgaPrimaryContactInput {
  contact_type?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Transfers the selected TGA contact into the tenant profile. The caller owns
 * guards, loading/toast state, and dialog state; this adapter preserves the
 * existing Chief Executive preference and upsert contract.
 */
export async function transferTgaPrimaryContact(
  tenantId: number,
  userId: string,
  contacts: readonly TgaPrimaryContactInput[]
): Promise<string | null | undefined> {
  const contact = contacts.find((candidate) =>
    candidate.contact_type?.toLowerCase().includes("chief executive") ||
    candidate.contact_type === "ChiefExecutive"
  ) || contacts[0];
  const updates: TablesInsert<"tenant_profile"> = {
    tenant_id: tenantId,
    updated_by: userId,
    updated_at: new Date().toISOString(),
    primary_contact_name: contact.name || null,
    primary_contact_email: contact.email || null,
    primary_contact_phone: contact.phone || null,
  };

  const { error } = await supabase
    .from("tenant_profile")
    .upsert(updates, { onConflict: "tenant_id" });
  if (error) throw error;

  return contact.name;
}
