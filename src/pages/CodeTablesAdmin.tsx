import { useState, useMemo } from "react";
import { useCodeTables, useTableData } from "@/hooks/useCodeTables";
import { CodeTableSidebar } from "@/components/admin/CodeTableSidebar";
import { CodeTableDataGrid } from "@/components/admin/CodeTableDataGrid";
import { CodeRowDialog } from "@/components/admin/CodeRowDialog";
import type { CodeTableRow } from "@/services/codeTablesService";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DialogMode = "create" | "edit" | "duplicate";

export default function CodeTablesAdmin() {
  const { tables, loading: tablesLoading } = useCodeTables();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const { data, loading: dataLoading, createRow, updateRow, deleteRow } = useTableData(selectedTable);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [dialogRow, setDialogRow] = useState<CodeTableRow | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CodeTableRow | null>(null);

  const selectedMeta = useMemo(
    () => tables.find((t) => t.table_name === selectedTable) ?? null,
    [tables, selectedTable]
  );

  const columns = selectedMeta?.columns ?? [];

  function getPrimaryKey() {
    if (columns.find((c) => c.column_name === "id")) return "id";
    if (columns.find((c) => c.column_name === "code")) return "code";
    return columns[0]?.column_name ?? "id";
  }

  function openDialog(mode: DialogMode, row?: CodeTableRow) {
    setDialogMode(mode);
    setDialogRow(row ?? null);
    setDialogOpen(true);
  }

  function handleSave(data: Record<string, any>) {
    if (dialogMode === "edit" && dialogRow) {
      const pk = getPrimaryKey();
      updateRow.mutate(
        { whereClause: { [pk]: dialogRow[pk] }, data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createRow.mutate(data, { onSuccess: () => setDialogOpen(false) });
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const pk = getPrimaryKey();
    deleteRow.mutate({ [pk]: deleteTarget[pk] }, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      <CodeTableSidebar
        tables={tables}
        selectedTable={selectedTable}
        onSelect={setSelectedTable}
        loading={tablesLoading}
      />
      <CodeTableDataGrid
        table={selectedMeta}
        data={data}
        loading={dataLoading}
        onAdd={() => openDialog("create")}
        onEdit={(row) => openDialog("edit", row)}
        onDuplicate={(row) => openDialog("duplicate", row)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      {/* Create/Edit/Duplicate Dialog */}
      <CodeRowDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        columns={columns}
        row={dialogRow}
        onSave={handleSave}
        saving={createRow.isPending || updateRow.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Row</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedMeta?.columns.some((c) => c.column_name === "is_active")
                ? "This will deactivate the row (soft delete). Are you sure?"
                : "This will permanently delete the row. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
