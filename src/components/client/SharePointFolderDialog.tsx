import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  FolderOpen,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  FolderSearch,
  Save,
  Settings2,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SharePointFileBrowser } from '@/components/documents/SharePointFileBrowser';

interface SharePointFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
}

export function SharePointFolderDialog({ open, onOpenChange, tenantId }: SharePointFolderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [provisioning, setProvisioning] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showSiteConfig, setShowSiteConfig] = useState(false);
  const [savingSiteConfig, setSavingSiteConfig] = useState(false);

  // Site config form state
  const [siteGraphId, setSiteGraphId] = useState('');
  const [siteDriveId, setSiteDriveId] = useState('');
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);

  // Tenant data
  const { data: tenant } = useQuery({
    queryKey: ['tenant-basic', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('name, rto_id, legal_name, status')
        .eq('id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!tenantId,
  });

  // Tenant SP settings
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['tenant-sharepoint-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_sharepoint_settings')
        .select('root_folder_url, manual_folder_url, setup_mode, provisioning_status, root_name, is_enabled, validation_status')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!tenantId,
  });

  // SharePoint sites (for config)
  const { data: spSites, refetch: refetchSites } = useQuery({
    queryKey: ['sharepoint-sites-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sharepoint_sites')
        .select('*')
        .eq('is_active', true)
        .order('purpose');
      return data || [];
    },
    enabled: open,
  });

  // Folder template
  const { data: template } = useQuery({
    queryKey: ['sharepoint-folder-template-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sharepoint_folder_templates')
        .select('id, name, base_subfolders')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: open,
  });

  const folderUrl = settings?.setup_mode === 'manual'
    ? settings?.manual_folder_url
    : settings?.root_folder_url;

  const isProvisioned = settings?.provisioning_status === 'success' && !!folderUrl;

  // Build expected folder name using the same convention as the edge function
  const buildExpectedFolderName = () => {
    if (!tenant) return '—';
    const rtoId = tenant.rto_id;
    const isKickStart = !rtoId || rtoId === 'TBA' || rtoId.startsWith('Replacing:');
    if (isKickStart) {
      return `KS-${tenant.name}`;
    }
    const displayName = tenant.legal_name || tenant.name;
    return `${rtoId} - ${displayName}`;
  };

  const expectedFolderName = buildExpectedFolderName();

  // Subfolders from template
  const subfolders: string[] = (template?.base_subfolders as string[]) || [];

  // Check if any site is missing config
  const clientSuccessSite = spSites?.find(s => s.purpose === 'client_success_files');
  const governanceSite = spSites?.find(s => s.purpose === 'governance_client_files');
  const primarySite = clientSuccessSite || governanceSite || spSites?.[0];
  const siteConfigured = primarySite?.graph_site_id && primarySite?.drive_id;

  // Populate form when site data loads
  useEffect(() => {
    if (primarySite) {
      setSiteGraphId(primarySite.graph_site_id || '');
      setSiteDriveId(primarySite.drive_id || '');
      setEditingSiteId(primarySite.id);
    }
  }, [primarySite?.id]);

  const handleSaveSiteConfig = async () => {
    if (!editingSiteId) return;
    setSavingSiteConfig(true);
    try {
      const { error } = await supabase
        .from('sharepoint_sites')
        .update({
          graph_site_id: siteGraphId || null,
          drive_id: siteDriveId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingSiteId);

      if (error) throw error;
      toast({ title: 'Site config saved', description: 'SharePoint site IDs updated.' });
      refetchSites();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSiteConfig(false);
    }
  };

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-tenant-sharepoint-folder', {
        body: { tenant_id: tenantId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Folder provisioned', description: `SharePoint folder created for ${tenant?.name}.` });
      refetch();
    } catch (err: any) {
      toast({ title: 'Provisioning failed', description: err.message, variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setShowBrowser(false); setShowSiteConfig(false); } }}>
      <DialogContent className={showBrowser ? "sm:max-w-4xl max-h-[85vh] overflow-y-auto" : "sm:max-w-lg max-h-[85vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            SharePoint Client Folder
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Tenant info */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Client</span>
                <span className="text-sm">{tenant?.name || '—'}</span>
              </div>
              {tenant?.rto_id && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RTO ID</span>
                  <span className="text-sm">{tenant.rto_id}</span>
                </div>
              )}
              {tenant?.legal_name && tenant.legal_name !== tenant.name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Legal Name</span>
                  <span className="text-sm">{tenant.legal_name}</span>
                </div>
              )}
            </div>

            {/* Folder name preview */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Folder Name Preview</div>
              <div className="flex items-center gap-2 rounded bg-muted px-3 py-2">
                <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-mono font-medium">{expectedFolderName}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Convention: <code className="bg-muted px-1 rounded">{'{{RTO ID}} - {{Legal Name || Name}}'}</code> or <code className="bg-muted px-1 rounded">{'KS-{{Name}}'}</code> for KickStart
              </p>
            </div>

            {/* Subfolders that will be created */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Subfolders to Create</div>
                {template && (
                  <Badge variant="secondary" className="text-xs">Template: {template.name}</Badge>
                )}
              </div>
              {subfolders.length > 0 ? (
                <div className="space-y-1">
                  {subfolders.map((folder, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                      <span>{folder}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No active folder template found. Subfolders won't be created during provisioning.
                </p>
              )}
            </div>

            {/* Status */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                {isProvisioned ? (
                  <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Provisioned
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-50 text-orange-800">
                    <AlertCircle className="h-3 w-3" />
                    Not provisioned
                  </Badge>
                )}
              </div>
              {settings?.root_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Folder name</span>
                  <span className="text-sm">{settings.root_name}</span>
                </div>
              )}
              {settings?.setup_mode && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Setup mode</span>
                  <Badge variant="secondary" className="text-xs">{settings.setup_mode}</Badge>
                </div>
              )}
            </div>

            {/* Site Configuration (collapsible) */}
            <div className="rounded-md border">
              <button
                type="button"
                className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setShowSiteConfig(!showSiteConfig)}
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  SharePoint Site Configuration
                </span>
                <div className="flex items-center gap-2">
                  {siteConfigured ? (
                    <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-50 text-emerald-800 text-xs">
                      <CheckCircle2 className="h-3 w-3" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 border-red-500/40 bg-red-50 text-red-800 text-xs">
                      <AlertCircle className="h-3 w-3" />
                      Not configured
                    </Badge>
                  )}
                  <ChevronRight className={`h-4 w-4 transition-transform ${showSiteConfig ? 'rotate-90' : ''}`} />
                </div>
              </button>
              {showSiteConfig && (
                <div className="px-3 pb-3 space-y-3 border-t pt-3">
                  {primarySite ? (
                    <>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Site: {primarySite.site_name}</span>
                        <span>Purpose: {primarySite.purpose}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label htmlFor="graph-site-id" className="text-xs">Graph Site ID</Label>
                          <Input
                            id="graph-site-id"
                            value={siteGraphId}
                            onChange={(e) => setSiteGraphId(e.target.value)}
                            placeholder="e.g. contoso.sharepoint.com,abc123,def456"
                            className="text-xs font-mono"
                          />
                        </div>
                        <div>
                          <Label htmlFor="drive-id" className="text-xs">Drive ID</Label>
                          <Input
                            id="drive-id"
                            value={siteDriveId}
                            onChange={(e) => setSiteDriveId(e.target.value)}
                            placeholder="e.g. b!abc123def456..."
                            className="text-xs font-mono"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {"Get these from Graph Explorer: "}
                          <code className="bg-muted px-1 rounded">{"GET /sites/{hostname}:/sites/{sitename}"}</code>
                          {" for site ID, then "}
                          <code className="bg-muted px-1 rounded">{"GET /sites/{siteId}/drive"}</code>
                          {" for drive ID."}
                        </p>
                        <Button
                          size="sm"
                          onClick={handleSaveSiteConfig}
                          disabled={savingSiteConfig || (!siteGraphId && !siteDriveId)}
                        >
                          {savingSiteConfig ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Save className="h-4 w-4 mr-1" />
                          )}
                          Save Site Config
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No SharePoint site registered. Add a row to <code>sharepoint_sites</code> first.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Actions */}
            {isProvisioned && folderUrl ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" asChild>
                    <a href={folderUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in SharePoint
                    </a>
                  </Button>
                  <Button
                    className="flex-1"
                    variant={showBrowser ? 'secondary' : 'default'}
                    onClick={() => setShowBrowser(!showBrowser)}
                  >
                    <FolderSearch className="h-4 w-4 mr-2" />
                    {showBrowser ? 'Hide Browser' : 'Browse Files'}
                  </Button>
                </div>
                {showBrowser && (
                  <div className="mt-4">
                    <SharePointFileBrowser tenantId={tenantId} />
                  </div>
                )}
              </div>
            ) : (
              <>
                {!siteConfigured && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      SharePoint site IDs are not configured. Expand "Site Configuration" above and set the Graph Site ID and Drive ID before provisioning.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  className="w-full"
                  onClick={handleProvision}
                  disabled={provisioning || tenant?.status !== 'active' || !siteConfigured}
                >
                  {provisioning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FolderPlus className="h-4 w-4 mr-2" />
                  )}
                  Provision SharePoint Folder
                </Button>
                {tenant?.status !== 'active' && (
                  <p className="text-xs text-muted-foreground text-center">
                    Provisioning is only available for active tenants.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
