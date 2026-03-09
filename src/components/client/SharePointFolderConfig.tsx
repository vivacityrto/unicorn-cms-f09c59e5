import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Clock,
  Loader2,
  Info,
  ExternalLink,
  ShieldCheck,
  Save,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SharePointFolderConfigProps {
  tenantId: number;
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
  shared_folder_item_id: string | null;
  shared_folder_name: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string; icon: React.ReactNode }> = {
  unvalidated: {
    variant: 'secondary',
    label: 'Unvalidated',
    icon: <Clock className="h-3 w-3" />,
  },
  valid: {
    variant: 'default',
    label: 'Valid',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  invalid: {
    variant: 'destructive',
    label: 'Invalid',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function SharePointFolderConfig({ tenantId }: SharePointFolderConfigProps) {
  const { isSuperAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SharePointSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [browsingSharedFolder, setBrowsingSharedFolder] = useState(false);
  const [sharedFolderBrowseItems, setSharedFolderBrowseItems] = useState<Array<{ id: string; name: string; is_folder: boolean }>>([]);
  const [sharedFolderBrowseStack, setSharedFolderBrowseStack] = useState<Array<{ id: string; name: string }>>([]);
  const [sharedFolderBrowseLoading, setSharedFolderBrowseLoading] = useState(false);
  const [savingSharedFolder, setSavingSharedFolder] = useState(false);

  // Fetch global SharePoint site URL
  const { data: globalSiteUrl } = useQuery({
    queryKey: ['app-settings-sharepoint-site-url'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('sharepoint_site_url')
        .limit(1)
        .single();
      return data?.sharepoint_site_url || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Only Vivacity team can manage
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
      console.error('[SharePointConfig] Fetch error:', error);
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

  const validateUrl = (url: string): boolean => {
    if (!url) {
      toast({ title: 'URL required', description: 'Please enter a SharePoint folder link.', variant: 'destructive' });
      return false;
    }
    if (!url.startsWith('https://')) {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL starting with https://', variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Save link only (no Graph API validation)
  const handleSave = async () => {
    const trimmedUrl = urlInput.trim();
    if (!validateUrl(trimmedUrl)) return;

    if (!profile?.user_uuid) {
      toast({ title: 'Error', description: 'You must be logged in to save settings.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (settings) {
        const { error } = await supabase
          .from('tenant_sharepoint_settings')
          .update({ root_folder_url: trimmedUrl, validation_status: 'unvalidated', validation_error: null, updated_at: now, updated_by: profile.user_uuid })
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_sharepoint_settings')
          .insert([{ tenant_id: tenantId, root_folder_url: trimmedUrl, validation_status: 'unvalidated', is_enabled: true, created_by: profile.user_uuid, setup_mode: 'manual', manual_folder_url: trimmedUrl }]);
        if (error) throw error;
      }
      toast({ title: 'Link saved', description: 'SharePoint folder link stored. Use "Validate" to verify access via Microsoft.' });
      await fetchSettings();
    } catch (err: any) {
      console.error('SharePoint save error:', err);
      const message = err?.message || err?.details || err?.hint || 'An unexpected error occurred.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Validate via Graph API (requires connected Microsoft account)
  const handleValidateAndSave = async () => {
    const trimmedUrl = urlInput.trim();
    if (!validateUrl(trimmedUrl)) return;

    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-sharepoint-root-folder', {
        body: { tenant_id: tenantId, root_folder_url: trimmedUrl },
      });

      if (error) {
        toast({ title: 'Validation failed', description: error.message || 'Could not validate the folder link.', variant: 'destructive' });
      } else if (data?.success) {
        toast({ title: 'SharePoint folder validated', description: `Root folder "${data.root_name}" connected and verified.` });
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

  const handleToggleEnabled = async () => {
    if (!settings) return;

    setToggling(true);
    try {
      const { error } = await supabase
        .from('tenant_sharepoint_settings')
        .update({
          is_enabled: !settings.is_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) {
        toast({
          title: 'Update failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: settings.is_enabled ? 'SharePoint disabled' : 'SharePoint enabled',
          description: settings.is_enabled
            ? 'Tenant users will no longer have access to SharePoint files.'
            : 'Tenant users can now browse SharePoint files.',
        });
        await fetchSettings();
      }
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading SharePoint settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isVivacityTeam) {
    // Read-only view for non-staff
    if (!settings || !settings.is_enabled || settings.validation_status !== 'valid') {
      return null;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            SharePoint Folder
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Connected to: <strong>{settings.root_name}</strong></span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = STATUS_CONFIG[settings?.validation_status || 'unvalidated'] || STATUS_CONFIG.unvalidated;

  const isDisabled = settings ? !settings.is_enabled : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              {globalSiteUrl ? (
                <a
                  href={globalSiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-4 transition-colors"
                >
                  SharePoint Folder
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                'SharePoint Folder'
              )}
            </CardTitle>
            {settings && (
              <Badge variant={status.variant} className="flex items-center gap-1">
                {status.icon}
                {status.label}
              </Badge>
            )}
          </div>
          {settings && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {settings.is_enabled ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={settings.is_enabled}
                onCheckedChange={handleToggleEnabled}
                disabled={toggling}
              />
            </div>
          )}
        </div>
        <CardDescription className="mt-1">
          Connect a SharePoint folder as the document root for this client
        </CardDescription>
      </CardHeader>
      <CardContent className={`space-y-4 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* URL Input — always visible even when disabled */}
        <div className={`space-y-2 ${isDisabled ? '!opacity-100 !pointer-events-auto' : ''}`}>
          {settings?.last_validated_at && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last validated: {formatDateTime(settings.last_validated_at)}
            </p>
          )}
          <Label htmlFor="sp-root-url">
            {urlInput.trim().startsWith('https://') ? (
              <a
                href={urlInput.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-4 transition-colors"
              >
                Root folder link
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : globalSiteUrl ? (
              <a
                href={globalSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-4 transition-colors"
              >
                Browse Client Folder root
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              'Root folder link'
            )}
            {settings?.root_name && (
              <span className="font-semibold text-foreground ml-1">— {settings.root_name}</span>
            )}
          </Label>
          <div className="flex gap-2">
            <Input
              id="sp-root-url"
              placeholder="https://yourorg.sharepoint.com/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving || validating || !urlInput.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Link
            </Button>
            <Button
              onClick={handleValidateAndSave}
              disabled={saving || validating || !urlInput.trim()}
            >
              {validating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Validate & Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            Use &quot;Copy link&quot; from SharePoint to get a sharing link for the folder.
          </p>
          {settings?.drive_id && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Drive ID: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{settings.drive_id.substring(0, 20)}...</code>
            </p>
          )}
        </div>

        {settings?.validation_error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{settings.validation_error}</AlertDescription>
          </Alert>
        )}

        {/* Shared Folder Configuration — full width */}
        {settings && settings.validation_status === 'valid' && (
          <SharedFolderSection
            settings={settings}
            tenantId={tenantId}
            browsingSharedFolder={browsingSharedFolder}
            setBrowsingSharedFolder={setBrowsingSharedFolder}
            sharedFolderBrowseItems={sharedFolderBrowseItems}
            setSharedFolderBrowseItems={setSharedFolderBrowseItems}
            sharedFolderBrowseStack={sharedFolderBrowseStack}
            setSharedFolderBrowseStack={setSharedFolderBrowseStack}
            sharedFolderBrowseLoading={sharedFolderBrowseLoading}
            setSharedFolderBrowseLoading={setSharedFolderBrowseLoading}
            savingSharedFolder={savingSharedFolder}
            setSavingSharedFolder={setSavingSharedFolder}
            onSaved={fetchSettings}
            toast={toast}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Shared Folder Picker Section ─── */

function SharedFolderSection({
  settings,
  tenantId,
  browsingSharedFolder,
  setBrowsingSharedFolder,
  sharedFolderBrowseItems,
  setSharedFolderBrowseItems,
  sharedFolderBrowseStack,
  setSharedFolderBrowseStack,
  sharedFolderBrowseLoading,
  setSharedFolderBrowseLoading,
  savingSharedFolder,
  setSavingSharedFolder,
  onSaved,
  toast,
}: {
  settings: SharePointSettings;
  tenantId: number;
  browsingSharedFolder: boolean;
  setBrowsingSharedFolder: (v: boolean) => void;
  sharedFolderBrowseItems: Array<{ id: string; name: string; is_folder: boolean }>;
  setSharedFolderBrowseItems: (v: Array<{ id: string; name: string; is_folder: boolean }>) => void;
  sharedFolderBrowseStack: Array<{ id: string; name: string }>;
  setSharedFolderBrowseStack: (v: Array<{ id: string; name: string }>) => void;
  sharedFolderBrowseLoading: boolean;
  setSharedFolderBrowseLoading: (v: boolean) => void;
  savingSharedFolder: boolean;
  setSavingSharedFolder: (v: boolean) => void;
  onSaved: () => Promise<void>;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const loadFolder = async (folderId?: string) => {
    setSharedFolderBrowseLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('browse-sharepoint-folder', {
        body: { action: 'list', tenant_id: tenantId, folder_id: folderId || undefined },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const folders = (data.items || []).filter((i: any) => i.is_folder);
      setSharedFolderBrowseItems(folders);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load folders', variant: 'destructive' });
    } finally {
      setSharedFolderBrowseLoading(false);
    }
  };

  const startBrowsing = () => {
    setBrowsingSharedFolder(true);
    setSharedFolderBrowseStack([]);
    loadFolder(); // load root
  };

  const navigateInto = (folderId: string, folderName: string) => {
    setSharedFolderBrowseStack([...sharedFolderBrowseStack, { id: folderId, name: folderName }]);
    loadFolder(folderId);
  };

  const navigateBack = () => {
    const newStack = [...sharedFolderBrowseStack];
    newStack.pop();
    setSharedFolderBrowseStack(newStack);
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : undefined;
    loadFolder(parentId);
  };

  const selectAsSharedFolder = async (folderId: string, folderName: string) => {
    setSavingSharedFolder(true);
    try {
      const { error } = await supabase
        .from('tenant_sharepoint_settings')
        .update({
          shared_folder_item_id: folderId,
          shared_folder_name: folderName,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settings.id);
      if (error) throw error;
      toast({ title: 'Shared folder set', description: `"${folderName}" is now the shared folder for document linking.` });
      setBrowsingSharedFolder(false);
      await onSaved();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' });
    } finally {
      setSavingSharedFolder(false);
    }
  };

  const clearSharedFolder = async () => {
    setSavingSharedFolder(true);
    try {
      const { error } = await supabase
        .from('tenant_sharepoint_settings')
        .update({
          shared_folder_item_id: null,
          shared_folder_name: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settings.id);
      if (error) throw error;
      toast({ title: 'Shared folder cleared' });
      await onSaved();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to clear', variant: 'destructive' });
    } finally {
      setSavingSharedFolder(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Shared Folder (for Insert Link)</p>
          <p className="text-xs text-muted-foreground">
            Select a subfolder within the client folder to use as the starting point when inserting document links.
          </p>
        </div>
      </div>

      {settings.shared_folder_name && !browsingSharedFolder && (
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{settings.shared_folder_name}</span>
          <Button variant="outline" size="sm" onClick={startBrowsing} className="ml-auto">
            Change
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSharedFolder} disabled={savingSharedFolder}>
            Clear
          </Button>
        </div>
      )}

      {!settings.shared_folder_name && !browsingSharedFolder && (
        <Button variant="outline" size="sm" onClick={startBrowsing}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Select Shared Folder
        </Button>
      )}

      {browsingSharedFolder && (
        <div className="space-y-2 border rounded-md p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{settings.root_name || 'Root'}</span>
            {sharedFolderBrowseStack.map((item, idx) => (
              <span key={idx} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <span>{item.name}</span>
              </span>
            ))}
          </div>

          {sharedFolderBrowseStack.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={navigateBack} className="h-7 text-xs">
                <ArrowLeft className="h-3 w-3 mr-1" />
                Back
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const current = sharedFolderBrowseStack[sharedFolderBrowseStack.length - 1];
                  selectAsSharedFolder(current.id, current.name);
                }}
                disabled={savingSharedFolder}
              >
                {savingSharedFolder && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Use "{sharedFolderBrowseStack[sharedFolderBrowseStack.length - 1]?.name}" as Shared Folder
              </Button>
            </div>
          )}

          {sharedFolderBrowseLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading folders...
            </div>
          ) : sharedFolderBrowseItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">No subfolders found</p>
          ) : (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {sharedFolderBrowseItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted/50 text-left"
                  onClick={() => navigateInto(item.id, item.name)}
                >
                  <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
                  {item.name}
                </button>
              ))}
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={() => setBrowsingSharedFolder(false)} className="text-xs">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
