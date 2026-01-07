import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenInfo {
  token: string;
  sheet: string;
  cell: string;
  context: 'cell' | 'header_footer' | 'named_range' | 'shape' | 'unknown';
  sample_text: string;
  format: 'double_brace' | 'double_angle' | 'double_bracket' | 'mergefield';
}

interface DropdownInfo {
  dropdown_id: string;
  sheet: string;
  cell: string;
  validation_type: 'list';
  source_type: 'inline' | 'range' | 'named_range';
  source_ref: string;
  resolved_range: string | null;
  row_count_estimate: number | null;
  original_values: string[] | null;
}

interface ScanResult {
  merge_fields: string[];
  named_ranges: string[];
  scan_method: string;
  tokens?: TokenInfo[];
  dropdowns?: DropdownInfo[];
}

// Token patterns to detect
const TOKEN_PATTERNS = [
  { pattern: /\{\{([^}]+)\}\}/g, format: 'double_brace' as const },
  { pattern: /<<([^>]+)>>/g, format: 'double_angle' as const },
  { pattern: /\[\[([^\]]+)\]\]/g, format: 'double_bracket' as const },
];

// Extract merge fields with location info
function extractTokensFromText(
  content: string,
  sheet: string,
  cell: string,
  context: TokenInfo['context']
): TokenInfo[] {
  const tokens: TokenInfo[] = [];
  
  for (const { pattern, format } of TOKEN_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      tokens.push({
        token: match[1].trim(),
        sheet,
        cell,
        context,
        sample_text: content.substring(Math.max(0, match.index - 20), Math.min(content.length, match.index + match[0].length + 20)),
        format
      });
    }
  }
  
  return tokens;
}

// Extract simple merge fields list
function extractMergeFields(content: string): string[] {
  const fields = new Set<string>();
  
  for (const { pattern } of TOKEN_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      fields.add(match[1].trim());
    }
  }
  
  return Array.from(fields);
}

