import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentSignals {
  filename_tokens: string[];
  header_text?: string;
  footer_text?: string;
  headings: string[];
  key_paragraphs: string[];
  merge_fields: string[];
  sheet_names?: string[];
  table_headers?: string[];
  named_ranges?: string[];
  dropdown_sources?: Record<string, string[]>;
}

interface AnalysisResult {
  category: string;
  description: string;
  framework_type: 'RTO' | 'CRICOS' | 'GTO' | null;
  quality_area?: string;
  document_type: string;
  intended_role?: string;
  confidence: number;
  merge_fields: string[];
  dropdown_sources: Record<string, string[]>;
  source_signals: DocumentSignals;
}

// RTO/CRICOS/GTO document categories
const CATEGORIES = {
  RTO: [
    'Outcome Standards',
    'Credential Policy', 
    'Compliance Requirements',
    'Quality Indicators',
    'Training and Assessment',
    'Student Services',
    'Governance and Administration'
  ],
  CRICOS: [
    'National Code',
    'ESOS Framework',
    'Student Welfare',
    'Course Progress',
    'Attendance Monitoring',
    'Transfer Policies'
  ],
  GTO: [
    'Apprenticeship Management',
    'Training Contracts',
    'Employer Services',
    'Progress Monitoring',
    'Quality Assurance'
  ]
};

// Document type patterns
const DOC_TYPE_PATTERNS = {
  form: ['form', 'application', 'request', 'submission', 'declaration'],
  plan: ['plan', 'strategy', 'roadmap', 'schedule'],
  agreement: ['agreement', 'contract', 'terms', 'mou', 'consent'],
  register: ['register', 'log', 'record', 'tracker', 'list'],
  procedure: ['procedure', 'process', 'sop', 'workflow', 'instruction'],
  template: ['template', 'sample', 'example', 'model'],
  policy: ['policy', 'guideline', 'framework', 'standard'],
  checklist: ['checklist', 'audit', 'review', 'inspection'],
  report: ['report', 'analysis', 'summary', 'assessment']
};

// Framework detection patterns
const FRAMEWORK_PATTERNS = {
  CRICOS: ['cricos', 'national code', 'esos', 'international student', 'overseas student'],
  GTO: ['gto', 'group training', 'apprentice', 'traineeship', 'host employer'],
  RTO: ['rto', 'srto', 'aqtf', 'vet', 'competency', 'qualification', 'training package']
};

// Quality area patterns (SRTO 2015)
const QUALITY_AREA_PATTERNS: Record<string, string[]> = {
  '1': ['trainer', 'assessor', 'credential', 'qualification', 'competence'],
  '2': ['training', 'assessment', 'strategy', 'practice'],
  '3': ['recognition', 'rpl', 'credit', 'transfer'],
  '4': ['support', 'learner', 'student service'],
  '5': ['enrolment', 'induction', 'completion'],
  '6': ['complaints', 'appeals', 'grievance'],
  '7': ['governance', 'management', 'administration'],
  '8': ['marketing', 'information', 'accuracy']
};

function extractMergeFields(content: string): string[] {
  const pattern = /\{\{([^}]+)\}\}/g;
  const fields = new Set<string>();
  let match;
  while ((match = pattern.exec(content)) !== null) {
    fields.add(match[1].trim());
  }
  return Array.from(fields);
}

function tokenizeFilename(filename: string): string[] {
  // Remove extension and split into tokens
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  return nameWithoutExt
    .split(/[_\-\s.]+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 1);
}

function detectFramework(signals: DocumentSignals): 'RTO' | 'CRICOS' | 'GTO' | null {
  const allText = [
    ...signals.filename_tokens,
    signals.header_text || '',
    signals.footer_text || '',
    ...signals.headings,
    ...signals.key_paragraphs
  ].join(' ').toLowerCase();

  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (allText.includes(pattern)) {
        return framework as 'RTO' | 'CRICOS' | 'GTO';
      }
    }
  }
  return 'RTO'; // Default to RTO
}

function detectDocumentType(signals: DocumentSignals): string {
  const allText = [
    ...signals.filename_tokens,
    ...signals.headings
  ].join(' ').toLowerCase();

  for (const [type, patterns] of Object.entries(DOC_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (allText.includes(pattern)) {
        return type;
      }
    }
  }
  return 'template';
}

