import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, RotateCcw, Ban, FileText, Download } from 'lucide-react';
import type { AuditAction } from '@/types/auditWorkspace';
import { supabase } from '@/integrations/supabase/client';

interface VerificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: AuditAction | null;
  onVerify: (actionId: string, decision: 'verified' | 'rejected' | 'waived', notes: string) => void;
}

export function VerificationDrawer({ open, onOpenChange, action, onVerify }: VerificationDrawerProps) {
  const [notes, setNotes] = useState('');

  if (!action) return null;

  const handleDecision = (decision: 'verified' | 'rejected' | 'waived') => {
    onVerify(action.id, decision, notes.trim());
    setNotes('');
    onOpenChange(false);
  };

  const evidenceIds = action.evidence_document_ids || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Verify Action</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Action context */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{action.title}</h3>
            {action.standard_reference && (
              <p className="text-xs text-muted-foreground">Standard ref: {action.standard_reference}</p>
            )}
          </div>

          {/* Client response */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Client Response</Label>
            {action.client_response ? (
              <div className="rounded-md border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {action.client_response}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No response submitted yet.</p>
            )}
            {action.client_response_at && (
              <p className="text-xs text-muted-foreground">
                Submitted: {new Date(action.client_response_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {/* Evidence documents */}
          {evidenceIds.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Uploaded Evidence ({evidenceIds.length})</Label>
              <div className="space-y-1">
                {evidenceIds.map((docId, i) => (
                  <div key={docId} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">Document {i + 1}</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2">
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verification notes */}
          <div>
            <Label className="text-xs">Verification Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about the verification decision..."
            />
          </div>

          {/* Decision buttons */}
          <div className="space-y-2 pt-4 border-t">
            <Button onClick={() => handleDecision('verified')} className="w-full bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Verified — Mark Complete
            </Button>
            <Button onClick={() => handleDecision('rejected')} variant="outline" className="w-full border-amber-300 text-amber-700 hover:bg-amber-50">
              <RotateCcw className="h-4 w-4 mr-2" /> Request Resubmission
            </Button>
            <Button onClick={() => handleDecision('waived')} variant="ghost" className="w-full text-muted-foreground">
              <Ban className="h-4 w-4 mr-2" /> Waive — No Verification Needed
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
