import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Trash2, Plus } from 'lucide-react';
import { useAuditDocuments } from '@/hooks/useAuditWorkspace';
import { DOCUMENT_TYPES } from '@/types/auditWorkspace';
import type { AuditDocument } from '@/types/auditWorkspace';
import { cn } from '@/lib/utils';

interface DocumentsTabProps {
  auditId: string;
}

export function DocumentsTab({ auditId }: DocumentsTabProps) {
  const { data: documents, uploadDocument, deleteDocument } = useAuditDocuments(auditId);
  const [docType, setDocType] = useState('other');
  const [qualCode, setQualCode] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      uploadDocument.mutate({ file, documentType: docType, qualificationCode: qualCode || undefined });
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium text-sm mb-1">Upload documents for AI review</p>
        <p className="text-xs text-muted-foreground mb-4">
          Drop files here or click to browse — PDF · DOCX · XLSX — max 50MB per file
        </p>
        <div className="flex items-center justify-center gap-3 mb-3">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-60 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {docType === 'tas' && (
            <Input
              className="w-40 h-8 text-xs"
              placeholder="Qualification code"
              value={qualCode}
              onChange={(e) => setQualCode(e.target.value)}
            />
          )}
        </div>
        <Button size="sm" onClick={() => fileInputRef.current?.click()}>
          Browse Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.docx,.xlsx,.doc,.xls"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Document List */}
      {documents && documents.length > 0 ? (
        <div className="space-y-3">
          {documents.map(doc => (
            <DocumentCard key={doc.id} doc={doc} onDelete={() => deleteDocument.mutate({ id: doc.id, filePath: doc.file_path })} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          No documents uploaded yet. Upload documents above for AI review.
        </p>
      )}
    </div>
  );
}

function DocumentCard({ doc, onDelete }: { doc: AuditDocument; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type;

  const statusDisplay = {
    pending: { icon: <FileText className="h-3.5 w-3.5 text-gray-400" />, text: 'Queued for analysis', color: 'text-gray-500' },
    processing: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />, text: 'AI is reading...', color: 'text-blue-600' },
    complete: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />, text: 'Analysis complete', color: 'text-green-600' },
    error: { icon: <AlertCircle className="h-3.5 w-3.5 text-red-500" />, text: 'Analysis failed', color: 'text-red-600' },
    skipped: { icon: <FileText className="h-3.5 w-3.5 text-gray-400" />, text: 'Skipped', color: 'text-gray-500' },
  };

  const s = statusDisplay[doc.ai_status] || statusDisplay.skipped;
  const findingsCount = doc.ai_findings?.length || 0;
  const recsCount = doc.ai_recommendations?.length || 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <FileText className="h-8 w-8 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{doc.file_name}</p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
                <span>{typeLabel}</span>
                {doc.qualification_code && <span>· {doc.qualification_code}</span>}
                {doc.file_size && <span>· {(doc.file_size / 1024 / 1024).toFixed(1)} MB</span>}
              </div>
              <div className={cn('flex items-center gap-1 mt-2 text-xs', s.color)}>
                {s.icon}
                {s.text}
              </div>
              {doc.ai_status === 'complete' && (findingsCount > 0 || recsCount > 0) && (
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  {findingsCount > 0 && <span>{findingsCount} findings</span>}
                  {recsCount > 0 && <span>{recsCount} recommendations</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {doc.ai_status === 'complete' && (findingsCount > 0 || recsCount > 0) && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        {/* AI Results */}
        {expanded && doc.ai_status === 'complete' && (
          <div className="mt-4 space-y-3 border-t pt-3">
            {doc.ai_risk_summary && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                {doc.ai_risk_summary}
              </div>
            )}
            {doc.ai_findings?.map((f, i) => (
              <div key={i} className="bg-muted/50 rounded p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{f.risk_level}</Badge>
                  <span className="font-medium">{f.standard_code} {f.clause}</span>
                </div>
                <p>{f.finding}</p>
                {f.evidence_cited && <p className="text-muted-foreground italic">{f.evidence_cited}</p>}
              </div>
            ))}
            {doc.ai_recommendations?.map((r, i) => (
              <div key={i} className="bg-blue-50 border border-blue-100 rounded p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.priority}</Badge>
                  <span className="font-medium">{r.standard_reference}</span>
                </div>
                <p>{r.action}</p>
                {r.rationale && <p className="text-muted-foreground">{r.rationale}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
