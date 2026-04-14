import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useUpdateAudit, useInternalUsers } from '@/hooks/useAuditWorkspace';
import { EvidenceRequestsSection } from './EvidenceRequestsSection';
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

  const handleBlur = (field: string, value: any) => {
    updateAudit.mutate({ [field]: value || null } as any);
  };

  const saveSnapshot = () => {
    updateAudit.mutate(snapshot as any);
    setShowSnapshot(false);
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
                onBlur={(e) => handleBlur('conducted_at', e.target.value || null)}
              />
            </div>
            <div>
              <Label className="text-xs">Next Audit Due</Label>
              <Input
                type="date"
                defaultValue={audit.next_audit_due || ''}
                onBlur={(e) => handleBlur('next_audit_due', e.target.value || null)}
              />
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
            <Select
              value={audit.risk_rating || '__none__'}
              onValueChange={(v) => handleBlur('risk_rating', v === '__none__' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Not assessed" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not Assessed</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audit.score_pct !== null && (
            <div>
              <Label className="text-xs">Score</Label>
              <p className="text-2xl font-bold">{audit.score_pct}%</p>
            </div>
          )}
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

      {/* Client Snapshot */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Client Details Snapshot</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSnapshot(!showSnapshot)}>
              {showSnapshot ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showSnapshot ? 'Close' : 'Edit'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            These details are captured at the time of the audit and appear in the final report.
          </p>
        </CardHeader>
        <CardContent>
          {!showSnapshot ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['RTO Name', audit.snapshot_rto_name],
                ['RTO Number', audit.snapshot_rto_number],
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
              {Object.entries(snapshot).map(([key, val]) => (
                <div key={key}>
                  <Label className="text-xs">{key.replace('snapshot_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Label>
                  <Input
                    value={val}
                    onChange={(e) => setSnapshot(s => ({ ...s, [key]: e.target.value }))}
                  />
                </div>
              ))}
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
