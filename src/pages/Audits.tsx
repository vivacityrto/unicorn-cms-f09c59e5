import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { toast } from "sonner";
type AuditTab = "templates" | "inspections" | "schedules" | "analytics";
export default function Audits() {
  const navigate = useNavigate();
  const { audits, isLoading, createAudit } = useAudits();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<AuditTab>("templates");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("");

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

      // Transform to match AuditTemplate interface
      // Use last_published if available, otherwise fall back to updated_at
      return data.map((t) => ({
        id: t.id.toString(),
        name: t.name,
        created_at: t.created_at,
        last_published: t.last_published || t.updated_at,
        access: t.access as "all_users" | "restricted",
        status: t.status as "active" | "locked" | "draft",
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

  // Transform audits to inspection format
  const inspections: AuditInspection[] = useMemo(() => {
    if (!audits) return [];
    return audits.map((audit: any) => {
      const client = clients?.find((c) => c.id === audit.client_id);
      return {
        id: audit.id,
        audit_title: audit.audit_title,
        client_name: client?.companyname || client?.rto_name || "Unknown Client",
        client_rto_id: client?.rtoid,
        client_logo: client?.logo_url,
        status: audit.status,
        open_actions: Math.floor(Math.random() * 30),
        // TODO: Get real action counts
        closed_actions: Math.floor(Math.random() * 15),
        doc_number: undefined,
        // TODO: Get real doc number
        score:
          audit.status === "complete"
            ? Math.random() * 50 + 50
            : audit.status === "in_progress"
              ? Math.random() * 40
              : undefined,
        started_at: audit.started_at,
        completed_at: audit.completed_at,
        created_at: audit.created_at,
      };
    });
  }, [audits, clients]);
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
      inspections: audits?.length || 0,
      schedules: 0,
      analytics: 0,
    }),
    [audits, templates],
  );
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
  const handleDeleteTemplate = async (template: AuditTemplate) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)) {
      return;
    }

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
    } catch (error: any) {
      toast.error("Failed to delete template: " + error.message);
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
          {activeTab === "inspections" && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 gap-2">
                  <Plus className="h-4 w-4" />
                  New Audit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Audit</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Client</label>
                    <Select value={selectedClient} onValueChange={setSelectedClient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.companyname || client.rto_name || "Unknown"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleCreateAudit}
                    disabled={!selectedClient || createAudit.isPending}
                    className="w-full"
                  >
                    Create Audit
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
            onDeleteTemplate={handleDeleteTemplate}
          />
        )}

        {activeTab === "inspections" && <AuditInspectionsTable inspections={inspections} isLoading={isLoading} />}

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
    </DashboardLayout>
  );
}
