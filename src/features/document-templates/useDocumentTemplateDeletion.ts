import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DeleteDocumentCascadeResult {
  title: string;
  instances_deleted: number;
  stage_docs_deleted: number;
  client_stage_docs_deleted: number;
  tenant_docs_deleted: number;
}

interface PreviewDocumentDeleteResult {
  found: boolean;
  instances: number;
  stage_docs: number;
  data_sources: number;
  source_mappings: number;
  versions: number;
}

interface UseDocumentTemplateDeletionParams {
  fetchDocuments: () => void;
  selectedDocuments: number[];
  setSelectedDocuments: (ids: number[]) => void;
}

// Single-document and bulk delete for the document-template catalogue
// (src/pages/ManageDocuments.tsx). Extracted verbatim from the page's
// previously inline JSX handlers and its `handleBulkDelete` function --
// no logic change. `handleDuplicateDocument` and the window.confirm-based
// `handleDeleteDocument` that used to live alongside this were dead code
// (zero call sites) and were deleted rather than moved.
export function useDocumentTemplateDeletion({
  fetchDocuments,
  selectedDocuments,
  setSelectedDocuments,
}: UseDocumentTemplateDeletionParams) {
  const { toast } = useToast();
  const [documentToDelete, setDocumentToDelete] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<{
    instances: number;
    stageDocs: number;
    dataSources: number;
    sourceMappings: number;
    versions: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  const openDeleteDialog = async (docId: number) => {
    setDocumentToDelete(docId);
    setDeleteImpact(null);
    setIsDeleteDialogOpen(true);
    try {
      const { data } = await supabase.rpc('preview_document_delete', { p_doc_id: docId });
      const d = data as unknown as PreviewDocumentDeleteResult | null;
      if (d?.found) {
        setDeleteImpact({
          instances: d.instances,
          stageDocs: d.stage_docs,
          dataSources: d.data_sources,
          sourceMappings: d.source_mappings,
          versions: d.versions,
        });
      }
    } catch {
      /* best-effort preview; dialog still opens without an impact summary */
    }
  };

  const closeDeleteDialog = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      setDocumentToDelete(null);
      setDeleteImpact(null);
    }
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    try {
      setIsDeleting(true);
      const { data, error } = await supabase.rpc('delete_document_cascade', { p_doc_id: documentToDelete });
      if (error) throw error;
      const result = data as unknown as DeleteDocumentCascadeResult;
      toast({
        title: 'Document deleted',
        description: `Removed "${result.title}" along with ${result.instances_deleted} instance(s), ${result.stage_docs_deleted} stage link(s).`,
      });
      setDocumentToDelete(null);
      setDeleteImpact(null);
      setIsDeleteDialogOpen(false);
      fetchDocuments();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const bulkDelete = async () => {
    try {
      setIsDeleting(true);
      const results = [];
      for (const docId of selectedDocuments) {
        const { data, error } = await supabase.rpc('delete_document_cascade', { p_doc_id: docId });
        if (error) throw error;
        results.push(data);
      }
      const totalInstances = results.reduce(
        (sum, r) => sum + ((r as DeleteDocumentCascadeResult | null)?.instances_deleted || 0),
        0,
      );
      const totalStage = results.reduce(
        (sum, r) => sum + ((r as DeleteDocumentCascadeResult | null)?.stage_docs_deleted || 0),
        0,
      );
      toast({
        title: 'Success',
        description: `${selectedDocuments.length} document(s) deleted with ${totalInstances} instance(s) and ${totalStage} stage link(s) removed.`,
      });
      setSelectedDocuments([]);
      setIsBulkDeleteDialogOpen(false);
      fetchDocuments();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete documents',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    documentToDelete,
    isDeleteDialogOpen,
    deleteImpact,
    isDeleting,
    isBulkDeleteDialogOpen,
    setIsBulkDeleteDialogOpen,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
    bulkDelete,
  };
}
