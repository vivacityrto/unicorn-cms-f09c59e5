import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Resource } from "@/types/resource";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

// Helper function to transform database rows to Resource type
const transformResource = (row: any, favouriteIds: string[] = []): Resource => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  file_url: row.file_url,
  video_url: row.video_url,
  version: row.version || 'v1.0',
  tags: row.tags || [],
  access_level: row.access_level || 'member',
  created_at: row.created_at,
  updated_at: row.updated_at,
  usage_count: row.usage_count || 0,
  is_favourite: favouriteIds.includes(row.id),
});

export const useResources = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get user's favourite resource IDs
  const useFavouriteIds = () => {
    return useQuery({
      queryKey: ["resource-favourite-ids", user?.id],
      queryFn: async (): Promise<string[]> => {
        if (!user?.id) return [];
        const { data, error } = await supabase
          .from("resource_favourites")
          .select("resource_id")
          .eq("user_id", user.id);
        if (error) throw error;
        return data?.map((f: any) => f.resource_id) || [];
      },
      enabled: !!user?.id,
    });
  };

  // Get all resources
  const useAllResources = () => {
    const { data: favouriteIds = [] } = useFavouriteIds();
    
    return useQuery({
      queryKey: ["resources", "all"],
      queryFn: async (): Promise<Resource[]> => {
        // Get resources
        const { data: resources, error } = await supabase
          .from("resource_library")
          .select("*")
          .in("access_level", ["member", "public"])
          .order("created_at", { ascending: false });
        
        if (error) throw error;

        // Get usage counts
        const { data: usageCounts } = await supabase
          .from("resource_usage")
          .select("resource_id");

        const countMap: Record<string, number> = {};
        usageCounts?.forEach((u: any) => {
          countMap[u.resource_id] = (countMap[u.resource_id] || 0) + 1;
        });

        return (resources || []).map((r: any) => 
          transformResource({ ...r, usage_count: countMap[r.id] || 0 }, favouriteIds)
        );
      },
    });
  };

  // Get resources by category
  const useResourcesByCategory = (category: string) => {
    const { data: favouriteIds = [] } = useFavouriteIds();

    return useQuery({
      queryKey: ["resources", "category", category],
      queryFn: async (): Promise<Resource[]> => {
        const { data: resources, error } = await supabase
          .from("resource_library")
          .select("*")
          .eq("category", category)
          .in("access_level", ["member", "public"])
          .order("created_at", { ascending: false });
        
        if (error) throw error;

        // Get usage counts
        const { data: usageCounts } = await supabase
          .from("resource_usage")
          .select("resource_id");

        const countMap: Record<string, number> = {};
        usageCounts?.forEach((u: any) => {
          countMap[u.resource_id] = (countMap[u.resource_id] || 0) + 1;
        });

        return (resources || []).map((r: any) => 
          transformResource({ ...r, usage_count: countMap[r.id] || 0 }, favouriteIds)
        );
      },
      enabled: !!category,
    });
  };

  // Get recently added resources
  const useRecentResources = (limit: number = 10) => {
    const { data: favouriteIds = [] } = useFavouriteIds();

    return useQuery({
      queryKey: ["resources", "recent", limit],
      queryFn: async (): Promise<Resource[]> => {
        const { data: resources, error } = await supabase
          .from("resource_library")
          .select("*")
          .in("access_level", ["member", "public"])
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (error) throw error;

        // Get usage counts
        const { data: usageCounts } = await supabase
          .from("resource_usage")
          .select("resource_id");

        const countMap: Record<string, number> = {};
        usageCounts?.forEach((u: any) => {
          countMap[u.resource_id] = (countMap[u.resource_id] || 0) + 1;
        });

        return (resources || []).map((r: any) => 
          transformResource({ ...r, usage_count: countMap[r.id] || 0 }, favouriteIds)
        );
      },
    });
  };

  // Get most used resources
  const useMostUsedResources = (limit: number = 10) => {
    const { data: favouriteIds = [] } = useFavouriteIds();

    return useQuery({
      queryKey: ["resources", "most-used", limit],
      queryFn: async (): Promise<Resource[]> => {
        // Get all usage counts first
        const { data: usageCounts } = await supabase
          .from("resource_usage")
          .select("resource_id");

        const countMap: Record<string, number> = {};
        usageCounts?.forEach((u: any) => {
          countMap[u.resource_id] = (countMap[u.resource_id] || 0) + 1;
        });

        // Get resources
        const { data: resources, error } = await supabase
          .from("resource_library")
          .select("*")
          .in("access_level", ["member", "public"]);
        
        if (error) throw error;

        // Sort by usage count and limit
        const sortedResources = (resources || [])
          .map((r: any) => ({ ...r, usage_count: countMap[r.id] || 0 }))
          .sort((a: any, b: any) => b.usage_count - a.usage_count)
          .slice(0, limit);

        return sortedResources.map((r: any) => transformResource(r, favouriteIds));
      },
    });
  };

  // Get user favourites
  const useFavouriteResources = () => {
    const { data: favouriteIds = [] } = useFavouriteIds();

    return useQuery({
      queryKey: ["resources", "favourites"],
      queryFn: async (): Promise<Resource[]> => {
        if (!user?.id || favouriteIds.length === 0) return [];

        const { data: resources, error } = await supabase
          .from("resource_library")
          .select("*")
          .in("id", favouriteIds)
          .in("access_level", ["member", "public"]);
        
        if (error) throw error;

        // Get usage counts
        const { data: usageCounts } = await supabase
          .from("resource_usage")
          .select("resource_id");

        const countMap: Record<string, number> = {};
        usageCounts?.forEach((u: any) => {
          countMap[u.resource_id] = (countMap[u.resource_id] || 0) + 1;
        });

        return (resources || []).map((r: any) => 
          transformResource({ ...r, usage_count: countMap[r.id] || 0 }, favouriteIds)
        );
      },
      enabled: !!user?.id,
    });
  };

  // Search resources
  const useSearchResources = (searchTerm: string, category?: string, tags?: string[]) => {
    const { data: favouriteIds = [] } = useFavouriteIds();

    return useQuery({
      queryKey: ["resources", "search", searchTerm, category, tags],
      queryFn: async (): Promise<Resource[]> => {
        let query = supabase
          .from("resource_library")
          .select("*")
          .in("access_level", ["member", "public"]);

        if (searchTerm) {
          query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
        }

        if (category) {
          query = query.eq("category", category);
        }

        if (tags && tags.length > 0) {
          query = query.overlaps("tags", tags);
        }

        const { data: resources, error } = await query.order("created_at", { ascending: false });
        
        if (error) throw error;

        // Get usage counts
        const { data: usageCounts } = await supabase
          .from("resource_usage")
          .select("resource_id");

        const countMap: Record<string, number> = {};
        usageCounts?.forEach((u: any) => {
          countMap[u.resource_id] = (countMap[u.resource_id] || 0) + 1;
        });

        return (resources || []).map((r: any) => 
          transformResource({ ...r, usage_count: countMap[r.id] || 0 }, favouriteIds)
        );
      },
      enabled: searchTerm.length >= 2 || !!category || (tags && tags.length > 0),
    });
  };

  // Record resource usage
  const recordUsage = useMutation({
    mutationFn: async ({ resourceId, downloaded }: { resourceId: string; downloaded: boolean }) => {
      if (!user?.id) throw new Error("User not authenticated");
      
      const { error } = await supabase
        .from("resource_usage")
        .insert({
          resource_id: resourceId,
          user_id: user.id,
          downloaded,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });

  // Add favourite
  const addFavourite = useMutation({
    mutationFn: async (resourceId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      
      const { error } = await supabase
        .from("resource_favourites")
        .insert({
          resource_id: resourceId,
          user_id: user.id,
        });
      
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-favourite-ids"] });
      toast.success("Added to favourites");
    },
    onError: () => {
      toast.error("Failed to add to favourites");
    },
  });

  // Remove favourite
  const removeFavourite = useMutation({
    mutationFn: async (resourceId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      
      const { error } = await supabase
        .from("resource_favourites")
        .delete()
        .eq("resource_id", resourceId)
        .eq("user_id", user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-favourite-ids"] });
      toast.success("Removed from favourites");
    },
    onError: () => {
      toast.error("Failed to remove from favourites");
    },
  });

  // Toggle favourite
  const toggleFavourite = async (resourceId: string, isFavourite: boolean) => {
    if (isFavourite) {
      await removeFavourite.mutateAsync(resourceId);
    } else {
      await addFavourite.mutateAsync(resourceId);
    }
  };

  return {
    useAllResources,
    useResourcesByCategory,
    useRecentResources,
    useMostUsedResources,
    useFavouriteResources,
    useSearchResources,
    recordUsage,
    addFavourite,
    removeFavourite,
    toggleFavourite,
  };
};
