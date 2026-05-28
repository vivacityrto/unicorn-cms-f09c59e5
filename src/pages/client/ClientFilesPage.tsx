import { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderOpen,
  ExternalLink,
  BookOpen,
  Folder,
  FileText,
  ChevronLeft,
  Download,
  Loader2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useSharePointBrowser } from '@/hooks/useSharePointBrowser';

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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const browser = useSharePointBrowser(tenantId, { useSharedFolder: true });

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

              {/* Inline folder browser */}
              <div className="mt-6 border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  {browser.folderStack.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={browser.navigateBack}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                  )}
                  <nav className="flex items-center gap-1 text-muted-foreground flex-wrap">
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={browser.navigateToRoot}
                    >
                      {sharedFolderName ?? 'Shared Folder'}
                    </button>
                    {browser.folderStack.slice(1).map((seg, i) => (
                      <span key={`${seg.id}-${i}`} className="flex items-center gap-1">
                        <span>/</span>
                        <span>{seg.name}</span>
                      </span>
                    ))}
                  </nav>
                </div>

                {browser.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : browser.error ? (
                  <p className="text-sm text-destructive">
                    {(browser.error as Error).message || 'Failed to load folder contents.'}
                  </p>
                ) : browser.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">This folder is empty.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {browser.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 p-2.5">
                        {item.is_folder ? (
                          <>
                            <Folder className="h-4 w-4 text-primary shrink-0" />
                            <button
                              type="button"
                              className="text-sm font-medium text-left flex-1 hover:underline"
                              onClick={() => browser.navigateToFolder(item.id, item.name)}
                            >
                              {item.name}
                            </button>
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm flex-1 truncate">{item.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={browser.downloading === item.id}
                              onClick={() => browser.downloadFile(item.id, item.name)}
                            >
                              {browser.downloading === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
