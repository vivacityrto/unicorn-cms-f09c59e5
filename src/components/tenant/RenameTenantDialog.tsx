import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RTO_NUMERIC = /^\d+$/;
export const canRenameTenant = (rtoId?: string | null) =>
  !rtoId || !RTO_NUMERIC.test(rtoId.trim());

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  currentName: string;
  rtoId?: string | null;
  onRenamed?: (newName: string) => void;
}

export function RenameTenantDialog({
  open,
  onOpenChange,
  tenantId,
  currentName,
  rtoId,
  onRenamed,
}: Props) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [duplicateWarn, setDuplicateWarn] = useState<string | null>(null);

  const checkDuplicate = async (val: string) => {
    if (!val.trim() || val.trim() === currentName.trim()) {
      setDuplicateWarn(null);
      return;
    }
    const { data } = await supabase
      .from("tenants")
      .select("id, name")
      .ilike("name", val.trim())
      .neq("id", tenantId)
      .limit(1);
    setDuplicateWarn(
      data && data.length > 0
        ? `Another organisation already uses this name (#${data[0].id}).`
        : null
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      if (trimmed.length > 120) throw new Error("Name too long (max 120)");
      if (!canRenameTenant(rtoId)) throw new Error("Name is locked by TGA");

      // Re-check lock server-side via the helper
      const { data: locked } = await supabase.rpc("tenant_name_is_locked", {
        _tenant_id: tenantId,
      });
      if (locked === true) throw new Error("Name is locked by TGA");

      const { error } = await supabase
        .from("tenants")
        .update({ name: trimmed })
        .eq("id", tenantId);
      if (error) throw error;

      // Audit (entity_id is uuid; use tenants.id_uuid)
      const { data: tRow } = await supabase
        .from("tenants")
        .select("id_uuid")
        .eq("id", tenantId)
        .maybeSingle();
      if (tRow?.id_uuid) {
        await supabase.from("audit_events").insert({
          entity: "tenants",
          entity_id: tRow.id_uuid,
          action: "name_changed",
          user_id: profile?.user_uuid ?? null,
          details: {
            tenant_id: tenantId,
            from: currentName,
            to: trimmed,
            rto_id_at_change: rtoId ?? null,
          },
        });
      }

      return trimmed;
    },
    onSuccess: (newName) => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({ title: "Organisation renamed", description: newName });
      onRenamed?.(newName);
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        title: "Rename failed",
        description: err instanceof Error ? err.message : "Could not rename",
        variant: "destructive",
      });
    },
  });

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <AppModalTitle>Rename Organisation</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">Name</Label>
            <Input
              id="tenant-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => checkDuplicate(e.target.value)}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Renaming is only available while the RTO ID is blank or non-numeric (e.g.{" "}
            <code>TBA</code>). Once a numeric RTO code is set, the name is managed by TGA.
          </p>
          {duplicateWarn && (
            <p className="text-xs text-amber-600">{duplicateWarn}</p>
          )}
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !name.trim() ||
              name.trim() === currentName.trim()
            }
          >
            Save
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
