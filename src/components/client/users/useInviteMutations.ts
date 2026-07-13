import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useToast } from "@/hooks/use-toast";
import { userCapacityKeys } from "@/hooks/useUserCapacity";

export type InviteAccessLevel = "academy" | "secondary" | "user";

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  accessLevel: InviteAccessLevel;
}

const ROLE_MAP: Record<
  InviteAccessLevel,
  { unicorn_role: "Admin" | "User"; relationship_role: "academy_user" | "secondary_contact" | "user" }
> = {
  academy: { unicorn_role: "User", relationship_role: "academy_user" },
  secondary: { unicorn_role: "Admin", relationship_role: "secondary_contact" },
  user: { unicorn_role: "User", relationship_role: "user" },
};

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

export function useInviteMutations() {
  const { activeTenantId } = useClientTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["client_tenant_users", activeTenantId] });
    void queryClient.invalidateQueries({ queryKey: userCapacityKeys.tenant(activeTenantId ?? null) });
  };

  const invite = useMutation({
    mutationFn: async (input: InviteInput) => {
      if (!activeTenantId) throw new Error("No active tenant");
      const mapping = ROLE_MAP[input.accessLevel];
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
    },
    onSuccess: (_data, input) => {
      toast({ title: "Invitation sent", description: `An email is on its way to ${input.email.trim()}.` });
      invalidate();
    },
  });

  const resend = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { invitation_id: invitationId },
      });
      if (error) {
        const edge = await extractEdgeError(error);
        throw new Error(edge?.detail || error.message);
      }
      return data;
    },
    onSuccess: () => {
      toast({ title: "Invitation re-sent", description: "We've sent a fresh email with a new link." });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't resend", description: err.message });
    },
  });

  const revoke = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.functions.invoke("cancel-invite", {
        body: { invitation_id: invitationId, reason: "Revoked by tenant admin" },
      });
      if (error) {
        const edge = await extractEdgeError(error);
        throw new Error(edge?.detail || error.message);
      }
      return data;
    },
    onSuccess: () => {
      toast({ title: "Invitation revoked", description: "The link in their email will no longer work." });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't revoke", description: err.message });
    },
  });

  return { invite, resend, revoke };
}
