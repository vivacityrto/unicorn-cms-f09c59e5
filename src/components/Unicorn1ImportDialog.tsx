import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  company_name: string;
  rto_id: string | null;
}

interface ImportResult {
  imported: Record<string, { status?: string; id?: number; reason?: string; created?: number; skipped?: number; total?: number }>;
}

export function Unicorn1ImportDialog({ open, onOpenChange, onSuccess }: Unicorn1ImportDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
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
  const [importStaffTasks, setImportStaffTasks] = useState(true);
  const [importClientTasks, setImportClientTasks] = useState(true);
  const [importEmails, setImportEmails] = useState(true);

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
            staff_task_instances: importStaffTasks,
            client_task_instances: importClientTasks,
            email_instances: importEmails,
          },
        },
      });
      if (error) throw error;
      setResult(data as ImportResult);
      toast({ title: 'Import complete', description: `Client ${selected.company_name} imported successfully.` });
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
    setImportStaffTasks(true);
    setImportClientTasks(true);
    setImportEmails(true);
    onOpenChange(false);
  };

  const instancesDisabled = !importPackages || !importStages;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Import from Unicorn 1
          </DialogTitle>
          <DialogDescription>
            Search the live Unicorn 1 database by client ID or name. Select a client and choose what to import.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID or company name..."
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
                        <p className="font-medium text-sm">{c.company_name}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">ID: {c.id}</Badge>
                          {c.rto_id && <Badge variant="secondary" className="text-xs">RTO: {c.rto_id}</Badge>}
                        </div>
                      </div>
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
                  <h3 className="font-semibold text-base">{selected.company_name}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    Change
                  </Button>
                </div>
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Unicorn 1 ID:</span>{' '}
                    <span className="font-medium">{selected.id}</span>
                  </div>
                  {selected.rto_id && (
                    <div>
                      <span className="text-muted-foreground">RTO ID:</span>{' '}
                      <span className="font-medium">{selected.rto_id}</span>
                    </div>
                  )}
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
                  description="Company name and RTO ID"
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
                  disabled={instancesDisabled}
                />
                <ImportOption
                  id="staff-tasks"
                  label="Staff task instances"
                  description="Staff task allocations linked to stages"
                  checked={importStaffTasks}
                  onCheckedChange={setImportStaffTasks}
                  disabled={instancesDisabled}
                />
                <ImportOption
                  id="client-tasks"
                  label="Client task instances"
                  description="Client task allocations linked to stages"
                  checked={importClientTasks}
                  onCheckedChange={setImportClientTasks}
                  disabled={instancesDisabled}
                />
                <ImportOption
                  id="emails"
                  label="Email instances"
                  description="Email allocations linked to stages"
                  checked={importEmails}
                  onCheckedChange={setImportEmails}
                  disabled={instancesDisabled}
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
              {Object.entries(result.imported).map(([key, val]) => (
                <ResultRow
                  key={key}
                  label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  status={val.status === 'skipped' ? 'skipped' : 'done'}
                  detail={
                    val.reason
                      ? val.reason
                      : val.total !== undefined
                        ? `${val.created} created, ${val.skipped} skipped of ${val.total}`
                        : val.id
                          ? `ID: ${val.id}`
                          : val.status || ''
                  }
                />
              ))}
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
          <AlertCircle className="h-4 w-4 text-warning" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}
