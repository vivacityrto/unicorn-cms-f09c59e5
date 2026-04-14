import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CalendarIcon, FileCheck, ArrowRight, Eye, Archive } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import {
  useComplianceAuditList,
  fetchActiveTemplates,
  createAudit,
  archiveAudit,
  type ComplianceTemplate,
} from '@/hooks/useComplianceAudits';
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-warning/10 text-warning' },
  complete: { label: 'Complete', className: 'bg-success/10 text-success' },
  archived: { label: 'Archived', className: 'bg-muted/50 text-muted-foreground/60' },
};

export default function ComplianceAuditList() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tid = tenantId ? parseInt(tenantId, 10) : null;
  const { audits, loading, fetchAudits } = useComplianceAuditList(tid);

  const [tenantName, setTenantName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [auditDate, setAuditDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (tid) {
      fetchAudits();
      supabase
        .from('tenants')
        .select('name')
        .eq('id', tid)
        .single()
        .then(({ data }) => setTenantName(data?.name || `Tenant ${tid}`));
    }
  }, [tid, fetchAudits]);

  const openModal = async () => {
    try {
      const tpls = await fetchActiveTemplates();
      setTemplates(tpls);
      if (tpls.length > 0) setSelectedTemplate(tpls[0].id);
      setShowModal(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!tid || !user?.id || !selectedTemplate) return;
    setCreating(true);
    try {
      const auditId = await createAudit({
        tenantId: tid,
        templateId: selectedTemplate,
        auditDate: format(auditDate, 'yyyy-MM-dd'),
        auditorUserId: user.id,
        notes,
        createdBy: user.id,
      });
      setShowModal(false);
      toast({ title: 'Audit created', description: 'Navigating to audit form...' });
      navigate(`/compliance-audits/${tid}/audit/${auditId}`);
    } catch (err: any) {
      toast({ title: 'Error creating audit', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (auditId: string) => {
    try {
      await archiveAudit(auditId);
      toast({ title: 'Audit archived' });
      fetchAudits();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Compliance Audits</h1>
            <p className="text-sm text-muted-foreground mt-1">{tenantName}</p>
          </div>
          <Button onClick={openModal} className="gap-2">
            <Plus className="h-4 w-4" />
            Start New Audit
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading audits...</div>
        ) : audits.length === 0 ? (
          <div className="text-center py-16 border rounded-xl bg-card">
            <FileCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No audits yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Start your first compliance audit for this tenant.</p>
            <Button onClick={openModal} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Start New Audit
            </Button>
          </div>
        ) : (
          <div className="border rounded-xl bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Audit Date</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Auditor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Open CAAs</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map(audit => {
                  const status = STATUS_BADGE[audit.status] || STATUS_BADGE.draft;
                  return (
                    <TableRow key={audit.id}>
                      <TableCell className="text-sm">
                        {audit.audit_date ? format(new Date(audit.audit_date), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{audit.template_name}</TableCell>
                      <TableCell className="text-sm">{audit.auditor_name}</TableCell>
                      <TableCell>
                        <Badge className={status.className}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {audit.status === 'complete' && audit.score_pct !== null
                          ? `${Math.round(audit.score_pct)}%`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {(audit.open_caas || 0) > 0 ? (
                          <Badge className="bg-destructive/10 text-destructive">{audit.open_caas}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(audit.status === 'draft' || audit.status === 'in_progress') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => navigate(`/compliance-audits/${tid}/audit/${audit.id}`)}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Continue
                            </Button>
                          )}
                          {audit.status === 'complete' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => navigate(`/compliance-audits/${tid}/audit/${audit.id}/report`)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View Report
                            </Button>
                          )}
                          {audit.status !== 'archived' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs text-muted-foreground"
                              onClick={() => handleArchive(audit.id)}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Start New Audit Modal */}
        <AppModal open={showModal} onOpenChange={setShowModal}>
          <AppModalContent size="md">
            <AppModalHeader>
              <AppModalTitle>Start New Audit</AppModalTitle>
            </AppModalHeader>
            <AppModalBody className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Tenant</label>
                <Input value={tenantName} disabled />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Template</label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Audit Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(auditDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={auditDate}
                      onSelect={(d) => d && setAuditDate(d)}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Notes (optional)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes..." />
              </div>
            </AppModalBody>
            <AppModalFooter>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleCreate} isLoading={creating} disabled={!selectedTemplate}>
                Create Audit
              </Button>
            </AppModalFooter>
          </AppModalContent>
        </AppModal>
      </div>
    </DashboardLayout>
  );
}
