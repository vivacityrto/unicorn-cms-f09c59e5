import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Bot, Trash2, Pencil, Search } from 'lucide-react';
import { useAuditFindings } from '@/hooks/useAuditWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { AddFindingForm } from './AddFindingForm';
import { cn } from '@/lib/utils';

interface FindingsTabProps {
  auditId: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
  low: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700',
};

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function FindingsTab({ auditId }: FindingsTabProps) {
  const { data: findings, createFinding, updateFinding, deleteFinding } = useAuditFindings(auditId);
  const { session } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [codeFilter, setCodeFilter] = useState('');

  const filtered = findings?.filter(f => {
    if (codeFilter.trim() && !(f.finding_code || '').toLowerCase().includes(codeFilter.trim().toLowerCase())) return false;
    if (filter === 'all') return true;
    if (filter === 'ai') return f.is_auto_generated;
    if (filter === 'manual') return !f.is_auto_generated;
    return f.priority === filter;
  }) || [];

  const grouped = PRIORITY_ORDER.map(p => ({
    priority: p,
    findings: filtered
      .filter(f => f.priority === p)
      .sort((a, b) => (a.finding_code || '').localeCompare(b.finding_code || '')),
  })).filter(g => g.findings.length > 0);

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'ai', label: 'AI-generated' },
    { value: 'manual', label: 'Manual' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-colors',
                filter === f.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              {f.label}
            </button>
          ))}
          <div className="relative ml-2">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
              placeholder="Filter by code (e.g. GOV-2)"
              className="h-7 pl-7 w-[180px] text-xs"
            />
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Finding
        </Button>
      </div>

      {showForm && (
        <AddFindingForm
          auditId={auditId}
          onSave={(f) => {
            createFinding.mutate({ ...f, audit_id: auditId, created_by: session?.user?.id });
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {grouped.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            No findings raised yet. Rate questions in the Audit Form or upload documents for AI review.
          </p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.priority} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.priority} ({group.findings.length})
            </h3>
            {group.findings.map(f => (
              editingId === f.id ? (
                <AddFindingForm
                  key={f.id}
                  auditId={auditId}
                  mode="edit"
                  initialValues={{
                    summary: f.summary,
                    detail: f.detail,
                    standard_reference: f.standard_reference,
                    regulatory_reference: f.regulatory_reference,
                    finding_code: f.finding_code,
                    impact: f.impact,
                    priority: f.priority,
                  }}
                  onSave={(updates) => {
                    updateFinding.mutate({ id: f.id, ...updates });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <Card key={f.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {f.finding_code && (
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted border">
                              {f.finding_code}
                            </span>
                          )}
                          <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[f.priority])}>
                            {f.priority}
                          </Badge>
                          <p className="text-sm font-medium flex-1 min-w-0">{f.summary}</p>
                        </div>
                        {f.regulatory_reference && (
                          <p className="text-xs text-muted-foreground">Regulatory: {f.regulatory_reference}</p>
                        )}
                        {f.detail && <p className="text-xs text-muted-foreground">{f.detail}</p>}
                        {f.impact && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Impact:</span> {f.impact}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(f.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {f.is_auto_generated && (
                            <span className="ml-2 inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <Bot className="h-3 w-3" /> AI-generated
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(f.id)} title="Edit finding">
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteFinding.mutate(f.id)} title="Delete finding">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            ))}
          </div>
        ))
      )}
    </div>
  );
}
