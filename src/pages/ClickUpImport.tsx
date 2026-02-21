import { useState, useCallback } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileUp, CheckCircle2, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { mapRowForTable, getPreviewColumns, type ImportMode } from "@/utils/clickup-import-mappings";

const BATCH_SIZE = 50;

export default function ClickUpImport() {
  const [mode, setMode] = useState<ImportMode>("clickup_tasks");
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; errors: number; resolved?: number } | null>(null);
  const [resolving, setResolving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete(results) {
        const headers = results.meta.fields ?? [];
        setCsvHeaders(headers);
        const mapped = (results.data as Record<string, string>[]).map((row) =>
          mapRowForTable(row, mode)
        );
        // Filter out rows with no task_id
        const valid = mapped.filter((r) => r.task_id);
        setParsedRows(valid);
      },
      error(err) {
        toast({ title: "CSV parse error", description: err.message, variant: "destructive" });
      },
    });
  }, [toast, mode]);

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    setProgress(0);
    let totalInserted = 0;
    let totalErrors = 0;

    const batches = [];
    for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
      batches.push(parsedRows.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      const { data, error } = await supabase.functions.invoke("import-clickup-csv", {
        body: { rows: batches[i], target_table: mode },
      });

      if (error) {
        totalErrors += batches[i].length;
      } else {
        totalInserted += data?.inserted ?? 0;
        totalErrors += data?.errors ?? 0;
      }

      setProgress(Math.round(((i + 1) / batches.length) * 100));
    }

    setResult({ inserted: totalInserted, errors: totalErrors });
    setImporting(false);
    toast({
      title: "Import complete",
      description: `${totalInserted} rows imported, ${totalErrors} errors.`,
    });
  };

  const handleResolveTenants = async () => {
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-clickup-csv", {
        body: { action: "resolve_tenants" },
      });
      if (error) throw error;
      const resolved = data?.resolved ?? 0;
      toast({
        title: "Tenant Resolution Complete",
        description: resolved > 0
          ? `${resolved} tenant ID${resolved === 1 ? "" : "s"} resolved from unicorn_url.`
          : "No unresolved rows found — all tenant IDs are already set or URLs could not be matched.",
      });
    } catch (err) {
      toast({
        title: "Resolution failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
  };

  const handleModeChange = (newMode: ImportMode) => {
    setMode(newMode);
    // Reset file state when switching modes
    setFile(null);
    setParsedRows([]);
    setCsvHeaders([]);
    setResult(null);
  };

  const previewCols = getPreviewColumns(mode);
  const previewRows = parsedRows.slice(0, 5);

  // Count mapped vs unmapped headers
  const mappedCount = csvHeaders.filter((h) => {
    const row = { [h]: "test" };
    const result = mapRowForTable(row as any, mode);
    return Object.keys(result).length > 0;
  }).length;
  const unmappedCount = csvHeaders.length - mappedCount;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tasks")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">ClickUp CSV Importer</h1>
            <p className="text-sm text-muted-foreground">
              Import ClickUp data into Unicorn 2.0
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import Type</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button
              variant={mode === "clickup_tasks" ? "default" : "outline"}
              onClick={() => handleModeChange("clickup_tasks")}
              className="flex-1"
            >
              <div className="text-left">
                <div className="font-medium">ClickUp Export</div>
                <div className="text-xs opacity-70">Raw task data → clickup_tasks</div>
              </div>
            </Button>
            <Button
              variant={mode === "clickup_tasksdb" ? "default" : "outline"}
              onClick={() => handleModeChange("clickup_tasksdb")}
              className="flex-1"
            >
              <div className="text-left">
                <div className="font-medium">Dashboard Export</div>
                <div className="text-xs opacity-70">Enriched data → clickup_tasksdb</div>
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* Manual Tenant Resolution */}
        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Resolve Tenant IDs</p>
              <p className="text-xs text-muted-foreground">
                Scan all clickup_tasksdb rows with missing tenant_id and resolve from unicorn_url
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleResolveTenants}
              disabled={resolving}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${resolving ? "animate-spin" : ""}`} />
              {resolving ? "Resolving…" : "Resolve Now"}
            </Button>
          </CardContent>
        </Card>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" /> Upload CSV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 cursor-pointer hover:border-primary/50 transition-colors">
              <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Click or drag a .csv file here"}
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          </CardContent>
        </Card>

        {/* Summary */}
        {parsedRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mapping Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{parsedRows.length} rows parsed</Badge>
                <Badge className="bg-green-100 text-green-800">{mappedCount} mapped columns</Badge>
                {unmappedCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    {unmappedCount} unmapped (ignored)
                  </Badge>
                )}
                <Badge variant="outline">
                  Target: {mode === "clickup_tasks" ? "clickup_tasks" : "clickup_tasksdb"}
                </Badge>
              </div>
              {mode === "clickup_tasksdb" && (
                <p className="text-xs text-muted-foreground">
                  tenant_id will be auto-resolved from unicorn_url after import.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {previewRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview (first 5 rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewCols.map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {previewCols.map((c) => (
                        <TableCell key={c} className="max-w-[200px] truncate">
                          {String(row[c] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Import */}
        {parsedRows.length > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {importing && (
                <Progress value={progress} showValue label="Importing…" />
              )}
              {result && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span>{result.inserted} rows imported</span>
                  {result.errors > 0 && (
                    <>
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <span>{result.errors} errors</span>
                    </>
                  )}
                </div>
              )}
              <Button
                onClick={handleImport}
                isLoading={importing}
                disabled={importing || parsedRows.length === 0}
              >
                Import {parsedRows.length} Rows to {mode === "clickup_tasks" ? "clickup_tasks" : "clickup_tasksdb"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
