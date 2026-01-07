import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScanResult {
  merge_fields: string[];
  named_ranges: string[];
  scan_method: string;
}

// Extract merge fields from text content (pattern: {{FieldName}})
function extractMergeFields(content: string): string[] {
  const pattern = /\{\{([^}]+)\}\}/g;
  const fields = new Set<string>();
  let match;
  
  while ((match = pattern.exec(content)) !== null) {
    fields.add(match[1].trim());
  }
  
  return Array.from(fields);
}

// Parse DOCX file to extract text and merge fields
async function scanDocx(fileContent: ArrayBuffer): Promise<ScanResult> {
  try {
    // DOCX files are ZIP archives containing XML files
    // We'll use a simple approach to extract text from the main document
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    // The main document content is in word/document.xml
    const documentXml = await zip.file("word/document.xml")?.async("string");
    
    if (!documentXml) {
      console.log("No document.xml found in DOCX");
      return { merge_fields: [], named_ranges: [], scan_method: "docx_scan" };
    }
    
    // Extract text content and find merge field patterns
    // Remove XML tags but keep content
    const textContent = documentXml.replace(/<[^>]+>/g, ' ');
    const mergeFields = extractMergeFields(textContent);
    
    // Also check for Word mail merge fields (MERGEFIELD)
    const mergeFieldPattern = /MERGEFIELD\s+(\w+)/g;
    let match;
    while ((match = mergeFieldPattern.exec(documentXml)) !== null) {
      mergeFields.push(match[1]);
    }
    
    // Deduplicate
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

// Parse XLSX file to extract merge fields and named ranges
async function scanXlsx(fileContent: ArrayBuffer): Promise<ScanResult> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const mergeFields: string[] = [];
    const namedRanges: string[] = [];
    
    // Check workbook.xml for defined names (named ranges)
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    if (workbookXml) {
      // Extract defined names
      const definedNamePattern = /<definedName[^>]*name="([^"]+)"[^>]*>/g;
      let match;
      while ((match = definedNamePattern.exec(workbookXml)) !== null) {
        const name = match[1];
        // Filter out internal Excel names (start with _)
        if (!name.startsWith("_")) {
          namedRanges.push(name);
        }
      }
    }
    
    // Scan all sheet XML files for merge field patterns
    const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"));
    
    for (const sheetFile of sheetFiles) {
      const sheetXml = await zip.file(sheetFile)?.async("string");
      if (sheetXml) {
        // Extract text from cells
        const textContent = sheetXml.replace(/<[^>]+>/g, ' ');
        const fields = extractMergeFields(textContent);
        mergeFields.push(...fields);
      }
    }
    
    // Also check sharedStrings.xml for cell text values
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (sharedStringsXml) {
      const textContent = sharedStringsXml.replace(/<[^>]+>/g, ' ');
      const fields = extractMergeFields(textContent);
      mergeFields.push(...fields);
    }
    
    // Deduplicate
    const uniqueFields = [...new Set(mergeFields)];
    const uniqueRanges = [...new Set(namedRanges)];
    
    console.log(`XLSX scan found ${uniqueFields.length} merge fields, ${uniqueRanges.length} named ranges`);
    
    return {
      merge_fields: uniqueFields,
      named_ranges: uniqueRanges,
      scan_method: "xlsx_scan"
    };
  } catch (error) {
    console.error("Error scanning XLSX:", error);
    return { merge_fields: [], named_ranges: [], scan_method: "xlsx_scan_error" };
  }
}

serve(async (req) => {
  // Handle CORS preflight
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
      .select("id, name, file_path, document_type")
      .eq("id", document_id)
      .single();
    
    if (docError || !document) {
      console.error("Document not found:", docError);
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!document.file_path) {
      return new Response(
        JSON.stringify({ error: "Document has no file attached" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.file_path);
    
    if (downloadError || !fileData) {
      console.error("Error downloading file:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download document file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const fileBuffer = await fileData.arrayBuffer();
    const fileName = document.name.toLowerCase();
    const fileType = document.document_type?.toLowerCase() || "";
    
    let scanResult: ScanResult;
    
    // Determine file type and scan accordingly
    if (fileName.endsWith(".docx") || fileType === "word" || fileType === "docx") {
      scanResult = await scanDocx(fileBuffer);
    } else if (fileName.endsWith(".xlsx") || fileType === "excel" || fileType === "xlsx") {
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
    
    // Update merge_fields if any found
    if (scanResult.merge_fields.length > 0) {
      updateData.merge_fields = scanResult.merge_fields;
    }
    
    // Update named_ranges if any found (Excel only)
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
    
    console.log(`Document ${document_id} scanned successfully`);
    
    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        merge_fields: scanResult.merge_fields,
        named_ranges: scanResult.named_ranges,
        scan_method: scanResult.scan_method
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
