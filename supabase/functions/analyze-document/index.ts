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
  detected_standards?: string[];
}

interface AnalysisResult {
  category: string;
  description: string;
  framework_type: 'RTO' | 'CRICOS' | 'GTO' | null;
  quality_area?: string;
  document_type: string;
  intended_role?: string;
  confidence: number;
  category_confidence: number;
  description_confidence: number;
  merge_fields: string[];
  dropdown_sources: Record<string, string[]>;
  source_signals: DocumentSignals;
  standards_tags?: {
    framework: string;
    codes: string[];
    national_code?: string[];
  };
}

// ===== CATEGORY DICTIONARY WITH STANDARDS MAPPING =====

// RTO Standards (SRTO 2015) category patterns
const RTO_CATEGORIES: Record<string, { patterns: string[]; codes: string[]; description: string }> = {
  'Outcome Standards': {
    patterns: ['outcome', 'srto', 'quality indicator', 'performance indicator', 'learner engagement', 'employer satisfaction'],
    codes: ['Q1', 'Q2', 'Q3', 'Q4'],
    description: 'Documents related to RTO quality indicators and outcome standards for training delivery.'
  },
  'Credential Policy': {
    patterns: ['credential', 'certification', 'certificate', 'testamur', 'record of results', 'qualification issuance', 'cp-'],
    codes: ['CP'],
    description: 'Documents governing the issuance and management of training credentials and qualifications.'
  },
  'Compliance Requirements': {
    patterns: ['compliance', 'regulatory', 'audit', 'legislation', 'act', 'regulation', 'cr-', 'legal'],
    codes: ['CR'],
    description: 'Documents addressing regulatory compliance and legislative requirements for RTOs.'
  },
  'Training and Assessment': {
    patterns: ['training', 'assessment', 'competency', 'tas', 'trainer', 'assessor', 'strategy', 'validation', 'moderation'],
    codes: ['Q1.D', 'Q2.D'],
    description: 'Documents for training delivery and assessment practices including TAS and validation.'
  },
  'Student Services': {
    patterns: ['student', 'learner', 'support', 'welfare', 'counselling', 'llnd', 'accessibility', 'reasonable adjustment'],
    codes: ['Q3.D', 'Q4.D'],
    description: 'Documents for learner support services, welfare, and accessibility provisions.'
  },
  'Governance and Administration': {
    patterns: ['governance', 'management', 'administration', 'policy', 'procedure', 'quality', 'continuous improvement'],
    codes: [],
    description: 'Documents for RTO governance, management systems, and administrative procedures.'
  }
};

// CRICOS National Code categories
const CRICOS_CATEGORIES: Record<string, { patterns: string[]; codes: string[]; description: string }> = {
  'Registration Requirements': {
    patterns: ['nc.01', 'nc.02', 'registration', 'provider', 'cricos'],
    codes: ['NC.01', 'NC.02'],
    description: 'Documents for CRICOS provider registration and ongoing requirements.'
  },
  'Agent Management': {
    patterns: ['nc.03', 'agent', 'education agent', 'recruitment'],
    codes: ['NC.03'],
    description: 'Documents for managing education agents and recruitment practices.'
  },
  'Student Information': {
    patterns: ['nc.04', 'pre-enrolment', 'information', 'marketing', 'accuracy'],
    codes: ['NC.04'],
    description: 'Documents for pre-enrolment information and marketing to international students.'
  },
  'Enrolment and Letters': {
    patterns: ['nc.05', 'enrolment', 'coe', 'confirmation', 'offer', 'letter'],
    codes: ['NC.05'],
    description: 'Documents for enrolment processes and confirmation of enrolment letters.'
  },
  'Student Support': {
    patterns: ['nc.06', 'support', 'orientation', 'welfare', 'international'],
    codes: ['NC.06'],
    description: 'Documents for international student support and orientation programs.'
  },
  'Student Transfers': {
    patterns: ['nc.07', 'transfer', 'release', 'provider transfer'],
    codes: ['NC.07'],
    description: 'Documents governing student transfers between providers.'
  },
  'Course Progress': {
    patterns: ['nc.08', 'progress', 'intervention', 'academic', 'monitoring'],
    codes: ['NC.08'],
    description: 'Documents for monitoring and managing student academic progress.'
  },
  'Attendance': {
    patterns: ['nc.09', 'attendance', 'contact hours', 'participation'],
    codes: ['NC.09'],
    description: 'Documents for attendance monitoring and reporting requirements.'
  },
  'Deferral and Suspension': {
    patterns: ['nc.10', 'deferral', 'suspension', 'cancellation', 'defer'],
    codes: ['NC.10'],
    description: 'Documents for managing student deferrals, suspensions, and cancellations.'
  },
  'Complaints and Appeals': {
    patterns: ['nc.11', 'complaint', 'appeal', 'grievance', 'dispute'],
    codes: ['NC.11'],
    description: 'Documents for complaints and appeals processes for international students.'
  }
};

