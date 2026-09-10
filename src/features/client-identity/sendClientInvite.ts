import { supabase } from "@/integrations/supabase/client";
import {
  mapClientInviteAccess,
  type InviteAccessLevel,
} from "./invite-policy";

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  accessLevel: InviteAccessLevel;
}

interface EdgeError {
  ok?: boolean;
  code?: string;
  detail?: string;
}

async function extractEdgeError(err: unknown): Promise<EdgeError | null> {
  if (!err || typeof err !== "object") return null;
  const ctx = (err as { context?: unknown }).context;
  if (!ctx || typeof ctx !== "object") return null;
  const response = ctx as Response;
  try {
    if (typeof response.json === "function") {
      return (await response.json()) as EdgeError;
    }
    if (typeof response.text === "function") {
      return JSON.parse(await response.text()) as EdgeError;
    }
  } catch {
    // body already consumed or not JSON — fall through
  }
  return null;
}

/**
 * Sends a client invitation while preserving the existing invite-user Edge
 * contract. Keep this adapter free of React Query/UI concerns so the command
 * can be characterized independently from its callers.
 */
export async function sendClientInvite(
  activeTenantId: number | null | undefined,
  input: InviteInput,
) {
  if (!activeTenantId) throw new Error("No active tenant");
  const mapping = mapClientInviteAccess(input.accessLevel);
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email: input.email.trim().toLowerCase(),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      invite_as: "CLIENT",
      tenant_id: activeTenantId,
      unicorn_role: mapping.unicorn_role,
      relationship_role: mapping.relationship_role,
    },
  });
  if (error) {
    const edge = await extractEdgeError(error);
    const wrapped = new Error(edge?.detail || error.message) as Error & {
      code?: string;
    };
    wrapped.code = edge?.code;
    throw wrapped;
  }
  return data;
}
