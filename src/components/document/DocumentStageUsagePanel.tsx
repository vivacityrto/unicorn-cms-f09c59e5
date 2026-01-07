import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, Package, Pin, Loader2 } from 'lucide-react';
import { useDocumentStageUsage } from '@/hooks/useDocumentVersions';

interface DocumentStageUsagePanelProps {
  documentId: number;
}

export function DocumentStageUsagePanel({ documentId }: DocumentStageUsagePanelProps) {
  const { usage, loading } = useDocumentStageUsage(documentId);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Stage Usage
        </CardTitle>
        <CardDescription>
          {usage.length} stage{usage.length !== 1 ? 's' : ''} using this document
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Not linked to any stages</p>
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {usage.map((item) => (
                <div 
                  key={item.stage_id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.stage_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Package className="h-3 w-3" />
                        {item.package_count} package{Number(item.package_count) !== 1 ? 's' : ''}
                      </Badge>
                      {item.pinned_version_id && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Pin className="h-3 w-3" />
                          Pinned v{item.pinned_version_number}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