// GTO categories
const GTO_CATEGORIES: Record<string, { patterns: string[]; codes: string[]; description: string }> = {
  'Apprenticeship Management': {
    patterns: ['apprentice', 'traineeship', 'training contract', 'gto-'],
    codes: ['GTO'],
    description: 'Documents for managing apprenticeships and traineeships.'
  },
  'Host Employer Services': {
    patterns: ['host', 'employer', 'placement', 'rotation', 'supervision'],
    codes: ['GTO.HE'],
    description: 'Documents for host employer relationships and placement management.'
  },
  'Progress Monitoring': {
    patterns: ['progress', 'competency', 'sign-off', 'workplace assessment'],
    codes: ['GTO.PM'],
    description: 'Documents for monitoring apprentice progress and competency achievement.'
  },
  'Quality Assurance': {
    patterns: ['quality', 'audit', 'review', 'improvement'],
    codes: ['GTO.QA'],
    description: 'Documents for GTO quality assurance and continuous improvement.'
  }
};

// Document type patterns with enhanced detection
const DOC_TYPE_PATTERNS: Record<string, { patterns: string[]; description: string }> = {
  form: {
    patterns: ['form', 'application', 'request', 'submission', 'declaration', 'enrolment form'],
    description: 'A form used to collect and record information'
  },
  plan: {
    patterns: ['plan', 'strategy', 'roadmap', 'schedule', 'training plan'],
    description: 'A planning document that outlines strategy and approach'
  },
  agreement: {
    patterns: ['agreement', 'contract', 'terms', 'mou', 'consent', 'undertaking'],
    description: 'A formal agreement document establishing terms and conditions'
  },
  register: {
    patterns: ['register', 'log', 'record', 'tracker', 'list', 'inventory'],
    description: 'A register for tracking and maintaining records'
  },
  procedure: {
    patterns: ['procedure', 'process', 'sop', 'workflow', 'instruction', 'guide'],
    description: 'A procedure document detailing step-by-step instructions'
  },
  template: {
    patterns: ['template', 'sample', 'example', 'model', 'pro forma'],
    description: 'A template document providing a standardized format'
  },
  policy: {
    patterns: ['policy', 'guideline', 'framework', 'standard', 'principle'],
    description: 'A policy document establishing guidelines and requirements'
  },
  checklist: {
    patterns: ['checklist', 'audit', 'review', 'inspection', 'verification'],
    description: 'A checklist for verification and quality assurance'
  },
  report: {
    patterns: ['report', 'analysis', 'summary', 'assessment', 'evaluation'],
    description: 'A report document for analysis and documentation'
  }
};

// Standards code patterns for filename/footer detection
const STANDARDS_PATTERNS = {
  RTO_QUALITY: /Q([1-4])(?:\.D(\d+))?/gi,
  CREDENTIAL_POLICY: /CP[-.]?(\d+)?/gi,
  COMPLIANCE_REQ: /CR[-.]?(\d+)?/gi,
  NATIONAL_CODE: /NC[-.]?(\d{1,2})/gi,
  GTO: /GTO[-.]?([A-Z]{2})?/gi
};

