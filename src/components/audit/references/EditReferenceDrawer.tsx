import { useState, useEffect } from 'react';
import { FormModal, FormModalSection, FormModalRow } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateAuditReference } from '@/hooks/useAuditReferences';
import { SOURCE_OPTIONS, OUTCOME_OPTIONS, type AuditReferenceSource, type AuditReferenceOutcome, type ClientAuditReference } from '@/types/auditReferences';

interface EditReferenceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: ClientAuditReference | null;
}

export function EditReferenceDrawer({ open, onOpenChange, reference }: EditReferenceDrawerProps) {
  const updateMutation = useUpdateAuditReference();

  const [source, setSource] = useState<AuditReferenceSource>('other');
  const [sourceLabel, setSourceLabel] = useState('');
  const [auditType, setAuditType] = useState('');
  const [framework, setFramework] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [outcome, setOutcome] = useState<string>('__none__');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (reference) {
      setSource(reference.source);
      setSourceLabel(reference.source_label || '');
      setAuditType(reference.audit_type || '');
      setFramework(reference.standards_framework || '');
      setAuditDate(reference.audit_date || '');
      setAuditorName(reference.auditor_name || '');
      setOutcome(reference.audit_outcome || '__none__');
      setNotes(reference.notes || '');
    }
  }, [reference]);

  const handleSubmit = async () => {
    if (!reference) return;
    await updateMutation.mutateAsync({
      id: reference.id,
      subject_tenant_id: reference.subject_tenant_id,
      source,
      source_label: sourceLabel || null,
      audit_type: auditType || null,
      audit_date: auditDate || null,
      audit_outcome: outcome !== '__none__' ? (outcome as AuditReferenceOutcome) : null,
      auditor_name: auditorName || null,
      standards_framework: framework || null,
      notes: notes || null,
    });
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Reference"
      onSubmit={handleSubmit}
      submitText="Save Changes"
      isSubmitting={updateMutation.isPending}
      size="lg"
    >
      <FormModalSection>
        <div>
          <Label>Source</Label>
          <Select value={source} onValueChange={(v) => setSource(v as AuditReferenceSource)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Source Label</Label>
          <Input value={sourceLabel} onChange={e => setSourceLabel(e.target.value)} placeholder="e.g. NSW TAFE Commission Audit 2023" />
        </div>
      </FormModalSection>

      <FormModalSection>
        <FormModalRow>
          <div>
            <Label>Audit Type</Label>
            <Input value={auditType} onChange={e => setAuditType(e.target.value)} placeholder="e.g. Compliance Audit" />
          </div>
          <div>
            <Label>Standards Framework</Label>
            <Input value={framework} onChange={e => setFramework(e.target.value)} placeholder="e.g. SRTO 2025" />
          </div>
        </FormModalRow>
        <FormModalRow>
          <div>
            <Label>Audit Date</Label>
            <Input type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)} />
          </div>
          <div>
            <Label>Auditor / Organisation</Label>
            <Input value={auditorName} onChange={e => setAuditorName(e.target.value)} placeholder="e.g. ASQA" />
          </div>
        </FormModalRow>
        <div>
          <Label>Outcome</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not specified</SelectItem>
              {OUTCOME_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
      </FormModalSection>
    </FormModal>
  );
}
