import { useState, useCallback, useRef, useEffect } from 'react';
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
  start_folder_name?: string | null;
}

export function useSharePointBrowser(tenantId: number | null, options?: { useSharedFolder?: boolean; sitePurpose?: string; startFolderName?: string }) {
  const { user } = useAuth();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const autoNavigated = useRef(false);

  const useSharedFolder = options?.useSharedFolder ?? false;
  const sitePurpose = options?.sitePurpose;
  const startFolderName = options?.startFolderName;

  // Fetch folder contents
  const {
    data: browseResult,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sharepoint-browse', tenantId, currentFolderId, useSharedFolder, sitePurpose],
    queryFn: async (): Promise<BrowseResult | null> => {
      if (!user) return null;
      // Either tenantId or sitePurpose must be provided
      if (!tenantId && !sitePurpose) return null;

      const requestBody: Record<string, unknown> = {
        action: 'list',
        folder_id: currentFolderId || undefined,
      };

      if (sitePurpose) {
        requestBody.site_purpose = sitePurpose;
        // Still pass tenant_id for audit logging if available
        if (tenantId) requestBody.tenant_id = tenantId;
      } else {
        requestBody.tenant_id = tenantId;
        requestBody.use_shared_folder = useSharedFolder;
      }

      const { data, error } = await supabase.functions.invoke(
        'browse-sharepoint-folder',
        { body: requestBody }
      );

      if (error) throw new Error(error.message || 'Failed to list folder');
      if (data?.error) throw new Error(data.error);

      return data as BrowseResult;
    },
    enabled: !!user && (!!tenantId || !!sitePurpose),
    staleTime: QUERY_STALE_TIMES.LIST,
  });

  // Auto-navigate into startFolderName on first successful root load
  useEffect(() => {
    if (autoNavigated.current || !startFolderName || !browseResult?.items || !browseResult.is_root) return;
    const target = browseResult.items.find(
      (item) => item.is_folder && item.name.toLowerCase() === startFolderName.toLowerCase()
    );
    if (target) {
      autoNavigated.current = true;
      setFolderStack([{ id: 'root', name: browseResult.root_name || 'Root' }]);
      setCurrentFolderId(target.id);
    }
  }, [browseResult, startFolderName]);

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
