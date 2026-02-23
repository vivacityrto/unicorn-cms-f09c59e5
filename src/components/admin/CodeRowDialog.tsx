import { useEffect, useState, useCallback, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { CodeTableColumn, CodeTableRow } from "@/services/codeTablesService";
import { codeTablesService } from "@/services/codeTablesService";

interface CodeRowDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit" | "duplicate";
  columns: CodeTableColumn[];
  row: CodeTableRow | null;
  onSave: (data: Record<string, any>) => void;
  saving: boolean;
}

const SKIP_ON_CREATE = ["id", "created_at", "updated_at", "created_by", "updated_by"];
const SKIP_ON_EDIT = ["id", "created_at", "updated_at", "created_by", "updated_by"];

function isEditable(col: CodeTableColumn, mode: string) {
  const skipList = mode === "edit" ? SKIP_ON_EDIT : SKIP_ON_CREATE;
  return !skipList.includes(col.column_name);
}

function isRequired(col: CodeTableColumn) {
  return col.is_nullable === "NO" && !col.column_default;
}

export function CodeRowDialog({
  open, onClose, mode, columns, row, onSave, saving,
}: CodeRowDialogProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      // Initialize with defaults
      const defaults: Record<string, any> = {};
      columns.forEach((col) => {
        if (col.data_type === "boolean") defaults[col.column_name] = true;
      });
      setFormData(defaults);
    } else if (row) {
      const copy = { ...row };
      if (mode === "duplicate") {
        delete copy.id;
      }
      setFormData(copy);
    }
  }, [open, mode, row, columns]);

  const hasValueCol = columns.some((c) => c.column_name === "value");
  const hasLabelCol = columns.some((c) => c.column_name === "label");

  /** Convert label to snake_case value: lowercase, replace non-alphanumeric with _, collapse multiples, trim */
  function labelToValue(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  const handleLabelChange = useCallback(
    (newLabel: string) => {
      const updates: Record<string, any> = { label: newLabel };
      if (hasValueCol) {
        updates.value = labelToValue(newLabel);
      }
      setFormData((prev) => ({ ...prev, ...updates }));

      // Also call RPC for formatted label (optional polish)
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const formatted = await codeTablesService.formatLabel(newLabel);
          setFormData((prev) => ({
            ...prev,
            label: formatted,
            ...(hasValueCol ? { value: labelToValue(formatted) } : {}),
          }));
        } catch {
          // Silently fail — user can still edit manually
        }
      }, 500);
    },
    [hasValueCol]
  );

  function handleChange(colName: string, value: any) {
    if (colName === "label" && hasLabelCol) {
      handleLabelChange(value);
    } else {
      setFormData((prev) => ({ ...prev, [colName]: value }));
    }
  }

  function handleSubmit() {
    const data: Record<string, any> = {};
    columns.forEach((col) => {
      if (!isEditable(col, mode)) return;
      if (formData[col.column_name] !== undefined) {
        data[col.column_name] = formData[col.column_name];
      }
    });
    onSave(data);
  }

  // Sort columns: label first, then value, then the rest
  const editableColumns = columns.filter((col) => isEditable(col, mode)).sort((a, b) => {
    const order = (name: string) => name === "label" ? 0 : name === "value" ? 1 : 2;
    return order(a.column_name) - order(b.column_name);
  });

  const title =
    mode === "create" ? "Add Row" : mode === "edit" ? "Edit Row" : "Duplicate Row";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {editableColumns.map((col) => {
            const val = formData[col.column_name] ?? "";
            const required = isRequired(col);

            if (col.data_type === "boolean") {
              return (
                <div key={col.column_name} className="flex items-center justify-between">
                  <Label>{col.column_name}</Label>
                  <Switch
                    checked={!!formData[col.column_name]}
                    onCheckedChange={(v) => handleChange(col.column_name, v)}
                  />
                </div>
              );
            }

            if (col.column_name === "description" || col.data_type === "text") {
              if (col.column_name === "label" || col.column_name === "value" || col.column_name === "code" || col.column_name === "name" || col.column_name === "tag") {
                // Short text fields — use Input
                return (
                  <div key={col.column_name} className="space-y-1.5">
                    <Label>
                      {col.column_name}
                      {required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      value={val}
                      onChange={(e) => handleChange(col.column_name, e.target.value)}
                      placeholder={col.column_name}
                    />
                  </div>
                );
              }
              return (
                <div key={col.column_name} className="space-y-1.5">
                  <Label>
                    {col.column_name}
                    {required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Textarea
                    value={val}
                    onChange={(e) => handleChange(col.column_name, e.target.value)}
                    placeholder={col.column_name}
                    rows={3}
                  />
                </div>
              );
            }

            if (col.data_type === "integer" || col.data_type === "bigint" || col.data_type === "smallint") {
              return (
                <div key={col.column_name} className="space-y-1.5">
                  <Label>
                    {col.column_name}
                    {required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    type="number"
                    value={val}
                    onChange={(e) => handleChange(col.column_name, e.target.value ? Number(e.target.value) : "")}
                    placeholder={col.column_name}
                  />
                </div>
              );
            }

            return (
              <div key={col.column_name} className="space-y-1.5">
                <Label>
                  {col.column_name}
                  {required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  value={val}
                  onChange={(e) => handleChange(col.column_name, e.target.value)}
                  placeholder={col.column_name}
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={saving}>
            {mode === "edit" ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
