import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Eye, FileCheck } from 'lucide-react';
import { format } from 'date-fns';

interface AuditRow {
  id: string;
  tenant_id: number;
  status: string;
  audit_date: string;
  score_pct: number | null;
  created_at: string;
  tenant_name: string;
  template_name: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'completed': return 'default';
    case 'in_progress': return 'secondary';
    case 'draft': return 'outline';
    default: return 'outline';
  }
};

const ComplianceAuditGlobal = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['compliance-audits-global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_audits')
        .select(`
          id,
          tenant_id,
          status,
          audit_date,
          score_pct,
          created_at,
          tenants!inner(company_name),
          compliance_templates!inner(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        status: row.status,
        audit_date: row.audit_date,
        score_pct: row.score_pct,
        created_at: row.created_at,
        tenant_name: row.tenants?.company_name ?? 'Unknown',
        template_name: row.compliance_templates?.name ?? 'Unknown',
      })) as AuditRow[];
    },
  });

  const filtered = audits.filter((a) =>
    a.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
    a.template_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileCheck className="h-6 w-6 text-primary" />
              Compliance Auditor
            </h1>
            <p className="text-muted-foreground mt-1">All audits across tenants</p>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by tenant or template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="text-muted-foreground py-8 text-center">Loading audits…</div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            {search ? 'No audits match your search.' : 'No audits found.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Audit Date</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((audit) => (
                <TableRow key={audit.id}>
                  <TableCell className="font-medium">{audit.tenant_name}</TableCell>
                  <TableCell>{audit.template_name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(audit.status)}>
                      {audit.status?.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {audit.audit_date
                      ? format(new Date(audit.audit_date), 'dd MMM yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {audit.score_pct != null ? `${Number(audit.score_pct).toFixed(0)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        navigate(
                          `/compliance-audits/${audit.tenant_id}/audit/${audit.id}${audit.status === 'completed' ? '/report' : ''}`
                        )
                      }
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ComplianceAuditGlobal;
