import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useCompliancePacks, CompliancePackExport } from '@/hooks/useCompliancePacks';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Package, FileArchive, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Tenant {
  id: number;
  name: string;
}

interface StageRelease {
  id: string;
  stage_id: number;
  status: string;
  created_at: string;
  released_at: string | null;
  stage?: { title: string };
}

export default function AdminCompliancePacks() {
  const navigate = useNavigate();
  const { exports, loading, exporting, fetchExports, createExport, startExport, getDownloadUrl } = useCompliancePacks();
  
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [releases, setReleases] = useState<StageRelease[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [selectedRelease, setSelectedRelease] = useState<string>('');
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Fetch tenants on mount
  useEffect(() => {
    const fetchTenants = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      setTenants(data || []);
      setLoadingTenants(false);
    };
    fetchTenants();
    fetchExports();
  }, [fetchExports]);

  // Fetch releases when tenant changes
  useEffect(() => {
    if (!selectedTenant) {
      setReleases([]);
      return;
    }

    const fetchReleases = async () => {
      setLoadingReleases(true);
      const { data } = await supabase
        .from('stage_releases' as any)
        .select(`
          id, stage_id, status, created_at, released_at,
          stage:stages(name)
        `)
        .eq('tenant_id', parseInt(selectedTenant))
        .order('created_at', { ascending: false })
        .limit(50) as any;
      
      setReleases((data || []) as unknown as StageRelease[]);
      setLoadingReleases(false);
    };
    fetchReleases();
    fetchExports(parseInt(selectedTenant));
  }, [selectedTenant, fetchExports]);

  const handleExport = async () => {
    if (!selectedTenant || !selectedRelease) return;

    const exportId = await createExport(parseInt(selectedTenant), selectedRelease);
    if (exportId) {
      const success = await startExport(exportId);
      if (success) {
        fetchExports(parseInt(selectedTenant));
        setSelectedRelease('');
      }
    }
  };

  const handleDownload = async (exp: CompliancePackExport) => {
    if (!exp.storage_path) return;
    
    setDownloading(exp.id);
    const url = await getDownloadUrl(exp.storage_path);
    if (url) {
      window.open(url, '_blank');
    }
    setDownloading(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Ready</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Queued</Badge>;
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AppLayout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Compliance Packs</h1>
            <p className="text-muted-foreground">Export audit-ready document bundles</p>
          </div>
          <Button variant="outline" onClick={() => fetchExports(selectedTenant ? parseInt(selectedTenant) : undefined)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Export Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5" />
              New Export
            </CardTitle>
            <CardDescription>
              Select a tenant and stage release to export a compliance pack
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tenant</label>
                <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTenants ? "Loading..." : "Select tenant"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Stage Release</label>
                <Select 
                  value={selectedRelease} 
                  onValueChange={setSelectedRelease}
                  disabled={!selectedTenant || loadingReleases}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingReleases ? "Loading..." : "Select release"} />
                  </SelectTrigger>
                  <SelectContent>
                    {releases.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.stage?.title || `Stage ${r.stage_id}`} - {r.status} ({format(new Date(r.created_at), 'MMM d, yyyy')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button 
                  onClick={handleExport}
                  disabled={!selectedTenant || !selectedRelease || exporting}
                  className="w-full"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Package className="h-4 w-4 mr-2" />
                      Export Pack
                    </>
                  )}
                </Button>
              </div>
            </div>

            {selectedRelease && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Export will include:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Released document files (generated or published versions)</li>
                  <li>• Email notification logs</li>
                  <li>• Audit trail of release events</li>
                  <li>• Index files (JSON + CSV) with metadata</li>
                  <li>• README with verification instructions</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export History */}
        <Card>
          <CardHeader>
            <CardTitle>Export History</CardTitle>
            <CardDescription>
              {selectedTenant 
                ? `Showing exports for selected tenant`
                : `Showing all recent exports`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : exports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No exports yet. Create your first compliance pack above.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Release</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-medium">
                        {exp.tenant?.name || `Tenant ${exp.tenant_id}`}
                      </TableCell>
                      <TableCell>
                        {exp.stage_release_id?.substring(0, 8) || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(exp.status)}</TableCell>
                      <TableCell>{formatFileSize(exp.file_size_bytes)}</TableCell>
                      <TableCell>
                        {format(new Date(exp.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        {exp.status === 'success' && exp.storage_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(exp)}
                            disabled={downloading === exp.id}
                          >
                            {downloading === exp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {exp.status === 'failed' && exp.error && (
                          <span className="text-xs text-destructive" title={exp.error}>
                            {exp.error.substring(0, 30)}...
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
