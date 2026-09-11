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

/** Gets an invitation link without sending another email. */
export async function copyClientInviteLink(invitationId: string) {
  const { data, error } = await supabase.functions.invoke("resend-invite", {
    body: { invitation_id: invitationId, skip_email: true },
  });
  if (error) {
    const edge = await extractEdgeError(error);
    throw new Error(edge?.detail || error.message);
  }
  if (!data?.action_link) {
    throw new Error("The resend-invite function did not return a link.");
  }
  return data as { action_link: string };
}
