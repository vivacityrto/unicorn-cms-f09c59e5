import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Send, 
  Download, 
  CheckCircle2, 
  Eye, 
  EyeOff,
  FileText,
  Calendar,
  Loader2
} from 'lucide-react';
import { useTenantDocumentReleases, TenantDocumentRelease } from '@/hooks/useDocumentVersions';
import { formatDistanceToNow } from 'date-fns';

interface TenantDocumentReleasesPanelProps {
  tenantId: number;
  tenantName?: string;
}

export function TenantDocumentReleasesPanel({ 
  tenantId,
  tenantName 
}: TenantDocumentReleasesPanelProps) {
  const { 
    releases, 
    loading, 
    toggleVisibility,
    acknowledgeDocument 
  } = useTenantDocumentReleases(tenantId);

  const visibleReleases = releases.filter(r => r.is_visible_to_tenant);
  const acknowledgedCount = releases.filter(r => r.acknowledged_at).length;
  const downloadedCount = releases.filter(r => r.downloaded_at).length;

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
          <Send className="h-4 w-4" />
          Released Documents
        </CardTitle>
        <CardDescription>
          {releases.length} document{releases.length !== 1 ? 's' : ''} released
          {tenantName && ` to ${tenantName}`}
          {' • '}
          {visibleReleases.length} visible • {downloadedCount} downloaded • {acknowledgedCount} acknowledged
        </CardDescription>
      </CardHeader>
      <CardContent>
        {releases.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No documents released yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {releases.map((release) => (
                <ReleaseCard 
                  key={release.id} 
                  release={release}
                  onToggleVisibility={(visible) => toggleVisibility(release.id, visible)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function ReleaseCard({ 
  release,
  onToggleVisibility
}: { 
  release: TenantDocumentRelease;
  onToggleVisibility: (visible: boolean) => void;
}) {
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (visible: boolean) => {
    setUpdating(true);
    await onToggleVisibility(visible);
    setUpdating(false);
  };

  return (
    <div className={`p-3 rounded-lg border ${
      release.is_visible_to_tenant 
        ? 'bg-muted/30' 
        : 'bg-muted/10 opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">
              {release.document?.title || 'Unknown Document'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {release.version && (
              <Badge variant="outline" className="text-xs">
                v{release.version.version_number}
              </Badge>
            )}
            
            {release.downloaded_at && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Download className="h-3 w-3" />
                Downloaded
              </Badge>
            )}
            
            {release.acknowledged_at && (
              <Badge className="text-xs gap-1 bg-green-100 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3" />
                Acknowledged
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Released {formatDistanceToNow(new Date(release.released_at), { addSuffix: true })}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor={`visible-${release.id}`} className="text-xs text-muted-foreground flex items-center gap-1">
            {release.is_visible_to_tenant ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </Label>
          <Switch
            id={`visible-${release.id}`}
            checked={release.is_visible_to_tenant}
            onCheckedChange={handleToggle}
            disabled={updating}
            className="scale-75"
          />
        </div>
      </div>
    </div>
  );
}