function detectCategory(signals: DocumentSignals, framework: string): string {
  const allText = [
    ...signals.filename_tokens,
    signals.header_text || '',
    ...signals.headings,
    ...signals.key_paragraphs
  ].join(' ').toLowerCase();

  const categories = CATEGORIES[framework as keyof typeof CATEGORIES] || CATEGORIES.RTO;
  
  // Simple keyword matching
  for (const category of categories) {
    if (allText.includes(category.toLowerCase())) {
      return category;
    }
  }
  
  // Default based on document type patterns
  if (allText.includes('policy') || allText.includes('procedure')) {
    return 'Compliance Requirements';
  }
  if (allText.includes('training') || allText.includes('assessment')) {
    return 'Training and Assessment';
  }
  if (allText.includes('student') || allText.includes('learner')) {
    return 'Student Services';
  }
  
  return categories[0];
}

function detectQualityArea(signals: DocumentSignals): string | undefined {
  const allText = [
    ...signals.filename_tokens,
    ...signals.headings,
    ...signals.key_paragraphs
  ].join(' ').toLowerCase();

  for (const [area, patterns] of Object.entries(QUALITY_AREA_PATTERNS)) {
    for (const pattern of patterns) {
      if (allText.includes(pattern)) {
        return `Standard ${area}`;
      }
    }
  }
  return undefined;
}

function generateDescription(signals: DocumentSignals, docType: string, category: string): string {
  const purposeMap: Record<string, string> = {
    form: 'A form used to collect and record information',
    plan: 'A planning document that outlines strategy and approach',
    agreement: 'A formal agreement document establishing terms and conditions',
    register: 'A register for tracking and maintaining records',
    procedure: 'A procedure document detailing step-by-step instructions',
    template: 'A template document providing a standardized format',
    policy: 'A policy document establishing guidelines and requirements',
    checklist: 'A checklist for verification and quality assurance',
    report: 'A report document for analysis and documentation'
  };

  const purpose = purposeMap[docType] || 'A document';
  const title = signals.headings[0] || signals.filename_tokens.join(' ');
  
  return `${purpose} for ${category.toLowerCase()}. ${title ? `Relates to: ${title}.` : ''} Use this document when ${docType === 'form' ? 'collecting required information' : docType === 'checklist' ? 'conducting reviews or audits' : 'following established procedures'}.`;
}

function calculateConfidence(signals: DocumentSignals, framework: 'RTO' | 'CRICOS' | 'GTO' | null): number {
  let confidence = 30; // Base confidence

  // Strong signals from filename
  if (signals.filename_tokens.length > 0) confidence += 15;
  
  // Header/footer presence (highest confidence)
  if (signals.header_text || signals.footer_text) confidence += 20;
  
  // Content signals
  if (signals.headings.length > 0) confidence += 15;
  if (signals.merge_fields.length > 0) confidence += 10;
  if (signals.key_paragraphs.length > 0) confidence += 10;
  
  // Framework-specific keywords boost
  if (framework) confidence += 10;

  return Math.min(confidence, 95);
}

