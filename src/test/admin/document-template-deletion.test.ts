import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { useDocumentTemplateDeletion } from '@/features/document-templates/useDocumentTemplateDeletion';

function setup(overrides: { selectedDocuments?: number[] } = {}) {
  const fetchDocuments = vi.fn();
  const setSelectedDocuments = vi.fn();
  const { result, rerender } = renderHook(
    (props: { selectedDocuments: number[] }) =>
      useDocumentTemplateDeletion({
        fetchDocuments,
        selectedDocuments: props.selectedDocuments,
        setSelectedDocuments,
      }),
    { initialProps: { selectedDocuments: overrides.selectedDocuments ?? [] } },
  );
  return { result, rerender, fetchDocuments, setSelectedDocuments };
}

describe('useDocumentTemplateDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openDeleteDialog', () => {
    it('opens the dialog and populates the impact preview on a found result', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { found: true, instances: 2, stage_docs: 1, data_sources: 0, source_mappings: 3, versions: 4 },
        error: null,
      });
      const { result } = setup();

      await act(async () => {
        await result.current.openDeleteDialog(42);
      });

      expect(mockRpc).toHaveBeenCalledWith('preview_document_delete', { p_doc_id: 42 });
      expect(result.current.documentToDelete).toBe(42);
      expect(result.current.isDeleteDialogOpen).toBe(true);
      expect(result.current.deleteImpact).toEqual({
        instances: 2,
        stageDocs: 1,
        dataSources: 0,
        sourceMappings: 3,
        versions: 4,
      });
    });

    it('still opens the dialog when the preview RPC fails (best-effort)', async () => {
      mockRpc.mockRejectedValueOnce(new Error('network error'));
      const { result } = setup();

      await act(async () => {
        await result.current.openDeleteDialog(7);
      });

      expect(result.current.isDeleteDialogOpen).toBe(true);
      expect(result.current.documentToDelete).toBe(7);
      expect(result.current.deleteImpact).toBeNull();
    });
  });

  describe('closeDeleteDialog', () => {
    it('clears the target document and impact preview on close', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { found: true, instances: 1, stage_docs: 0, data_sources: 0, source_mappings: 0, versions: 0 },
        error: null,
      });
      const { result } = setup();

      await act(async () => {
        await result.current.openDeleteDialog(1);
      });
      act(() => {
        result.current.closeDeleteDialog(false);
      });

      expect(result.current.isDeleteDialogOpen).toBe(false);
      expect(result.current.documentToDelete).toBeNull();
      expect(result.current.deleteImpact).toBeNull();
    });
  });

  describe('confirmDelete', () => {
    it('does nothing when there is no target document', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.confirmDelete();
      });

      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deletes, toasts success, refetches, and closes the dialog', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { found: true, instances: 0, stage_docs: 0, data_sources: 0, source_mappings: 0, versions: 0 }, error: null })
        .mockResolvedValueOnce({
          data: { title: 'Policy A', instances_deleted: 3, stage_docs_deleted: 1, client_stage_docs_deleted: 0, tenant_docs_deleted: 2 },
          error: null,
        });
      const { result, fetchDocuments } = setup();

      await act(async () => {
        await result.current.openDeleteDialog(9);
      });
      await act(async () => {
        await result.current.confirmDelete();
      });

      expect(mockRpc).toHaveBeenLastCalledWith('delete_document_cascade', { p_doc_id: 9 });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Document deleted', description: expect.stringContaining('Policy A') }),
      );
      expect(result.current.isDeleteDialogOpen).toBe(false);
      expect(result.current.documentToDelete).toBeNull();
      expect(fetchDocuments).toHaveBeenCalledTimes(1);
    });

    it('shows an error toast and stops deleting on RPC failure', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { found: false, instances: 0, stage_docs: 0, data_sources: 0, source_mappings: 0, versions: 0 }, error: null })
        .mockResolvedValueOnce({ data: null, error: new Error('cascade failed') });
      const { result, fetchDocuments } = setup();

      await act(async () => {
        await result.current.openDeleteDialog(5);
      });
      await act(async () => {
        await result.current.confirmDelete();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' }),
      );
      expect(result.current.isDeleting).toBe(false);
      // Dialog state is left open on failure -- the user should see the error and retry.
      expect(result.current.isDeleteDialogOpen).toBe(true);
      expect(fetchDocuments).not.toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('deletes every selected document, sums the impact, and clears selection', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { title: 'A', instances_deleted: 2, stage_docs_deleted: 1, client_stage_docs_deleted: 0, tenant_docs_deleted: 0 }, error: null })
        .mockResolvedValueOnce({ data: { title: 'B', instances_deleted: 1, stage_docs_deleted: 0, client_stage_docs_deleted: 0, tenant_docs_deleted: 0 }, error: null });
      const { result, fetchDocuments, setSelectedDocuments } = setup({ selectedDocuments: [1, 2] });

      await act(async () => {
        await result.current.bulkDelete();
      });

      expect(mockRpc).toHaveBeenNthCalledWith(1, 'delete_document_cascade', { p_doc_id: 1 });
      expect(mockRpc).toHaveBeenNthCalledWith(2, 'delete_document_cascade', { p_doc_id: 2 });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Success', description: expect.stringContaining('2 document(s) deleted with 3 instance(s)') }),
      );
      expect(setSelectedDocuments).toHaveBeenCalledWith([]);
      expect(result.current.isBulkDeleteDialogOpen).toBe(false);
      expect(fetchDocuments).toHaveBeenCalledTimes(1);
    });

    it('stops on the first failure and shows an error toast', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('cascade failed') });
      const { result, fetchDocuments, setSelectedDocuments } = setup({ selectedDocuments: [1, 2] });

      await act(async () => {
        await result.current.bulkDelete();
      });

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' }),
      );
      expect(setSelectedDocuments).not.toHaveBeenCalled();
      expect(fetchDocuments).not.toHaveBeenCalled();
      await waitFor(() => expect(result.current.isDeleting).toBe(false));
    });
  });
});
