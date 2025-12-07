import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

interface FindingCardProps {
  finding: any;
  auditId: number;
}

export const FindingCard = ({ finding }: FindingCardProps) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className={`h-5 w-5 mt-0.5 ${
              finding.priority === 'high' ? 'text-destructive' : 
              finding.priority === 'medium' ? 'text-primary' : 
              'text-muted-foreground'
            }`} />
            <div>
              <CardTitle className="text-base">Finding</CardTitle>
              <Badge variant={getPriorityColor(finding.priority)} className="mt-2">
                {finding.priority} priority
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">Summary</p>
            <p className="text-sm text-muted-foreground">{finding.summary}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Impact</p>
            <p className="text-sm text-muted-foreground">{finding.impact}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
