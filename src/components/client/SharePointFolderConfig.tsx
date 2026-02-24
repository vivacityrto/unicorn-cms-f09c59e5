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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
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
            <CardDescription className="mt-1">
              Connect a SharePoint folder as the document root for this client
            </CardDescription>
          </div>
          {settings && (
            <Badge variant={status.variant} className="flex items-center gap-1">
              {status.icon}
              {status.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* URL Input */}
        <div className="space-y-2">
          <Label htmlFor="sp-root-url">Root folder link</Label>
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
        </div>

        {/* Status Details */}
        {settings && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            {settings.root_name && settings.validation_status === 'valid' && (
              <div className="flex items-center gap-2 text-sm">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Root folder:</span>
                <span className="font-medium">{settings.root_name}</span>
              </div>
            )}
            {settings.validation_status === 'valid' && settings.root_folder_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={settings.root_folder_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in SharePoint
                </a>
              </Button>
            )}
            {settings.drive_id && settings.validation_status === 'valid' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Drive ID:</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {settings.drive_id.substring(0, 20)}...
                </code>
              </div>
            )}
            {settings.last_validated_at && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last validated:</span>
                <span>{formatDateTime(settings.last_validated_at)}</span>
              </div>
            )}
            {settings.validation_error && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{settings.validation_error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Enable/Disable toggle */}
        {settings && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">SharePoint access</p>
              <p className="text-xs text-muted-foreground">
                {settings.is_enabled
                  ? 'Tenant users can browse and download files'
                  : 'Access is disabled for tenant users'}
              </p>
            </div>
            <Switch
              checked={settings.is_enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={toggling}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
