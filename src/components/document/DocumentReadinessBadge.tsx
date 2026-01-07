import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentReadiness, DocumentReadiness } from '@/hooks/useExcelDataSources';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

interface DocumentReadinessBadgeProps {
  documentId: number;
  tenantId?: number;
  isExcel?: boolean;
  showMergeStatus?: boolean;
  showDataSourcesStatus?: boolean;
  compact?: boolean;
}

export function DocumentReadinessBadge({
  documentId,
  tenantId,
  isExcel = false,
  showMergeStatus = true,
  showDataSourcesStatus = true,
  compact = false
}: DocumentReadinessBadgeProps) {
  const { validateDocument } = useDocumentReadiness();
  const [readiness, setReadiness] = useState<DocumentReadiness | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      setLoading(true);
      const result = await validateDocument(documentId, tenantId);
      setReadiness(result);
      setLoading(false);
    };
    check();
  }, [documentId, tenantId]);

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (!readiness) return null;

  const getStatusIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'warn':
        return <AlertTriangle className="h-3.5 w-3.5" />;
      case 'fail':
        return <XCircle className="h-3.5 w-3.5" />;
    }
  };

  const getStatusVariant = (status: 'pass' | 'warn' | 'fail'): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'pass':
        return 'default';
      case 'warn':
        return 'secondary';
      case 'fail':
        return 'destructive';
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        {showMergeStatus && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant={getStatusVariant(readiness.merge_status)}
                className="gap-1 cursor-help"
              >
                {getStatusIcon(readiness.merge_status)}
                {!compact && (
                  <span>
                    {readiness.merge_status === 'pass' && 'Merge Ready'}
                    {readiness.merge_status === 'warn' && 'Merge Warning'}
                    {readiness.merge_status === 'fail' && 'Missing Fields'}
                  </span>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              {readiness.merge_status === 'pass' && (
                <p>All merge fields are ready</p>
              )}
              {readiness.merge_status === 'warn' && (
                <div>
                  <p className="font-medium mb-1">Cannot validate merge fields</p>
                  <p className="text-xs">No tenant context provided for validation</p>
                </div>
              )}
              {readiness.merge_status === 'fail' && (
                <div>
                  <p className="font-medium mb-1">Missing merge fields:</p>
                  <ul className="text-xs list-disc list-inside">
                    {readiness.missing_fields.map((field, i) => (
                      <li key={i}>{field}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {showDataSourcesStatus && isExcel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant={getStatusVariant(readiness.data_sources_status)}
                className="gap-1 cursor-help"
              >
                {getStatusIcon(readiness.data_sources_status)}
                {!compact && (
                  <span>
                    {readiness.data_sources_status === 'pass' && 'Data Ready'}
                    {readiness.data_sources_status === 'warn' && 'Data Warning'}
                    {readiness.data_sources_status === 'fail' && 'Missing Tables'}
                  </span>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              {readiness.data_sources_status === 'pass' && (
                <p>All data sources are configured</p>
              )}
              {readiness.data_sources_status === 'warn' && (
                <p>Some data sources may need attention</p>
              )}
              {readiness.data_sources_status === 'fail' && (
                <div>
                  <p className="font-medium mb-1">Missing data tables:</p>
                  <ul className="text-xs list-disc list-inside">
                    {readiness.missing_tables.map((table, i) => (
                      <li key={i}>{table}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
