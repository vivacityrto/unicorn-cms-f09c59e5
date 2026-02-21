import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { codeTablesService, type CodeTable, type CodeTableRow } from "@/services/codeTablesService";
import { toast } from "@/hooks/use-toast";

export function useCodeTables() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["code-tables"],
    queryFn: codeTablesService.getCodeTables,
  });

  return {
    tables: data ?? [],
    loading: isLoading,
    error,
    refetch,
  };
}

export function useTableData(tableName: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["code-table-data", tableName];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => codeTablesService.getTableData(tableName!),
    enabled: !!tableName,
  });

  const createRow = useMutation({
    mutationFn: (rowData: Record<string, any>) =>
      codeTablesService.createRow(tableName!, rowData),
    onSuccess: () => {
      toast({ title: "Row created successfully" });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["code-tables"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create row", description: err.message, variant: "destructive" });
    },
  });

  const updateRow = useMutation({
    mutationFn: ({ whereClause, data }: { whereClause: Record<string, any>; data: Record<string, any> }) =>
      codeTablesService.updateRow(tableName!, whereClause, data),
    onSuccess: () => {
      toast({ title: "Row updated successfully" });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update row", description: err.message, variant: "destructive" });
    },
  });

  const deleteRow = useMutation({
    mutationFn: (whereClause: Record<string, any>) =>
      codeTablesService.deleteRow(tableName!, whereClause),
    onSuccess: () => {
      toast({ title: "Row deleted successfully" });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["code-tables"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete row", description: err.message, variant: "destructive" });
    },
  });

  return {
    data: (data ?? []) as CodeTableRow[],
    loading: isLoading,
    error,
    refetch,
    createRow,
    updateRow,
    deleteRow,
  };
}
