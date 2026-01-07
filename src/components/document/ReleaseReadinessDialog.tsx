import { useState, useEffect } from 'react';
import { useDocumentReadiness, ReleaseReadiness } from '@/hooks/useExcelDataSources';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  CheckCircle2, AlertTriangle, XCircle, Loader2, 
  ShieldAlert, FileCheck 
} from 'lucide-react';

interface ReleaseReadinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentIds: number[];
  tenantId?: number;
  onConfirmRelease: () => void;
}

export function ReleaseReadinessDialog({
  open,
  onOpenChange,
  documentIds,
  tenantId,
  onConfirmRelease
}: ReleaseReadinessDialogProps) {
  const { validateReleaseReadiness } = useDocumentReadiness();
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  useEffect(() => {
    if (open && documentIds.length > 0) {
      const validate = async () => {
        setLoading(true);
        setOverrideConfirmed(false);
        const result = await validateReleaseReadiness(documentIds, tenantId);
        setReadiness(result);
        setLoading(false);
      };
      validate();
    }
  }, [open, documentIds, tenantId]);

  const handleRelease = () => {
    onConfirmRelease();
    onOpenChange(false);
  };

  const getStatusIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const canRelease = readiness?.can_release || (readiness?.requires_override && overrideConfirmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Release Readiness Check
          </DialogTitle>
          <DialogDescription>
            Validating {documentIds.length} document{documentIds.length !== 1 ? 's' : ''} for release
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Checking document readiness...</p>
          </div>
        ) : readiness ? (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-center gap-4 py-4 bg-muted/30 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {readiness.summary.pass}
                </div>
                <div className="text-xs text-muted-foreground">Pass</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-500">
                  {readiness.summary.warn}
                </div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">
                  {readiness.summary.fail}
                </div>
                <div className="text-xs text-muted-foreground">Failures</div>
              </div>
            </div>

            {/* Document Details */}
            <ScrollArea className="h-[250px]">
              <Accordion type="multiple" className="space-y-2">
                {readiness.documents.map((doc) => {
                  const overallStatus = 
                    doc.readiness.merge_status === 'fail' || doc.readiness.data_sources_status === 'fail'
                      ? 'fail'
                      : doc.readiness.merge_status === 'warn' || doc.readiness.data_sources_status === 'warn'
                        ? 'warn'
                        : 'pass';
                  
                  return (
                    <AccordionItem 
                      key={doc.document_id} 
                      value={String(doc.document_id)}
                      className="border rounded-lg px-3"
                    >
                      <AccordionTrigger className="py-2 hover:no-underline">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(overallStatus)}
                          <span className="font-medium text-sm">
                            {doc.document_name || `Document #${doc.document_id}`}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Merge Fields:</span>
                            <Badge variant={doc.readiness.merge_status === 'pass' ? 'default' : doc.readiness.merge_status === 'warn' ? 'secondary' : 'destructive'}>
                              {doc.readiness.merge_status}
                            </Badge>
                          </div>
                          {doc.readiness.missing_fields.length > 0 && (
                            <ul className="text-xs text-muted-foreground list-disc list-inside pl-2">
                              {doc.readiness.missing_fields.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          )}
                          
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Data Sources:</span>
                            <Badge variant={doc.readiness.data_sources_status === 'pass' ? 'default' : doc.readiness.data_sources_status === 'warn' ? 'secondary' : 'destructive'}>
                              {doc.readiness.data_sources_status}
                            </Badge>
                          </div>
                          {doc.readiness.missing_tables.length > 0 && (
                            <ul className="text-xs text-muted-foreground list-disc list-inside pl-2">
                              {doc.readiness.missing_tables.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </ScrollArea>

            {/* Override Warning */}
            {readiness.requires_override && (
              <div className="border border-destructive/50 bg-destructive/5 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      Some documents failed readiness checks
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Releasing documents with failures may result in incomplete or unusable files for the tenant.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={overrideConfirmed}
                        onCheckedChange={(checked) => setOverrideConfirmed(checked === true)}
                      />
                      <span className="text-xs">
                        I understand the risks and want to release anyway
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            Failed to validate documents
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleRelease}
            disabled={loading || !canRelease}
          >
            {readiness?.summary.warn && readiness.summary.warn > 0 
              ? 'Release with Warnings'
              : 'Release Documents'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
