import { useState, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLifecycleDropdowns, useLifecycleTemplates } from "@/hooks/useLifecycleChecklists";
import { LifecycleTemplateDialog } from "@/components/admin/lifecycle/LifecycleTemplateDialog";
import { LifecycleTemplateGrid } from "@/components/admin/lifecycle/LifecycleTemplateGrid";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, ClipboardList } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modals";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { LifecycleTemplate } from "@/hooks/useLifecycleChecklists";

const COUNTERPART_MAP: Record<string, string> = {
  client_onboarding: "client_offboarding",
  client_offboarding: "client_onboarding",
  staff_onboarding: "staff_offboarding",
  staff_offboarding: "staff_onboarding",
};

export default function LifecycleChecklistsAdmin() {
  const { lifecycleTypes, responsibleRoles, categories, isLoading: dropdownsLoading } = useLifecycleDropdowns();
  const [activeTab, setActiveTab] = useState<string>("");
  
  // Set default tab once types load
  const currentTab = activeTab || (lifecycleTypes[0]?.code ?? "");

  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useLifecycleTemplates(currentTab || undefined);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LifecycleTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LifecycleTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<LifecycleTemplate | null>(null);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, LifecycleTemplate[]> = {};
    for (const t of templates) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    // Sort categories by dd_lifecycle_category sort_order
    const categoryOrder = new Map(categories.map(c => [c.code, c.sort_order]));
    return Object.entries(groups).sort(([a], [b]) => 
      (categoryOrder.get(a) ?? 999) - (categoryOrder.get(b) ?? 999)
    );
  }, [templates, categories]);

  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.code] = c.label;
    return map;
  }, [categories]);

  const roleLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of responsibleRoles) map[r.code] = r.label;
    return map;
  }, [responsibleRoles]);

  const counterpartCode = COUNTERPART_MAP[currentTab] ?? "";
  const counterpartLabel = lifecycleTypes.find(lt => lt.code === counterpartCode)?.label ?? "";

  const handleCopyToCounterpart = useCallback((step: LifecycleTemplate) => {
    if (!counterpartCode) return;
    const { id, lifecycle_type, created_at, updated_at, ...rest } = step;
    createTemplate.mutate(
      { ...rest, lifecycle_type: counterpartCode },
      {
        onSuccess: () => {
          toast({ title: "Step copied", description: `Copied "${step.step_title}" to ${counterpartLabel}` });
        },
      }
    );
  }, [counterpartCode, counterpartLabel, createTemplate]);

  function handleAdd() {
    setEditingTemplate(null);
    setDialogOpen(true);
  }

  function handleEdit(t: LifecycleTemplate) {
    setEditingTemplate(t);
    setDialogOpen(true);
  }

  function handleSave(data: Partial<LifecycleTemplate>) {
    if (editingTemplate) {
      updateTemplate.mutate({ ...data, id: editingTemplate.id } as any, {
        onSuccess: () => setDialogOpen(false),
      });
    } else {
      createTemplate.mutate({ ...data, lifecycle_type: currentTab }, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteTemplate.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Lifecycle Checklists</h1>
              <p className="text-sm text-muted-foreground">
                Configure onboarding and offboarding checklist templates for clients and staff
              </p>
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!currentTab}>
            <Plus className="h-4 w-4 mr-2" />
            Add Step
          </Button>
        </div>

        <Tabs value={currentTab} onValueChange={setActiveTab}>
          <TabsList>
            {lifecycleTypes.map((lt) => (
              <TabsTrigger key={lt.code} value={lt.code}>
                {lt.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {lifecycleTypes.map((lt) => (
            <TabsContent key={lt.code} value={lt.code}>
              <LifecycleTemplateGrid
                groupedTemplates={groupedTemplates}
                categoryLabels={categoryLabels}
                roleLabels={roleLabels}
                loading={loading || dropdownsLoading}
                counterpartLabel={counterpartLabel}
                onView={setViewingTemplate}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onCopyToCounterpart={counterpartCode ? handleCopyToCounterpart : undefined}
              />
            </TabsContent>
          ))}
        </Tabs>

        <LifecycleTemplateDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          template={editingTemplate}
          categories={categories}
          responsibleRoles={responsibleRoles}
          onSave={handleSave}
          saving={createTemplate.isPending || updateTemplate.isPending}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          title="Deactivate Step"
          description="This will deactivate this checklist step. It won't appear in new checklists but existing instances are preserved."
          confirmText="Deactivate"
          variant="destructive"
          isLoading={deleteTemplate.isPending}
          onConfirm={handleDeleteConfirm}
        />

        <Dialog open={!!viewingTemplate} onOpenChange={(v) => !v && setViewingTemplate(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{viewingTemplate?.step_title}</DialogTitle>
              <DialogDescription>Step instructions and details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {viewingTemplate?.description ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Instructions</p>
                  <p className="text-sm whitespace-pre-wrap">{viewingTemplate.description}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No instructions provided for this step.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {viewingTemplate?.category && (
                  <Badge variant="secondary">{categoryLabels[viewingTemplate.category] || viewingTemplate.category}</Badge>
                )}
                {viewingTemplate?.responsible_role && (
                  <Badge variant="outline">{roleLabels[viewingTemplate.responsible_role] || viewingTemplate.responsible_role}</Badge>
                )}
                {viewingTemplate?.external_link && (
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => window.open(viewingTemplate.external_link!, "_blank")}>
                    Open external link ↗
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
