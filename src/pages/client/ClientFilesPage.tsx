import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderOpen, ExternalLink, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

interface ReferenceLink {
  id: string;
  label: string;
  web_url: string;
}

export default function ClientFilesPage() {
  const { activeTenantId: tenantId } = useClientTenant();
  const [sharedFolderName, setSharedFolderName] = useState<string | null>(null);
  const [sharedFolderUrl, setSharedFolderUrl] = useState<string | null>(null);
  const [referenceLinks, setReferenceLinks] = useState<ReferenceLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      const [settingsRes, linksRes] = await Promise.all([
        supabase
          .from('tenant_sharepoint_settings')
          .select('shared_folder_name, shared_folder_url')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('tenant_sharepoint_reference_links')
          .select('id, label, web_url')
          .eq('tenant_id', tenantId)
          .eq('visibility', 'client')
          .order('sort_order'),
      ]);

      const s = settingsRes.data as any;
      setSharedFolderName(s?.shared_folder_name ?? null);
      setSharedFolderUrl(s?.shared_folder_url ?? null);

      setReferenceLinks((linksRes.data || []) as ReferenceLink[]);
      setLoading(false);
    };

    fetchData();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Access your client files and shared resources.
        </p>
      </div>

      {/* Shared Folder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Shared Folder
          </CardTitle>
          <CardDescription>
            Your organisation's shared document folder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sharedFolderUrl ? (
            <div className="space-y-3">
              {sharedFolderName && (
                <p className="text-sm font-medium">{sharedFolderName}</p>
              )}
              <Button asChild size="lg">
                <a href={sharedFolderUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Shared Folder
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your shared folder hasn't been configured yet. Contact your Vivacity consultant.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reference Library */}
      {referenceLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Reference Library
            </CardTitle>
            <CardDescription>
              Shared resources and guides from Vivacity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referenceLinks.map(link => (
                <a
                  key={link.id}
                  href={link.web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span className="text-sm font-medium flex-1">{link.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
