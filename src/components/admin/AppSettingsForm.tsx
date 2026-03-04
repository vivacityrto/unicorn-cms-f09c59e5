import { useState, useEffect } from "react";
import { Save, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { CodeTable, CodeTableRow, CodeTableColumn } from "@/services/codeTablesService";

interface AppSettingsFormProps {
  table: CodeTable;
  data: CodeTableRow[];
  loading: boolean;
  onSave: (whereClause: Record<string, any>, data: Record<string, any>) => void;
  saving: boolean;
}

const HIDDEN_COLUMNS = ["id", "created_by", "updated_by", "updated_at"];

function formatLabel(col: string): string {
  return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Group settings by prefix for visual organisation */
function groupColumns(columns: CodeTableColumn[]): { label: string; columns: CodeTableColumn[] }[] {
  const visible = columns.filter((c) => !HIDDEN_COLUMNS.includes(c.column_name));

  const groups: Record<string, CodeTableColumn[]> = {};
  for (const col of visible) {
    const parts = col.column_name.split("_");
    let prefix = "General";
    if (col.column_name.startsWith("ai_")) prefix = "AI Features";
    else if (col.column_name.startsWith("minutes_")) prefix = "Minutes / Copilot";
    else if (col.column_name.startsWith("addin_")) prefix = "Microsoft Add-in";
    else if (col.column_name.startsWith("sharepoint_")) prefix = "SharePoint";
    else if (col.column_name.startsWith("generation_") || col.column_name.startsWith("max_generation")) prefix = "Generation";
    else if (col.column_name.startsWith("clickup_")) prefix = "ClickUp";
    else if (col.column_name.startsWith("email_")) prefix = "Email";
    else if (col.column_name.startsWith("enable_")) prefix = "Feature Flags";
    else if (col.column_name.startsWith("microsoft_")) prefix = "Microsoft Add-in";
    else if (col.column_name.startsWith("review_")) prefix = "Review";
    else if (col.column_name.startsWith("ask_viv")) prefix = "Ask Viv";

    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(col);
  }

  return Object.entries(groups).map(([label, columns]) => ({ label, columns }));
}

export function AppSettingsForm({ table, data, loading, onSave, saving }: AppSettingsFormProps) {
  const row = data[0] ?? {};
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data.length > 0) {
      setFormData({ ...data[0] });
      setDirty(false);
    }
  }, [data]);

  function handleChange(col: string, value: any) {
    setFormData((prev) => ({ ...prev, [col]: value }));
    setDirty(true);
  }

  function handleSubmit() {
    const pk = row.id !== undefined ? { id: row.id } : {};
    // Strip hidden columns from save payload
    const payload = { ...formData };
    HIDDEN_COLUMNS.forEach((c) => delete payload[c]);
    onSave(pk, payload);
    setDirty(false);
  }

  const groups = groupColumns(table.columns);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Application Settings</h2>
          <Badge variant="secondary" className="text-xs">Single-row config</Badge>
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={!dirty || saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Form */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {group.label}
              </h3>
              <div className="divide-y rounded-lg border bg-card overflow-hidden">
                {group.columns.map((col) => {
                  const value = formData[col.column_name];
                  const isBool = col.data_type === "boolean";
                  const isNum = col.data_type === "integer" || col.data_type === "numeric";

                  return (
                    <div
                      key={col.column_name}
                      className="flex items-center gap-4 px-4 py-2.5"
                    >
                      <Label className="text-sm font-medium normal-case tracking-normal w-56 shrink-0">
                        {formatLabel(col.column_name)}
                      </Label>
                      <code className="text-[11px] text-muted-foreground font-mono w-52 shrink-0 truncate">
                        {col.column_name}
                      </code>
                      <div className="ml-auto flex items-center">
                        {isBool ? (
                          <Switch
                            checked={!!value}
                            onCheckedChange={(v) => handleChange(col.column_name, v)}
                          />
                        ) : isNum ? (
                          <Input
                            type="number"
                            value={value ?? ""}
                            onChange={(e) => handleChange(col.column_name, parseInt(e.target.value) || null)}
                            className="w-28 h-8 text-right text-sm"
                          />
                        ) : (
                          <Input
                            type="text"
                            value={value ?? ""}
                            onChange={(e) => handleChange(col.column_name, e.target.value || null)}
                            className="w-80 h-8 text-sm"
                            placeholder="Not set"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
