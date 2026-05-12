import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientPreview } from "@/contexts/ClientPreviewContext";

export interface ActingUserProfile {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  mobile_phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
}

interface UseClientActingUserResult {
  actingUser: ActingUserProfile | null;
  isLoading: boolean;
  isParentResolved: boolean;
  error: string | null;
}

/**
 * Resolves the "acting user" for the client portal.
 * - In impersonation/preview mode: ClientPreviewContext.actingUserId is the
 *   single source of truth. We never fall back to tenant_users / tenant_members,
 *   which previously selected unactivated "ghost" users.
 * - In real client session: returns the authenticated user's profile.
 */
export function useClientActingUser(): UseClientActingUserResult {
  const { profile } = useAuth();
  const { activeTenantId, isPreview } = useClientTenant();
  const { actingUserId, actingUserOptions } = useClientPreview();
  const [actingUser, setActingUser] = useState<ActingUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParentResolved, setIsParentResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) {
      setActingUser(null);
      setIsParentResolved(false);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!isPreview) {
      // Real client session — use auth user's profile
      if (profile) {
        setActingUser({
          user_uuid: profile.user_uuid,
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          email: profile.email,
          phone: null,
          mobile_phone: null,
          job_title: null,
          avatar_url: profile.avatar_url,
        });
        setIsParentResolved(true);
        setError(null);
      }
      setIsLoading(false);
      return;
    }

    // Preview mode — only ClientPreviewContext.actingUserId is authoritative.
    if (!actingUserId) {
      setActingUser(null);
      setIsParentResolved(false);
      setError("No activated users available for this tenant yet.");
      setIsLoading(false);
      return;
    }

    // Defensive: if the stored acting user is no longer in the filtered
    // options (e.g. revoked), refuse rather than silently falling back.
    if (
      actingUserOptions.length > 0 &&
      !actingUserOptions.some((o) => o.user_uuid === actingUserId)
    ) {
      setActingUser(null);
      setIsParentResolved(false);
      setError("Selected preview user is no longer available.");
      setIsLoading(false);
      return;
    }

    loadActingUserProfile(actingUserId);
  }, [activeTenantId, isPreview, profile, actingUserId, actingUserOptions]);

  async function loadActingUserProfile(userUuid: string) {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: profileError } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email, phone, mobile_phone, job_title, avatar_url")
        .eq("user_uuid", userUuid)
        .maybeSingle();

      if (profileError || !data) {
        setActingUser(null);
        setIsParentResolved(false);
        setError("Could not load preview user profile.");
        setIsLoading(false);
        return;
      }

      setActingUser({
        user_uuid: data.user_uuid,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        mobile_phone: data.mobile_phone,
        job_title: data.job_title,
        avatar_url: data.avatar_url,
      });
      setIsParentResolved(true);
    } catch (err) {
      console.error("[useClientActingUser] Error loading acting user:", err);
      setActingUser(null);
      setIsParentResolved(false);
      setError("Error loading preview user profile.");
    } finally {
      setIsLoading(false);
    }
  }

  return { actingUser, isLoading, isParentResolved, error };
}
