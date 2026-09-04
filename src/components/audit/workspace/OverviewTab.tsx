import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';
import { useUpdateAudit, useInternalUsers } from '@/hooks/useAuditWorkspace';
import { EvidenceRequestsSection } from './EvidenceRequestsSection';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { TgaRtoLookupRow } from '@/components/audit/TgaRtoLookupRow';
import type { TargetRtoSnapshot } from '@/lib/tga/lookupTargetRto';
import { toast } from 'sonner';
import { formatDateLong } from '@/lib/utils';
import type { ClientAudit, AuditRisk } from '@/types/clientAudits';

interface OverviewTabProps {
  audit: ClientAudit;
}

export function OverviewTab({ audit }: OverviewTabProps) {
  const updateAudit = useUpdateAudit(audit.id);
  const { data: users } = useInternalUsers();
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState({
    snapshot_rto_name: audit.snapshot_rto_name || '',
    snapshot_rto_number: audit.snapshot_rto_number || '',
    snapshot_cricos_code: audit.snapshot_cricos_code || '',
    snapshot_site_address: audit.snapshot_site_address || '',
    snapshot_ceo: audit.snapshot_ceo || '',
    snapshot_phone: audit.snapshot_phone || '',
    snapshot_email: audit.snapshot_email || '',
    snapshot_website: audit.snapshot_website || '',
  });

  type OverviewTextField =
    | 'title' | 'doc_number' | 'conducted_at' | 'next_audit_due'
    | 'lead_auditor_id' | 'assisted_by_id' | 'report_prepared_by_id'
    | 'executive_summary' | 'overall_finding';

  const handleBlur = (field: OverviewTextField, value: string | null) => {
    updateAudit.mutate({ [field]: value || null } as Partial<ClientAudit>);
  };

  // Native <input type="date"> renders its placeholder/value in the
  // browser's own locale (mm/dd/yyyy on a US-configured environment) with no
  // way to force it to the app's DD Month YYYY convention - these mirror the
  // field's live value just to show it spelled out underneath, without
  // changing how the date is actually picked or saved (still on blur).
  const [conductedAtPreview, setConductedAtPreview] = useState(audit.conducted_at?.split('T')[0] || '');
  const [nextAuditDuePreview, setNextAuditDuePreview] = useState(audit.next_audit_due || '');

  const saveSnapshot = () => {
    updateAudit.mutate(snapshot);
    setShowSnapshot(false);
  };

  const isDueDiligence =
    audit.audit_type === 'due_diligence' || audit.audit_type === 'due_diligence_combined';

  const applyTgaSnapshot = (incoming: TargetRtoSnapshot) => {
    const fieldMap: Array<[keyof typeof snapshot, string]> = [
      ['snapshot_rto_name', incoming.rto_name],
      ['snapshot_rto_number', incoming.rto_number],
      ['snapshot_site_address', incoming.site_address],
      ['snapshot_phone', incoming.phone],
      ['snapshot_email', incoming.email],
      ['snapshot_website', incoming.website],
      ['snapshot_ceo', incoming.ceo],
    ];
    const hasManualEntry = fieldMap.some(([key, val]) => snapshot[key] && val && snapshot[key] !== val);
    const apply = () => {
      setSnapshot(prev => {
        const next = { ...prev };
        fieldMap.forEach(([key, val]) => {
          if (val) next[key] = val;
        });
        return next;
      });
    };
    if (hasManualEntry) {
      toast('Overwrite manual entries with TGA data?', {
        action: { label: 'Replace', onClick: apply },
        cancel: { label: 'Keep mine', onClick: () => {} },
      });
    } else {
      apply();
    }
  };

  return (
    <div className="space-y-6">
      {/* Audit Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Audit Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                defaultValue={audit.title || ''}
                onBlur={(e) => handleBlur('title', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Doc Number</Label>
              <Input
                defaultValue={audit.doc_number || ''}
                onBlur={(e) => handleBlur('doc_number', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Conducted On</Label>
              <Input
                type="date"
                defaultValue={audit.conducted_at?.split('T')[0] || ''}
                onChange={(e) => setConductedAtPreview(e.target.value)}
                onBlur={(e) => handleBlur('conducted_at', e.target.value || null)}
              />
              {conductedAtPreview && (
                <p className="text-xs text-muted-foreground mt-1">{formatDateLong(conductedAtPreview)}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Next Audit Due</Label>
              <Input
                type="date"
                defaultValue={audit.next_audit_due || ''}
                onChange={(e) => setNextAuditDuePreview(e.target.value)}
                onBlur={(e) => handleBlur('next_audit_due', e.target.value || null)}
              />
              {nextAuditDuePreview && (
                <p className="text-xs text-muted-foreground mt-1">{formatDateLong(nextAuditDuePreview)}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Lead Auditor</Label>
              <Select
                value={audit.lead_auditor_id || '__none__'}
                onValueChange={(v) => handleBlur('lead_auditor_id', v === '__none__' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Assisted By</Label>
              <Select
                value={audit.assisted_by_id || '__none__'}
                onValueChange={(v) => handleBlur('assisted_by_id', v === '__none__' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Report Prepared By</Label>
              <Select
                value={audit.report_prepared_by_id || '__none__'}
                onValueChange={(v) => handleBlur('report_prepared_by_id', v === '__none__' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk & Score */}
      <Card>
        <CardHeader><CardTitle className="text-base">Risk & Score</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Overall Risk Rating</Label>
            <div className="mt-1 flex items-center gap-2">
              {audit.risk_rating ? (
                <AuditRiskBadge risk={audit.risk_rating} />
              ) : (
                <span className="text-sm text-muted-foreground">Not yet rated (no findings raised)</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Auto-derived from finding priorities. Add or update findings to change this.
            </p>
          </div>
          <div>
            <Label className="text-xs">Executive Summary</Label>
            <Textarea
              defaultValue={audit.executive_summary || ''}
              onBlur={(e) => handleBlur('executive_summary', e.target.value)}
              rows={4}
              placeholder="Enter the executive summary for this audit..."
            />
          </div>
          <div>
            <Label className="text-xs">Overall Finding</Label>
            <Textarea
              defaultValue={audit.overall_finding || ''}
              onBlur={(e) => handleBlur('overall_finding', e.target.value)}
              rows={4}
              placeholder="Enter the overall finding..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Snapshot — Target RTO for DD audits, Client Details otherwise */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {isDueDiligence && <Target className="h-4 w-4 text-primary" />}
              {isDueDiligence ? 'Target RTO Snapshot' : 'Client Details Snapshot'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSnapshot(!showSnapshot)}>
              {showSnapshot ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showSnapshot ? 'Close' : 'Edit'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isDueDiligence
              ? 'These details describe the Target RTO being assessed and appear in the final report.'
              : 'These details are captured at the time of the audit and appear in the final report.'}
          </p>
        </CardHeader>
        <CardContent>
          {!showSnapshot ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                [isDueDiligence ? 'Target RTO Name' : 'RTO Name', audit.snapshot_rto_name],
                [isDueDiligence ? 'Target RTO Number' : 'RTO Number', audit.snapshot_rto_number],
                ['CRICOS Code', audit.snapshot_cricos_code],
                ['Site Address', audit.snapshot_site_address],
                ['CEO', audit.snapshot_ceo],
                ['Phone', audit.snapshot_phone],
                ['Email', audit.snapshot_email],
                ['Website', audit.snapshot_website],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm">{(val as string) || '—'}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {isDueDiligence && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <TgaRtoLookupRow
                    initialCode={snapshot.snapshot_rto_number}
                    onResult={applyTgaSnapshot}
                    helperText="Refreshes Target RTO Name, Number, Address, Phone, Email, Website and CEO from training.gov.au. CRICOS Code is not included."
                  />
                </div>
              )}
              {Object.entries(snapshot).map(([key, val]) => {
                const baseLabel = key
                  .replace('snapshot_', '')
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase());
                const label = isDueDiligence && key === 'snapshot_rto_name'
                  ? 'Target RTO Name'
                  : isDueDiligence && key === 'snapshot_rto_number'
                  ? 'Target RTO Number'
                  : baseLabel;
                return (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={val}
                      onChange={(e) => setSnapshot(s => ({ ...s, [key]: e.target.value }))}
                    />
                  </div>
                );
              })}
              <Button size="sm" onClick={saveSnapshot}>Save Snapshot</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence Requests */}
      <EvidenceRequestsSection audit={audit} />
    </div>
  );
}
