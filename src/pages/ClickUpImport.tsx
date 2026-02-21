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
import { Upload, FileUp, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * ClickUp CSV → clickup_tasksdb column mapping.
 * Keys = CSV header (lowercased/trimmed), values = DB column name.
 */
const CSV_TO_DB_MAP: Record<string, string> = {
  task_id: "task_id",
  task_custom_id: "task_custom_id",
  task_name: "task_name",
  task_content: "task_content",
  status: "status",
  date_created: "date_created",
  due_date: "due_date",
  start_date: "start_date",
  assignees: "assignee",
  tags: "tags",
  priority: "priority",
  list_name: "list",
  folder_name_path: "folder",
  space_name: "space",
  time_estimated: "time_estimate",
  comments: "latest_comment",
  assigned_comments: "assigned_comment_count",
  time_spent: "time_logged",
  rolled_up_time: "time_logged_rolled_up",
};

/** Fallback text fields – use if primary is empty */
const FALLBACK_MAP: Record<string, string> = {
  date_created_text: "date_created",
  due_date_text: "due_date",
  start_date_text: "start_date",
  time_estimated_text: "time_estimate",
  time_spent_text: "time_logged",
  rolled_up_time_text: "time_logged_rolled_up",
};

const IGNORED_COLUMNS = new Set(["checklists", "parent_id"]);
const BATCH_SIZE = 50;

function mapRow(csvRow: Record<string, string>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  // Direct mappings
  for (const [csvKey, dbCol] of Object.entries(CSV_TO_DB_MAP)) {
    const val = csvRow[csvKey]?.trim();
    if (val) {
      if (dbCol === "assignee") {
        // Parse assignees as JSON array
        try {
          mapped[dbCol] = JSON.parse(val);
        } catch {
          mapped[dbCol] = val.split(",").map((s) => s.trim());
        }
      } else {
        mapped[dbCol] = val;
      }
    }
  }

  // Fallback fields – only fill if primary is empty
  for (const [csvKey, dbCol] of Object.entries(FALLBACK_MAP)) {
    if (!mapped[dbCol]) {
      const val = csvRow[csvKey]?.trim();
      if (val) mapped[dbCol] = val;
    }
  }

  return mapped;
}

export default function ClickUpImport() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; errors: number } | null>(null);
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
      complete(results) {
        const headers = results.meta.fields ?? [];
        setCsvHeaders(headers);
        const mapped = (results.data as Record<string, string>[]).map(mapRow);
        setParsedRows(mapped);
      },
      error(err) {
        toast({ title: "CSV parse error", description: err.message, variant: "destructive" });
      },
    });
  }, [toast]);

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
        body: { rows: batches[i] },
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

  // Determine mapped vs unmapped headers
  const mappedHeaders = csvHeaders.filter(
    (h) => CSV_TO_DB_MAP[h] || FALLBACK_MAP[h]
  );
  const unmappedHeaders = csvHeaders.filter(
    (h) => !CSV_TO_DB_MAP[h] && !FALLBACK_MAP[h] && !IGNORED_COLUMNS.has(h)
  );

  // Preview columns
  const previewCols = Object.values(CSV_TO_DB_MAP).slice(0, 8);
  const previewRows = parsedRows.slice(0, 5);

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
              Import ClickUp task exports into the clickup_tasksdb table
            </p>
          </div>
        </div>

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
                <Badge className="bg-green-100 text-green-800">{mappedHeaders.length} mapped columns</Badge>
                {unmappedHeaders.length > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    {unmappedHeaders.length} unmapped (ignored)
                  </Badge>
                )}
              </div>
              {unmappedHeaders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Ignored headers: {unmappedHeaders.join(", ")}
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
                Import {parsedRows.length} Rows
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