async function scanDocx(fileContent: ArrayBuffer): Promise<DocumentSignals> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const signals: DocumentSignals = {
      filename_tokens: [],
      headings: [],
      key_paragraphs: [],
      merge_fields: []
    };

    // Main document
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (documentXml) {
      // Extract headings (w:pStyle containing "Heading")
      const headingMatches = documentXml.match(/<w:pStyle[^>]*w:val="Heading[^"]*"[^>]*>[\s\S]*?<w:t>([^<]+)<\/w:t>/g) || [];
      for (const match of headingMatches.slice(0, 10)) {
        const textMatch = match.match(/<w:t>([^<]+)<\/w:t>/);
        if (textMatch) signals.headings.push(textMatch[1]);
      }

      // Extract first few paragraphs
      const textContent = documentXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const paragraphs = textContent.split(/\.\s+/).slice(0, 5);
      signals.key_paragraphs = paragraphs.filter(p => p.length > 20);

      // Extract merge fields
      signals.merge_fields = extractMergeFields(documentXml);
      
      // Also check for Word MERGEFIELD
      const mergeFieldPattern = /MERGEFIELD\s+(\w+)/g;
      let match;
      while ((match = mergeFieldPattern.exec(documentXml)) !== null) {
        if (!signals.merge_fields.includes(match[1])) {
          signals.merge_fields.push(match[1]);
        }
      }
    }

    // Headers
    const headerFiles = Object.keys(zip.files).filter(f => f.startsWith("word/header") && f.endsWith(".xml"));
    for (const headerFile of headerFiles) {
      const headerXml = await zip.file(headerFile)?.async("string");
      if (headerXml) {
        const text = headerXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text && text.length > 5) {
          signals.header_text = (signals.header_text || '') + ' ' + text;
        }
      }
    }

    // Footers
    const footerFiles = Object.keys(zip.files).filter(f => f.startsWith("word/footer") && f.endsWith(".xml"));
    for (const footerFile of footerFiles) {
      const footerXml = await zip.file(footerFile)?.async("string");
      if (footerXml) {
        const text = footerXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text && text.length > 5) {
          signals.footer_text = (signals.footer_text || '') + ' ' + text;
        }
      }
    }

    return signals;
  } catch (error) {
    console.error("Error scanning DOCX:", error);
    return { filename_tokens: [], headings: [], key_paragraphs: [], merge_fields: [] };
  }
}

async function scanXlsx(fileContent: ArrayBuffer): Promise<DocumentSignals> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const signals: DocumentSignals = {
      filename_tokens: [],
      headings: [],
      key_paragraphs: [],
      merge_fields: [],
      sheet_names: [],
      table_headers: [],
      named_ranges: [],
      dropdown_sources: {}
    };

    // Workbook for sheet names and named ranges
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    if (workbookXml) {
      // Sheet names
      const sheetMatches = workbookXml.match(/name="([^"]+)"/g) || [];
      signals.sheet_names = sheetMatches.map(m => m.replace('name="', '').replace('"', '')).slice(0, 10);
      
      // Named ranges
      const definedNamePattern = /<definedName[^>]*name="([^"]+)"[^>]*>/g;
      let match;
      while ((match = definedNamePattern.exec(workbookXml)) !== null) {
        if (!match[1].startsWith("_")) {
          signals.named_ranges!.push(match[1]);
        }
      }
    }

    // Scan sheets for content and merge fields
    const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"));
    
    for (const sheetFile of sheetFiles) {
      const sheetXml = await zip.file(sheetFile)?.async("string");
      if (sheetXml) {
        const textContent = sheetXml.replace(/<[^>]+>/g, ' ');
        signals.merge_fields.push(...extractMergeFields(textContent));

        // Try to extract data validations (dropdown sources)
        const validationPattern = /<dataValidation[^>]*>[\s\S]*?<formula1>([^<]+)<\/formula1>[\s\S]*?<\/dataValidation>/g;
        let valMatch;
        while ((valMatch = validationPattern.exec(sheetXml)) !== null) {
          const formula = valMatch[1];
          if (formula && !formula.startsWith('=')) {
            // Direct list of values
            const values = formula.split(',').map(v => v.trim().replace(/"/g, ''));
            signals.dropdown_sources![`dropdown_${Object.keys(signals.dropdown_sources!).length}`] = values;
          }
        }
      }
    }

    // Shared strings for cell values
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (sharedStringsXml) {
      const stringMatches = sharedStringsXml.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
      const strings = stringMatches.map(m => m.replace(/<t[^>]*>/, '').replace('</t>', '')).slice(0, 50);
      
      // First row values are likely headers
      signals.table_headers = strings.slice(0, 15);
      
      // Also check for merge fields
      signals.merge_fields.push(...extractMergeFields(strings.join(' ')));
    }

    // Deduplicate merge fields
    signals.merge_fields = [...new Set(signals.merge_fields)];

    return signals;
  } catch (error) {
    console.error("Error scanning XLSX:", error);
    return { filename_tokens: [], headings: [], key_paragraphs: [], merge_fields: [] };
  }
}

