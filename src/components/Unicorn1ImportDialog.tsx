import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, Database, CheckCircle2, AlertCircle, Download } from 'lucide-react';

interface Unicorn1ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface U1Client {
  id: number;
  companyname: string;
  rto_id: string | null;
  rto_name: string | null;
  legal_name: string | null;
  abn: string | null;
  acn: string | null;
  cricos_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  suburb: string | null;
  state_code: string | null;
  postcode: string | null;
  lms: string | null;
  accounting_system: string | null;
}

interface ImportResult {
  imported: {
    tenant?: { status: string; id?: number; reason?: string };
    package_instances?: { created: number; skipped: number; total: number };
    stage_instances?: { created: number; skipped: number; total: number };
    document_instances?: { created: number; skipped: number; total: number };
  };
}

export function Unicorn1ImportDialog({ open, onOpenChange, onSuccess }: Unicorn1ImportDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [clients, setClients] = useState<U1Client[]>([]);
  const [selected, setSelected] = useState<U1Client | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Import options
  const [importTenant, setImportTenant] = useState(true);
  const [importPackages, setImportPackages] = useState(true);
  const [importStages, setImportStages] = useState(true);
  const [importDocuments, setImportDocuments] = useState(true);

  const handleSearch = async () => {
    if (search.trim().length < 2) return;
    setSearching(true);
    setSelected(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-unicorn1-client', {
        body: { search: search.trim() },
      });
      if (error) throw error;
      setClients(data?.clients || []);
      if (!data?.clients?.length) {
        toast({ title: 'No results', description: 'No matching clients found in Unicorn 1.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Search failed', description: err.message || 'Could not connect to Unicorn 1', variant: 'destructive' });
      setClients([]);
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async () => {
    if (!selected) return;
    setImporting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-unicorn1-client', {
        body: {
          client_id: selected.id,
          import_options: {
            tenant: importTenant,
            package_instances: importPackages,
            stage_instances: importStages,
            document_instances: importDocuments,
          },
        },
      });
      if (error) throw error;
      setResult(data as ImportResult);
      toast({ title: 'Import complete', description: `Client ${selected.companyname} imported successfully.` });
      onSuccess?.();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message || 'Import error', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSearch('');
    setClients([]);
    setSelected(null);
    setResult(null);
    setImportTenant(true);
    setImportPackages(true);
    setImportStages(true);
    setImportDocuments(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Import from Unicorn 1
          </DialogTitle>
          <DialogDescription>
            Search the live Unicorn 1 database by client ID, RTO ID, or name. Select a client and choose what to import.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, RTO ID, or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || search.trim().length < 2}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>

        {/* Results List */}
        {clients.length > 0 && !selected && (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {clients.map((c) => (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelected(c)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{c.companyname}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">ID: {c.id}</Badge>
                          {c.rto_id && <Badge variant="secondary" className="text-xs">RTO: {c.rto_id}</Badge>}
                          {c.abn && <Badge variant="outline" className="text-xs">ABN: {c.abn}</Badge>}
                        </div>
                      </div>
                      {c.state_code && (
                        <span className="text-xs text-muted-foreground">{c.state_code}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Selected Client Preview */}
        {selected && !result && (
          <div className="space-y-4">
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">{selected.companyname}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    Change
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <Detail label="Unicorn 1 ID" value={selected.id} />
                  <Detail label="RTO ID" value={selected.rto_id} />
                  <Detail label="RTO Name" value={selected.rto_name} />
                  <Detail label="Legal Name" value={selected.legal_name} />
                  <Detail label="ABN" value={selected.abn} />
                  <Detail label="ACN" value={selected.acn} />
                  <Detail label="CRICOS" value={selected.cricos_id} />
                  <Detail label="Website" value={selected.website} />
                  <Detail label="LMS" value={selected.lms} />
                  <Detail label="State" value={selected.state_code} />
                </div>
                <div className="mt-2 p-2 bg-primary/5 rounded-md border border-primary/20">
                  <p className="text-xs text-primary font-medium">
                    ℹ️ Tenant ID in Unicorn 2.0 will be set to <strong>{selected.id}</strong> to match Unicorn 1
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Import Options */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Select data to import:</h4>
              <div className="space-y-2">
                <ImportOption
                  id="tenant"
                  label="Tenant details"
                  description="Company name, RTO ID, ABN, ACN, CRICOS, website, LMS"
                  checked={importTenant}
                  onCheckedChange={setImportTenant}
                />
                <ImportOption
                  id="packages"
                  label="Package instances"
                  description="Active and completed package allocations"
                  checked={importPackages}
                  onCheckedChange={setImportPackages}
                />
                <ImportOption
                  id="stages"
                  label="Stage instances"
                  description="Stage allocations linked to packages"
                  checked={importStages}
                  onCheckedChange={setImportStages}
                  disabled={!importPackages}
                />
                <ImportOption
                  id="documents"
                  label="Document instances"
                  description="Document allocations linked to stages"
                  checked={importDocuments}
                  onCheckedChange={setImportDocuments}
                  disabled={!importStages}
                />
              </div>
            </div>
          </div>
        )}

        {/* Import Result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <h4 className="font-semibold">Import Complete</h4>
            </div>
            <div className="space-y-2 text-sm">
              {result.imported.tenant && (
                <ResultRow
                  label="Tenant"
                  status={result.imported.tenant.status}
                  detail={result.imported.tenant.reason || `ID: ${result.imported.tenant.id}`}
                />
              )}
              {result.imported.package_instances && (
                <ResultRow
                  label="Package Instances"
                  status="done"
                  detail={`${result.imported.package_instances.created} created, ${result.imported.package_instances.skipped} skipped of ${result.imported.package_instances.total}`}
                />
              )}
              {result.imported.stage_instances && (
                <ResultRow
                  label="Stage Instances"
                  status="done"
                  detail={`${result.imported.stage_instances.created} created, ${result.imported.stage_instances.skipped} skipped of ${result.imported.stage_instances.total}`}
                />
              )}
              {result.imported.document_instances && (
                <ResultRow
                  label="Document Instances"
                  status="done"
                  detail={`${result.imported.document_instances.created} created, ${result.imported.document_instances.skipped} skipped of ${result.imported.document_instances.total}`}
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              {selected && (
                <Button onClick={handleImport} disabled={importing || (!importTenant && !importPackages)}>
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Import Selected
                    </>
                  )}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: any }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-medium">{String(value)}</span>
    </div>
  );
}

function ImportOption({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-2 rounded-md ${disabled ? 'opacity-50' : ''}`}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
        disabled={disabled}
      />
      <div>
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ResultRow({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
      <div className="flex items-center gap-2">
        {status === 'skipped' ? (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}
