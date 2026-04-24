import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Bot, Trash2, Pencil } from 'lucide-react';
import { useAuditFindings } from '@/hooks/useAuditWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { AddFindingForm } from './AddFindingForm';
import { cn } from '@/lib/utils';

interface FindingsTabProps {
  auditId: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-green-100 text-green-800 border-green-300',
};

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function FindingsTab({ auditId }: FindingsTabProps) {
  const { data: findings, createFinding, updateFinding, deleteFinding } = useAuditFindings(auditId);
  const { session } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const filtered = findings?.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'ai') return f.is_auto_generated;
    if (filter === 'manual') return !f.is_auto_generated;
    return f.priority === filter;
  }) || [];

  const grouped = PRIORITY_ORDER.map(p => ({
    priority: p,
    findings: filtered.filter(f => f.priority === p),
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
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
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
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Finding
        </Button>
      </div>

      {showForm && (
        <AddFindingForm
          auditId={auditId}
          onSave={(f) => {
            createFinding.mutate({ ...f, created_by: session?.user?.id });
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
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[f.priority])}>
                            {f.priority}
                          </Badge>
                          {f.standard_reference && (
                            <span className="text-xs text-muted-foreground">{f.standard_reference}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{f.summary}</p>
                        {f.detail && <p className="text-xs text-muted-foreground">{f.detail}</p>}
                        {f.impact && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Impact:</span> {f.impact}
                          </p>
                        )}
                        {f.is_auto_generated && (
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <Bot className="h-3 w-3" /> AI-generated
                          </div>
                        )}
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
