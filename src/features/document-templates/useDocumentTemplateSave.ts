import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import type { SelectedTemplate } from '@/components/documents/SharePointTemplateBrowser';

export interface DocumentTemplateFormData {
  title: string;
  description: string;
  format: string;
  watermark: boolean;
  versiondate: Date | undefined;
  versionlastupdated: Date | undefined;
  isclientdoc: boolean;
  categories: string[];
  framework_type: string;
  stage: string;
  standard_set: string;
  is_core: boolean;
  is_tenant_downloadable: boolean;
}

interface UseDocumentTemplateSaveParams {
  formData: DocumentTemplateFormData;
  editingDocumentId: number | null;
  existingFiles: { url: string; name: string }[];
  selectedTemplate: SelectedTemplate | null;
  newDocDisplayVersion: string;
  createdByUserUuid: string | null | undefined;
  nextOrderNumber: number | null;
  fetchDocuments: () => void;
  setImportingTemplate: (importing: boolean) => void;
  setSelectedDocId: (docId: number) => void;
  setNextOrderNumber: (n: number) => void;
  resetAfterSave: () => void;
}

// Create/update for a document template (src/pages/ManageDocuments.tsx),
// including the SharePoint-import-on-create step. Extracted verbatim from
// the page's previous handleCreateDocument -- no logic change.
export function useDocumentTemplateSave({
  formData,
  editingDocumentId,
  existingFiles,
  selectedTemplate,
  newDocDisplayVersion,
  createdByUserUuid,
  nextOrderNumber,
  fetchDocuments,
  setImportingTemplate,
  setSelectedDocId,
  setNextOrderNumber,
  resetAfterSave,
}: UseDocumentTemplateSaveParams) {
  const { toast } = useToast();

  const save = async () => {
    try {
      // Preserve the document's already-uploaded files across a metadata edit
      // (there is no manual upload/replace affordance in this dialog --
      // uploaded_files is only ever populated via the SharePoint import below).
      const allFileUrls = existingFiles.map((f) => f.url);
      const allFileNames = existingFiles.map((f) => f.name);
      if (editingDocumentId) {
        // Update existing document
        const { error } = await supabase
          .from('documents')
          .update({
            title: formData.title,
            description: formData.description || null,
            format: formData.format || null,
            watermark: formData.watermark,
            versiondate: formData.versiondate ? format(formData.versiondate, 'yyyy-MM-dd') : null,
            versionlastupdated: formData.versionlastupdated ? formData.versionlastupdated.toISOString() : null,
            isclientdoc: formData.isclientdoc,
            category: formData.categories.length > 0 ? formData.categories.join(',') : null,
            framework_type: formData.framework_type || null,
            stage: formData.stage ? parseInt(formData.stage) : null,
            standard_set: formData.standard_set || null,
            is_core: formData.is_core,
            is_tenant_downloadable: formData.is_tenant_downloadable,
            uploaded_files: allFileUrls.length > 0 ? allFileUrls : null,
            file_names: allFileNames.length > 0 ? allFileNames : null,
          })
          .eq('id', editingDocumentId);
        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Document updated successfully',
        });
      } else {
        // Create branch: require a selected SharePoint template file
        if (!selectedTemplate) {
          toast({
            title: 'Template file required',
            description: 'Select a SharePoint template file before creating the document.',
            variant: 'destructive',
          });
          return;
        }

        // Insert new document with created_by set to current user
        const { data: insertedDoc, error } = await supabase
          .from('documents')
          .insert({
            title: formData.title,
            description: formData.description || null,
            format: formData.format || null,
            watermark: formData.watermark,
            versiondate: formData.versiondate ? format(formData.versiondate, 'yyyy-MM-dd') : null,
            versionlastupdated: formData.versionlastupdated ? formData.versionlastupdated.toISOString() : null,
            isclientdoc: formData.isclientdoc,
            category: formData.categories.length > 0 ? formData.categories.join(',') : null,
            framework_type: formData.framework_type || null,
            stage: formData.stage ? parseInt(formData.stage) : null,
            standard_set: formData.standard_set || null,
            is_core: formData.is_core,
            is_tenant_downloadable: formData.is_tenant_downloadable,
            uploaded_files: allFileUrls.length > 0 ? allFileUrls : null,
            file_names: allFileNames.length > 0 ? allFileNames : null,
            created_by: createdByUserUuid || null,
          })
          .select('id')
          .single();
        if (error) throw error;

        const newDocId = insertedDoc?.id as number;

        // Import the selected SharePoint template. If this fails, keep the
        // document row and let the user retry — do not roll back.
        setImportingTemplate(true);
        try {
          const { data: importData, error: importError } = await supabase.functions.invoke(
            'import-sharepoint-template',
            {
              body: {
                action: 'import',
                document_id: newDocId,
                source_drive_id: selectedTemplate.driveId,
                source_item_id: selectedTemplate.file.id,
                display_version: newDocDisplayVersion,
              },
            },
          );
          if (importError) throw importError;
          if (importData?.error) throw new Error(importData.error);

          const linked = importData?.fields_linked ?? 0;
          const invalid = (importData?.invalid_tags || []).length;
          sonnerToast.success(
            `Imported ${importData?.display_version ?? newDocDisplayVersion} — ${linked} field${linked !== 1 ? 's' : ''} linked${invalid ? `, ${invalid} unrecognised` : ''}`,
          );
          toast({
            title: 'Success',
            description: 'Document created and template linked',
          });
        } catch (impErr) {
          sonnerToast.error(
            impErr instanceof Error
              ? impErr.message
              : 'Template import failed — document created without a linked file. You can retry from the edit dialog.',
          );
          // Keep dialog closed but preserve document row
        } finally {
          setImportingTemplate(false);
        }

        // Drill into the newly created document detail view
        setSelectedDocId(newDocId);

        // Update next order number only for new documents
        const newNextOrderNumber = nextOrderNumber ? nextOrderNumber + 1 : 1;
        setNextOrderNumber(newNextOrderNumber);
      }

      resetAfterSave();
      fetchDocuments();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save document',
        variant: 'destructive',
      });
    }
  };

  return { save };
}