// ===== HELPER FUNCTIONS =====

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
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  return nameWithoutExt
    .split(/[_\-\s.]+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 1);
}

function extractStandardsCodes(text: string): string[] {
  const codes: string[] = [];
  const upperText = text.toUpperCase();
  
  // Q1-Q4 patterns
  let match;
  const qPattern = /Q([1-4])(?:\.D(\d+))?/gi;
  while ((match = qPattern.exec(upperText)) !== null) {
    codes.push(match[0]);
  }
  
  // CP patterns
  const cpPattern = /CP[-.]?\d*/gi;
  while ((match = cpPattern.exec(upperText)) !== null) {
    codes.push(match[0].replace(/[-.]/g, ''));
  }
  
  // CR patterns
  const crPattern = /CR[-.]?\d*/gi;
  while ((match = crPattern.exec(upperText)) !== null) {
    codes.push(match[0].replace(/[-.]/g, ''));
  }
  
  // NC patterns
  const ncPattern = /NC[-.]?(\d{1,2})/gi;
  while ((match = ncPattern.exec(upperText)) !== null) {
    codes.push(`NC.${match[1].padStart(2, '0')}`);
  }
  
  // GTO patterns
  const gtoPattern = /GTO[-.]?([A-Z]{2})?/gi;
  while ((match = gtoPattern.exec(upperText)) !== null) {
    codes.push(match[0].replace(/[-]/g, '.'));
  }
  
  return [...new Set(codes)];
}

function detectFramework(signals: DocumentSignals): 'RTO' | 'CRICOS' | 'GTO' | null {
  const allText = [
    ...signals.filename_tokens,
    signals.header_text || '',
    signals.footer_text || '',
    ...signals.headings,
    ...signals.key_paragraphs,
    ...(signals.detected_standards || [])
  ].join(' ').toLowerCase();
  
  // Check detected standards first (highest confidence)
  if (signals.detected_standards?.some(s => s.startsWith('NC'))) {
    return 'CRICOS';
  }
  if (signals.detected_standards?.some(s => s.startsWith('GTO'))) {
    return 'GTO';
  }
  if (signals.detected_standards?.some(s => /^Q[1-4]|^CP|^CR/.test(s))) {
    return 'RTO';
  }
  
  // Keyword detection
  const cricosPatterns = ['cricos', 'national code', 'esos', 'international student', 'overseas student', 'visa'];
  const gtoPatterns = ['gto', 'group training', 'apprentice', 'traineeship', 'host employer'];
  const rtoPatterns = ['rto', 'srto', 'aqtf', 'vet', 'competency', 'qualification', 'training package'];
  
  for (const pattern of cricosPatterns) {
    if (allText.includes(pattern)) return 'CRICOS';
  }
  for (const pattern of gtoPatterns) {
    if (allText.includes(pattern)) return 'GTO';
  }
  for (const pattern of rtoPatterns) {
    if (allText.includes(pattern)) return 'RTO';
  }
  
  return 'RTO'; // Default
}

