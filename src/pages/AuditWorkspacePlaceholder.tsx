import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, FileText, AlertTriangle, CheckSquare, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { AuditTypeBadge } from '@/components/audit/AuditTypeBadge';
import { AuditStatusBadge } from '@/components/audit/AuditStatusBadge';
import { useAudit } from '@/hooks/useClientAudits';
import { Skeleton } from '@/components/ui/skeleton';

export default function AuditWorkspacePlaceholder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: audit, isLoading } = useAudit(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Audit not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/audits')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Audits
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/audits')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Audits
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold md:text-2xl">{audit.title || 'Untitled Audit'}</h1>
        <AuditTypeBadge type={audit.audit_type} />
        <AuditStatusBadge status={audit.status} />
      </div>

      <Card>
        <CardContent className="p-8 text-center">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Audit workspace coming soon</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            The full audit form and AI document review will appear here.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sections Completed" value={0} icon={FileText} />
        <StatCard label="Findings" value={0} icon={AlertTriangle} />
        <StatCard label="Open Actions" value={0} icon={CheckSquare} />
        <StatCard label="Documents Uploaded" value={0} icon={Upload} />
      </div>
    </div>
  );
}
