import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, Trash2, ArrowUp, ArrowDown, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { TenantCombobox } from "@/components/clickup/TenantCombobox";
import { isVivacityStaffRole } from "@/lib/roles/vivacityRoles";

interface TenantRelationshipsProps {
  tenantId: number;
}

interface RelationshipRow {
  id: number;
  parent_tenant_id: number;
  child_tenant_id: number;
  notes: string | null;
  created_at: string;
  bills_to_parent: boolean;
}

interface TenantBasic {
  id: number;
  name: string;
}

export function TenantRelationships({ tenantId }: TenantRelationshipsProps) {
  const { profile, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [direction, setDirection] = useState<"parent" | "child">("child");
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [billsToParent, setBillsToParent] = useState(false);

  const isVivacityStaff = isVivacityStaffRole(profile?.unicorn_role);

  // Fetch relationships involving this tenant
  const { data: relationships = [], isLoading } = useQuery({
    queryKey: ["tenant-relationships", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_relationships")
        .select("id, parent_tenant_id, child_tenant_id, notes, created_at, bills_to_parent")
        .or(`parent_tenant_id.eq.${tenantId},child_tenant_id.eq.${tenantId}`)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as RelationshipRow[];
    },
  });

  // Get all related tenant IDs to fetch names
  const relatedIds = [
    ...new Set(
      relationships.flatMap((r) => [r.parent_tenant_id, r.child_tenant_id])
        .filter((id) => id !== tenantId)
    ),
  ];

  const { data: relatedTenants = [] } = useQuery({
    queryKey: ["tenant-names", relatedIds],
    queryFn: async () => {
      if (!relatedIds.length) return [];
      const { data } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", relatedIds);
      return (data || []) as TenantBasic[];
    },
    enabled: relatedIds.length > 0,
  });

  // Fetch all tenants for the combobox
  const { data: allTenants = [] } = useQuery({
    queryKey: ["all-tenants-for-linking"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      return (data || []) as TenantBasic[];
    },
    enabled: showDialog,
  });

  const tenantMap = new Map(relatedTenants.map((t) => [t.id, t.name]));

  const parentRels = relationships.filter((r) => r.parent_tenant_id !== tenantId);
  const childRels = relationships.filter((r) => r.child_tenant_id !== tenantId);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId) throw new Error("No tenant selected");

      const parentId = direction === "parent" ? selectedTenantId : tenantId;
      const childId = direction === "parent" ? tenantId : selectedTenantId;

      const { error } = await supabase
        .from("tenant_relationships")
        .insert({
          parent_tenant_id: parentId,
          child_tenant_id: childId,
          notes: notes.trim() || null,
          bills_to_parent: billsToParent,
          created_by: profile?.user_uuid,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-relationships", tenantId] });
      toast({ title: "Relationship added" });
      resetDialog();
    },
    onError: (err: Error) => {
      const msg = err.message.includes("tenant_rel_unique")
        ? "This relationship already exists"
        : err.message.includes("no_self_link")
        ? "Cannot link an organisation to itself"
        : err.message || "Failed to add relationship";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (relId: number) => {
      const { error } = await supabase
        .from("tenant_relationships")
        .delete()
        .eq("id", relId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-relationships", tenantId] });
      toast({ title: "Relationship removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove relationship", variant: "destructive" });
    },
  });

  const resetDialog = () => {
    setShowDialog(false);
    setDirection("child");
    setSelectedTenantId(null);
    setNotes("");
    setBillsToParent(false);
  };

  const toggleBillsMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const { error } = await supabase
        .from("tenant_relationships")
        .update({ bills_to_parent: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-relationships", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["membership-usage"] });
      toast({ title: "Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "Update failed", variant: "destructive" });
    },
  });

  // Filter out current tenant and already-linked tenants from combobox
  const availableTenants = allTenants.filter(
    (t) => t.id !== tenantId && !relatedIds.includes(t.id)
  );

  if (isLoading) return null;
  if (!relationships.length && !isVivacityStaff) return null;

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <div className="bg-muted/30 px-6 h-14 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Related Organisations</h2>
        </div>
        {isVivacityStaff && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-primary"
            onClick={() => setShowDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Link
          </Button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {/* Parent organisations */}
        {parentRels.map((rel) => {
          const otherId = rel.parent_tenant_id;
          const name = tenantMap.get(otherId) || `#${otherId}`;
          return (
            <RelRow
              key={rel.id}
              label="Parent"
              icon={<ArrowUp className="h-3.5 w-3.5 text-blue-500" />}
              name={name}
              notes={rel.notes}
              billsToParent={rel.bills_to_parent}
              billsBadgeText={rel.bills_to_parent ? "Your time bills here" : null}
              onNavigate={() => navigate(`/tenant/${otherId}`)}
              onDelete={isVivacityStaff ? () => deleteMutation.mutate(rel.id) : undefined}
            />
          );
        })}

        {/* Child organisations */}
        {childRels.map((rel) => {
          const otherId = rel.child_tenant_id;
          const name = tenantMap.get(otherId) || `#${otherId}`;
          return (
            <RelRow
              key={rel.id}
              label="Child"
              icon={<ArrowDown className="h-3.5 w-3.5 text-green-500" />}
              name={name}
              notes={rel.notes}
              billsToParent={rel.bills_to_parent}
              billsBadgeText={rel.bills_to_parent ? "Time bills to this org" : null}
              onToggleBills={
                isVivacityStaff
                  ? (value) => toggleBillsMutation.mutate({ id: rel.id, value })
                  : undefined
              }
              onNavigate={() => navigate(`/tenant/${otherId}`)}
              onDelete={isVivacityStaff ? () => deleteMutation.mutate(rel.id) : undefined}
            />
          );
        })}

        {relationships.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No linked organisations
          </p>
        )}
      </div>

      {/* Link Organisation Dialog */}
      <AppModal open={showDialog} onOpenChange={resetDialog}>
        <AppModalContent size="sm">
          <AppModalHeader>
            <AppModalTitle>Link Organisation</AppModalTitle>
          </AppModalHeader>
          <AppModalBody className="space-y-4">
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "parent" | "child")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Selected org is the Parent</SelectItem>
                  <SelectItem value="child">Selected org is a Child</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Organisation</Label>
              <TenantCombobox
                tenants={availableTenants}
                value={selectedTenantId}
                onSelect={setSelectedTenantId}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Subsidiary RTO under same ownership"
                className="min-h-[60px]"
              />
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={billsToParent}
                onChange={(e) => setBillsToParent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Child's consult time bills to the parent
                <span className="block text-xs text-muted-foreground">
                  Time logged against the child organisation will be deducted from the parent's
                  membership pool. The child shows zero pool of its own.
                </span>
              </span>
            </label>
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={resetDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!selectedTenantId || addMutation.isPending}
            >
              Link Organisation
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>
    </Card>
  );
}

function RelRow({
  label,
  icon,
  name,
  notes,
  billsBadgeText,
  billsToParent,
  onToggleBills,
  onNavigate,
  onDelete,
}: {
  label: string;
  icon: React.ReactNode;
  name: string;
  notes: string | null;
  billsBadgeText?: string | null;
  billsToParent?: boolean;
  onToggleBills?: (value: boolean) => void;
  onNavigate: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors group">
      <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground uppercase">{label}</span>
            {billsBadgeText && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {billsBadgeText}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors">
            {name}
          </p>
          {notes && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{notes}</p>
          )}
        </div>
      </div>
      {onToggleBills && (
        <label
          className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap"
          title="Child's consult time bills to this parent"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={!!billsToParent}
            onChange={(e) => onToggleBills(e.target.checked)}
          />
          Bills to me
        </label>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
