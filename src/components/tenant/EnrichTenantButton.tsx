/**
 * EnrichTenantButton – Unicorn 2.0
 *
 * SuperAdmin-only button on tenant profile pages to trigger web enrichment.
 * Scrapes tenant's website + summarises via Perplexity.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface EnrichTenantButtonProps {
  tenantId: number;
  website?: string;
  abn?: string;
  rtoCode?: string;
}

export function EnrichTenantButton({ tenantId, website, abn, rtoCode }: EnrichTenantButtonProps) {
  const { session } = useAuth();
  const { isSuperAdmin } = useRBAC();
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ summary_md: string; citations: any[] } | null>(null);

  const [formWebsite, setFormWebsite] = useState(website || '');
  const [formAbn, setFormAbn] = useState(abn || '');
  const [formRtoCode, setFormRtoCode] = useState(rtoCode || '');

  if (!isSuperAdmin) return null;

  const handleEnrich = async () => {
    if (!formWebsite && !formRtoCode) {
      toast({ title: 'Missing input', description: 'Provide at least a website or RTO code.', variant: 'destructive' });
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('research-enrich-tenant', {
        body: {
          tenant_id: tenantId,
          website: formWebsite || undefined,
          abn: formAbn || undefined,
          rto_code: formRtoCode || undefined,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (error) throw error;

      if (data?.ok) {
        setResult({ summary_md: data.summary_md, citations: data.citations || [] });
        toast({ title: 'Enrichment complete', description: 'Review the draft summary below.' });
      } else {
        throw new Error(data?.detail || 'Enrichment failed');
      }
    } catch (err) {
      console.error('Enrich error:', err);
      toast({ title: 'Enrichment failed', description: String(err), variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setFormWebsite(website || '');
          setFormAbn(abn || '');
          setFormRtoCode(rtoCode || '');
          setResult(null);
          setOpen(true);
        }}
        className="gap-1.5 text-xs"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Enrich Tenant
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Enrich Tenant Profile
            </DialogTitle>
            <DialogDescription>
              Scrape the tenant's public web presence and generate a compliance-focused summary.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              AI draft — needs human review before use
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-xs">Website Domain</Label>
                <Input
                  value={formWebsite}
                  onChange={(e) => setFormWebsite(e.target.value)}
                  placeholder="example.edu.au"
                  className="text-sm"
                  disabled={isRunning}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">ABN</Label>
                  <Input
                    value={formAbn}
                    onChange={(e) => setFormAbn(e.target.value)}
                    placeholder="12 345 678 901"
                    className="text-sm"
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <Label className="text-xs">RTO Code</Label>
                  <Input
                    value={formRtoCode}
                    onChange={(e) => setFormRtoCode(e.target.value)}
                    placeholder="12345"
                    className="text-sm"
                    disabled={isRunning}
                  />
                </div>
              </div>
            </div>

            {result && (
              <div className="space-y-2 border rounded-md p-3">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                  <span className="text-xs text-muted-foreground">Needs review</span>
                </div>
                <div className="text-xs prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {result.summary_md}
                </div>
                {result.citations.length > 0 && (
                  <div className="space-y-0.5 pt-1 border-t">
                    <p className="text-[10px] font-medium text-muted-foreground">Sources</p>
                    {result.citations.map((c: any) => (
                      <a
                        key={c.index}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[10px] text-primary hover:underline truncate"
                      >
                        [{c.index}] {c.url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isRunning}>
              Close
            </Button>
            <Button onClick={handleEnrich} disabled={isRunning} className="gap-1.5">
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enriching…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Run Enrichment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
