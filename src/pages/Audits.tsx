import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAudits } from "@/hooks/useAudits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ClipboardCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuditNavCards } from "@/components/audit/AuditNavCards";
import { AuditTemplatesTable, AuditTemplate } from "@/components/audit/AuditTemplatesTable";
import { AuditInspectionsTable, AuditInspection } from "@/components/audit/AuditInspectionsTable";
import { DeleteConfirmDialog } from "@/components/audit/DeleteConfirmDialog";
import { toast } from "sonner";

type AuditTab = "templates" | "inspections" | "schedules" | "analytics";

export default function Audits() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { audits, isLoading, createAudit } = useAudits();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<AuditTab>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['templates', 'inspections', 'schedules', 'analytics'].includes(tabParam)) {
      return tabParam as AuditTab;
    }
    return "templates";
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("");
  
  // Delete dialog state
  const [deleteTemplateDialog, setDeleteTemplateDialog] = useState<{ open: boolean; template: AuditTemplate | null }>({ open: false, template: null });
  const [deleteInspectionDialog, setDeleteInspectionDialog] = useState<{ open: boolean; inspection: AuditInspection | null }>({ open: false, inspection: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch templates from audit_templates table
  const {
    data: templates,
    isLoading: templatesLoading,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ["audit_templates", profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch inspections to determine which templates are in use
      const { data: inspectionTemplateIds } = await supabase
        .from("audit_inspection")
        .select("template_id");
      
      const templateIdsInUse = new Set(
        (inspectionTemplateIds || []).map((i) => i.template_id?.toString())
      );

      // Transform to match AuditTemplate interface
      // Use last_published if available, otherwise fall back to updated_at
      return data.map((t) => ({
        id: t.id.toString(),
        name: t.name,
        created_at: t.created_at,
        last_published: t.last_published || t.updated_at,
        access: t.access as "all_users" | "restricted",
        status: t.status as "active" | "locked" | "draft",
        has_inspections: templateIdsInUse.has(t.id.toString()),
      })) as AuditTemplate[];
    },
    enabled: !!profile?.tenant_id,
  });

  const { data: clients } = useQuery({
    queryKey: ["clients", profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients_legacy")
        .select("id, companyname, rto_name, rtoid, logo_url")
        .eq("tenant_id", profile!.tenant_id!)
        .order("companyname");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch inspections from audit_inspection table
  const {
    data: inspectionsData,
    isLoading: inspectionsLoading,
    refetch: refetchInspections,
  } = useQuery({
    queryKey: ["audit_inspections", profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_inspection")
        .select(`
          id,
          template_id,
          inspection_title,
          doc_number,
          document_id,
          selected_tenant_id,
          status,
          compliance_score,
          conducted_by,
          started_at,
          completed_at,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch users for conducted_by display
  const { data: users } = useQuery({
    queryKey: ["users_for_inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, avatar_url");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Fetch tenants for client display (clients dropdown uses tenants)
  const { data: tenants } = useQuery({
    queryKey: ["tenants_for_inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  // Transform inspections to display format
  const inspections: AuditInspection[] = useMemo(() => {
    if (!inspectionsData) return [];
    return inspectionsData.map((inspection) => {
      const template = templates?.find((t) => t.id === inspection.template_id?.toString());
      const user = users?.find((u) => u.user_uuid === inspection.conducted_by);
      // selected_tenant_id stores tenant ID from the clients dropdown
      const tenant = tenants?.find((t) => t.id === inspection.selected_tenant_id);
      return {
        id: inspection.id,
        template_id: inspection.template_id,
        template_name: template?.name || inspection.inspection_title || 'Unknown Template',
        conducted_by: inspection.conducted_by,
        conducted_by_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
        conducted_by_avatar: typeof user?.avatar_url === 'string' ? user.avatar_url : undefined,
        status: inspection.status,
        doc_number: inspection.doc_number || undefined,
        document_id: inspection.document_id || undefined,
        selected_tenant_id: inspection.selected_tenant_id || undefined,
        client_name: tenant?.name || undefined,
        compliance_score: inspection.compliance_score ? Number(inspection.compliance_score) : undefined,
        started_at: inspection.started_at || undefined,
        completed_at: inspection.completed_at || undefined,
        created_at: inspection.created_at,
      };
    });
  }, [inspectionsData, templates, users, tenants]);
  const handleCreateAudit = async () => {
    if (!selectedClient) return;
    await createAudit.mutateAsync({
      clientId: selectedClient,
    });
    setCreateDialogOpen(false);
    setSelectedClient("");
  };

  // Calculate counts for nav cards
  const counts = useMemo(
    () => ({
      templates: templates?.length || 0,
      inspections: inspectionsData?.length || 0,
      schedules: 0,
      analytics: 0,
    }),
    [inspectionsData, templates],
  );

  // Delete inspection handler
  const handleDeleteInspection = async () => {
    const inspection = deleteInspectionDialog.inspection;
    if (!inspection) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("audit_inspection")
        .delete()
        .eq("id", inspection.id);
      if (error) throw error;
      toast.success("Inspection deleted successfully");
      refetchInspections();
      setDeleteInspectionDialog({ open: false, inspection: null });
    } catch (error: any) {
      toast.error("Failed to delete inspection: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };
  const handleStartInspection = (template: AuditTemplate) => {
    navigate(`/audits/create-template/${template.id}?mode=inspection`);
  };
  const handleCreateTemplate = () => {
    navigate("/audits/create-template");
  };
  const handleBrowseLibrary = () => {
    toast.info("Browse library dialog would open here");
    // TODO: Implement browse library flow
  };
  const handleDuplicateTemplate = async (template: AuditTemplate) => {
    try {
      // Create duplicate template
      const { data: newTemplate, error: templateError } = await supabase
        .from("audit_templates")
        .insert({
          tenant_id: profile!.tenant_id!,
          name: `${template.name} (Copy)`,
          status: "draft",
          access: template.access,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Copy questions if template has any
      const { data: questions, error: questionsError } = await supabase
        .from("audit_template_questions")
        .select("*")
        .eq("template_id", parseInt(template.id));

      if (questionsError) throw questionsError;

      if (questions && questions.length > 0) {
        const newQuestions = questions.map((q) => ({
          template_id: newTemplate.id,
          question_type: q.question_type,
          label: q.label,
          order_index: q.order_index,
          options: q.options,
          required: q.required,
          category: q.category,
        }));

        const { error: insertError } = await supabase.from("audit_template_questions").insert(newQuestions);

        if (insertError) throw insertError;
      }

      toast.success(`Template "${template.name}" duplicated successfully`);
      refetchTemplates();
    } catch (error: any) {
      toast.error("Failed to duplicate template: " + error.message);
    }
  };
  const handleDeleteTemplate = async () => {
    const template = deleteTemplateDialog.template;
    if (!template) return;

    setIsDeleting(true);
    try {
      // Delete questions first (due to foreign key)
      const { error: questionsError } = await supabase
        .from("audit_template_questions")
        .delete()
        .eq("template_id", parseInt(template.id));

      if (questionsError) throw questionsError;

      // Delete template
      const { error: templateError } = await supabase.from("audit_templates").delete().eq("id", parseInt(template.id));

      if (templateError) throw templateError;

      toast.success(`Template "${template.name}" deleted successfully`);
      refetchTemplates();
      setDeleteTemplateDialog({ open: false, template: null });
    } catch (error: any) {
      toast.error("Failed to delete template: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };
  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 animate-fade-in w-full">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold">Manage Audits</h1>
            <p className="text-muted-foreground">
              Manage compliance, inspections, schedules, and analytics in one place.
            </p>
          </div>
          {activeTab === "templates" && (
            <Button
              onClick={handleCreateTemplate}
              className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          )}
          {activeTab === "schedules" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Schedule
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Schedule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">Schedule configuration coming soon.</p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Navigation Cards */}
        <AuditNavCards activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

        {/* Tab Content */}
        {activeTab === "templates" && (
          <AuditTemplatesTable
            templates={templates || []}
            isLoading={templatesLoading}
            onCreateTemplate={handleCreateTemplate}
            onBrowseLibrary={handleBrowseLibrary}
            onStartInspection={handleStartInspection}
            onEditTemplate={(t) => navigate(`/audits/create-template/${t.id}`)}
            onDuplicateTemplate={handleDuplicateTemplate}
            onDeleteTemplate={(t) => setDeleteTemplateDialog({ open: true, template: t })}
          />
        )}

        {activeTab === "inspections" && (
          <AuditInspectionsTable 
            inspections={inspections} 
            isLoading={inspectionsLoading} 
            onEditInspection={(inspection) => navigate(`/audits/create-template/${inspection.template_id}?mode=inspection&inspectionId=${inspection.id}`)}
            onDeleteInspection={(inspection) => setDeleteInspectionDialog({ open: true, inspection })}
          />
        )}

        {activeTab === "schedules" && (
          <Card>
            <CardContent className="p-12 text-center">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No schedules yet</h3>
              <p className="text-muted-foreground">Schedule your upcoming audits here</p>
            </CardContent>
          </Card>
        )}

        {activeTab === "analytics" && (
          <Card>
            <CardContent className="p-12 text-center">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Analytics coming soon</h3>
              <p className="text-muted-foreground">View audit insights and reports</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Template Dialog */}
      <DeleteConfirmDialog
        open={deleteTemplateDialog.open}
        onOpenChange={(open) => setDeleteTemplateDialog({ open, template: open ? deleteTemplateDialog.template : null })}
        title="Delete Template"
        description="This action cannot be undone. This will permanently delete the template and all associated questions."
        itemName={deleteTemplateDialog.template?.name}
        onConfirm={handleDeleteTemplate}
        isDeleting={isDeleting}
      />

      {/* Delete Inspection Dialog */}
      <DeleteConfirmDialog
        open={deleteInspectionDialog.open}
        onOpenChange={(open) => setDeleteInspectionDialog({ open, inspection: open ? deleteInspectionDialog.inspection : null })}
        title="Delete Inspection"
        description="This action cannot be undone. This will permanently delete the inspection record."
        itemName={deleteInspectionDialog.inspection?.template_name}
        onConfirm={handleDeleteInspection}
        isDeleting={isDeleting}
      />
    </DashboardLayout>
  );
}
