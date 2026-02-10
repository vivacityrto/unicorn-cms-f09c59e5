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
  root_folder_url: string;
  drive_id: string | null;
  root_item_id: string | null;
  root_name: string | null;
  is_enabled: boolean;
  last_validated_at: string | null;
  validation_status: string;
  validation_error: string | null;
  created_at: string;
  updated_at: string;
}

export function ClientFilesTab({ tenantId, clientName }: ClientFilesTabProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SharePointSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
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

  const handleValidateAndSave = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      toast({ title: 'URL required', description: 'Please enter a SharePoint folder link.', variant: 'destructive' });
      return;
    }
    if (!trimmedUrl.startsWith('http')) {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL starting with https://', variant: 'destructive' });
      return;
    }

    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'validate-sharepoint-root-folder',
        { body: { tenant_id: tenantId, root_folder_url: trimmedUrl } }
      );

      if (error) {
        toast({ title: 'Validation failed', description: error.message || 'Could not validate the folder link.', variant: 'destructive' });
      } else if (data?.success) {
        toast({ title: 'Folder connected', description: `Root folder "${data.root_name}" validated successfully.` });
        setEditing(false);
      } else {
        toast({ title: 'Validation failed', description: data?.error || 'Could not validate the folder link.', variant: 'destructive' });
      }
      await fetchSettings();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'An unexpected error occurred.', variant: 'destructive' });
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
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setValidating(false);
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
    if (!settings || !settings.is_enabled || settings.validation_status !== 'valid') {
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
            <a href={settings.root_folder_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Client Files
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Vivacity team view ──
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
            {settings && (
              <Badge variant={isValid ? 'default' : 'destructive'} className="flex items-center gap-1">
                {isValid ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {isValid ? 'Connected' : 'Invalid'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current config display */}
          {isConfigured && !editing && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              {settings?.root_name && isValid && (
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Folder:</span>
                  <span className="font-medium">{settings.root_name}</span>
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

          {/* Edit form */}
          {(editing || !isConfigured) && (
            <div className="space-y-2">
              <Label htmlFor="sp-folder-url">SharePoint folder link</Label>
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
                Use &quot;Copy link&quot; from SharePoint to get a sharing link for the folder.
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
                Test Access
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