function detectCategory(signals: DocumentSignals, framework: string): { category: string; confidence: number; codes: string[] } {
  const allText = [
    ...signals.filename_tokens,
    signals.header_text || '',
    signals.footer_text || '',
    ...signals.headings,
    ...signals.key_paragraphs
  ].join(' ').toLowerCase();
  
  // Select category dictionary based on framework
  const categories = framework === 'CRICOS' ? CRICOS_CATEGORIES 
    : framework === 'GTO' ? GTO_CATEGORIES 
    : RTO_CATEGORIES;
  
  let bestMatch = { category: '', confidence: 0, codes: [] as string[] };
  let secondBest = { category: '', confidence: 0 };
  
  // Check detected standards codes first (highest confidence)
  if (signals.detected_standards?.length) {
    for (const [categoryName, categoryData] of Object.entries(categories)) {
      const matchingCodes = categoryData.codes.filter(code => 
        signals.detected_standards?.some(s => s.toUpperCase().startsWith(code.toUpperCase()))
      );
      if (matchingCodes.length > 0) {
        const confidence = 0.85 + (matchingCodes.length * 0.05); // High confidence for code match
        if (confidence > bestMatch.confidence) {
          secondBest = { category: bestMatch.category, confidence: bestMatch.confidence };
          bestMatch = { category: categoryName, confidence: Math.min(confidence, 0.95), codes: matchingCodes };
        }
      }
    }
  }
  
  // Pattern matching for remaining
  for (const [categoryName, categoryData] of Object.entries(categories)) {
    let patternMatches = 0;
    for (const pattern of categoryData.patterns) {
      if (allText.includes(pattern)) {
        patternMatches++;
      }
    }
    if (patternMatches > 0) {
      const confidence = 0.5 + (patternMatches * 0.1);
      if (confidence > bestMatch.confidence) {
        secondBest = { category: bestMatch.category, confidence: bestMatch.confidence };
        bestMatch = { category: categoryName, confidence: Math.min(confidence, 0.85), codes: categoryData.codes };
      } else if (confidence > secondBest.confidence) {
        secondBest = { category: categoryName, confidence };
      }
    }
  }
  
  // If top two are within 0.05, reduce confidence (ambiguity)
  if (secondBest.confidence > 0 && bestMatch.confidence - secondBest.confidence < 0.05) {
    bestMatch.confidence = Math.max(bestMatch.confidence - 0.15, 0.5);
  }
  
  // Default category if no match
  if (!bestMatch.category) {
    const defaultCategories = {
      RTO: 'Training and Assessment',
      CRICOS: 'Student Support',
      GTO: 'Apprenticeship Management'
    };
    return { 
      category: defaultCategories[framework as keyof typeof defaultCategories] || 'Training and Assessment',
      confidence: 0.3,
      codes: []
    };
  }
  
  return bestMatch;
}

