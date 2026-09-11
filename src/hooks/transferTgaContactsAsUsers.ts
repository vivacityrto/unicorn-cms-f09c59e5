import { supabase } from "@/integrations/supabase/client";

export interface TgaUserContactInput {
  email?: string | null;
  name?: string | null;
  contact_type?: string | null;
  position?: string | null;
  phone?: string | null;
}

export interface TransferTgaContactsResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Invites each unique (by email) TGA contact as a tenant user via the
 * invite-user Edge Function -- which owns all real authorization (caller
 * role, tenant-admin scope, allowed-role-per-tenant checks); this adapter is
 * pure client-side orchestration, not an authorization boundary itself. The
 * caller owns guards, loading/toast state, and dialog state; this preserves
 * the existing dedup-by-email, name-parsing, Admin/User role selection,
 * invite-user payload, and per-contact created/skipped/error accounting
 * (including both ALREADY_MEMBER detection paths -- the response body's
 * `data.code` and the thrown error message string match).
 */
export async function transferTgaContactsAsUsers(
  tenantId: number,
  contacts: readonly TgaUserContactInput[]
): Promise<TransferTgaContactsResult> {
  const uniqueByEmail = new Map<string, TgaUserContactInput>();
  for (const contact of contacts) {
    if (contact.email && !uniqueByEmail.has(contact.email.toLowerCase())) {
      uniqueByEmail.set(contact.email.toLowerCase(), contact);
    }
  }

  const uniqueContacts = Array.from(uniqueByEmail.values());
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const contact of uniqueContacts) {
    // Parse first/last name from contact name (e.g. "Mr Brenton Myatt")
    const nameParts = (contact.name || "").replace(/^(Mrs|Miss|Ms|Mr|Dr|Prof)\.?\s*/i, "").trim().split(/\s+/);
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ") || "Unknown";

    // Chief executive gets Admin role, others get User
    const isChief = contact.contact_type?.toLowerCase().includes("chief executive") ||
      contact.contact_type === "ChiefExecutive";
    const role = isChief ? "Admin" : "User";

    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: (contact.email ?? "").toLowerCase().trim(),
          first_name: firstName,
          last_name: lastName,
          invite_as: "CLIENT",
          tenant_id: tenantId,
          unicorn_role: role,
          skip_email: true,
          job_title: contact.position || null,
          phone_number: contact.phone || null,
        },
      });

      if (error) throw error;
      if (data?.ok === false && data?.code === "ALREADY_MEMBER") {
        skipped++;
      } else {
        created++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      if (msg.includes("ALREADY_MEMBER") || msg.includes("already")) {
        skipped++;
      } else {
        errors.push(`${contact.email}: ${msg}`);
      }
    }
  }

  return { created, skipped, errors };
}
