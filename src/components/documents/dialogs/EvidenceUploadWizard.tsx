import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Upload, FileText, Loader2, X, ChevronRight, ChevronLeft, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { useEvidenceCategories, type EvidenceCategory, type MetadataField } from '@/hooks/useEvidenceCategories';
import { useUploadPortalDocument } from '@/hooks/usePortalDocuments';
import { useToast } from '@/hooks/use-toast';

interface EvidenceUploadWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  stageType?: string;
  linkedStageId?: number;
  linkedPackageId?: number;
  direction?: 'vivacity_to_client' | 'client_to_vivacity' | 'internal';
}

const DOCUMENT_TYPES = [
  { value: 'policy', label: 'Policy' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'tool', label: 'Tool' },
  { value: 'record', label: 'Record' },
  { value: 'template', label: 'Template' },
  { value: 'form', label: 'Form' },
  { value: 'report', label: 'Report' },
  { value: 'other', label: 'Other' },
];

type WizardStep = 'category' | 'metadata' | 'file' | 'review';

export function EvidenceUploadWizard({
  open,
  onOpenChange,
  tenantId,
  stageType,
  linkedStageId,
  linkedPackageId,
  direction = 'client_to_vivacity',
}: EvidenceUploadWizardProps) {
  const [step, setStep] = useState<WizardStep>('category');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('');
  const [versionDate, setVersionDate] = useState<string>('');
  const [documentOwner, setDocumentOwner] = useState<string>('');
  const [relatedQualification, setRelatedQualification] = useState<string>('');
  const [metadataValues, setMetadataValues] = useState<Record<string, string | boolean>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [shareWithClient, setShareWithClient] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: categories = [], isLoading: categoriesLoading } = useEvidenceCategories(stageType);
  const uploadDoc = useUploadPortalDocument();

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const requiredMetadata: MetadataField[] = selectedCategory?.required_metadata_json || [];

  const resetWizard = () => {
    setStep('category');
    setSelectedCategoryId('');
    setDocumentType('');
    setVersionDate('');
    setDocumentOwner('');
    setRelatedQualification('');
    setMetadataValues({});
    setSelectedFiles([]);
    setShareWithClient(false);
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  const canProceedFromCategory = selectedCategoryId && documentType && versionDate && documentOwner;

  const canProceedFromMetadata = requiredMetadata
    .filter(f => f.required)
    .every(f => {
      const val = metadataValues[f.key];
      if (f.type === 'boolean') return val !== undefined;
      return val && String(val).trim() !== '';
    });

  const canProceedFromFile = selectedFiles.length > 0;

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;

    const evidenceMetadata = {
      ...metadataValues,
      version_date: versionDate,
      document_owner: documentOwner,
      related_qualification: relatedQualification,
    };

    try {
      for (const file of selectedFiles) {
        await uploadDoc.mutateAsync({
          tenantId,
          file,
          direction,
          isClientVisible: shareWithClient,
          categoryId: selectedCategory?.id || null,
          linkedStageId: linkedStageId || null,
          linkedPackageId: linkedPackageId || null,
        });
      }

      toast({
        title: 'Evidence uploaded',
        description: `${selectedFiles.length} file(s) uploaded with metadata to "${selectedCategory?.category_name}".`,
      });

      handleClose();
    } catch {
      // Error handled by hook toast
    }
  };

  const stepIndex = ['category', 'metadata', 'file', 'review'].indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Evidence
          </DialogTitle>
          <DialogDescription>
            Step {stepIndex + 1} of 4 — {step === 'category' ? 'Select Category' : step === 'metadata' ? 'Enter Details' : step === 'file' ? 'Select Files' : 'Review & Submit'}
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex gap-1 pt-2">
            {['category', 'metadata', 'file', 'review'].map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Step 1: Category Selection */}
          {step === 'category' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Evidence Category <span className="text-destructive">*</span></Label>
                {categoriesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading categories...
                  </div>
                ) : (
                  <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select evidence category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <span>{cat.category_name}</span>
                            {cat.mandatory_flag && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedCategory && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCategory.category_description}
                    {selectedCategory.related_standard_clause && (
                      <span className="ml-1 font-medium">({selectedCategory.related_standard_clause})</span>
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Document Type <span className="text-destructive">*</span></Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map(dt => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Version Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={versionDate}
                  onChange={e => setVersionDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Document Owner <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Training Manager, CEO"
                  value={documentOwner}
                  onChange={e => setDocumentOwner(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Related Qualification <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  placeholder="e.g. BSB50420 Diploma of Leadership and Management"
                  value={relatedQualification}
                  onChange={e => setRelatedQualification(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2: Category-specific metadata */}
          {step === 'metadata' && (
            <div className="space-y-4">
              {requiredMetadata.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm font-medium">No additional metadata required</p>
                  <p className="text-xs mt-1">This category doesn't require extra fields.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>Complete all required fields for <strong>{selectedCategory?.category_name}</strong></span>
                  </div>
                  {requiredMetadata.map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <Label>
                        {field.label}
                        {field.required && <span className="text-destructive"> *</span>}
                      </Label>
                      {field.type === 'boolean' ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!metadataValues[field.key]}
                            onCheckedChange={v => setMetadataValues(prev => ({ ...prev, [field.key]: v }))}
                          />
                          <span className="text-sm text-muted-foreground">
                            {metadataValues[field.key] ? 'Confirmed' : 'Not confirmed'}
                          </span>
                        </div>
                      ) : field.type === 'date' ? (
                        <Input
                          type="date"
                          value={String(metadataValues[field.key] || '')}
                          onChange={e => setMetadataValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      ) : (
                        <Input
                          placeholder={`Enter ${field.label.toLowerCase()}...`}
                          value={String(metadataValues[field.key] || '')}
                          onChange={e => setMetadataValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Step 3: File Upload */}
          {step === 'file' && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={e => {
                  if (e.target.files) setSelectedFiles(Array.from(e.target.files));
                }}
                multiple
                className="hidden"
              />

              {selectedFiles.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to select files</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, images supported</p>
                </button>
              ) : (
                <div className="space-y-2">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedFiles(f => f.filter((_, idx) => idx !== i))}
                        className="h-8 w-8 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    Add more files
                  </Button>
                </div>
              )}

              {direction === 'vivacity_to_client' && (
                <div className="flex items-center justify-between pt-2">
                  <div className="space-y-0.5">
                    <Label>Share with client</Label>
                    <p className="text-xs text-muted-foreground">Client will see this in their portal</p>
                  </div>
                  <Switch checked={shareWithClient} onCheckedChange={setShareWithClient} />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedCategory?.category_name}</Badge>
                  {selectedCategory?.mandatory_flag && (
                    <Badge variant="destructive" className="text-[10px]">Mandatory</Badge>
                  )}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Document Type:</span>
                    <p className="font-medium capitalize">{documentType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Version Date:</span>
                    <p className="font-medium">{versionDate}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Owner:</span>
                    <p className="font-medium">{documentOwner}</p>
                  </div>
                  {relatedQualification && (
                    <div>
                      <span className="text-muted-foreground">Qualification:</span>
                      <p className="font-medium">{relatedQualification}</p>
                    </div>
                  )}
                </div>

                {requiredMetadata.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Category Metadata</p>
                      {requiredMetadata.map(f => (
                        <div key={f.key} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{f.label}:</span>
                          <span className="font-medium">
                            {f.type === 'boolean'
                              ? (metadataValues[f.key] ? '✓ Confirmed' : '✗ Not confirmed')
                              : String(metadataValues[f.key] || '—')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Files ({selectedFiles.length})</p>
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-muted-foreground text-xs">({(f.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t flex justify-between">
          <div>
            {step !== 'category' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const steps: WizardStep[] = ['category', 'metadata', 'file', 'review'];
                  setStep(steps[stepIndex - 1]);
                }}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            {step === 'review' ? (
              <Button
                onClick={handleSubmit}
                disabled={uploadDoc.isPending}
                className="gap-2"
              >
                {uploadDoc.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Upload Evidence
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const steps: WizardStep[] = ['category', 'metadata', 'file', 'review'];
                  setStep(steps[stepIndex + 1]);
                }}
                disabled={
                  (step === 'category' && !canProceedFromCategory) ||
                  (step === 'metadata' && !canProceedFromMetadata) ||
                  (step === 'file' && !canProceedFromFile)
                }
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
