import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTgaSync, ProbeResult } from '@/hooks/useTgaSync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Clock,
  Database,
  Shield,
  Loader2,
  ExternalLink,
  Wifi,
  WifiOff,
  Play,
  RotateCcw,
  Building2,
  GraduationCap,
  FileText,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function AdminTgaIntegration() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  
  const {
    loading,
    canManage,
    status,
    jobs,
    products,
    units,
    organisations,
    fetchStatus,
    fetchJobs,
    fetchProducts,
    fetchUnits,
    fetchOrganisations,
    testConnection,
    probeCode,
    triggerFullSync,
    triggerDeltaSync,
    syncCodes,
    runHealthCheck,
  } = useTgaSync();

  const [probeInput, setProbeInput] = useState('');
  const [probeType, setProbeType] = useState<'training' | 'organisation'>('training');
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [syncInput, setSyncInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Check access
  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard');
    }
  }, [isSuperAdmin, navigate]);

  // Load data
  useEffect(() => {
    if (canManage) {
      fetchProducts('', 50);
      fetchUnits('', 50);
      fetchOrganisations('', 50);
    }
  }, [canManage, fetchProducts, fetchUnits, fetchOrganisations]);

  const handleProbe = async () => {
    if (!probeInput.trim()) return;
    const result = await probeCode(probeInput.trim(), probeType);
    setProbeResult(result);
  };

  const handleSync = async () => {
    const codes = syncInput.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) return;
    await syncCodes(codes);
    setSyncInput('');
  };

  const handleSearch = async () => {
    await Promise.all([
      fetchProducts(searchQuery, 100),
      fetchUnits(searchQuery, 100),
      fetchOrganisations(searchQuery, 100),
    ]);
  };

  if (!canManage) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-muted-foreground">
              SuperAdmin access required to view this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const connectionIcon = status?.connection_status === 'connected' 
    ? <Wifi className="h-4 w-4 text-green-500" /> 
    : status?.connection_status === 'error' 
      ? <WifiOff className="h-4 w-4 text-destructive" />
      : <AlertCircle className="h-4 w-4 text-muted-foreground" />;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="TGA Production Integration"
        description="Training.gov.au SOAP integration - health, sync, and data management"
      />

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {connectionIcon}
              Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">
              {status?.connection_status || 'Unknown'}
            </p>
            {status?.last_health_check_at && (
              <p className="text-xs text-muted-foreground">
                Checked {formatDistanceToNow(new Date(status.last_health_check_at))} ago
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{status?.counts?.products || 0}</p>
            <p className="text-xs text-muted-foreground">Qualifications & Skill Sets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Units
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{status?.counts?.units || 0}</p>
            <p className="text-xs text-muted-foreground">Units of Competency</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organisations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{status?.counts?.organisations || 0}</p>
            <p className="text-xs text-muted-foreground">RTOs</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sync Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sync Controls
            </CardTitle>
            <CardDescription>
              Trigger data synchronization from TGA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={testConnection} 
                disabled={loading} 
                variant="outline"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>
              <Button 
                onClick={runHealthCheck} 
                disabled={loading}
                variant="outline"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                Health Check
              </Button>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={triggerFullSync} 
                disabled={loading || status?.is_syncing}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Full Sync
              </Button>
              <Button 
                onClick={() => triggerDeltaSync()} 
                disabled={loading || status?.is_syncing}
                variant="secondary"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Delta Sync
              </Button>
            </div>

            {status?.is_syncing && (
              <div className="p-3 bg-muted rounded-lg flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Sync in progress...</span>
              </div>
            )}

            {status?.last_full_sync_at && (
              <p className="text-sm text-muted-foreground">
                Last full sync: {format(new Date(status.last_full_sync_at), 'PPpp')}
              </p>
            )}

            <Separator />

            <div className="space-y-2">
              <Label>Sync Specific Codes</Label>
              <div className="flex gap-2">
                <Input
                  value={syncInput}
                  onChange={(e) => setSyncInput(e.target.value.toUpperCase())}
                  placeholder="BSB30120, CHC33021, HLTAID009"
                />
                <Button onClick={handleSync} disabled={loading || !syncInput.trim()}>
                  Sync
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Probe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Probe TGA Code
            </CardTitle>
            <CardDescription>
              Test fetching from TGA production (no DB write)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <select
                value={probeType}
                onChange={(e) => setProbeType(e.target.value as 'training' | 'organisation')}
                className="px-3 py-2 border rounded-md"
              >
                <option value="training">Training</option>
                <option value="organisation">Organisation</option>
              </select>
              <Input
                value={probeInput}
                onChange={(e) => setProbeInput(e.target.value.toUpperCase())}
                placeholder={probeType === 'training' ? 'e.g., BSB30120' : 'e.g., 0275'}
                onKeyDown={(e) => e.key === 'Enter' && handleProbe()}
                className="flex-1"
              />
              <Button onClick={handleProbe} disabled={loading || !probeInput.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Probe'}
              </Button>
            </div>

            {probeResult && (
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center gap-2">
                  <Badge variant={probeResult.found ? 'default' : 'destructive'}>
                    {probeResult.found ? 'Found' : 'Not Found'}
                  </Badge>
                  <span className="font-mono text-sm">{probeResult.code}</span>
                </div>

                {probeResult.data && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <p className="font-medium">
                      {(probeResult.data as Record<string, string>).title || 
                       (probeResult.data as Record<string, string>).legalName}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {(probeResult.data as Record<string, string>).status && (
                        <Badge variant="secondary">
                          {(probeResult.data as Record<string, string>).status}
                        </Badge>
                      )}
                      {(probeResult.data as Record<string, string>).componentType && (
                        <Badge variant="outline">
                          {(probeResult.data as Record<string, string>).componentType}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {probeResult.raw && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      View Raw Response
                    </summary>
                    <ScrollArea className="h-40 mt-2">
                      <pre className="p-2 bg-muted rounded text-xs overflow-auto whitespace-pre-wrap">
                        {probeResult.raw}
                      </pre>
                    </ScrollArea>
                  </details>
                )}

                {probeResult.error && (
                  <p className="text-sm text-destructive">{probeResult.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Jobs History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sync Jobs
          </CardTitle>
          <CardDescription>Recent synchronization history</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchJobs} variant="ghost" size="sm" className="mb-3">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs found</p>
          ) : (
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div key={job.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          job.status === 'done' ? 'default' :
                          job.status === 'failed' ? 'destructive' :
                          job.status === 'running' ? 'secondary' : 'outline'
                        }>
                          {job.status}
                        </Badge>
                        <Badge variant="outline">{job.job_type}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(job.created_at), 'PP p')}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Fetched:</span>{' '}
                        <span className="font-medium">{job.records_fetched}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Inserted:</span>{' '}
                        <span className="font-medium text-green-600">{job.records_inserted}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Updated:</span>{' '}
                        <span className="font-medium text-blue-600">{job.records_updated}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed:</span>{' '}
                        <span className="font-medium text-destructive">{job.records_failed}</span>
                      </div>
                    </div>
                    {job.error_message && (
                      <p className="text-xs text-destructive mt-2">{job.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Data Browser */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Cached Data
          </CardTitle>
          <CardDescription>Browse locally cached TGA data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code or title..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <Tabs defaultValue="products">
            <TabsList>
              <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
              <TabsTrigger value="units">Units ({units.length})</TabsTrigger>
              <TabsTrigger value="orgs">Organisations ({organisations.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <ScrollArea className="h-64">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Code</th>
                      <th className="text-left py-2">Title</th>
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Fetched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 font-mono">
                          <a 
                            href={`https://training.gov.au/Training/Details/${item.code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            {item.code}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="py-2 max-w-xs truncate">{item.title}</td>
                        <td className="py-2"><Badge variant="outline">{item.product_type}</Badge></td>
                        <td className="py-2">{item.status || '-'}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {format(new Date(item.fetched_at), 'PP')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="units">
              <ScrollArea className="h-64">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Code</th>
                      <th className="text-left py-2">Title</th>
                      <th className="text-left py-2">Hours</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Fetched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 font-mono">
                          <a 
                            href={`https://training.gov.au/Training/Details/${item.code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            {item.code}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="py-2 max-w-xs truncate">{item.title}</td>
                        <td className="py-2">{item.nominal_hours || '-'}</td>
                        <td className="py-2">{item.status || '-'}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {format(new Date(item.fetched_at), 'PP')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="orgs">
              <ScrollArea className="h-64">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Code</th>
                      <th className="text-left py-2">Name</th>
                      <th className="text-left py-2">State</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Fetched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organisations.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 font-mono">
                          <a 
                            href={`https://training.gov.au/Organisation/Details/${item.code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            {item.code}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="py-2 max-w-xs truncate">{item.legal_name}</td>
                        <td className="py-2">{item.state || '-'}</td>
                        <td className="py-2">{item.status || '-'}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {format(new Date(item.fetched_at), 'PP')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}