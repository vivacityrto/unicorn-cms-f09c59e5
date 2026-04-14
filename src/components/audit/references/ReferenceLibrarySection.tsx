import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Download, Bot, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SourceBadge, OutcomeBadge } from './ReferenceBadges';
import { useAllAuditReferences } from '@/hooks/useAuditReferences';
import { SOURCE_OPTIONS } from '@/types/auditReferences';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export function ReferenceLibrarySection() {
  const [expanded, setExpanded] = useState(false);
  const { data: refs = [], isLoading } = useAllAuditReferences();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const filtered = useMemo(() => {
    return refs.filter(r => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !(r.client_name?.toLowerCase().includes(s) ||
            r.source_label?.toLowerCase().includes(s) ||
            r.file_name?.toLowerCase().includes(s))
        ) return false;
      }
      return true;
    });
  }, [refs, search, sourceFilter]);

  const handleDownload = async (filePath: string) => {
    const { data } = await supabase.storage.from('audit-references').createSignedUrl(filePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const aiStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'processing':
      case 'pending': return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <span className="text-xs text-muted-foreground">—</span>;
    }
  };

  return (
    <div className="space-y-4">
      <button
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Reference Library
        <span className="text-xs font-normal normal-case">({refs.length})</span>
      </button>

      {expanded && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search client or label…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {SOURCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No reference audits found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Framework</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>AI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.client_name || '—'}</TableCell>
                    <TableCell><SourceBadge source={r.source} /></TableCell>
                    <TableCell><OutcomeBadge outcome={r.audit_outcome} /></TableCell>
                    <TableCell className="text-sm">
                      {r.audit_date ? format(new Date(r.audit_date), 'd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{r.standards_framework || '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(r.file_path)}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        <span className="truncate max-w-[120px]">{r.file_name}</span>
                      </Button>
                    </TableCell>
                    <TableCell>{aiStatusIcon(r.ai_status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
