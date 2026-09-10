import { supabase } from "@/integrations/supabase/client";

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

/** Revokes an invitation while preserving the existing cancel-invite contract. */
export async function revokeClientInvite(invitationId: string) {
  const { data, error } = await supabase.functions.invoke("cancel-invite", {
    body: { invitation_id: invitationId, reason: "Revoked by tenant admin" },
  });
  if (error) {
    const edge = await extractEdgeError(error);
    throw new Error(edge?.detail || error.message);
  }
  return data;
}
