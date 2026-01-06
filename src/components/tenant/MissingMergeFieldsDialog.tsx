import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, FileText, Loader2, CheckCircle } from 'lucide-react';
import { MissingField, useMissingMergeFields } from '@/hooks/useMissingMergeFields';

interface MissingMergeFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  documentName?: string;
  documentId?: number;
  stageId?: number;
  packageId?: number;
  missingFields: MissingField[];
  onSuccess?: () => void;
}

const MAX_FIELDS_PER_PAGE = 12;

export function MissingMergeFieldsDialog({
  open,
  onOpenChange,
  tenantId,
  documentName,
  documentId,
  stageId,
  packageId,
  missingFields,
  onSuccess
}: MissingMergeFieldsDialogProps) {
  const { saveMergeData, loading, getCurrentValues } = useMissingMergeFields(tenantId);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);

  // Split fields into pages if more than MAX_FIELDS_PER_PAGE
  const totalPages = Math.ceil(missingFields.length / MAX_FIELDS_PER_PAGE);
  const currentFields = missingFields.slice(
    currentPage * MAX_FIELDS_PER_PAGE,
    (currentPage + 1) * MAX_FIELDS_PER_PAGE
  );

  // Load current values when dialog opens
  useEffect(() => {
    if (open && missingFields.length > 0) {
      setInitialLoading(true);
      getCurrentValues().then((values) => {
        const initialData: Record<string, string> = {};
        missingFields.forEach((field) => {
          const value = values[field.source_column];
          if (value) {
            initialData[field.source_column] = String(value);
          }
        });
        setFormData(initialData);
        setInitialLoading(false);
      });
    }
  }, [open, missingFields, getCurrentValues]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData({});
      setErrors({});
      setCurrentPage(0);
    }
  }, [open]);

  const handleInputChange = (sourceColumn: string, value: string) => {
    setFormData((prev) => ({ ...prev, [sourceColumn]: value }));
    // Clear error when user types
    if (errors[sourceColumn]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[sourceColumn];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    currentFields.forEach((field) => {
      const value = formData[field.source_column]?.trim() || '';

      // Required validation
      if (field.required && !value) {
        newErrors[field.source_column] = `${field.name} is required`;
        return;
      }

      if (!value) return;

      // Email validation
      if (field.inputType === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          newErrors[field.source_column] = 'Please enter a valid email address';
        }
      }

      // Phone validation (basic)
      if (field.inputType === 'tel') {
        const phoneRegex = /^[\d\s\-+()]{8,}$/;
        if (!phoneRegex.test(value)) {
          newErrors[field.source_column] = 'Please enter a valid phone number';
        }
      }

      // URL validation
      if (field.inputType === 'url' && value) {
        try {
          new URL(value.startsWith('http') ? value : `https://${value}`);
        } catch {
          newErrors[field.source_column] = 'Please enter a valid URL';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (retryGeneration: boolean) => {
    if (!validateForm()) return;

    // Filter out empty values
    const dataToSave: Record<string, string> = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (value?.trim()) {
        dataToSave[key] = value.trim();
      }
    });

    if (Object.keys(dataToSave).length === 0) {
      return;
    }

    const success = await saveMergeData(dataToSave, {
      retryGeneration,
      documentId,
      stageId,
      packageId
    });

    if (success) {
      onOpenChange(false);
      onSuccess?.();
    }
  };

  const renderInput = (field: MissingField) => {
    const value = formData[field.source_column] || '';
    const error = errors[field.source_column];

    if (field.inputType === 'textarea') {
      return (
        <Textarea
          id={field.source_column}
          value={value}
          onChange={(e) => handleInputChange(field.source_column, e.target.value)}
          placeholder={`Enter ${field.name.toLowerCase()}`}
          className={error ? 'border-destructive' : ''}
        />
      );
    }

    return (
      <Input
        id={field.source_column}
        type={field.inputType}
        value={value}
        onChange={(e) => handleInputChange(field.source_column, e.target.value)}
        placeholder={`Enter ${field.name.toLowerCase()}`}
        className={error ? 'border-destructive' : ''}
      />
    );
  };

  const requiredCount = missingFields.filter((f) => f.required).length;
  const optionalCount = missingFields.length - requiredCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Missing Information Required
          </DialogTitle>
          <DialogDescription className="space-y-2">
            {documentName && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{documentName}</span>
              </div>
            )}
            <p>
              Please provide the following information to generate your document
              {requiredCount > 0 && optionalCount > 0 && (
                <span className="block text-xs mt-1">
                  <Badge variant="destructive" className="text-xs mr-2">
                    {requiredCount} required
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {optionalCount} optional
                  </Badge>
                </span>
              )}
            </p>
          </DialogDescription>
        </DialogHeader>

        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 py-4">
              {currentFields.map((field) => (
                <div key={field.source_column} className="space-y-2">
                  <Label
                    htmlFor={field.source_column}
                    className="flex items-center gap-2"
                  >
                    {field.name}
                    {field.required && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  {renderInput(field)}
                  {errors[field.source_column] && (
                    <p className="text-xs text-destructive">
                      {errors[field.source_column]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Pagination if needed */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 0}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSave(false)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Save Only
          </Button>
          {documentId && packageId && (
            <Button onClick={() => handleSave(true)} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Save & Generate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
