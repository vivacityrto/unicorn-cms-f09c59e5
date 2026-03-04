import { supabase } from "@/integrations/supabase/client";

export interface CodeTableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface CodeTable {
  table_name: string;
  schema_name: string;
  row_count: number;
  has_rls: boolean;
  policy_count: number;
  columns: CodeTableColumn[];
  last_updated: string;
}

export interface CodeTableRow {
  [key: string]: any;
}

export const codeTablesService = {
  async getCodeTables(): Promise<CodeTable[]> {
    const { data, error } = await supabase.rpc("list_code_tables");
    if (error) throw error;
    const tables = (data as unknown as CodeTable[]) ?? [];
    // dd_fields is managed via the dedicated Merge Field Tags admin page
    return tables.filter(t => t.table_name !== 'dd_fields');
  },

  async getTableData(tableName: string): Promise<CodeTableRow[]> {
    const { data, error } = await supabase.rpc("code_table_operation", {
      p_table_name: tableName,
      p_operation: "select",
    });
    if (error) throw error;
    return (data as unknown as CodeTableRow[]) ?? [];
  },

  async createRow(tableName: string, rowData: Record<string, any>): Promise<CodeTableRow> {
    const { data, error } = await supabase.rpc("code_table_operation", {
      p_table_name: tableName,
      p_operation: "insert",
      p_data: rowData,
    });
    if (error) throw error;
    return data as unknown as CodeTableRow;
  },

  async updateRow(
    tableName: string,
    whereClause: Record<string, any>,
    rowData: Record<string, any>
  ): Promise<CodeTableRow> {
    const { data, error } = await supabase.rpc("code_table_operation", {
      p_table_name: tableName,
      p_operation: "update",
      p_data: rowData,
      p_where_clause: whereClause,
    });
    if (error) throw error;
    return data as unknown as CodeTableRow;
  },

  async deleteRow(tableName: string, whereClause: Record<string, any>): Promise<CodeTableRow> {
    const { data, error } = await supabase.rpc("code_table_operation", {
      p_table_name: tableName,
      p_operation: "delete",
      p_where_clause: whereClause,
    });
    if (error) throw error;
    return data as unknown as CodeTableRow;
  },

  async formatLabel(inputLabel: string): Promise<string> {
    const { data, error } = await supabase.rpc("format_code_label", {
      input_label: inputLabel,
    });
    if (error) throw error;
    return data as string;
  },

  async generateValue(inputLabel: string): Promise<string> {
    const { data, error } = await supabase.rpc("standardize_code_value", {
      input_label: inputLabel,
    });
    if (error) throw error;
    return data as string;
  },

  async addAppSetting(columnName: string, dataType: string, defaultValue: string): Promise<void> {
    const { error } = await supabase.rpc("add_app_setting", {
      p_column_name: columnName,
      p_data_type: dataType,
      p_default_value: defaultValue || null,
    });
    if (error) throw error;
  },
};
