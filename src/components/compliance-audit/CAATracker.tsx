import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { ComplianceCAA, ComplianceQuestion, ComplianceResponse } from '@/hooks/useComplianceAudits';

interface CAATrackerProps {
  caas: ComplianceCAA[];
  questions: ComplianceQuestion[];
  responses: ComplianceResponse[];
  onStatusChange: (caaId: string, status: string, verifiedBy?: string) => void;
  isReadOnly?: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-destructive/10 text-destructive',
  in_progress: 'bg-warning/10 text-warning',
  closed: 'bg-success/10 text-success',
  not_applicable: 'bg-muted text-muted-foreground',
};

export function CAATracker({ caas, questions, responses, onStatusChange, isReadOnly }: CAATrackerProps) {
  const [verifyMap, setVerifyMap] = useState<Record<string, string>>({});

  const getQuestionForResponse = (responseId: string) => {
    const resp = responses.find(r => r.id === responseId);
    if (!resp) return null;
    return questions.find(q => q.id === resp.question_id) || null;
  };

  const handleStatusSelect = (caaId: string, newStatus: string) => {
    if (newStatus === 'closed') {
      // Need verification name
      const name = verifyMap[caaId];
      if (!name) {
        setVerifyMap(prev => ({ ...prev, [caaId]: '' }));
        return;
      }
      onStatusChange(caaId, newStatus, name);
    } else {
      onStatusChange(caaId, newStatus);
    }
  };

  const activeCaas = caas.filter(c => c.status !== 'closed');

  if (activeCaas.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No open corrective actions.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">Open Corrective Actions</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Clause</TableHead>
            <TableHead>Finding</TableHead>
            <TableHead>Responsible</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Verified By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeCaas.map(caa => {
            const question = getQuestionForResponse(caa.response_id);
            const needsVerify = verifyMap[caa.id] !== undefined && caa.status !== 'closed';
            return (
              <TableRow key={caa.id}>
                <TableCell className="font-mono text-xs">{question?.clause || '—'}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{caa.description}</TableCell>
                <TableCell className="text-sm">{caa.responsible_person || '—'}</TableCell>
                <TableCell className="text-sm">
                  {caa.due_date ? format(new Date(caa.due_date), 'dd MMM yyyy') : '—'}
                </TableCell>
                <TableCell>
                  {isReadOnly ? (
                    <Badge className={STATUS_BADGE[caa.status]}>{caa.status}</Badge>
                  ) : (
                    <Select
                      value={caa.status}
                      onValueChange={(v) => handleStatusSelect(caa.id, v)}
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="not_applicable">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {caa.verified_at ? (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(caa.verified_at), 'dd MMM yyyy')}
                    </span>
                  ) : needsVerify ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 w-[100px] text-xs"
                        placeholder="Your name"
                        value={verifyMap[caa.id] || ''}
                        onChange={(e) => setVerifyMap(prev => ({ ...prev, [caa.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs px-2"
                        disabled={!verifyMap[caa.id]}
                        onClick={() => handleStatusSelect(caa.id, 'closed')}
                      >
                        Verify
                      </Button>
                    </div>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
