import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTgaIntegration, ProbeResult, HealthCheckResult } from '@/hooks/useTgaIntegration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/ui/page-header';
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
} from 'lucide-react';
import { format } from 'date-fns';

export default function AdminTgaIntegration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, isSuperAdmin, hasTenantAdmin } = useAuth();
  
  // Get tenant_id from URL or user profile
  const urlTenantId = searchParams.get('tenant_id');
  const tenantId = urlTenantId ? parseInt(urlTenantId) : profile?.tenant_id;
  
  const {
    loading,
    canManage,
    healthCheck,
    cachedItems,
    jobs,
    fetchCachedItems,
    fetchJobs,
    runHealthCheck,
    queueSync,
    probeCode,
    syncCodes,
  } = useTgaIntegration(tenantId);

  const [probeInput, setProbeInput] = useState('');
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [syncInput, setSyncInput] = useState('');
  const [sampleCodes, setSampleCodes] = useState('BSB30120,CHC33021,HLTAID009');

  // Check access
  useEffect(() => {
    if (!isSuperAdmin() && tenantId && !hasTenantAdmin(tenantId)) {
      navigate('/dashboard');
    }
  }, [isSuperAdmin, hasTenantAdmin, tenantId, navigate]);

  // Load data on mount
  useEffect(() => {
    if (tenantId && canManage) {
      fetchCachedItems();
      fetchJobs();
    }
  }, [tenantId, canManage, fetchCachedItems, fetchJobs]);

  const handleHealthCheck = async () => {
    const codes = sampleCodes.split(',').map(c => c.trim()).filter(Boolean);
    await runHealthCheck(codes);
  };

  const handleProbe = async () => {
    if (!probeInput.trim()) return;
    const result = await probeCode(probeInput.trim());
    setProbeResult(result);
  };

  const handleSync = async () => {
    const codes = syncInput.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) return;
    await syncCodes(codes);
    setSyncInput('');
  };

  const handleQueueSync = async () => {
    const codes = syncInput.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) return;
    await queueSync(codes);
    setSyncInput('');
  };

  if (!canManage) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-muted-foreground">
              You need Admin access to view this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="TGA Integration"
        description="Training.gov.au integration health, sync, and diagnostics"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Health Check Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Health Check
            </CardTitle>
            <CardDescription>
              Verify TGA integration status and data freshness
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sample-codes">Sample Codes to Check</Label>
              <Input
                id="sample-codes"
                value={sampleCodes}
                onChange={(e) => setSampleCodes(e.target.value)}
                placeholder="BSB30120,CHC33021"
              />
            </div>
            
            <Button onClick={handleHealthCheck} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Run Health Check
            </Button>

            {healthCheck && (
              <div className="mt-4 space-y-3">
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <HealthItem
                    label="Tables Exist"
                    value={healthCheck.tables_exist}
                    icon={healthCheck.tables_exist ? CheckCircle : XCircle}
                  />
                  <HealthItem
                    label="RLS Enabled"
                    value={healthCheck.rls_enabled}
                    icon={healthCheck.rls_enabled ? Shield : AlertCircle}
                  />
                  <HealthItem
                    label="Total Cached"
                    value={healthCheck.total_cached}
                    icon={Database}
                    isNumber
                  />
                  <HealthItem
                    label="Stale Items"
                    value={healthCheck.stale_count}
                    icon={Clock}
                    isNumber
                    warn={healthCheck.stale_count > 0}
                  />
                </div>
                {healthCheck.sample_codes_requested > 0 && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm">
                      Sample codes: {healthCheck.sample_codes_found} / {healthCheck.sample_codes_requested} found
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Checked at: {format(new Date(healthCheck.checked_at), 'PPpp')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Probe Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Probe TGA Code
            </CardTitle>
            <CardDescription>
              Test fetching a code from TGA without writing to database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={probeInput}
                onChange={(e) => setProbeInput(e.target.value.toUpperCase())}
                placeholder="e.g., BSB30120"
                onKeyDown={(e) => e.key === 'Enter' && handleProbe()}
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

                {probeResult.mapped && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <p className="font-medium">{probeResult.mapped.title}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{probeResult.mapped.product_type}</Badge>
                      {probeResult.mapped.status && (
                        <Badge variant="secondary">{probeResult.mapped.status}</Badge>
                      )}
                      {probeResult.mapped.training_package && (
                        <Badge variant="outline">{probeResult.mapped.training_package}</Badge>
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
                      <pre className="p-2 bg-muted rounded text-xs overflow-auto">
                        {JSON.stringify(probeResult.raw, null, 2)}
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

        {/* Sync Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sync Products
            </CardTitle>
            <CardDescription>
              Fetch and cache training products from TGA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Product Codes (comma-separated)</Label>
              <Input
                value={syncInput}
                onChange={(e) => setSyncInput(e.target.value.toUpperCase())}
                placeholder="BSB30120,CHC33021,HLTAID009"
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={loading || !syncInput.trim()} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Sync Now
              </Button>
              <Button onClick={handleQueueSync} disabled={loading || !syncInput.trim()} variant="outline" className="flex-1">
                Queue Job
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Jobs Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Jobs
            </CardTitle>
            <CardDescription>
              Import job history
            </CardDescription>
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
                    <div key={job.id} className="p-2 border rounded-lg text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant={
                          job.status === 'done' ? 'default' :
                          job.status === 'failed' ? 'destructive' :
                          job.status === 'running' ? 'secondary' : 'outline'
                        }>
                          {job.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(job.created_at), 'PP p')}
                        </span>
                      </div>
                      <p className="text-xs mt-1">
                        {job.codes.length} codes • {job.rows_upserted} upserted
                      </p>
                      {job.error && (
                        <p className="text-xs text-destructive mt-1">{job.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cached Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Cached Products
          </CardTitle>
          <CardDescription>
            Training products cached for this tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchCachedItems} variant="ghost" size="sm" className="mb-3">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          {cachedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cached items</p>
          ) : (
            <ScrollArea className="h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Code</th>
                    <th className="text-left py-2 px-2">Title</th>
                    <th className="text-left py-2 px-2">Type</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Fetched</th>
                  </tr>
                </thead>
                <tbody>
                  {cachedItems.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-2 px-2 font-mono">
                        <a 
                          href={`https://training.gov.au/Training/Details/${item.product_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {item.product_code}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="py-2 px-2 max-w-xs truncate">{item.title}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline">{item.product_type}</Badge>
                      </td>
                      <td className="py-2 px-2">{item.status || '-'}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">
                        {format(new Date(item.fetched_at), 'PP')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper component for health check items
function HealthItem({ 
  label, 
  value, 
  icon: Icon, 
  isNumber = false,
  warn = false 
}: { 
  label: string; 
  value: boolean | number; 
  icon: React.ComponentType<{ className?: string }>;
  isNumber?: boolean;
  warn?: boolean;
}) {
  const color = isNumber 
    ? (warn ? 'text-warning' : 'text-muted-foreground')
    : (value ? 'text-green-500' : 'text-destructive');
    
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{isNumber ? value : (value ? 'Yes' : 'No')}</p>
      </div>
    </div>
  );
}