import { LinkedDocumentsList } from '@/components/documents/LinkedDocumentsList';

interface ClientSharePointDocumentsTabProps {
  tenantId: number;
  clientName: string;
}

export function ClientSharePointDocumentsTab({ tenantId, clientName }: ClientSharePointDocumentsTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">SharePoint & OneDrive Documents</h3>
        <p className="text-sm text-muted-foreground">
          Link documents from SharePoint or OneDrive to {clientName} for audit evidence and quick access.
        </p>
      </div>

      <LinkedDocumentsList
        clientId={tenantId}
        title={`Documents linked to ${clientName}`}
        showAddButton={true}
      />
    </div>
  );
}
