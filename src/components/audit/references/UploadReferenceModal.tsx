import { useState, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { FormModal, FormModalSection, FormModalRow } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCreateAuditReference } from '@/hooks/useAuditReferences';
import { SOURCE_OPTIONS, OUTCOME_OPTIONS, type AuditReferenceSource, type AuditReferenceOutcome } from '@/types/auditReferences';

interface UploadReferenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
}

const ACCEPTED_TYPES = '.pdf,.docx,.xlsx,.zip';
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export function UploadReferenceModal({ open, onOpenChange, tenantId }: UploadReferenceModalProps) {
  const createMutation = useCreateAuditReference();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<AuditReferenceSource>('other');
  const [sourceLabel, setSourceLabel] = useState('');
  const [auditType, setAuditType] = useState('');
  const [framework, setFramework] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [outcome, setOutcome] = useState<string>('__none__');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const resetForm = () => {
    setSource('other');
    setSourceLabel('');
    setAuditType('');
    setFramework('');
    setAuditDate('');
    setAuditorName('');
    setOutcome('__none__');
    setNotes('');
    setFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size > MAX_SIZE) {
      return;
    }
    setFile(f || null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.size <= MAX_SIZE) {
      setFile(f);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    await createMutation.mutateAsync({
      subject_tenant_id: tenantId,
      source,
      source_label: sourceLabel || undefined,
      audit_type: auditType || undefined,
      audit_date: auditDate || undefined,
      audit_outcome: outcome !== '__none__' ? (outcome as AuditReferenceOutcome) : undefined,
      auditor_name: auditorName || undefined,
      standards_framework: framework || undefined,
      notes: notes || undefined,
      file,
    });
    resetForm();
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}
      title="Upload Reference Audit"
      description="Upload a past audit report from an external source"
      onSubmit={handleSubmit}
      submitText="Upload"
      isSubmitting={createMutation.isPending}
      submitDisabled={!file}
      size="lg"
    >
      <FormModalSection title="Source">
        <div>
          <Label>Source *</Label>
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
          <Input
            value={sourceLabel}
            onChange={e => setSourceLabel(e.target.value)}
            placeholder="e.g. NSW TAFE Commission Audit 2023"
          />
        </div>
      </FormModalSection>

      <FormModalSection title="Audit Details">
        <FormModalRow>
          <div>
            <Label>Audit Type</Label>
            <Input
              value={auditType}
              onChange={e => setAuditType(e.target.value)}
              placeholder="e.g. Compliance Audit, Registration Audit"
            />
          </div>
          <div>
            <Label>Standards Framework</Label>
            <Input
              value={framework}
              onChange={e => setFramework(e.target.value)}
              placeholder="e.g. SRTO 2025, National Code 2018"
            />
          </div>
        </FormModalRow>
        <FormModalRow>
          <div>
            <Label>Audit Date</Label>
            <Input type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)} />
          </div>
          <div>
            <Label>Auditor / Organisation</Label>
            <Input
              value={auditorName}
              onChange={e => setAuditorName(e.target.value)}
              placeholder="e.g. ASQA, Sam Smith Consulting"
            />
          </div>
        </FormModalRow>
        <div>
          <Label>Outcome</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not specified</SelectItem>
              {OUTCOME_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormModalSection>

      <FormModalSection title="Notes">
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional context about this audit..."
          rows={3}
        />
      </FormModalSection>

      <FormModalSection title="File *">
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Drop file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">PDF · DOCX · XLSX · ZIP — max 100MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </FormModalSection>
    </FormModal>
  );
}
