import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
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
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  RefreshCw,
  Globe,
  HardDrive,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/utils';

interface SharePointSite {
  id: string;
  site_name: string;
  site_url: string;
  purpose: string;
  graph_site_id: string | null;
  drive_id: string | null;
  master_docs_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PURPOSE_LABELS: Record<string, string> = {
  client_success_files: 'Client Success Team Files',
  client_files: 'Client Files (Clients938)',
  governance_client_files: 'Governance Client Files',
  master_documents: 'Master Documents',
};

const PURPOSE_COLORS: Record<string, string> = {
  client_success_files: 'bg-blue-50 text-blue-800 border-blue-200',
  client_files: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  governance_client_files: 'bg-purple-50 text-purple-800 border-purple-200',
  master_documents: 'bg-amber-50 text-amber-800 border-amber-200',
};

export default function SharePointSitesAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: sites, isLoading, refetch } = useQuery({
    queryKey: ['sharepoint-sites-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sharepoint_sites')
        .select('*')
        .order('purpose');
      if (error) throw error;
      return (data || []) as SharePointSite[];
    },
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">SharePoint Sites</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage Microsoft Graph site IDs and drive IDs for each registered SharePoint site.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {/* Info banner */}
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Each site requires <code className="bg-muted px-1 rounded text-xs">Sites.Selected</code> permission
            granted via PowerShell for the <strong>Unicorn 2.0 - Outlook Integration</strong> app (ID: <code className="bg-muted px-1 rounded text-xs">920d8b27-ea77-4874-9e51-e66068f0b09a</code>).
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading sites...
          </div>
        ) : !sites || sites.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No SharePoint sites registered.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} onSaved={() => refetch()} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SiteCard({ site, onSaved }: { site: SharePointSite; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [graphSiteId, setGraphSiteId] = useState(site.graph_site_id || '');
  const [driveId, setDriveId] = useState(site.drive_id || '');
  const [masterDocsUrl, setMasterDocsUrl] = useState(site.master_docs_url || '');
  const [isActive, setIsActive] = useState(site.is_active);
  const [siteName, setSiteName] = useState(site.site_name);
  const [siteUrl, setSiteUrl] = useState(site.site_url);

  const isConfigured = !!site.graph_site_id && !!site.drive_id;
  const purposeLabel = PURPOSE_LABELS[site.purpose] || site.purpose;
  const purposeColor = PURPOSE_COLORS[site.purpose] || 'bg-muted text-muted-foreground border-border';

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('sharepoint_sites')
        .update({
          site_name: siteName.trim(),
          site_url: siteUrl.trim(),
          graph_site_id: graphSiteId.trim() || null,
          drive_id: driveId.trim() || null,
          master_docs_url: masterDocsUrl.trim() || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', site.id);

      if (error) throw error;
      toast.success(`${site.site_name} settings saved.`);
      setEditing(false);
      setTestResult(null);
      onSaved();
    } catch (err: any) {
      toast.error('Save failed', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestAccess = async () => {
    if (!site.graph_site_id) {
      setTestResult({ success: false, message: 'No Graph Site ID configured.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // Use the validate edge function to test access
      const { data, error } = await supabase.functions.invoke('validate-sharepoint-root-folder', {
        body: {
          tenant_id: 0, // Dummy tenant_id — we're only testing site access, not validating a tenant folder
          root_folder_url: site.site_url,
          test_site_access: true,
        },
      });

      if (error) {
        setTestResult({ success: false, message: error.message || 'Edge function error.' });
      } else if (data?.error) {
        setTestResult({ success: false, message: data.error });
      } else {
        setTestResult({ success: true, message: data?.root_name ? `Access confirmed — "${data.root_name}"` : 'Access confirmed.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleReset = () => {
    setSiteName(site.site_name);
    setSiteUrl(site.site_url);
    setGraphSiteId(site.graph_site_id || '');
    setDriveId(site.drive_id || '');
    setMasterDocsUrl(site.master_docs_url || '');
    setIsActive(site.is_active);
    setEditing(false);
    setTestResult(null);
  };

  return (
    <Card className={!site.is_active ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">{site.site_name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${purposeColor}`}>
              {purposeLabel}
            </Badge>
            {isConfigured ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-50 text-emerald-800 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-50 text-orange-800 text-xs">
                <AlertCircle className="h-3 w-3" />
                Missing IDs
              </Badge>
            )}
            {!site.is_active && (
              <Badge variant="secondary" className="text-xs">Inactive</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Each setting on its own row */}
        <SettingRow label="Site Name" editing={editing}>
          {editing ? (
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="text-sm" />
          ) : (
            <span className="text-sm">{site.site_name}</span>
          )}
        </SettingRow>

        <SettingRow label="Site URL" editing={editing}>
          {editing ? (
            <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} className="text-sm font-mono" placeholder="https://contoso.sharepoint.com/sites/..." />
          ) : (
            <span className="text-xs font-mono break-all">{site.site_url}</span>
          )}
        </SettingRow>

        <SettingRow label="Graph Site ID" editing={editing}>
          {editing ? (
            <Input value={graphSiteId} onChange={(e) => setGraphSiteId(e.target.value)} className="text-xs font-mono" placeholder="e.g. contoso.sharepoint.com,abc123,def456" />
          ) : (
            <span className="text-xs font-mono break-all">{site.graph_site_id || <span className="text-muted-foreground italic">Not set</span>}</span>
          )}
        </SettingRow>

        <SettingRow label="Drive ID" editing={editing}>
          {editing ? (
            <Input value={driveId} onChange={(e) => setDriveId(e.target.value)} className="text-xs font-mono" placeholder="e.g. b!abc123def456..." />
          ) : (
            <span className="text-xs font-mono break-all">{site.drive_id || <span className="text-muted-foreground italic">Not set</span>}</span>
          )}
        </SettingRow>

        {(site.purpose === 'master_documents' || site.master_docs_url || editing) && (
          <SettingRow label="Master Docs URL" editing={editing}>
            {editing ? (
              <Input value={masterDocsUrl} onChange={(e) => setMasterDocsUrl(e.target.value)} className="text-xs font-mono" placeholder="https://vivacityteam.sharepoint.com/sites/..." />
            ) : (
              <span className="text-xs font-mono break-all">{site.master_docs_url || <span className="text-muted-foreground italic">Not set</span>}</span>
            )}
          </SettingRow>
        )}

        {editing && (
          <SettingRow label="Active" editing={editing}>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </SettingRow>
        )}

        {/* Test result */}
        {testResult && (
          <Alert variant={testResult.success ? 'default' : 'destructive'}>
            {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription className="text-sm">{testResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Updated: {formatDateTime(site.updated_at)}</span>
          {site.site_url && (
            <a
              href={site.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open site
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleReset} disabled={saving}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestAccess}
                disabled={testing || !site.graph_site_id}
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <HardDrive className="h-4 w-4 mr-1" />}
                Test Access
              </Button>
            </>
          )}
        </div>

        {/* Help text for getting IDs */}
        {editing && (
          <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs font-medium">How to get these IDs:</p>
            <p className="text-xs text-muted-foreground">
              <strong>Graph Site ID:</strong> Run <code className="bg-background px-1 rounded">Get-MgSite -Search "{site.site_name}"</code> in PowerShell,
              or use Graph Explorer: <code className="bg-background px-1 rounded">GET /sites/{'{hostname}'}:/sites/{'{sitename}'}</code>
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Drive ID:</strong> <code className="bg-background px-1 rounded">GET /sites/{'{siteId}'}/drive</code> → use the <code className="bg-background px-1 rounded">id</code> field.
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Grant access:</strong> <code className="bg-background px-1 rounded">New-MgSitePermission -SiteId "{'{siteId}'}" -BodyParameter @{'{...}'}</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingRow({ label, editing, children }: { label: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-1.5 border-b border-border/50 last:border-0">
      <Label className="text-xs text-muted-foreground w-32 shrink-0 pt-1.5">{label}</Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
