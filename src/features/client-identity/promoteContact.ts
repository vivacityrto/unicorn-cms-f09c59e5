import { supabase } from "@/integrations/supabase/client";
import type { TenantContact } from "./models";
import type { RelationshipRole } from "@/lib/roles/relationshipRole";

/**
 * Sends the existing client-contact promotion invitation without changing the
 * invite-user Edge contract. UI state, toast handling, and contact refreshes
 * remain with the caller.
 */
export async function promoteContactViaInvite(
  tenantId: number,
  contact: TenantContact,
  promoteRole: RelationshipRole,
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Authentication required");

  return supabase.functions.invoke("invite-user", {
    body: {
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name || "",
      invite_as: "CLIENT",
      tenant_id: tenantId,
      unicorn_role:
        promoteRole === "primary_contact" || promoteRole === "secondary_contact"
          ? "Admin"
          : "User",
      relationship_role: promoteRole,
      // Send a real invitation email rather than creating the account
      // directly — skip_email:true left promoted contacts as unusable
      // "ghost" accounts with no way to set a password (client callers
      // can't reach the staff-only activate-ghost-user function). The
      // matching tenant_contacts row is archived and linked to the new
      // user automatically by accept_invitation_v2 once they accept —
      // not here, since no user exists yet at send time.
      skip_email: false,
      job_title: null,
    },
  });
}
