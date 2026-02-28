import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Search, FolderOpen, CheckCircle2, AlertCircle, XCircle,
  ExternalLink, RefreshCw, FolderPlus, ArrowLeft, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';

interface TenantRow {
  id: number;
  name: string;
  rto_id: string | null;
  sp_drive_id: string | null;
  sp_root_item_id: string | null;
  sp_root_name: string | null;
  sp_root_folder_url: string | null;
  sp_compliance_item_id: string | null;
  sp_match_method: string | null;
  sp_verified_at: string | null;
}

interface FolderCandidate {
  item_id: string;
  name: string;
  web_url: string;
  match_type: 'stored' | 'rtoid' | 'name';
  confidence: 'high' | 'medium' | 'low';
}

const PAGE_SIZE = 25;

export default function SharePointFolderMapping() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [page, setPage] = useState(1);

  // Resolve dialog state
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveTenant, setResolveTenant] = useState<TenantRow | null>(null);
  const [candidates, setCandidates] = useState<FolderCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Compliance folder dialog
  const [complianceTenant, setComplianceTenant] = useState<TenantRow | null>(null);
  const [creatingCompliance, setCreatingCompliance] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch tenants with their SharePoint settings
      const { data: tenantsData, error } = await supabase
        .from('tenants')
        .select('id, name, rto_id')
        .order('name');

      if (error) throw error;

      // Fetch SP settings separately
      const { data: spData } = await supabase
        .from('tenant_sharepoint_settings')
        .select('tenant_id, drive_id, root_item_id, root_name, root_folder_url, compliance_docs_folder_item_id, match_method, verified_at');

      const spMap = new Map(
        (spData || []).map((s: Record<string, unknown>) => [s.tenant_id as number, s])
      );

      const rows: TenantRow[] = (tenantsData || []).map((t: { id: number; name: string; rto_id: string | null }) => {
        const sp = spMap.get(t.id) as Record<string, unknown> | undefined;
        return {
          id: t.id,
          name: t.name,
          rto_id: t.rto_id,
          sp_drive_id: (sp?.drive_id as string) || null,
          sp_root_item_id: (sp?.root_item_id as string) || null,
          sp_root_name: (sp?.root_name as string) || null,
          sp_root_folder_url: (sp?.root_folder_url as string) || null,
          sp_compliance_item_id: (sp?.compliance_docs_folder_item_id as string) || null,
          sp_match_method: (sp?.match_method as string) || null,
          sp_verified_at: (sp?.verified_at as string) || null,
        };
      });

      setTenants(rows);
    } catch (err) {
      toast.error('Failed to load tenants');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const filtered = tenants.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.rto_id || '').toLowerCase().includes(q)) return false;
    }
    if (filterStatus === 'mapped' && !t.sp_root_item_id) return false;
    if (filterStatus === 'unmapped' && t.sp_root_item_id) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const mappedCount = tenants.filter(t => t.sp_root_item_id).length;
  const complianceCount = tenants.filter(t => t.sp_compliance_item_id).length;

  // ── Resolve folder search ──
  const handleResolve = async (tenant: TenantRow) => {
    setResolveTenant(tenant);
    setCandidates([]);
    setResolveDialogOpen(true);
    setSearching(true);

    try {
      const { data, error } = await supabase.functions.invoke('resolve-tenant-folder', {
        body: { tenant_id: tenant.id, action: 'search' },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Search failed');
        setCandidates([]);
      } else {
        setCandidates(data.candidates || []);
        if ((data.candidates || []).length === 0) {
          toast.info('No folder candidates found in SharePoint');
        }
      }
    } catch (err) {
      toast.error('Failed to search SharePoint');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmFolder = async (candidate: FolderCandidate) => {
    if (!resolveTenant) return;
    setConfirming(true);

    try {
      const { data, error } = await supabase.functions.invoke('resolve-tenant-folder', {
        body: {
          tenant_id: resolveTenant.id,
          action: 'confirm',
          folder_item_id: candidate.item_id,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to confirm mapping');
      } else {
        toast.success(`Folder mapped: ${candidate.name}`);
        setResolveDialogOpen(false);
        fetchTenants();
      }
    } catch (err) {
      toast.error('Failed to confirm folder mapping');
    } finally {
      setConfirming(false);
    }
  };

  // ── Verify/create compliance folder ──
  const handleVerifyCompliance = async (tenant: TenantRow) => {
    setComplianceTenant(tenant);
    setCreatingCompliance(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-compliance-folder', {
        body: { tenant_id: tenant.id, create_category_subfolders: true },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to verify compliance folder');
      } else {
        const msg = data.already_exists
          ? 'Compliance folder verified'
          : 'Compliance folder created';
        const subs = data.category_subfolders;
        if (subs?.created?.length) {
          toast.success(`${msg}. Created ${subs.created.length} category subfolders.`);
        } else {
          toast.success(msg);
        }
        fetchTenants();
      }
    } catch (err) {
      toast.error('Failed to verify compliance folder');
    } finally {
      setCreatingCompliance(false);
      setComplianceTenant(null);
    }
  };

  const getStatusBadge = (tenant: TenantRow) => {
    if (!tenant.sp_root_item_id) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Unmapped</Badge>;
    }
    if (tenant.sp_verified_at) {
      return <Badge className="gap-1 bg-primary"><CheckCircle2 className="h-3 w-3" />Verified</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />Mapped</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/manage-documents')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SharePoint Folder Mapping</h1>
              <p className="text-sm text-muted-foreground">
                Map tenants to their SharePoint client folders for document generation
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchTenants} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterStatus('all')}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{tenants.length}</div>
              <p className="text-sm text-muted-foreground">Total Tenants</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterStatus('mapped')}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{mappedCount}</div>
              <p className="text-sm text-muted-foreground">Folders Mapped</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterStatus('unmapped')}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{tenants.length - mappedCount}</div>
              <p className="text-sm text-muted-foreground">Unmapped</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tenant name or RTO ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-10"
            />
          </div>
          <Badge
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            className="cursor-pointer px-4 py-2"
            onClick={() => { setFilterStatus('all'); setPage(1); }}
          >All</Badge>
          <Badge
            variant={filterStatus === 'mapped' ? 'default' : 'outline'}
            className="cursor-pointer px-4 py-2"
            onClick={() => { setFilterStatus('mapped'); setPage(1); }}
          >Mapped</Badge>
          <Badge
            variant={filterStatus === 'unmapped' ? 'default' : 'outline'}
            className="cursor-pointer px-4 py-2"
            onClick={() => { setFilterStatus('unmapped'); setPage(1); }}
          >Unmapped</Badge>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>RTO ID</TableHead>
                  <TableHead>Folder Status</TableHead>
                  <TableHead>SharePoint Folder</TableHead>
                  <TableHead>Compliance Docs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : pageData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No tenants found
                    </TableCell>
                  </TableRow>
                ) : pageData.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.id}</TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.rto_id || '—'}</TableCell>
                    <TableCell>{getStatusBadge(t)}</TableCell>
                    <TableCell>
                      {t.sp_root_folder_url ? (
                        <a
                          href={t.sp_root_folder_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          <FolderOpen className="h-3 w-3" />
                          {t.sp_root_name || 'Open'}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.sp_compliance_item_id ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          Ready
                        </Badge>
                      ) : t.sp_root_item_id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleVerifyCompliance(t)}
                          disabled={creatingCompliance && complianceTenant?.id === t.id}
                        >
                          {creatingCompliance && complianceTenant?.id === t.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FolderPlus className="h-3 w-3 mr-1" />
                          )}
                          Create
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResolve(t)}
                      >
                        <Search className="h-3 w-3 mr-1" />
                        {t.sp_root_item_id ? 'Re-map' : 'Map Folder'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p > totalPages || p < 1) return null;
                return (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={() => setPage(p)}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        {/* Resolve Folder Dialog */}
        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Map SharePoint Folder</DialogTitle>
              <DialogDescription>
                {resolveTenant
                  ? `Finding folders for: ${resolveTenant.name}${resolveTenant.rto_id ? ` (${resolveTenant.rto_id})` : ''}`
                  : 'Select a folder to map'}
              </DialogDescription>
            </DialogHeader>

            {searching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                <span className="text-muted-foreground">Searching SharePoint...</span>
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <XCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No candidate folders found.</p>
                <p className="text-xs mt-1">Ensure a Client Files site is configured in the SharePoint Sites registry.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {candidates.map((c) => (
                    <Card key={c.item_id} className="hover:border-primary/50 transition-colors">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium truncate">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {c.match_type === 'stored' ? 'Stored' : c.match_type === 'rtoid' ? 'RTO ID Match' : 'Name Match'}
                            </Badge>
                            <Badge
                              variant={c.confidence === 'high' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {c.confidence}
                            </Badge>
                            {c.web_url && (
                              <a
                                href={c.web_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                              >
                                <ExternalLink className="h-3 w-3" />
                                View
                              </a>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleConfirmFolder(c)}
                          disabled={confirming}
                        >
                          {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                          Confirm
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
