import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

export interface SharePointItem {
  id: string;
  name: string;
  size: number | null;
  last_modified: string;
  is_folder: boolean;
  mime_type: string | null;
  web_url: string;
  child_count: number;
}

interface BrowseResult {
  items: SharePointItem[];
  folder_id: string;
  is_root: boolean;
  root_name: string;
}

export function useSharePointBrowser(tenantId: number | null, options?: { useSharedFolder?: boolean }) {
  const { user } = useAuth();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  const useSharedFolder = options?.useSharedFolder ?? false;

  // Fetch folder contents
  const {
    data: browseResult,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sharepoint-browse', tenantId, currentFolderId, useSharedFolder],
    queryFn: async (): Promise<BrowseResult | null> => {
      if (!tenantId || !user) return null;

      const { data, error } = await supabase.functions.invoke(
        'browse-sharepoint-folder',
        {
          body: {
            action: 'list',
            tenant_id: tenantId,
            folder_id: currentFolderId || undefined,
            use_shared_folder: useSharedFolder,
          },
        }
      );

      if (error) throw new Error(error.message || 'Failed to list folder');
      if (data?.error) throw new Error(data.error);

      return data as BrowseResult;
    },
    enabled: !!tenantId && !!user,
    staleTime: QUERY_STALE_TIMES.LIST,
  });

  // Navigate into a subfolder
  const navigateToFolder = useCallback(
    (folderId: string, folderName: string) => {
      setFolderStack((prev) => [
        ...prev,
        { id: currentFolderId || 'root', name: browseResult?.root_name || 'Root' },
      ]);
      setCurrentFolderId(folderId);
    },
    [currentFolderId, browseResult?.root_name]
  );

  // Navigate back
  const navigateBack = useCallback(() => {
    setFolderStack((prev) => {
      const newStack = [...prev];
      const parent = newStack.pop();
      if (parent) {
        setCurrentFolderId(parent.id === 'root' ? null : parent.id);
      }
      return newStack;
    });
  }, []);

  // Navigate to root
  const navigateToRoot = useCallback(() => {
    setCurrentFolderId(null);
    setFolderStack([]);
  }, []);

  // Download a file
  const downloadFile = useCallback(
    async (itemId: string, fileName: string) => {
      setDownloading(itemId);
      try {
        const { data, error } = await supabase.functions.invoke(
          'browse-sharepoint-folder',
          {
            body: {
              action: 'download',
              tenant_id: tenantId,
              item_id: itemId,
            },
          }
        );

        if (error) throw new Error(error.message || 'Download failed');
        if (data?.error) throw new Error(data.error);

        if (data?.download_url) {
          // Open pre-authenticated download URL
          const link = document.createElement('a');
          link.href = data.download_url;
          link.download = fileName;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } finally {
        setDownloading(null);
      }
    },
    []
  );

  return {
    items: browseResult?.items || [],
    isRoot: browseResult?.is_root ?? true,
    rootName: browseResult?.root_name || 'SharePoint',
    folderStack,
    isLoading,
    error,
    downloading,
    navigateToFolder,
    navigateBack,
    navigateToRoot,
    downloadFile,
    refetch,
  };
}
