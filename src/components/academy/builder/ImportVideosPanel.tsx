import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Film, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface TrainingVideo {
  id: string;
  video_name: string;
  vimeo_url: string | null;
  folder_name: string | null;
  thumbnail: string | null;
  duration_seconds: number | null;
}

interface ImportVideosPanelProps {
  open: boolean;
  onClose: () => void;
  moduleId: number;
  courseId: number;
  existingVideoIds: string[];
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ImportVideosPanel({ open, onClose, moduleId, courseId, existingVideoIds }: ImportVideosPanelProps) {
  const qc = useQueryClient();
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("__all__");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // Fetch all videos once on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    setSearch("");
    setFolderFilter("__all__");

    (async () => {
      const { data, error } = await supabase
        .from("training_videos")
        .select("id, video_name, vimeo_url, folder_name, thumbnail, duration_seconds")
        .order("folder_name")
        .order("video_name");
      if (error) {
        console.error(error);
        toast.error("Failed to load video library");
      }
      setVideos((data as TrainingVideo[]) ?? []);
      setLoading(false);
    })();
  }, [open]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    videos.forEach(v => { if (v.folder_name) set.add(v.folder_name); });
    return Array.from(set).sort();
  }, [videos]);

  const filtered = useMemo(() => {
    let list = videos;
    if (folderFilter !== "__all__") {
      list = list.filter(v => v.folder_name === folderFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v => v.video_name?.toLowerCase().includes(q));
    }
    return list;
  }, [videos, folderFilter, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map(v => v.id)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get max sort_order in this module
      const { data: existingLessons } = await supabase
        .from("academy_lessons")
        .select("sort_order")
        .eq("module_id", moduleId)
        .order("sort_order", { ascending: false })
        .limit(1);

      const maxSort = existingLessons?.[0]?.sort_order ?? 0;

      const selectedVideos = videos.filter(v => selected.has(v.id));
      const rows = selectedVideos.map((v, i) => ({
        module_id: moduleId,
        course_id: courseId,
        title: v.video_name,
        lesson_type: "video",
        video_id: v.id,
        estimated_minutes: v.duration_seconds != null ? Math.round(v.duration_seconds / 60) : null,
        sort_order: maxSort + i + 1,
        is_published: true,
        created_by: user?.id,
      }));

      const { error } = await supabase.from("academy_lessons").insert(rows as any);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["academy-modules-lessons"] });
      toast.success(`${rows.length} lessons imported successfully`);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to import videos");
    } finally {
      setImporting(false);
    }
  };

  const existingSet = useMemo(() => new Set(existingVideoIds), [existingVideoIds]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="text-base">Import from Video Library</SheetTitle>
        </SheetHeader>

        {/* Search & Filter */}
        <div className="px-6 py-3 border-b space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search videos..."
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={folderFilter} onValueChange={setFolderFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Folders</SelectItem>
              {folders.map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Select All / Deselect All */}
        {!loading && filtered.length > 0 && (
          <div className="px-6 py-2 border-b flex items-center gap-3 text-xs shrink-0">
            <button onClick={selectAll} className="text-primary hover:underline">Select All ({filtered.length})</button>
            <span className="text-muted-foreground">·</span>
            <button onClick={deselectAll} className="text-muted-foreground hover:underline">Deselect All</button>
          </div>
        )}

        {/* Video List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-2 space-y-1">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No videos found</p>
            ) : (
              filtered.map(v => {
                const isAlready = existingSet.has(v.id);
                const isChecked = selected.has(v.id);
                return (
                  <label
                    key={v.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${isChecked ? "bg-primary/5" : ""}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleSelect(v.id)}
                    />
                    {v.thumbnail ? (
                      <img src={v.thumbnail} alt="" className="h-9 w-14 rounded object-cover shrink-0 bg-muted" />
                    ) : (
                      <div className="h-9 w-14 rounded bg-muted flex items-center justify-center shrink-0">
                        <Film className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.video_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {v.folder_name && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{v.folder_name}</Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{formatDuration(v.duration_seconds)}</span>
                        {isAlready && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Already added</span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center justify-between shrink-0 bg-background">
          <span className="text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size} video${selected.size !== 1 ? "s" : ""} selected` : "No videos selected"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#7130A0" }}
            >
              {importing ? "Importing…" : "Import Selected"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