function detectDocumentType(signals: DocumentSignals): { type: string; confidence: number } {
  const allText = [
    ...signals.filename_tokens,
    ...signals.headings
  ].join(' ').toLowerCase();
  
  let bestMatch = { type: 'template', confidence: 0.3 };
  
  for (const [typeName, typeData] of Object.entries(DOC_TYPE_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of typeData.patterns) {
      if (allText.includes(pattern)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      const confidence = 0.6 + (matchCount * 0.1);
      if (confidence > bestMatch.confidence) {
        bestMatch = { type: typeName, confidence: Math.min(confidence, 0.9) };
      }
    }
  }
  
  return bestMatch;
}

function generateDescription(
  signals: DocumentSignals, 
  docType: string, 
  category: string, 
  framework: string
): { description: string; confidence: number } {
  const typeData = DOC_TYPE_PATTERNS[docType];
  const purpose = typeData?.description || 'A document';
  const title = signals.headings[0] || signals.filename_tokens.join(' ');
  
  // Get category description
  const categories = framework === 'CRICOS' ? CRICOS_CATEGORIES 
    : framework === 'GTO' ? GTO_CATEGORIES 
    : RTO_CATEGORIES;
  const categoryDesc = categories[category]?.description || '';
  
  // Build usage guidance based on document type
  const usageMap: Record<string, string> = {
    form: 'Complete this form when collecting required information from students, staff, or stakeholders.',
    plan: 'Use this document when developing or reviewing strategic plans and approaches.',
    agreement: 'Use when formalizing arrangements and obtaining signed commitments.',
    register: 'Maintain this register to track and record relevant activities or items.',
    procedure: 'Follow these steps when carrying out the described process.',
    template: 'Use as a starting point to create consistent documentation.',
    policy: 'Reference this document for guidance on required practices and standards.',
    checklist: 'Complete during reviews, audits, or verification activities.',
    report: 'Generate when documenting analysis, outcomes, or assessments.'
  };
  
  const usage = usageMap[docType] || 'Use as required for compliance and operational purposes.';
  
  let confidence = 0.6;
  if (signals.headings.length > 0) confidence += 0.1;
  if (signals.detected_standards?.length) confidence += 0.1;
  if (categoryDesc) confidence += 0.1;
  
  const description = `${purpose} for ${category.toLowerCase()}. ${title ? `Related to: ${title}. ` : ''}${usage}`;
  
  return { description, confidence: Math.min(confidence, 0.9) };
}

function calculateConfidence(
  signals: DocumentSignals, 
  categoryResult: { confidence: number },
  descriptionResult: { confidence: number },
  framework: 'RTO' | 'CRICOS' | 'GTO' | null
): { overall: number; category: number; description: number } {
  let categoryConfidence = categoryResult.confidence;
  let descriptionConfidence = descriptionResult.confidence;
  
  // Boost from strong signals
  if (signals.header_text || signals.footer_text) {
    categoryConfidence = Math.min(categoryConfidence + 0.1, 0.95);
  }
  if (signals.detected_standards?.length) {
    categoryConfidence = Math.min(categoryConfidence + 0.1, 0.95);
  }
  if (signals.headings.length > 2) {
    descriptionConfidence = Math.min(descriptionConfidence + 0.05, 0.9);
  }
  
  // Overall is weighted combination
  const overall = Math.min(0.95, categoryConfidence * 0.6 + descriptionConfidence * 0.4);
  
  return {
    overall,
    category: categoryConfidence,
    description: descriptionConfidence
  };
}

// ===== DOCUMENT SCANNING FUNCTIONS =====

async function scanDocx(fileContent: ArrayBuffer): Promise<DocumentSignals> {
  try {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(fileContent);
    
    const signals: DocumentSignals = {
      filename_tokens: [],
      headings: [],
      key_paragraphs: [],
      merge_fields: [],
      detected_standards: []
    };

    // Main document
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (documentXml) {
      // Extract headings
      const headingMatches = documentXml.match(/<w:pStyle[^>]*w:val="Heading[^"]*"[^>]*>[\s\S]*?<w:t>([^<]+)<\/w:t>/g) || [];
      for (const match of headingMatches.slice(0, 10)) {
        const textMatch = match.match(/<w:t>([^<]+)<\/w:t>/);
        if (textMatch) signals.headings.push(textMatch[1]);
      }

      // Extract text content for paragraphs
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
      
      // Extract standards codes from content
      signals.detected_standards = extractStandardsCodes(textContent);
    }

    // Headers
    const headerFiles = Object.keys(zip.files).filter(f => f.startsWith("word/header") && f.endsWith(".xml"));
    for (const headerFile of headerFiles) {
      const headerXml = await zip.file(headerFile)?.async("string");
      if (headerXml) {
        const text = headerXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text && text.length > 5) {
          signals.header_text = (signals.header_text || '') + ' ' + text;
          // Standards codes from headers are high confidence
          const headerCodes = extractStandardsCodes(text);
          signals.detected_standards?.push(...headerCodes);
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
          // Standards codes from footers are high confidence
          const footerCodes = extractStandardsCodes(text);
          signals.detected_standards?.push(...footerCodes);
        }
      }
    }
    
    // Deduplicate standards
    signals.detected_standards = [...new Set(signals.detected_standards)];

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
      dropdown_sources: {},
      detected_standards: []
    };

    // Workbook for sheet names and named ranges
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    if (workbookXml) {
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
      
      // Extract standards from sheet names
      const sheetText = signals.sheet_names.join(' ');
      signals.detected_standards?.push(...extractStandardsCodes(sheetText));
    }

    // Scan sheets for content
    const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"));
    
    for (const sheetFile of sheetFiles) {
      const sheetXml = await zip.file(sheetFile)?.async("string");
      if (sheetXml) {
        const textContent = sheetXml.replace(/<[^>]+>/g, ' ');
        signals.merge_fields.push(...extractMergeFields(textContent));

        // Data validations (dropdowns)
        const validationPattern = /<dataValidation[^>]*>[\s\S]*?<formula1>([^<]+)<\/formula1>[\s\S]*?<\/dataValidation>/g;
        let valMatch;
        while ((valMatch = validationPattern.exec(sheetXml)) !== null) {
          const formula = valMatch[1];
          if (formula && !formula.startsWith('=')) {
            const values = formula.split(',').map(v => v.trim().replace(/"/g, ''));
            signals.dropdown_sources![`dropdown_${Object.keys(signals.dropdown_sources!).length}`] = values;
          }
        }
      }
    }

    // Shared strings
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (sharedStringsXml) {
      const stringMatches = sharedStringsXml.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
      const strings = stringMatches.map(m => m.replace(/<t[^>]*>/, '').replace('</t>', '')).slice(0, 50);
      
      signals.table_headers = strings.slice(0, 15);
      signals.merge_fields.push(...extractMergeFields(strings.join(' ')));
      signals.detected_standards?.push(...extractStandardsCodes(strings.join(' ')));
    }

    signals.merge_fields = [...new Set(signals.merge_fields)];
    signals.detected_standards = [...new Set(signals.detected_standards)];

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
      merge_fields: [],
      detected_standards: []
    };

    const slideFiles = Object.keys(zip.files).filter(f => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"));
    
    for (const slideFile of slideFiles.slice(0, 5)) {
      const slideXml = await zip.file(slideFile)?.async("string");
      if (slideXml) {
        const textMatches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
        const texts = textMatches.map(m => m.replace('<a:t>', '').replace('</a:t>', ''));
        
        if (slideFile.includes('slide1')) {
          signals.headings.push(...texts.slice(0, 2));
        }
        
        signals.key_paragraphs.push(...texts.filter(t => t.length > 20));
        signals.merge_fields.push(...extractMergeFields(texts.join(' ')));
        signals.detected_standards?.push(...extractStandardsCodes(texts.join(' ')));
      }
    }

    signals.merge_fields = [...new Set(signals.merge_fields)];
    signals.detected_standards = [...new Set(signals.detected_standards)];
    
    return signals;
  } catch (error) {
    console.error("Error scanning PPTX:", error);
    return { filename_tokens: [], headings: [], key_paragraphs: [], merge_fields: [] };
  }
}

// ===== MAIN HANDLER =====

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

    // Fetch document info if ID provided
    if (document_id && !storage_path) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, title, uploaded_files, user_edited_category, user_edited_description")
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

    // Update status
    if (docId) {
      await supabase.from("documents").update({ 
        ai_analysis_status: 'analyzing',
        ai_last_run_at: new Date().toISOString()
      }).eq("id", docId);
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
    } else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
      signals = await scanXlsx(fileBuffer);
    } else if (fileNameLower.endsWith('.pptx')) {
      signals = await scanPptx(fileBuffer);
    } else {
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

    // Add filename tokens and extract standards from filename
    const actualFilename = fileName || filePath.split('/').pop() || '';
    signals.filename_tokens = tokenizeFilename(actualFilename);
    const filenameCodes = extractStandardsCodes(actualFilename);
    signals.detected_standards = [...new Set([...(signals.detected_standards || []), ...filenameCodes])];

    // Analyze
    const framework = detectFramework(signals);
    const categoryResult = detectCategory(signals, framework || 'RTO');
    const docTypeResult = detectDocumentType(signals);
    const descResult = generateDescription(signals, docTypeResult.type, categoryResult.category, framework || 'RTO');
    const confidence = calculateConfidence(signals, categoryResult, descResult, framework);

    // Build standards tags
    const standardsTags = {
      framework: framework || 'RTO',
      codes: categoryResult.codes,
      detected: signals.detected_standards || []
    };

    const result: AnalysisResult = {
      category: categoryResult.category,
      description: descResult.description,
      framework_type: framework,
      quality_area: undefined,
      document_type: docTypeResult.type,
      confidence: Math.round(confidence.overall * 100),
      category_confidence: Math.round(confidence.category * 100),
      description_confidence: Math.round(confidence.description * 100),
      merge_fields: signals.merge_fields,
      dropdown_sources: signals.dropdown_sources || {},
      source_signals: signals,
      standards_tags: standardsTags
    };

    // Determine AI status based on thresholds
    let aiStatus: 'auto_approved' | 'needs_review' | 'pending' = 'needs_review';
    
    // Auto-approve thresholds from spec
    const categoryAutoApprove = confidence.category >= 0.85;
    const descriptionAutoApprove = confidence.description >= 0.80;
    const overallAutoApprove = confidence.overall >= 0.85;
    
    if (overallAutoApprove || (categoryAutoApprove && descriptionAutoApprove)) {
      aiStatus = 'auto_approved';
    } else if (confidence.overall < 0.5) {
      aiStatus = 'pending'; // Very low confidence, needs manual entry
    }

    // Generate reasoning
    const reasoningParts: string[] = [];
    if (signals.detected_standards?.length) {
      reasoningParts.push(`Standards detected: ${signals.detected_standards.slice(0, 5).join(', ')}`);
    }
    if (signals.filename_tokens.length > 0) {
      reasoningParts.push(`Filename: ${signals.filename_tokens.slice(0, 5).join(', ')}`);
    }
    if (signals.header_text || signals.footer_text) {
      reasoningParts.push('Header/footer detected (high confidence)');
    }
    if (signals.headings.length > 0) {
      reasoningParts.push(`${signals.headings.length} headings found`);
    }
    if (signals.merge_fields.length > 0) {
      reasoningParts.push(`${signals.merge_fields.length} merge fields`);
    }
    reasoningParts.push(`Framework: ${framework || 'RTO'}`);
    reasoningParts.push(`Type: ${docTypeResult.type}`);
    
    const reasoning = reasoningParts.join('. ') + '.';

    // Update document
    if (docId) {
      const { data: existingDoc } = await supabase
        .from("documents")
        .select("user_edited_category, user_edited_description, category, description")
        .eq("id", docId)
        .single();

      const updateData: Record<string, unknown> = {
        ai_category_suggestion: result.category,
        ai_description_draft: result.description,
        ai_confidence: result.confidence,
        ai_confidence_score: result.confidence,
        ai_category_confidence: result.category_confidence,
        ai_description_confidence: result.description_confidence,
        ai_status: aiStatus,
        ai_reasoning: reasoning,
        ai_suggested_category: result.category,
        ai_suggested_description: result.description,
        ai_last_run_at: new Date().toISOString(),
        detected_merge_fields: result.merge_fields,
        detected_dropdown_sources: result.dropdown_sources,
        source_signals: result.source_signals,
        framework_type: result.framework_type,
        ai_analysis_status: 'completed'
      };

      // Auto-apply if auto_approved and user hasn't edited
      if (aiStatus === 'auto_approved') {
        if (!existingDoc?.user_edited_category && !existingDoc?.category) {
          updateData.category = result.category;
        }
        if (!existingDoc?.user_edited_description && !existingDoc?.description) {
          updateData.description = result.description;
        }
      }

      const { error: updateError } = await supabase
        .from("documents")
        .update(updateData)
        .eq("id", docId);

      if (updateError) {
        console.error("Update error:", updateError);
      }

      // Audit log
      await supabase.from("document_ai_audit").insert({
        document_id: docId,
        action: 'ai_analysis_completed',
        category_confidence: result.category_confidence,
        description_confidence: result.description_confidence,
        overall_confidence: result.confidence,
        suggested_category: result.category,
        suggested_description: result.description,
        reasoning: reasoning
      });
    }

    console.log(`Analysis complete: category=${result.category}, confidence=${result.confidence}%, status=${aiStatus}`);

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
