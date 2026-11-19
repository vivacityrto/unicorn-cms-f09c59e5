import { supabase } from '@/integrations/supabase/client';

export interface SenderProfile {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  /** Vivacity staff. Unknown (false) when only the older direct lookup could answer. */
  is_staff: boolean;
}

/** "First Last", or the fallback when the person has no name on file. */
export function displayName(profile: Pick<SenderProfile, 'first_name' | 'last_name'> | null | undefined, fallback: string): string {
  const name = [profile?.first_name, profile?.last_name].filter((p): p is string => !!p && p.trim().length > 0).join(' ').trim();
  return name || fallback;
}

type RpcCall = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/**
 * Who wrote the messages in a conversation, with their name and profile picture.
 *
 * A client's row-level security only lets them read their own CSC and their own organisation's people, so asking the
 * users table directly returns nothing for other Vivacity staff (the sender of a broadcast, a second consultant) and
 * the portal showed a generic "Vivacity Team". The database function get_conversation_sender_profiles answers for the
 * people in one conversation the caller takes part in, returning only name and picture. If it is not available (for
 * example not yet deployed) or misses someone, this falls back to the direct lookup for just those people.
 */
export async function fetchSenderProfiles(conversationId: string, senderIds: readonly string[]): Promise<Map<string, SenderProfile>> {
  const out = new Map<string, SenderProfile>();
  const wanted = Array.from(new Set(senderIds.filter(Boolean)));
  if (wanted.length === 0) return out;

  try {
    const rpc = supabase.rpc.bind(supabase) as unknown as RpcCall;
    const { data, error } = await rpc('get_conversation_sender_profiles', { p_conversation_id: conversationId });
    if (!error && Array.isArray(data)) {
      for (const row of data as SenderProfile[]) {
        if (row?.user_uuid) out.set(row.user_uuid, { user_uuid: row.user_uuid, first_name: row.first_name ?? null, last_name: row.last_name ?? null, avatar_url: row.avatar_url ?? null, is_staff: !!row.is_staff });
      }
    }
  } catch {
    // Fall through to the direct lookup below.
  }

  const missing = wanted.filter((id) => !out.has(id));
  if (missing.length > 0) {
    const { data } = await supabase.from('users').select('user_uuid, first_name, last_name, avatar_url').in('user_uuid', missing);
    for (const u of data ?? []) {
      out.set(u.user_uuid, { user_uuid: u.user_uuid, first_name: u.first_name ?? null, last_name: u.last_name ?? null, avatar_url: u.avatar_url ?? null, is_staff: false });
    }
  }
  return out;
}
