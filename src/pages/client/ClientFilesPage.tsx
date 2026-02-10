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
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [referenceLinks, setReferenceLinks] = useState<ReferenceLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetch = async () => {
      const [settingsRes, linksRes] = await Promise.all([
        supabase
          .from('tenant_sharepoint_settings')
          .select('root_folder_url, provisioning_status, client_access_enabled')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('tenant_sharepoint_reference_links')
          .select('id, label, web_url')
          .eq('tenant_id', tenantId)
          .eq('visibility', 'client')
          .order('sort_order'),
      ]);

      const s = settingsRes.data;
      if (s?.provisioning_status === 'success' && s?.client_access_enabled && s?.root_folder_url) {
        setFolderUrl(s.root_folder_url);
      }

      setReferenceLinks((linksRes.data || []) as ReferenceLink[]);
      setLoading(false);
    };

    fetch();
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

      {/* Client Folder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Client SharePoint Folder
          </CardTitle>
          <CardDescription>
            This folder is used for shared audit evidence and client files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {folderUrl ? (
            <Button asChild size="lg">
              <a href={folderUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Client Files
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              No folder has been configured yet. Contact your Vivacity consultant for access.
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
