import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClientTenant } from "@/contexts/ClientTenantContext";

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
 * - In impersonation mode: resolves the parent/primary contact user for the tenant.
 * - In real client session: returns the authenticated user's profile.
 */
export function useClientActingUser(): UseClientActingUserResult {
  const { profile, user } = useAuth();
  const { activeTenantId, isPreview } = useClientTenant();
  const [actingUser, setActingUser] = useState<ActingUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParentResolved, setIsParentResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) {
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
      }
      setIsLoading(false);
      return;
    }

    // Impersonation mode — resolve parent account for tenant
    resolveParentUser(activeTenantId);
  }, [activeTenantId, isPreview, profile]);

  async function resolveParentUser(tenantId: number) {
    setIsLoading(true);
    setError(null);

    try {
      // Strategy 1: Check tenant_users for primary_contact = true
      const { data: primaryContact } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("primary_contact", true)
        .limit(1)
        .maybeSingle();

      let parentUserId = primaryContact?.user_id;

      // Strategy 2: Fall back to tenant_members with Admin role, oldest first
      if (!parentUserId) {
        const { data: adminMember } = await supabase
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("role", "Admin")
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        parentUserId = adminMember?.user_id;
      }

      // Strategy 3: Fall back to any active tenant member, oldest first
      if (!parentUserId) {
        const { data: anyMember } = await supabase
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        parentUserId = anyMember?.user_id;
      }

      if (!parentUserId) {
        setError("No parent account configured for this tenant.");
        setIsParentResolved(false);
        setIsLoading(false);
        return;
      }

      // Fetch parent user profile
      const { data: parentProfile, error: profileError } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email, phone, mobile_phone, job_title, avatar_url")
        .eq("user_uuid", parentUserId)
        .single();

      if (profileError || !parentProfile) {
        setError("Could not load parent account profile.");
        setIsParentResolved(false);
        setIsLoading(false);
        return;
      }

      setActingUser({
        user_uuid: parentProfile.user_uuid,
        first_name: parentProfile.first_name,
        last_name: parentProfile.last_name,
        email: parentProfile.email,
        phone: parentProfile.phone,
        mobile_phone: parentProfile.mobile_phone,
        job_title: parentProfile.job_title,
        avatar_url: parentProfile.avatar_url,
      });
      setIsParentResolved(true);
    } catch (err) {
      console.error("[useClientActingUser] Error resolving parent:", err);
      setError("Error resolving parent account.");
      setIsParentResolved(false);
    } finally {
      setIsLoading(false);
    }
  }

  return { actingUser, isLoading, isParentResolved, error };
}
