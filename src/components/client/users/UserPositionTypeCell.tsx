import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { positionTypeLabel, type PositionTypeOption } from "@/lib/roles/positionType";
import { clientUserPositionTypesKey } from "@/hooks/use-client-user-position-types";
import type { ClientTenantUserRow } from "@/features/client-identity/models";

interface UserPositionTypeCellProps {
  row: ClientTenantUserRow;
  tenantId: number | null;
  /** Current position type for this row's user, from `useClientUserPositionTypes`. */
  value: string | null;
  options: PositionTypeOption[];
  /** True for people who can manage portal users (and the portal is not read-only). */
  canEdit: boolean;
}

/**
 * Position type for one row of the client portal Users table: a dropdown for
 * people who can manage portal users, plain text for everyone else. Invited
 * rows have no user yet, so there is nothing to show.
 */
export function UserPositionTypeCell({ row, tenantId, value, options, canEdit }: UserPositionTypeCellProps) {
  const queryClient = useQueryClient();
  const userId = row.user_id;

  const mutation = useMutation({
    mutationFn: async (next: string | null) => {
      if (!tenantId || !userId) throw new Error("Missing tenant or user");
      const { error } = await supabase.rpc("set_tenant_user_position_type", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        // The function accepts NULL to clear; the generated type lists it as a plain string.
        p_position_type: next as string,
      });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next ? "Position type updated" : "Position type cleared");
      queryClient.invalidateQueries({ queryKey: clientUserPositionTypesKey(tenantId) });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update position type";
      toast.error(message);
    },
  });

  if (row.row_type !== "active" || !userId) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (!canEdit) {
    return <span className="text-sm text-muted-foreground">{positionTypeLabel(value, options)}</span>;
  }

  return (
    <Select
      value={value || "__none__"}
      disabled={mutation.isPending}
      onValueChange={(next) => {
        const nextValue = next === "__none__" ? null : next;
        if ((value ?? null) === nextValue) return;
        mutation.mutate(nextValue);
      }}
    >
      <SelectTrigger className="h-8 w-[170px] text-sm" aria-label={`Position type for ${row.display_name}`}>
        <SelectValue>{value ? positionTypeLabel(value, options) : "Position type"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No position type</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
