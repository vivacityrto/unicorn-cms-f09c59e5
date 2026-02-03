import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Calendar, 
  CheckCircle2, 
  Send, 
  Download,
  TrendingUp,
  Shield,
  Cog,
  Target,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ClientImpactReport, ClientImpactItem, ItemSection } from '@/types/clientImpact';
import { REPORT_STATUS_CONFIG, SECTION_CONFIG } from '@/types/clientImpact';
import { ImpactItemCard } from './ImpactItemCard';

interface ImpactReportViewProps {
  report: ClientImpactReport;
  items: ClientImpactItem[];
  onPublish?: () => void;
  isPublishing?: boolean;
  isVivacityUser?: boolean;
}

const SECTION_ICONS: Record<ItemSection, React.ReactNode> = {
  improvements: <TrendingUp className="h-5 w-5" />,
  risks: <Shield className="h-5 w-5" />,
  process_enhancements: <Cog className="h-5 w-5" />,
  forward_focus: <Target className="h-5 w-5" />,
};

export function ImpactReportView({ 
  report, 
  items, 
  onPublish, 
  isPublishing,
  isVivacityUser = false,
}: ImpactReportViewProps) {
  const statusConfig = REPORT_STATUS_CONFIG[report.overall_status];
  
  // Group items by section
  const groupedItems = items.reduce((acc, item) => {
    const section = item.section as ItemSection;
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {} as Record<ItemSection, ClientImpactItem[]>);
  
  const sections: ItemSection[] = ['improvements', 'risks', 'process_enhancements', 'forward_focus'];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Impact Report: {report.reporting_period}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(report.period_start), 'MMMM d')} – {format(new Date(report.period_end), 'MMMM d, yyyy')}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={cn('text-sm', statusConfig.color, statusConfig.bgColor)}
              >
                {statusConfig.label}
              </Badge>
              {report.is_published && (
                <Badge variant="outline" className="text-green-600 bg-green-50 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Published
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Executive Summary */}
          {report.executive_summary && (
            <div className="p-4 rounded-lg bg-muted/50">
              <h3 className="font-semibold text-sm mb-2">Executive Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {report.executive_summary}
              </p>
            </div>
          )}
          
          {/* Focus Areas */}
          {report.focus_areas && report.focus_areas.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Key Focus Areas</h3>
              <div className="flex flex-wrap gap-2">
                {report.focus_areas.map((area, i) => (
                  <Badge key={i} variant="secondary">
                    {area}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Actions for Vivacity users */}
          {isVivacityUser && !report.is_published && onPublish && (
            <div className="flex items-center gap-2 pt-2">
              <Button 
                onClick={onPublish} 
                disabled={isPublishing}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {isPublishing ? 'Publishing...' : 'Publish Report'}
              </Button>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Sections */}
      {sections.map((sectionKey) => {
        const sectionItems = groupedItems[sectionKey] || [];
        const config = SECTION_CONFIG[sectionKey];
        
        // Skip empty sections
        if (sectionItems.length === 0) return null;
        
        return (
          <Card key={sectionKey}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/10 text-primary">
                  {SECTION_ICONS[sectionKey]}
                </div>
                <div>
                  <CardTitle className="text-lg">{config.label}</CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {sectionItems.map((item) => (
                <ImpactItemCard key={item.id} item={item} />
              ))}
            </CardContent>
          </Card>
        );
      })}
      
      {/* Empty state */}
      {items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-lg mb-2">No Items Yet</h3>
            <p className="text-sm text-muted-foreground">
              This report has not yet been populated with impact items.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
