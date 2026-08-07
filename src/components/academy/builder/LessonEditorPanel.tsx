import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVideoLibraryPicker, useResourceLibraryPicker } from "@/hooks/academy/useAcademyBuilderPickers";
import { useCreateLesson, useUpdateLesson, type AcademyLesson } from "@/hooks/academy/useAcademyModulesLessons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Search, Play, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  moduleId: number;
  courseId: number;
  lesson: AcademyLesson | null;
}

type LessonType = "video" | "text" | "resource";

export default function LessonEditorPanel({ open, onClose, moduleId, courseId, lesson }: Props) {
  const isNew = !lesson;

  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [lessonType, setLessonType] = useState<LessonType>((lesson?.lesson_type as LessonType) ?? "video");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | "">(lesson?.estimated_minutes ?? "");
  const [isPreview, setIsPreview] = useState(lesson?.is_preview ?? false);
  const [isPublished, setIsPublished] = useState(lesson?.is_published ?? true);
  const [completionThreshold, setCompletionThreshold] = useState(80);
  const [videoId, setVideoId] = useState<string | null>(lesson?.video_id ?? null);
  const [resourceId, setResourceId] = useState<string | null>(lesson?.resource_id ?? null);
  const [contentMarkdown, setContentMarkdown] = useState(lesson?.content_markdown ?? "");
  const [videoSearch, setVideoSearch] = useState("");
  const [resourceSearch, setResourceSearch] = useState("");
  const [videoSource, setVideoSource] = useState<"link" | "library">(lesson?.video_id ? "library" : "link");
  const [vimeoUrl, setVimeoUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);


  const { data: videos = [], isLoading: videosLoading } = useVideoLibraryPicker(videoSearch || undefined);
  const { data: resources = [], isLoading: resourcesLoading } = useResourceLibraryPicker(resourceSearch || undefined);

  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();

  /** Resolve (or create) a training_videos row for a pasted Vimeo link. */
  const resolveVimeoVideoId = async (url: string, userId: string | null) => {
    const cleanUrl = url.trim();
    const { data: existing, error: lookupErr } = await supabase
      .from("training_videos")
      .select("id")
      .eq("vimeo_url", cleanUrl)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (existing?.id) return existing.id as string;

    // Best-effort metadata from Vimeo oEmbed (public/embeddable videos)
    let durationSeconds: number | null = null;
    let thumbnail: string | null = null;
    let oembedTitle: string | null = null;
    try {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(cleanUrl)}`);
      if (res.ok) {
        const j = await res.json();
        durationSeconds = typeof j.duration === "number" ? j.duration : null;
        thumbnail = j.thumbnail_url ?? null;
        oembedTitle = j.title ?? null;
      }
    } catch { /* metadata is optional */ }

    const folderName = "Course Lesson Videos";
    const { data: existingFolder, error: fLookupErr } = await supabase
      .from("training_folders")
      .select("id")
      .eq("folder_name", folderName)
      .maybeSingle();
    if (fLookupErr) throw fLookupErr;

    let folderId = existingFolder?.id as string | undefined;
    if (!folderId) {
      const { data: newFolder, error: fInsErr } = await supabase
        .from("training_folders")
        .insert({ folder_name: folderName } as any)
        .select("id")
        .single();
      if (fInsErr) throw fInsErr;
      folderId = newFolder.id as string;
    }

    const { data: newVideo, error: vInsErr } = await supabase
      .from("training_videos")
      .insert({
        folder_id: folderId,
        folder_name: folderName,
        video_name: (oembedTitle || title).trim(),
        vimeo_url: cleanUrl,
        duration_seconds: durationSeconds,
        thumbnail,
        added_by: userId,
      } as any)
      .select("id")
      .single();
    if (vInsErr) throw vInsErr;
    return newVideo.id as string;
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    setLinkError(null);
    const { data: { user } } = await supabase.auth.getUser();

    let resolvedVideoId = videoId;
    if (lessonType === "video" && videoSource === "link") {
      const url = vimeoUrl.trim();
      if (!url) {
        setLinkError("Paste a Vimeo link for this lesson, or switch to the video library.");
        return;
      }
      if (!/vimeo\.com\//i.test(url)) {
        setLinkError("That doesn't look like a Vimeo link (expected vimeo.com/...).");
        return;
      }
      try {
        resolvedVideoId = await resolveVimeoVideoId(url, user?.id ?? null);
      } catch (e: any) {
        setLinkError(e?.message || "Could not save that Vimeo link.");
        return;
      }
    }

    const payload: Record<string, any> = {
      title: title.trim(),
      description: description || null,
      lesson_type: lessonType,
      estimated_minutes: estimatedMinutes || null,
      is_preview: isPreview,
      is_published: isPublished,
      video_id: lessonType === "video" ? resolvedVideoId : null,
      resource_id: lessonType === "resource" ? resourceId : null,
      content_markdown: lessonType === "text" ? contentMarkdown : null,
      completion_threshold: lessonType === "video" ? completionThreshold : null,
    };


    if (isNew) {
      // Get next sort_order
      const { data: existing } = await supabase
        .from("academy_lessons")
        .select("sort_order")
        .eq("module_id", moduleId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;
      payload.sort_order = nextOrder;
      payload.created_by = user?.id;

      createLesson.mutate({ moduleId, courseId, data: payload }, {
        onSuccess: () => onClose(),
      });
    } else {
      updateLesson.mutate({ id: lesson!.id, courseId, data: payload }, {
        onSuccess: () => onClose(),
      });
    }
  };

  const saving = createLesson.isPending || updateLesson.isPending;

  const typeOptions: { value: LessonType; label: string; icon: React.ReactNode }[] = [
    { value: "video", label: "Video", icon: <Play className="h-4 w-4" /> },
    { value: "text", label: "Text", icon: <FileText className="h-4 w-4" /> },
    { value: "resource", label: "Resource", icon: <Paperclip className="h-4 w-4" /> },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isNew ? "Add Lesson" : "Edit Lesson"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {/* Lesson Type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Lesson Type</label>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLessonType(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                    lessonType === opt.value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Estimated Minutes */}
          {(() => {
            const isVideoLesson = lessonType === "video";
            const selectedVideo = isVideoLesson && videoId ? (videos as any[]).find((v) => v.id === videoId) : null;
            const autoMin = selectedVideo?.duration_seconds != null ? Math.ceil(selectedVideo.duration_seconds / 60) : null;
            const readOnly = isVideoLesson && !!videoId;
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Estimated Minutes</label>
                  {isVideoLesson && videoId && (
                    <span className="text-[11px] text-muted-foreground">
                      {autoMin != null ? `🎬 ~${autoMin} min from video` : "🎬 Duration unknown — run backfill"}
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  value={readOnly && autoMin != null ? autoMin : (estimatedMinutes as number | "")}
                  onChange={(e) => setEstimatedMinutes(e.target.value ? parseInt(e.target.value) : "")}
                  readOnly={readOnly}
                  className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                />
                {readOnly && (
                  <p className="text-[11px] text-muted-foreground">Auto-set from video duration on save.</p>
                )}
              </div>
            );
          })()}

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Free Preview</span>
            <Switch checked={isPreview} onCheckedChange={setIsPreview} />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Published</span>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
          </div>

          {/* Video Picker */}
          {lessonType === "video" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Video</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search videos..."
                  value={videoSearch}
                  onChange={(e) => setVideoSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                {videosLoading ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : videos.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No videos found</p>
                ) : videos.map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => setVideoId(v.id)}
                    className={`w-full text-left p-3 text-sm flex items-center gap-3 hover:bg-muted/50 transition-colors ${videoId === v.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    {v.thumbnail && <img src={v.thumbnail} className="h-8 w-12 rounded object-cover" alt="" />}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">{v.video_name}</p>
                      {v.folder_name && <p className="text-xs text-muted-foreground">{v.folder_name}</p>}
                    </div>
                    {videoId === v.id && <span className="text-primary text-xs font-medium">Selected</span>}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Completion Threshold: {completionThreshold}%</label>
                <Slider
                  value={[completionThreshold]}
                  onValueChange={([v]) => setCompletionThreshold(v)}
                  min={50}
                  max={100}
                  step={5}
                />
              </div>
            </div>
          )}

          {/* Text Editor */}
          {lessonType === "text" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Content (Markdown)</label>
              <Textarea
                value={contentMarkdown}
                onChange={(e) => setContentMarkdown(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder="# Heading&#10;&#10;Write your content here..."
              />
              {contentMarkdown && (
                <div className="border rounded-lg p-4 prose prose-sm max-w-none text-foreground" style={{ borderColor: "hsl(var(--border))" }}>
                  <p className="text-xs text-muted-foreground mb-2">Preview</p>
                  <div dangerouslySetInnerHTML={{ __html: contentMarkdown.replace(/\n/g, "<br/>") }} />
                </div>
              )}
            </div>
          )}

          {/* Resource Picker */}
          {lessonType === "resource" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Resource</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search resources..."
                  value={resourceSearch}
                  onChange={(e) => setResourceSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                {resourcesLoading ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : resources.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No resources found</p>
                ) : resources.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setResourceId(r.id)}
                    className={`w-full text-left p-3 text-sm flex items-center gap-3 hover:bg-muted/50 transition-colors ${resourceId === r.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-foreground">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.category} {r.version ? `· v${r.version}` : ""}</p>
                    </div>
                    {resourceId === r.id && <span className="text-primary text-xs font-medium">Selected</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Save */}
          <div className="flex gap-3 pt-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex-1 text-white hover:opacity-90"
              style={{ backgroundColor: "#23c0dd" }}
            >
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : isNew ? "Create Lesson" : "Save Changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
