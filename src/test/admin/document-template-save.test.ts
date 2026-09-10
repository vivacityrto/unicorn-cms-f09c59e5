import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockSonnerSuccess = vi.fn();
const mockSonnerError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mockSonnerSuccess(...args), error: (...args: unknown[]) => mockSonnerError(...args) },
}));

const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'documents') throw new Error(`unexpected table ${table}`);
      return {
        update: (payload: unknown) => ({
          eq: (...args: unknown[]) => mockUpdate(payload, ...args),
        }),
        insert: (payload: unknown) => ({
          select: () => ({
            single: () => mockInsert(payload),
          }),
        }),
      };
    },
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { useDocumentTemplateSave, type DocumentTemplateFormData } from '@/features/document-templates/useDocumentTemplateSave';

const baseFormData: DocumentTemplateFormData = {
  title: 'Policy A',
  description: '',
  format: 'docx',
  watermark: false,
  versiondate: undefined,
  versionlastupdated: undefined,
  isclientdoc: false,
  categories: [],
  framework_type: '',
  stage: '',
  standard_set: '',
  is_core: true,
  is_tenant_downloadable: true,
};

function setup(overrides: Partial<Parameters<typeof useDocumentTemplateSave>[0]> = {}) {
  const fetchDocuments = vi.fn();
  const setImportingTemplate = vi.fn();
  const setSelectedDocId = vi.fn();
  const setNextOrderNumber = vi.fn();
  const resetAfterSave = vi.fn();
  const { result } = renderHook(() =>
    useDocumentTemplateSave({
      formData: baseFormData,
      editingDocumentId: null,
      existingFiles: [],
      selectedTemplate: null,
      newDocDisplayVersion: '2026.00.00',
      createdByUserUuid: 'user-1',
      nextOrderNumber: 5,
      fetchDocuments,
      setImportingTemplate,
      setSelectedDocId,
      setNextOrderNumber,
      resetAfterSave,
      ...overrides,
    }),
  );
  return { result, fetchDocuments, setImportingTemplate, setSelectedDocId, setNextOrderNumber, resetAfterSave };
}

describe('useDocumentTemplateSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('edit branch', () => {
    it('updates, toasts success, resets, and refetches', async () => {
      mockUpdate.mockResolvedValueOnce({ error: null });
      const { result, fetchDocuments, resetAfterSave } = setup({ editingDocumentId: 42 });

      await act(async () => {
        await result.current.save();
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Policy A', category: null, uploaded_files: null }),
        'id',
        42,
      );
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
      expect(resetAfterSave).toHaveBeenCalledTimes(1);
      expect(fetchDocuments).toHaveBeenCalledTimes(1);
    });

    it('shows an error toast and does not reset on update failure', async () => {
      mockUpdate.mockResolvedValueOnce({ error: new Error('update failed') });
      const { result, fetchDocuments, resetAfterSave } = setup({ editingDocumentId: 42 });

      await act(async () => {
        await result.current.save();
      });

      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error', variant: 'destructive' }));
      expect(resetAfterSave).not.toHaveBeenCalled();
      expect(fetchDocuments).not.toHaveBeenCalled();
    });

    it('preserves existingFiles as uploaded_files/file_names on update', async () => {
      mockUpdate.mockResolvedValueOnce({ error: null });
      const { result } = setup({
        editingDocumentId: 42,
        existingFiles: [{ url: 'path/a.pdf', name: 'a.pdf' }],
      });

      await act(async () => {
        await result.current.save();
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ uploaded_files: ['path/a.pdf'], file_names: ['a.pdf'] }),
        'id',
        42,
      );
    });
  });

  describe('create branch', () => {
    it('requires a selected template before inserting', async () => {
      const { result } = setup({ editingDocumentId: null, selectedTemplate: null });

      await act(async () => {
        await result.current.save();
      });

      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Template file required' }));
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('inserts, imports, and reports success on a clean import', async () => {
      const selectedTemplate = { driveId: 'drive-1', folderName: 'RTO', rootFolderName: 'RTO', file: { id: 'file-1', name: 'a.docx', mimeType: null } };
      mockInsert.mockResolvedValueOnce({ data: { id: 7 }, error: null });
      mockInvoke.mockResolvedValueOnce({ data: { display_version: '2026.00.00', fields_linked: 3, invalid_tags: [] }, error: null });
      const { result, setSelectedDocId, setNextOrderNumber, resetAfterSave, fetchDocuments } = setup({
        editingDocumentId: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedTemplate: selectedTemplate as any,
      });

      await act(async () => {
        await result.current.save();
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'import-sharepoint-template',
        expect.objectContaining({ body: expect.objectContaining({ document_id: 7, source_drive_id: 'drive-1' }) }),
      );
      expect(mockSonnerSuccess).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success', description: 'Document created and template linked' }));
      expect(setSelectedDocId).toHaveBeenCalledWith(7);
      expect(setNextOrderNumber).toHaveBeenCalledWith(6);
      expect(resetAfterSave).toHaveBeenCalledTimes(1);
      expect(fetchDocuments).toHaveBeenCalledTimes(1);
    });

    it('keeps the created document row and still resets when the import fails', async () => {
      const selectedTemplate = { driveId: 'drive-1', folderName: 'RTO', rootFolderName: 'RTO', file: { id: 'file-1', name: 'a.docx', mimeType: null } };
      mockInsert.mockResolvedValueOnce({ data: { id: 9 }, error: null });
      mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('import failed') });
      const { result, setSelectedDocId, resetAfterSave, fetchDocuments } = setup({
        editingDocumentId: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedTemplate: selectedTemplate as any,
      });

      await act(async () => {
        await result.current.save();
      });

      expect(mockSonnerError).toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'Document created and template linked' }));
      expect(setSelectedDocId).toHaveBeenCalledWith(9);
      expect(resetAfterSave).toHaveBeenCalledTimes(1);
      expect(fetchDocuments).toHaveBeenCalledTimes(1);
    });

    it('shows an error toast and does not reset when the insert fails', async () => {
      const selectedTemplate = { driveId: 'drive-1', folderName: 'RTO', rootFolderName: 'RTO', file: { id: 'file-1', name: 'a.docx', mimeType: null } };
      mockInsert.mockResolvedValueOnce({ data: null, error: new Error('insert failed') });
      const { result, resetAfterSave, fetchDocuments } = setup({
        editingDocumentId: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedTemplate: selectedTemplate as any,
      });

      await act(async () => {
        await result.current.save();
      });

      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error', variant: 'destructive' }));
      expect(resetAfterSave).not.toHaveBeenCalled();
      expect(fetchDocuments).not.toHaveBeenCalled();
    });
  });
});
