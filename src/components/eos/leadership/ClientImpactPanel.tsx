import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  ExternalLink,
  FileText,
  Mountain,
  AlertTriangle,
  CheckSquare
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface ClientImpactItem {
  clientId: number;
  clientName: string;
  summary: string;
  status: 'active' | 'pending' | 'resolved';
  nextAction?: string;
  sources: {
    type: 'todo' | 'rock' | 'issue' | 'meeting';
    id: string;
    title: string;
  }[];
}

interface ClientImpactPanelProps {
  items: ClientImpactItem[];
}

const statusStyles = {
  active: { label: 'Active', variant: 'default' as const, color: 'text-blue-600' },
  pending: { label: 'Pending', variant: 'secondary' as const, color: 'text-amber-600' },
  resolved: { label: 'Resolved', variant: 'outline' as const, color: 'text-emerald-600' },
};

const sourceIcons = {
  todo: CheckSquare,
  rock: Mountain,
  issue: AlertTriangle,
  meeting: FileText,
};

export function ClientImpactPanel({ items }: ClientImpactPanelProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Client Impact
          </CardTitle>
          <CardDescription>Internal reporting: EOS items linked to clients</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No client-linked EOS items</p>
            <p className="text-xs mt-1">Items tagged to clients will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Client Impact
            </CardTitle>
            <CardDescription>Internal reporting: EOS items linked to clients</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            Read-only
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item, index) => {
            const status = statusStyles[item.status];
            return (
              <div 
                key={`${item.clientId}-${index}`}
                className="p-4 rounded-lg border bg-muted/30"
              >
                {/* Client Header */}
                <div className="flex items-center justify-between mb-2">
                  <Link 
                    to={`/tenant/${item.clientId}`}
                    className="font-medium hover:underline flex items-center gap-2"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {item.clientName}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                  <Badge variant={status.variant} className={cn('text-xs', status.color)}>
                    {status.label}
                  </Badge>
                </div>

                {/* Summary */}
                <p className="text-sm text-muted-foreground mb-3">
                  {item.summary}
                </p>

                {/* Next Action */}
                {item.nextAction && (
                  <div className="text-sm mb-3 p-2 rounded bg-primary/5 border-l-2 border-primary">
                    <span className="font-medium">Next:</span> {item.nextAction}
                  </div>
                )}

                {/* Source Links */}
                <div className="flex flex-wrap gap-2">
                  {item.sources.map((source, sourceIndex) => {
                    const Icon = sourceIcons[source.type];
                    const linkMap = {
                      todo: '/eos/todos',
                      rock: '/eos/rocks',
                      issue: '/eos/risks-opportunities',
                      meeting: '/eos/meetings',
                    };
                    return (
                      <Link
                        key={`${source.type}-${sourceIndex}`}
                        to={`${linkMap[source.type]}?id=${source.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline bg-primary/5 px-2 py-1 rounded"
                      >
                        <Icon className="h-3 w-3" />
                        {source.type.charAt(0).toUpperCase() + source.type.slice(1)}: {source.title.slice(0, 30)}...
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4 italic">
          This section is read-only. Edit items in their source modules.
        </p>
      </CardContent>
    </Card>
  );
}
