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

export interface ResetClientPasswordResult {
  ok?: boolean;
  email?: string;
}

/** Sends a password-reset email while preserving the existing Edge contract. */
export async function resetClientPassword(
  userUuid: string,
): Promise<ResetClientPasswordResult> {
  const { data, error } = await supabase.functions.invoke("send-password-reset", {
    body: { user_uuid: userUuid },
  });
  if (error) {
    const edge = await extractEdgeError(error);
    const wrapped = new Error(edge?.detail || error.message) as Error & { code?: string };
    wrapped.code = edge?.code;
    throw wrapped;
  }
  return data as ResetClientPasswordResult;
}