// Generate stable dropdown ID
function generateDropdownId(sheet: string, cell: string): string {
  const str = `${sheet}:${cell}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `dd_${Math.abs(hash).toString(16)}`;
}

// Parse DOCX file to extract text and merge fields
async function scanDocx(fileContent: ArrayBuffer): Promise<ScanResult> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const documentXml = await zip.file("word/document.xml")?.async("string");
    
    if (!documentXml) {
      console.log("No document.xml found in DOCX");
      return { merge_fields: [], named_ranges: [], scan_method: "docx_scan" };
    }
    
    const textContent = documentXml.replace(/<[^>]+>/g, ' ');
    const mergeFields = extractMergeFields(textContent);
    
    // Also check for Word mail merge fields
    const mergeFieldPattern = /MERGEFIELD\s+(\w+)/g;
    let match;
    while ((match = mergeFieldPattern.exec(documentXml)) !== null) {
      mergeFields.push(match[1]);
    }
    
    const uniqueFields = [...new Set(mergeFields)];
    
    console.log(`DOCX scan found ${uniqueFields.length} merge fields`);
    
    return {
      merge_fields: uniqueFields,
      named_ranges: [],
      scan_method: "docx_scan"
    };
  } catch (error) {
    console.error("Error scanning DOCX:", error);
    return { merge_fields: [], named_ranges: [], scan_method: "docx_scan_error" };
  }
}

// Parse XLSX file to extract merge fields, named ranges, and data validations
async function scanXlsx(fileContent: ArrayBuffer): Promise<ScanResult> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const allTokens: TokenInfo[] = [];
    const allDropdowns: DropdownInfo[] = [];
    const namedRanges: string[] = [];
    const namedRangeRefs: Record<string, string> = {};
    
    // Parse workbook.xml for defined names (named ranges)
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    if (workbookXml) {
      const definedNamePattern = /<definedName[^>]*name="([^"]+)"[^>]*>([^<]*)<\/definedName>/g;
      let match;
      while ((match = definedNamePattern.exec(workbookXml)) !== null) {
        const name = match[1];
        const ref = match[2];
        if (!name.startsWith("_")) {
          namedRanges.push(name);
          namedRangeRefs[name] = ref;
        }
      }
    }
    
    // Get sheet names from workbook
    const sheetNames: string[] = [];
    if (workbookXml) {
      const sheetPattern = /<sheet[^>]*name="([^"]+)"[^>]*\/>/g;
      let match;
      while ((match = sheetPattern.exec(workbookXml)) !== null) {
        sheetNames.push(match[1]);
      }
    }
    
    // Scan each sheet for tokens and data validations
    const sheetFiles = Object.keys(zip.files)
      .filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"))
      .sort();
    
    for (let i = 0; i < sheetFiles.length; i++) {
      const sheetFile = sheetFiles[i];
      const sheetName = sheetNames[i] || `Sheet${i + 1}`;
      const sheetXml = await zip.file(sheetFile)?.async("string");
      
      if (!sheetXml) continue;
      
      // Extract cell values and look for tokens
      const cellPattern = /<c\s+r="([A-Z]+\d+)"[^>]*>.*?<v>([^<]*)<\/v>.*?<\/c>/gs;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(sheetXml)) !== null) {
        const cellRef = cellMatch[1];
        const cellValue = cellMatch[2];
        const tokens = extractTokensFromText(cellValue, sheetName, cellRef, 'cell');
        allTokens.push(...tokens);
      }
      
      // Parse data validations
      const dataValidationPattern = /<dataValidation[^>]*type="list"[^>]*sqref="([^"]+)"[^>]*>.*?<formula1>([^<]*)<\/formula1>.*?<\/dataValidation>/gs;
      let dvMatch;
      while ((dvMatch = dataValidationPattern.exec(sheetXml)) !== null) {
        const sqref = dvMatch[1];
        const formula = dvMatch[2];
        
        // Parse sqref (could be range like A1:A10 or single cell)
        const cells = sqref.split(' ')[0].split(':')[0]; // Take first cell
        
        let sourceType: DropdownInfo['source_type'] = 'inline';
        let resolvedRange: string | null = null;
        let originalValues: string[] | null = null;
        let rowCountEstimate: number | null = null;
        
        if (formula.startsWith('=')) {
          // It's a reference
          const refFormula = formula.substring(1);
          
          // Check if it's a named range
          if (namedRangeRefs[refFormula]) {
            sourceType = 'named_range';
            resolvedRange = namedRangeRefs[refFormula];
          } else {
            sourceType = 'range';
            resolvedRange = refFormula;
          }
          
          // Try to estimate row count from range
          const rangeMatch = resolvedRange?.match(/\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/);
          if (rangeMatch) {
            rowCountEstimate = parseInt(rangeMatch[4]) - parseInt(rangeMatch[2]) + 1;
          }
        } else if (formula.includes(',') || formula.includes('"')) {
          // Inline list
          sourceType = 'inline';
          originalValues = formula.split(',').map(v => v.replace(/^"|"$/g, '').trim());
          rowCountEstimate = originalValues.length;
        }
        
        allDropdowns.push({
          dropdown_id: generateDropdownId(sheetName, cells),
          sheet: sheetName,
          cell: cells,
          validation_type: 'list',
          source_type: sourceType,
          source_ref: formula,
          resolved_range: resolvedRange,
          row_count_estimate: rowCountEstimate,
          original_values: originalValues
        });
      }
      
      // Also try simpler data validation pattern
      const simpleDvPattern = /<dataValidation[^>]*type="list"[^>]*sqref="([^"]+)"[^>]*formula1="([^"]+)"[^>]*\/>/g;
      while ((dvMatch = simpleDvPattern.exec(sheetXml)) !== null) {
        const sqref = dvMatch[1];
        const formula = dvMatch[2];
        const cells = sqref.split(' ')[0].split(':')[0];
        
        // Check if we already captured this
        if (allDropdowns.find(d => d.sheet === sheetName && d.cell === cells)) continue;
        
        let sourceType: DropdownInfo['source_type'] = 'inline';
        let resolvedRange: string | null = null;
        
        if (formula.startsWith('=')) {
          const refFormula = formula.substring(1);
          sourceType = namedRangeRefs[refFormula] ? 'named_range' : 'range';
          resolvedRange = namedRangeRefs[refFormula] || refFormula;
        }
        
        allDropdowns.push({
          dropdown_id: generateDropdownId(sheetName, cells),
          sheet: sheetName,
          cell: cells,
          validation_type: 'list',
          source_type: sourceType,
          source_ref: formula,
          resolved_range: resolvedRange,
          row_count_estimate: null,
          original_values: null
        });
      }
    }
    
    // Also check sharedStrings.xml for token patterns
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (sharedStringsXml) {
      // Extract individual string items
      const stringPattern = /<si>.*?<t[^>]*>([^<]*)<\/t>.*?<\/si>/gs;
      let strMatch;
      while ((strMatch = stringPattern.exec(sharedStringsXml)) !== null) {
        const text = strMatch[1];
        const tokens = extractTokensFromText(text, 'SharedStrings', 'N/A', 'unknown');
        allTokens.push(...tokens);
      }
    }
    
    // Check for header/footer tokens
    const headerFooterFiles = Object.keys(zip.files).filter(f => f.includes('header') || f.includes('footer'));
    for (const hfFile of headerFooterFiles) {
      const hfXml = await zip.file(hfFile)?.async("string");
      if (hfXml) {
        const tokens = extractTokensFromText(hfXml.replace(/<[^>]+>/g, ' '), 'HeaderFooter', 'N/A', 'header_footer');
        allTokens.push(...tokens);
      }
    }
    
    // Deduplicate tokens by token name
    const uniqueTokens = allTokens.reduce((acc, token) => {
      if (!acc.find(t => t.token === token.token && t.sheet === token.sheet && t.cell === token.cell)) {
        acc.push(token);
      }
      return acc;
    }, [] as TokenInfo[]);
    
    const mergeFields = [...new Set(uniqueTokens.map(t => t.token))];
    
    console.log(`XLSX scan found ${mergeFields.length} merge fields, ${namedRanges.length} named ranges, ${allDropdowns.length} dropdowns`);
    
    return {
      merge_fields: mergeFields,
      named_ranges: namedRanges,
      scan_method: "xlsx_scan_v2",
      tokens: uniqueTokens,
      dropdowns: allDropdowns
    };
  } catch (error) {
    console.error("Error scanning XLSX:", error);
    return { merge_fields: [], named_ranges: [], scan_method: "xlsx_scan_error" };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { document_id } = await req.json();
    
    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Scanning document: ${document_id}`);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get document info
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, title, name, file_path, format, uploaded_files")
      .eq("id", document_id)
      .single();
    
    if (docError || !document) {
      console.error("Document not found:", docError);
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Get file path from either file_path or uploaded_files
    const filePath = document.file_path || document.uploaded_files?.[0];
    
    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "Document has no file attached" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Determine storage bucket
    const bucket = document.file_path ? "documents" : "package-documents";
    
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(filePath);
    
    if (downloadError || !fileData) {
      console.error("Error downloading file:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download document file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const fileBuffer = await fileData.arrayBuffer();
    const fileName = (document.name || document.title || '').toLowerCase();
    const fileFormat = (document.format || '').toLowerCase();
    
    let scanResult: ScanResult;
    
    // Determine file type and scan accordingly
    const isWord = fileName.endsWith(".docx") || fileFormat === "word" || fileFormat === "docx";
    const isExcel = fileName.endsWith(".xlsx") || fileFormat === "excel" || fileFormat === "xlsx" || fileFormat === "xls";
    
    if (isWord) {
      scanResult = await scanDocx(fileBuffer);
    } else if (isExcel) {
      scanResult = await scanXlsx(fileBuffer);
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Only .docx and .xlsx are supported." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Update document with scan results
    const updateData: Record<string, unknown> = {
      scan_status: "completed",
      scanned_at: new Date().toISOString(),
    };
    
    if (scanResult.merge_fields.length > 0) {
      updateData.merge_fields = scanResult.merge_fields;
      updateData.detected_merge_fields = scanResult.merge_fields;
    }
    
    if (scanResult.named_ranges.length > 0) {
      updateData.named_ranges = scanResult.named_ranges;
    }
    
    const { error: updateError } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", document_id);
    
    if (updateError) {
      console.error("Error updating document:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update document with scan results" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // For Excel files, also upsert the bindings record
    if (isExcel && (scanResult.tokens || scanResult.dropdowns)) {
      try {
        const { error: bindingsError } = await supabase.rpc('upsert_excel_template_bindings', {
          p_document_id: document_id,
          p_detected_tokens: scanResult.tokens || [],
          p_detected_dropdowns: scanResult.dropdowns || []
        });
        
        if (bindingsError) {
          console.error("Error upserting excel bindings:", bindingsError);
        } else {
          console.log(`Excel bindings record created/updated for document ${document_id}`);
        }
      } catch (err) {
        console.error("Error calling upsert_excel_template_bindings:", err);
      }
    }
    
    console.log(`Document ${document_id} scanned successfully`);
    
    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        merge_fields: scanResult.merge_fields,
        named_ranges: scanResult.named_ranges,
        scan_method: scanResult.scan_method,
        tokens: scanResult.tokens || [],
        dropdowns: scanResult.dropdowns || []
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Scan error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
