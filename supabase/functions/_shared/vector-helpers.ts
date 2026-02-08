/**
 * Vector Indexing Helpers for Ask Viv
 * 
 * Provides utilities for building summaries, chunking text, and generating embeddings.
 */

// ============= Summary Builders =============

/**
 * Build a client/tenant summary for indexing
 */
export function buildClientSummary(tenant: {
  id: number;
  name: string;
  status: string;
  rto_id?: string | null;
  risk_level?: string | null;
  cricos_code?: string | null;
  abn?: string | null;
}): string {
  const parts = [
    `Client: ${tenant.name}`,
    `Status: ${tenant.status || "Unknown"}`,
  ];
  
  if (tenant.rto_id) parts.push(`RTO ID: ${tenant.rto_id}`);
  if (tenant.cricos_code) parts.push(`CRICOS Code: ${tenant.cricos_code}`);
  if (tenant.abn) parts.push(`ABN: ${tenant.abn}`);
  if (tenant.risk_level) parts.push(`Risk Level: ${tenant.risk_level}`);
  
  return parts.join("\n");
}

/**
 * Build a phase/stage summary for indexing
 */
export function buildPhaseSummary(phase: {
  id: number;
  title: string;
  status: string;
  stage_type?: string | null;
  completion_percent?: number | null;
  blockers?: string[];
  required_evidence?: string[];
}): string {
  const parts = [
    `Phase: ${phase.title}`,
    `Status: ${phase.status}`,
  ];
  
  if (phase.stage_type) parts.push(`Type: ${phase.stage_type}`);
  if (phase.completion_percent !== undefined) {
    parts.push(`Completion: ${phase.completion_percent}%`);
  }
  if (phase.blockers && phase.blockers.length > 0) {
    parts.push(`Blockers: ${phase.blockers.join(", ")}`);
  }
  if (phase.required_evidence && phase.required_evidence.length > 0) {
    parts.push(`Required Evidence: ${phase.required_evidence.join(", ")}`);
  }
  
  return parts.join("\n");
}

/**
 * Build a task summary for indexing
 */
export function buildTaskSummary(task: {
  id: string;
  task_name: string;
  status: string;
  description?: string | null;
  due_date_text?: string | null;
  priority?: string | null;
}): string {
  const parts = [
    `Task: ${task.task_name}`,
    `Status: ${task.status}`,
  ];
  
  if (task.priority) parts.push(`Priority: ${task.priority}`);
  if (task.due_date_text) parts.push(`Due: ${task.due_date_text}`);
  if (task.description) parts.push(`Description: ${task.description}`);
  
  return parts.join("\n");
}

/**
 * Build a consult log summary for indexing
 */
export function buildConsultSummary(log: {
  id: string;
  date: string;
  purpose?: string | null;
  outcomes?: string | null;
  actions?: string[];
  duration_minutes?: number | null;
}): string {
  const parts = [
    `Consultation: ${log.date}`,
  ];
  
  if (log.purpose) parts.push(`Purpose: ${log.purpose}`);
  if (log.duration_minutes) {
    const hours = Math.floor(log.duration_minutes / 60);
    const mins = log.duration_minutes % 60;
    parts.push(`Duration: ${hours > 0 ? `${hours}h ` : ""}${mins}m`);
  }
  if (log.outcomes) parts.push(`Outcomes: ${log.outcomes}`);
  if (log.actions && log.actions.length > 0) {
    parts.push(`Actions: ${log.actions.join("; ")}`);
  }
  
  return parts.join("\n");
}

/**
 * Build a document metadata summary for indexing
 */
export function buildDocumentSummary(doc: {
  id: number;
  title: string;
  category?: string | null;
  status?: string | null;
  is_released?: boolean;
  uploaded_at?: string | null;
  doc_type?: string | null;
}): string {
  const parts = [
    `Document: ${doc.title}`,
  ];
  
  if (doc.category) parts.push(`Category: ${doc.category}`);
  if (doc.doc_type) parts.push(`Type: ${doc.doc_type}`);
  if (doc.status) parts.push(`Status: ${doc.status}`);
  if (doc.is_released !== undefined) {
    parts.push(`Released: ${doc.is_released ? "Yes" : "No"}`);
  }
  if (doc.uploaded_at) parts.push(`Uploaded: ${doc.uploaded_at}`);
  
  return parts.join("\n");
}

// ============= Chunking Utilities =============

export interface TextChunk {
  index: number;
  text: string;
  tokenCount: number;
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks, preserving structure
 */
export function chunkText(
  text: string,
  maxTokens: number = 500
): TextChunk[] {
  const chunks: TextChunk[] = [];
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";
  let currentTokens = 0;
  let chunkIndex = 0;
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    
    // If single paragraph exceeds max, split by sentences
    if (paraTokens > maxTokens) {
      // Save current chunk if any
      if (currentChunk.trim()) {
        chunks.push({
          index: chunkIndex++,
          text: currentChunk.trim(),
          tokenCount: currentTokens,
        });
        currentChunk = "";
        currentTokens = 0;
      }
      
      // Split paragraph by sentences
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentTokens = estimateTokens(sentence);
        
        if (currentTokens + sentTokens > maxTokens && currentChunk.trim()) {
          chunks.push({
            index: chunkIndex++,
            text: currentChunk.trim(),
            tokenCount: currentTokens,
          });
          currentChunk = "";
          currentTokens = 0;
        }
        
        currentChunk += (currentChunk ? " " : "") + sentence;
        currentTokens += sentTokens;
      }
    } else {
      // Add paragraph to current chunk if it fits
      if (currentTokens + paraTokens > maxTokens && currentChunk.trim()) {
        chunks.push({
          index: chunkIndex++,
          text: currentChunk.trim(),
          tokenCount: currentTokens,
        });
        currentChunk = "";
        currentTokens = 0;
      }
      
      currentChunk += (currentChunk ? "\n\n" : "") + para;
      currentTokens += paraTokens;
    }
  }
  
  // Save remaining chunk
  if (currentChunk.trim()) {
    chunks.push({
      index: chunkIndex,
      text: currentChunk.trim(),
      tokenCount: currentTokens,
    });
  }
  
  return chunks;
}

// ============= Namespace Key Builder =============

/**
 * Build namespace key for a vector embedding
 */
export function buildNamespaceKey(
  tenantId: number,
  sourceType: string,
  recordId: string | number
): string {
  return `tenant:${tenantId}:${sourceType}:${recordId}`;
}

// ============= Embedding Types =============

export interface EmbeddingRecord {
  tenant_id: number;
  namespace_key: string;
  source_type: string;
  record_id: string;
  record_label: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  embedding: number[];
  mode_allowed: "knowledge" | "compliance" | "both";
  metadata: Record<string, unknown>;
}

export interface IndexResult {
  success: boolean;
  recordsIndexed: number;
  recordsRemoved: number;
  errors: string[];
}
