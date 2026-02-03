import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, FileText, CheckCircle2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ClientImpactReport } from '@/types/clientImpact';
import { REPORT_STATUS_CONFIG } from '@/types/clientImpact';

interface ImpactReportCardProps {
  report: ClientImpactReport;
  onView: (id: string) => void;
  showClientInfo?: boolean;
}

export function ImpactReportCard({ report, onView, showClientInfo }: ImpactReportCardProps) {
  const statusConfig = REPORT_STATUS_CONFIG[report.overall_status];
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{report.reporting_period}</CardTitle>
          </div>
          <Badge 
            variant="outline" 
            className={cn('shrink-0', statusConfig.color, statusConfig.bgColor)}
          >
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>
              {format(new Date(report.period_start), 'MMM d')} – {format(new Date(report.period_end), 'MMM d, yyyy')}
            </span>
          </div>
          {report.is_published && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Published</span>
            </div>
          )}
        </div>
        
        {report.executive_summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {report.executive_summary}
          </p>
        )}
        
        {report.focus_areas && report.focus_areas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {report.focus_areas.map((area, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {area}
              </Badge>
            ))}
          </div>
        )}
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full gap-2"
          onClick={() => onView(report.id)}
        >
          <Eye className="h-4 w-4" />
          View Report
        </Button>
      </CardContent>
    </Card>
  );
}
