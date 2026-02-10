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
  created_at: string;
  updated_at: string;
}

export function ClientFilesTab({ tenantId, clientName }: ClientFilesTabProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SharePointSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('tenant_sharepoint_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('[ClientFiles] Fetch error:', error);
    }

    setSettings(data as SharePointSettings | null);
    if (data) {
      setUrlInput(data.root_folder_url || '');
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
        toast({
          title: data.already_provisioned ? 'Already provisioned' : 'Folder created',
          description: data.already_provisioned
            ? 'SharePoint folder was already set up.'
            : `Created "${data.folder_name}" in SharePoint.`,
        });
      } else {
        toast({ title: 'Provisioning failed', description: data?.error || 'Unknown error', variant: 'destructive' });
      }
      await fetchSettings();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  const handleValidateAndSave = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl || !trimmedUrl.startsWith('http')) {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL.', variant: 'destructive' });
      return;
    }

    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'validate-sharepoint-root-folder',
        { body: { tenant_id: tenantId, root_folder_url: trimmedUrl } }
      );

      if (error) {
        toast({ title: 'Validation failed', description: error.message, variant: 'destructive' });
      } else if (data?.success) {
        toast({ title: 'Folder connected', description: `Root folder "${data.root_name}" validated.` });
        setEditing(false);
      } else {
        toast({ title: 'Validation failed', description: data?.error || 'Could not validate.', variant: 'destructive' });
      }
      await fetchSettings();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
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
      await fetchSettings();
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
      await fetchSettings();
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

  // ── Client view: simple "Open" button ──
  if (!isVivacityTeam) {
    const canOpen =
      settings?.provisioning_status === 'success' &&
      settings?.client_access_enabled &&
      settings?.root_folder_url;

    if (!canOpen) {
      return (
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
            <p className="text-sm text-muted-foreground">
              No folder has been configured yet. Contact your Vivacity consultant for access.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
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
          <Button asChild>
            <a href={settings.root_folder_url!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Client Files
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Vivacity team view ──
  const provStatus = settings?.provisioning_status || 'not_started';
  const isProvisioned = provStatus === 'success';
  const isFailed = provStatus === 'failed';
  const isValid = settings?.validation_status === 'valid';
  const isConfigured = !!settings?.root_folder_url;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Client SharePoint Folder</h3>
        <p className="text-sm text-muted-foreground">
          This folder is used for shared audit evidence and client files.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Folder Configuration
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Provisioning status badge */}
              {provStatus === 'not_started' && (
                <Badge variant="outline" className="text-xs">Not Created</Badge>
              )}
              {provStatus === 'pending' && (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Provisioning...
                </Badge>
              )}
              {isProvisioned && (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Provisioned
                </Badge>
              )}
              {isFailed && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Failed
                </Badge>
              )}
              {/* Validation status (only if provisioned) */}
              {isProvisioned && settings && (
                <Badge variant={isValid ? 'default' : 'destructive'} className="flex items-center gap-1">
                  {isValid ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {isValid ? 'Connected' : 'Invalid'}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Not created — show provision button */}
          {provStatus === 'not_started' && !isConfigured && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                No SharePoint folder has been created for this client yet.
              </p>
              <Button onClick={handleProvision} disabled={provisioning}>
                {provisioning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FolderPlus className="h-4 w-4 mr-2" />
                )}
                Provision Folder
              </Button>
            </div>
          )}

          {/* Failed — show error + retry */}
          {isFailed && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{settings?.provisioning_error || 'Provisioning failed.'}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="ml-4 shrink-0"
                >
                  {provisioning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Retry Provisioning
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Provisioned — show folder info */}
          {isConfigured && !editing && (
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
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Path:</span>
                  <span className="text-xs font-mono">{settings.folder_path}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">URL:</span>
                <span className="text-xs font-mono truncate max-w-md">{settings?.root_folder_url}</span>
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

          {/* Manual URL edit form */}
          {(editing || (provStatus === 'not_started' && !isConfigured)) && (
            <div className="space-y-2">
              <Label htmlFor="sp-folder-url">SharePoint folder link (manual override)</Label>
              <div className="flex gap-2">
                <Input
                  id="sp-folder-url"
                  placeholder="https://yourorg.sharepoint.com/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleValidateAndSave}
                  disabled={validating || !urlInput.trim()}
                >
                  {validating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Validate & Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                Or use auto-provisioning above to create a folder automatically.
              </p>
              {editing && (
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setUrlInput(settings?.root_folder_url || ''); }}>
                  Cancel
                </Button>
              )}
            </div>
          )}

          {/* Actions */}
          {isConfigured && !editing && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Update Folder Link
              </Button>
              {settings?.root_folder_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={settings.root_folder_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in SharePoint
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleTestAccess} disabled={validating}>
                {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Revalidate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
