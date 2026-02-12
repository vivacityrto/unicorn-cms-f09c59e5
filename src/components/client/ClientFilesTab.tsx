import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  ExternalLink,
  RefreshCw,
  Link2,
  RotateCcw,
  FolderPlus,
  BookOpen,
  FolderTree,
  ClipboardPaste,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ClientFilesTabProps {
  tenantId: number;
  clientName: string;
}

interface SharePointSettings {
  id: string;
  tenant_id: number;
  root_folder_url: string | null;
  drive_id: string | null;
  root_item_id: string | null;
  root_name: string | null;
  folder_name: string | null;
  folder_path: string | null;
  site_id: string | null;
  base_path: string | null;
  is_enabled: boolean;
  last_validated_at: string | null;
  validation_status: string;
  validation_error: string | null;
  provisioning_status: string;
  provisioning_error: string | null;
  client_access_enabled: boolean;
  template_id: string | null;
  setup_mode: string;
  manual_folder_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ReferenceLink {
  id: string;
  label: string;
  web_url: string;
  visibility: string;
  sort_order: number;
}

interface SeedRun {
  id: string;
  status: string;
  subfolders_created: number;
  files_copied: number;
  links_created: number;
  errors: string[];
  completed_at: string | null;
}

/** Returns the effective folder URL based on setup mode. */
function getEffectiveFolderUrl(settings: SharePointSettings | null): string | null {
  if (!settings) return null;
  if (settings.setup_mode === 'manual') return settings.manual_folder_url || null;
  return settings.root_folder_url || null;
}

export function ClientFilesTab({ tenantId, clientName }: ClientFilesTabProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SharePointSettings | null>(null);
  const [referenceLinks, setReferenceLinks] = useState<ReferenceLink[]>([]);
  const [seedRun, setSeedRun] = useState<SeedRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [manualEditing, setManualEditing] = useState(false);
  const [manualUrlInput, setManualUrlInput] = useState('');

  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const fetchAll = useCallback(async () => {
    const [settingsRes, linksRes, seedRes] = await Promise.all([
      supabase
        .from('tenant_sharepoint_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('tenant_sharepoint_reference_links')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order'),
      supabase
        .from('tenant_sharepoint_seed_runs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (settingsRes.error) console.error('[ClientFiles] Settings error:', settingsRes.error);
    const s = settingsRes.data as SharePointSettings | null;
    setSettings(s);
    if (s) setManualUrlInput(s.manual_folder_url || s.root_folder_url || '');

    setReferenceLinks((linksRes.data || []) as ReferenceLink[]);
    setSeedRun(seedRes.data as SeedRun | null);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const effectiveUrl = getEffectiveFolderUrl(settings);

  // ── Auto-provision handler ──
  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'provision-tenant-sharepoint-folder',
        { body: { tenant_id: tenantId } }
      );

      if (error) {
        toast({ title: 'Provisioning failed', description: error.message, variant: 'destructive' });
      } else if (data?.success) {
        const details = data.already_provisioned
          ? 'SharePoint folder was already set up.'
          : `Created "${data.folder_name}" with ${data.subfolders_created || 0} subfolders.`;
        toast({
          title: data.already_provisioned ? 'Already provisioned' : 'Folder created',
          description: details,
        });
      } else {
        toast({ title: 'Provisioning failed', description: data?.error || 'Unknown error', variant: 'destructive' });
      }
      await fetchAll();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  // ── Manual paste handler ──
  const handleManualSave = async () => {
    const trimmedUrl = manualUrlInput.trim();
    if (!trimmedUrl || !trimmedUrl.startsWith('https://')) {
      toast({ title: 'Invalid URL', description: 'Please enter a valid https:// SharePoint URL.', variant: 'destructive' });
      return;
    }

    // Basic SharePoint URL validation
    const isSharePointUrl = /sharepoint\.com|onedrive\.com/i.test(trimmedUrl);
    if (!isSharePointUrl) {
      toast({ title: 'Invalid URL', description: 'URL must be a SharePoint or OneDrive folder link.', variant: 'destructive' });
      return;
    }

    setValidating(true);
    try {
      const now = new Date().toISOString();

      if (settings) {
        // Update existing row
        const { error } = await supabase
          .from('tenant_sharepoint_settings')
          .update({
            setup_mode: 'manual',
            manual_folder_url: trimmedUrl,
            provisioning_status: 'success',
            last_validated_at: now,
            validation_status: 'valid',
            validation_error: null,
            updated_at: now,
          })
          .eq('tenant_id', tenantId);

        if (error) throw error;
      } else {
        // Insert new row
        const { error } = await supabase
          .from('tenant_sharepoint_settings')
          .insert({
            tenant_id: tenantId,
            setup_mode: 'manual',
            manual_folder_url: trimmedUrl,
            provisioning_status: 'success',
            last_validated_at: now,
            validation_status: 'valid',
            is_enabled: true,
            created_by: profile?.user_uuid || '',
          });

        if (error) throw error;
      }

      // Emit timeline event
      await supabase.from('client_timeline_events').insert({
        tenant_id: tenantId,
        client_id: String(tenantId),
        event_type: 'sharepoint_root_configured',
        title: 'SharePoint folder linked manually',
        body: `Folder URL set manually by ${profile?.first_name || 'Vivacity'}.`,
        metadata: { setup_mode: 'manual', url: trimmedUrl },
        created_by: profile?.user_uuid || null,
        dedupe_key: `sharepoint_root_configured:${tenantId}:${now}`,
        visibility: 'internal',
        source: 'system',
      }).then(({ error: tlError }) => { if (tlError) console.warn('Timeline event error:', tlError); });

      toast({ title: 'Folder linked', description: 'Manual SharePoint link saved successfully.' });
      setManualEditing(false);
      await fetchAll();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  };

  const handleTestAccess = async () => {
    if (!settings?.root_folder_url) return;
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'validate-sharepoint-root-folder',
        { body: { tenant_id: tenantId, root_folder_url: settings.root_folder_url } }
      );
      if (error || !data?.success) {
        toast({ title: 'Access test failed', description: data?.error || error?.message || 'Folder is no longer accessible.', variant: 'destructive' });
      } else {
        toast({ title: 'Access confirmed', description: `Folder "${data.root_name}" is accessible.` });
      }
      await fetchAll();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  };

  const handleToggleClientAccess = async (enabled: boolean) => {
    const { error } = await supabase
      .from('tenant_sharepoint_settings')
      .update({ client_access_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to update client access setting.', variant: 'destructive' });
    } else {
      toast({ title: enabled ? 'Client access enabled' : 'Client access disabled' });
      await fetchAll();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading file settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Client view ──
  if (!isVivacityTeam) {
    const canOpen =
      settings?.provisioning_status === 'success' &&
      settings?.client_access_enabled &&
      effectiveUrl;

    const clientLinks = referenceLinks.filter(l => l.visibility === 'client');

    return (
      <div className="space-y-6">
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
            {canOpen ? (
              <Button asChild>
                <a href={effectiveUrl!} target="_blank" rel="noopener noreferrer">
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
        {clientLinks.length > 0 && (
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
                {clientLinks.map(link => (
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

  // ── Vivacity team view ──
  const provStatus = settings?.provisioning_status || 'not_started';
  const setupMode = settings?.setup_mode || 'auto';
  const isProvisioned = provStatus === 'success';
  const isFailed = provStatus === 'failed';
  const hasNoSettings = !settings;
  const isValid = settings?.validation_status === 'valid';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Client SharePoint Folder</h3>
        <p className="text-sm text-muted-foreground">
          This folder is used for shared audit evidence and client files.
        </p>
      </div>

      {/* Setup Mode Badge */}
      {settings && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Setup mode:</span>
          <Badge variant={setupMode === 'manual' ? 'secondary' : 'default'} className="text-xs">
            {setupMode === 'manual' ? 'Manual' : 'Auto'}
          </Badge>
          {isProvisioned && (
            <Badge variant="default" className="flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3" />
              Configured
            </Badge>
          )}
          {isFailed && (
            <Badge variant="destructive" className="flex items-center gap-1 text-xs">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}
        </div>
      )}

      {/* Folder Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Folder Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* No settings yet — show both options */}
          {hasNoSettings && !manualEditing && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No SharePoint folder has been configured for this client yet.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setManualEditing(true)}>
                  <ClipboardPaste className="h-4 w-4 mr-2" />
                  Paste Existing Folder Link
                </Button>
                <Button onClick={handleProvision} disabled={provisioning}>
                  {provisioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderPlus className="h-4 w-4 mr-2" />}
                  Auto-Provision Folder
                </Button>
              </div>
            </div>
          )}

          {/* Failed provisioning */}
          {isFailed && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{settings?.provisioning_error || 'Provisioning failed.'}</span>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setManualEditing(true)}>
                    <ClipboardPaste className="h-4 w-4 mr-2" />
                    Paste Link Instead
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleProvision} disabled={provisioning}>
                    {provisioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                    Retry
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Currently configured folder display */}
          {isProvisioned && !manualEditing && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              {settings?.folder_name && (
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Folder:</span>
                  <span className="font-medium">{settings.folder_name}</span>
                </div>
              )}
              {settings?.folder_path && (
                <div className="flex items-center gap-2 text-sm">
                  <FolderTree className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Path:</span>
                  <span className="text-xs font-mono">{settings.folder_path}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">URL:</span>
                <span className="text-xs font-mono truncate max-w-md">{effectiveUrl}</span>
              </div>
              {settings?.last_validated_at && (
                <div className="text-xs text-muted-foreground">
                  Last validated: {formatDateTime(settings.last_validated_at)}
                </div>
              )}
              {settings?.validation_error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{settings.validation_error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Manual paste form */}
          {manualEditing && (
            <div className="space-y-3 rounded-lg border p-4">
              <Label htmlFor="sp-manual-url" className="text-sm font-medium">
                Paste existing SharePoint folder link
              </Label>
              <div className="flex gap-2">
                <Input
                  id="sp-manual-url"
                  placeholder="https://yourorg.sharepoint.com/sites/..."
                  value={manualUrlInput}
                  onChange={(e) => setManualUrlInput(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleManualSave} disabled={validating || !manualUrlInput.trim()}>
                  {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                URL must be a valid https:// SharePoint or OneDrive folder link.
              </p>
              <Button variant="ghost" size="sm" onClick={() => {
                setManualEditing(false);
                setManualUrlInput(settings?.manual_folder_url || settings?.root_folder_url || '');
              }}>
                Cancel
              </Button>
            </div>
          )}

          {/* Action buttons when configured */}
          {isProvisioned && !manualEditing && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setManualEditing(true)}>
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Change Folder Link
              </Button>
              {effectiveUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={effectiveUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in SharePoint
                  </a>
                </Button>
              )}
              {setupMode === 'auto' && (
                <Button variant="outline" size="sm" onClick={handleTestAccess} disabled={validating}>
                  {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Revalidate
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seed Run Status */}
      {seedRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Folder Seeding
              <Badge variant={seedRun.status === 'success' ? 'default' : seedRun.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                {seedRun.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Subfolders:</span>
                <span className="ml-2 font-medium">{seedRun.subfolders_created}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Files copied:</span>
                <span className="ml-2 font-medium">{seedRun.files_copied}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Links created:</span>
                <span className="ml-2 font-medium">{seedRun.links_created}</span>
              </div>
            </div>
            {seedRun.errors && seedRun.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-destructive mb-1">Errors:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {(seedRun.errors as string[]).map((err, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {seedRun.completed_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Completed: {formatDateTime(seedRun.completed_at)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reference Links */}
      {referenceLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Reference Links
            </CardTitle>
            <CardDescription>
              Shared resource links created during provisioning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referenceLinks.map(link => (
                <div key={link.id} className="flex items-center gap-3 p-2 rounded border">
                  <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{link.label}</span>
                  <Badge variant="outline" className="text-xs">{link.visibility}</Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={link.web_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client access toggle */}
      {isProvisioned && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="client-access" className="text-sm font-medium">
                  Client has access to SharePoint folder
                </Label>
                <p className="text-xs text-muted-foreground">
                  SharePoint access is managed in Microsoft admin. Toggle this to show the folder link in the client portal.
                </p>
              </div>
              <Switch
                id="client-access"
                checked={settings?.client_access_enabled || false}
                onCheckedChange={handleToggleClientAccess}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
