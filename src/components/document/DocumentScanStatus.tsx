import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Scan, Check, AlertCircle, Loader2, FileText, Table } from "lucide-react";
import { useDocumentScan } from "@/hooks/useDocumentScan";

interface DocumentScanStatusProps {
  documentId: number;
  scanStatus?: string | null;
  scannedAt?: string | null;
  mergeFields?: string[];
  namedRanges?: string[];
  documentType?: string;
  onScanComplete?: () => void;
}

export function DocumentScanStatus({
  documentId,
  scanStatus,
  scannedAt,
  mergeFields = [],
  namedRanges = [],
  documentType,
  onScanComplete
}: DocumentScanStatusProps) {
  const { scanDocument, scanning } = useDocumentScan();
  const [localMergeFields, setLocalMergeFields] = useState(mergeFields);
  const [localNamedRanges, setLocalNamedRanges] = useState(namedRanges);
  const [localScanStatus, setLocalScanStatus] = useState(scanStatus);

  const handleScan = async () => {
    const result = await scanDocument(documentId);
    if (result) {
      setLocalMergeFields(result.merge_fields);
      setLocalNamedRanges(result.named_ranges);
      setLocalScanStatus("completed");
      onScanComplete?.();
    }
  };

  const isExcel = documentType?.toLowerCase() === "excel" || documentType?.toLowerCase() === "xlsx";
  const isScanned = localScanStatus === "completed";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Merge Fields Badge */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={isScanned && localMergeFields.length > 0 ? "default" : "outline"}
              className="gap-1"
            >
              <FileText className="h-3 w-3" />
              {isScanned ? `${localMergeFields.length} fields` : "Not scanned"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {isScanned && localMergeFields.length > 0 ? (
              <div>
                <p className="font-medium mb-1">Merge Fields Detected:</p>
                <ul className="text-xs space-y-0.5">
                  {localMergeFields.slice(0, 10).map(field => (
                    <li key={field}>• {field}</li>
                  ))}
                  {localMergeFields.length > 10 && (
                    <li className="text-muted-foreground">...and {localMergeFields.length - 10} more</li>
                  )}
                </ul>
              </div>
            ) : isScanned ? (
              <p>No merge fields detected</p>
            ) : (
              <p>Click "Scan" to detect merge fields</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Named Ranges Badge (Excel only) */}
      {isExcel && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant={isScanned && localNamedRanges.length > 0 ? "secondary" : "outline"}
                className="gap-1"
              >
                <Table className="h-3 w-3" />
                {isScanned ? `${localNamedRanges.length} ranges` : "—"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {isScanned && localNamedRanges.length > 0 ? (
                <div>
                  <p className="font-medium mb-1">Named Ranges Detected:</p>
                  <ul className="text-xs space-y-0.5">
                    {localNamedRanges.slice(0, 10).map(range => (
                      <li key={range}>• {range}</li>
                    ))}
                    {localNamedRanges.length > 10 && (
                      <li className="text-muted-foreground">...and {localNamedRanges.length - 10} more</li>
                    )}
                  </ul>
                </div>
              ) : isScanned ? (
                <p>No named ranges detected</p>
              ) : (
                <p>Click "Scan" to detect named ranges</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Scan Status Indicator */}
      {isScanned ? (
        <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
          <Check className="h-3 w-3" />
          Scanned
        </Badge>
      ) : localScanStatus === "error" ? (
        <Badge variant="outline" className="gap-1 text-destructive border-destructive/20">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      ) : null}

      {/* Scan Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScan}
        disabled={scanning}
        className="h-6 px-2 text-xs"
      >
        {scanning ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <Scan className="h-3 w-3 mr-1" />
            {isScanned ? "Re-scan" : "Scan now"}
          </>
        )}
      </Button>
    </div>
  );
}