async function scanPptx(fileContent: ArrayBuffer): Promise<DocumentSignals> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const signals: DocumentSignals = {
      filename_tokens: [],
      headings: [],
      key_paragraphs: [],
      merge_fields: []
    };

    // Scan slide files
    const slideFiles = Object.keys(zip.files).filter(f => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"));
    
    for (const slideFile of slideFiles.slice(0, 5)) {
      const slideXml = await zip.file(slideFile)?.async("string");
      if (slideXml) {
        // Extract text content
        const textMatches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
        const texts = textMatches.map(m => m.replace('<a:t>', '').replace('</a:t>', ''));
        
        // First slide typically has title
        if (slideFile.includes('slide1')) {
          signals.headings.push(...texts.slice(0, 2));
        }
        
        signals.key_paragraphs.push(...texts.filter(t => t.length > 20));
        signals.merge_fields.push(...extractMergeFields(texts.join(' ')));
      }
    }

    signals.merge_fields = [...new Set(signals.merge_fields)];
    return signals;
  } catch (error) {
    console.error("Error scanning PPTX:", error);
    return { filename_tokens: [], headings: [], key_paragraphs: [], merge_fields: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id, storage_path, filename } = await req.json();

    if (!document_id && !storage_path) {
      return new Response(
        JSON.stringify({ error: "document_id or storage_path is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let filePath = storage_path;
    let fileName = filename || '';
    let docId = document_id;

    // If document_id provided, fetch document info
    if (document_id && !storage_path) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, title, uploaded_files")
        .eq("id", document_id)
        .single();

      if (docError || !doc) {
        return new Response(
          JSON.stringify({ error: "Document not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uploadedFiles = doc.uploaded_files as string[] || [];
      if (uploadedFiles.length === 0) {
        return new Response(
          JSON.stringify({ error: "Document has no files" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      filePath = uploadedFiles[0];
      fileName = doc.title || '';
    }

    console.log(`Analyzing document: ${fileName || filePath}`);

    // Update status to analyzing
    if (docId) {
      await supabase.from("documents").update({ ai_analysis_status: 'analyzing' }).eq("id", docId);
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("document-files")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      if (docId) {
        await supabase.from("documents").update({ 
          ai_analysis_status: 'failed',
          source_signals: { error: 'Failed to download file' }
        }).eq("id", docId);
      }
      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileBuffer = await fileData.arrayBuffer();
    const fileNameLower = (fileName || filePath).toLowerCase();

    // Determine file type and scan
    let signals: DocumentSignals;
    
    if (fileNameLower.endsWith('.docx')) {
      signals = await scanDocx(fileBuffer);
    } else if (fileNameLower.endsWith('.xlsx')) {
      signals = await scanXlsx(fileBuffer);
    } else if (fileNameLower.endsWith('.pptx')) {
      signals = await scanPptx(fileBuffer);
    } else {
      // Unsupported file type - skip analysis
      if (docId) {
        await supabase.from("documents").update({ ai_analysis_status: 'skipped' }).eq("id", docId);
      }
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true,
          message: "Unsupported file type for AI analysis" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add filename tokens
    signals.filename_tokens = tokenizeFilename(fileName || filePath.split('/').pop() || '');

    // Analyze
    const framework = detectFramework(signals);
    const docType = detectDocumentType(signals);
    const category = detectCategory(signals, framework || 'RTO');
    const qualityArea = detectQualityArea(signals);
    const description = generateDescription(signals, docType, category);
    const confidence = calculateConfidence(signals, framework);

    const result: AnalysisResult = {
      category,
      description,
      framework_type: framework,
      quality_area: qualityArea,
      document_type: docType,
      confidence,
      merge_fields: signals.merge_fields,
      dropdown_sources: signals.dropdown_sources || {},
      source_signals: signals
    };

    // Update document with analysis results
    if (docId) {
      const updateData = {
        ai_category_suggestion: result.category,
        ai_description_draft: result.description,
        ai_confidence: result.confidence,
        detected_merge_fields: result.merge_fields,
        detected_dropdown_sources: result.dropdown_sources,
        source_signals: result.source_signals,
        framework_type: result.framework_type,
        ai_analysis_status: 'completed'
      };

      const { error: updateError } = await supabase
        .from("documents")
        .update(updateData)
        .eq("id", docId);

      if (updateError) {
        console.error("Update error:", updateError);
      }
    }

    console.log(`Analysis complete for ${fileName}: category=${result.category}, confidence=${result.confidence}`);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
