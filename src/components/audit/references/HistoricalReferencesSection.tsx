import { useState } from 'react';
import { Plus, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientAuditReferences } from '@/hooks/useAuditReferences';
import { ReferenceCard } from './ReferenceCard';
import { UploadReferenceModal } from './UploadReferenceModal';
import { EditReferenceDrawer } from './EditReferenceDrawer';
import type { ClientAuditReference } from '@/types/auditReferences';

interface HistoricalReferencesSectionProps {
  tenantId: number;
}

export function HistoricalReferencesSection({ tenantId }: HistoricalReferencesSectionProps) {
  const { data: references = [], isLoading } = useClientAuditReferences(tenantId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editRef, setEditRef] = useState<ClientAuditReference | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Historical Reference Audits
        </h3>
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Upload Reference
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : references.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border rounded-lg">
          <Archive className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No reference audits uploaded yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Upload iAuditor reports, ASQA letters, or other external audit documents using the button above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {references.map(ref => (
            <ReferenceCard key={ref.id} reference={ref} onEdit={setEditRef} />
          ))}
        </div>
      )}

      <UploadReferenceModal open={uploadOpen} onOpenChange={setUploadOpen} tenantId={tenantId} />
      <EditReferenceDrawer open={!!editRef} onOpenChange={(o) => { if (!o) setEditRef(null); }} reference={editRef} />
    </div>
  );
}
