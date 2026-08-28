import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useModulesWithLessons, useCreateModule, useUpdateModule, useDeleteModule, useReorderModules, useCreateLesson, useUpdateLesson, useDeleteLesson, useReorderLessons, type AcademyModule, type AcademyLesson } from "@/hooks/academy/useAcademyModulesLessons";
import { useUpdateCourse, usePublishCourse, useDeleteCourse } from "@/hooks/academy/useAdminAcademyCourses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, GripVertical, Trash2, ChevronDown, ChevronRight, Edit2, Play, FileText, BookOpen, Paperclip, Sparkles, Loader2, Upload, Save } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import LessonEditorPanel from "@/components/academy/builder/LessonEditorPanel";
import ImportVideosPanel from "@/components/academy/builder/ImportVideosPanel";
import ShowcaseImportPanel from "@/components/academy/builder/ShowcaseImportPanel";
import AssessmentEditorTab from "@/components/academy/builder/AssessmentEditorTab";
import PackageRulesTab from "@/components/academy/builder/PackageRulesTab";
import AiAssistPanel, { type AiAssistResult } from "@/components/academy/builder/AiAssistPanel";
import PathwayMultiSelect from "@/components/academy/PathwayMultiSelect";
import CourseResourcesSection from "@/components/academy/builder/CourseResourcesSection";
import TagChipInput from "@/components/academy/TagChipInput";
import { fetchDistinctAcademyTags } from "@/lib/academy/queries";
import { todayLocalISODate } from "@/lib/academy/aiAssist";
import { canManageAcademyResources } from "@/lib/academy/courseResources";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { cn } from "@/lib/utils";
import WebinarSeriesSubtitle from "@/components/academy/WebinarSeriesSubtitle";
import ThumbnailPositionEditor from "@/components/academy/builder/ThumbnailPositionEditor";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const lessonTypeIcon = (type: string | null) => {
  if (type === "video") return <Play className="h-3.5 w-3.5" />;
  if (type === "resource") return <Paperclip className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
};

const lessonTypeEmoji = (type: string | null) => {
  if (type === "video") return "🎬";
  if (type === "resource") return "📎";
  return "📄";
};

function SortableLessonRow({
  lesson,
  canEdit,
  canPublishOrDelete,
  onEdit,
  onDelete,
  onTogglePublished,
}: {
  lesson: AcademyLesson;
  canEdit: boolean;
  canPublishOrDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublished: (published: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2 px-3 rounded hover:bg-muted/50 transition-colors text-sm group"
    >
      <button
        type="button"
        className="p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Reorder ${lesson.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <span className="text-sm">{lessonTypeEmoji(lesson.lesson_type)}</span>
      <span className="text-foreground flex-1 truncate">{lesson.title}</span>

      {lesson.is_preview && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Preview</Badge>
      )}

      {canPublishOrDelete && (
        <Switch
          checked={lesson.is_published !== false}
          onCheckedChange={onTogglePublished}
        />
      )}

      {canEdit && (
        <>
          <button onClick={onEdit} className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </>
      )}
    </div>
  );
}

function SortableModuleCard({
  mod,
  expanded,
  isEditing,
  editModuleTitle,
  canEdit,
  canPublishOrDelete,
  lessonSensors,
  onToggleExpand,
  onEditTitleChange,
  onEditTitleSave,
  onStartEditTitle,
  onTogglePublished,
  onDelete,
  onLessonDragEnd,
  onOpenLessonEditor,
  onDeleteLesson,
  onToggleLessonPublished,
  onImportVideos,
}: {
  mod: AcademyModule;
  expanded: boolean;
  isEditing: boolean;
  editModuleTitle: string;
  canEdit: boolean;
  canPublishOrDelete: boolean;
  lessonSensors: ReturnType<typeof useSensors>;
  onToggleExpand: () => void;
  onEditTitleChange: (value: string) => void;
  onEditTitleSave: () => void;
  onStartEditTitle: () => void;
  onTogglePublished: (published: boolean) => void;
  onDelete: () => void;
  onLessonDragEnd: (event: DragEndEvent) => void;
  onOpenLessonEditor: (lesson?: AcademyLesson | null) => void;
  onDeleteLesson: (lesson: AcademyLesson) => void;
  onToggleLessonPublished: (lesson: AcademyLesson, published: boolean) => void;
  onImportVideos: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mod.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: "hsl(var(--border))" }}
      className={cn("rounded-lg border", isDragging && "z-10")}
    >
      {/* Module header */}
      <div className="flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors">
        <button
          type="button"
          className="p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label={`Reorder module ${mod.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button onClick={onToggleExpand} className="p-1">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>

        {isEditing ? (
          <Input
            value={editModuleTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onBlur={onEditTitleSave}
            onKeyDown={(e) => e.key === "Enter" && onEditTitleSave()}
            className="h-8 text-sm flex-1"
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-semibold text-foreground flex-1 cursor-pointer"
            onDoubleClick={onStartEditTitle}
          >
            {mod.title}
          </span>
        )}

        <span className="text-xs text-muted-foreground">{mod.lessons.length} lessons</span>

        <div className="flex items-center gap-1">
          {canPublishOrDelete && (
            <Switch
              checked={mod.is_published !== false}
              onCheckedChange={onTogglePublished}
            />
          )}
          {canEdit && (
            <>
              <button onClick={onStartEditTitle} className="p-1 hover:bg-muted rounded">
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 hover:bg-destructive/10 rounded"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lessons — separate DndContext so lesson IDs cannot collide with module IDs */}
      {expanded && (
        <div className="border-t px-3 pb-3 space-y-1" style={{ borderColor: "hsl(var(--border))" }}>
          <DndContext
            sensors={lessonSensors}
            collisionDetection={closestCenter}
            onDragEnd={onLessonDragEnd}
          >
            <SortableContext
              items={mod.lessons.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {mod.lessons.map((lesson) => (
                <SortableLessonRow
                  key={lesson.id}
                  lesson={lesson}
                  canEdit={canEdit}
                  canPublishOrDelete={canPublishOrDelete}
                  onEdit={() => onOpenLessonEditor(lesson)}
                  onDelete={() => onDeleteLesson(lesson)}
                  onTogglePublished={(v) => onToggleLessonPublished(lesson, v)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {canEdit && (
            <div className="flex gap-1 mt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenLessonEditor(null)}
                className="flex-1 text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Lesson
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onImportVideos}
                className="flex-1 text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5 mr-1" /> Import Videos
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AcademyBuilderCourse() {
  const { courseId: courseIdParam } = useParams<{ courseId: string }>();
  const courseId = courseIdParam ? parseInt(courseIdParam, 10) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── RBAC gates ──
  const canEdit = usePermission('academy.builder.edit');
  const canPublishOrDelete = usePermission('academy.builder.publish');
  // Resources writes are gated by can_manage_academy_resources() (SA/TL/TM),
  // which is narrower than academy.builder.edit (also grants BGT).
  const { profile, isSuperAdmin } = useAuth();
  const canManageResources = canManageAcademyResources(profile?.unicorn_role, isSuperAdmin());

  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<{ lesson: AcademyLesson | null; moduleId: number; courseId: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "module" | "lesson"; id: number; name: string; hasChildren?: boolean } | null>(null);
  const [importVideosModuleId, setImportVideosModuleId] = useState<number | null>(null);

  // Fetch course
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["academy-builder-course", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("*")
        .eq("id", courseId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: facilitators = [] } = useQuery({
    queryKey: ["academy-builder-facilitators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name, archived, disabled")
        .eq("is_vivacity_internal", true)
        .eq("is_system_account", false)
        .order("full_name");
      if (error) throw error;
      // Historical drafts may intentionally retain an inactive facilitator.
      // Keep all internal users selectable and make the state visible below.
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: historicalFacilitators = [] } = useQuery({
    queryKey: ["academy-historical-facilitators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_historical_facilitators" as any).select("id, display_name").eq("is_selectable", true).order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-calculated lesson minutes total (from v_academy_course_total_minutes)
  const { data: courseTotals } = useQuery({
    queryKey: ["academy-course-total-minutes", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_academy_course_total_minutes")
        .select("total_lesson_minutes, lesson_count, video_lesson_count")
        .eq("course_id", courseId!)
        .maybeSingle();
      if (error) throw error;
      return data as { total_lesson_minutes: number | null; lesson_count: number | null; video_lesson_count: number | null } | null;
    },
  });

  // Modules & lessons
  const { data: modules = [], isLoading: modulesLoading } = useModulesWithLessons(courseId, { admin: true });

  // Mutations
  const updateCourse = useUpdateCourse();
  const publishCourse = usePublishCourse();
  const archiveCourse = useDeleteCourse();
  const createModule = useCreateModule();
  const updateModule = useUpdateModule();
  const deleteModule = useDeleteModule();
  const reorderModules = useReorderModules();
  const createLesson = useCreateLesson();
  const updateLessonMut = useUpdateLesson();
  const deleteLesson = useDeleteLesson();
  const reorderLessons = useReorderLessons();

  // ===== Course Settings controlled form state =====
  type SettingsForm = {
    title: string;
    slug: string;
    short_description: string;
    description: string;
    target_audience: string[];
    difficulty_level: string;
    estimated_minutes: number | null;
    tags: string[];
    is_free: boolean;
    certificate_enabled: boolean;
    pass_score: number;
    facilitator_id: string | null;
    facilitator_display_name: string | null;
    delivery_date: string | null;
    thumbnail_url: string | null;
    thumbnail_position: string;
    thumbnail_fit: "cover" | "contain";
    thumbnail_zoom: number;
    banner_thumbnail_url: string | null;
    banner_thumbnail_position: string;
    banner_thumbnail_fit: "cover" | "contain";
    banner_thumbnail_zoom: number;
    webinar_series: string | null;
    transcript: string;
  };

  const buildForm = useCallback((c: any): SettingsForm => {
    const neverPublished = !c?.published_at;
    const existingDelivery = c?.delivery_date ? String(c.delivery_date).slice(0, 10) : null;
    return {
      title: c?.title ?? "",
      slug: c?.slug ?? "",
      short_description: c?.short_description ?? "",
      description: c?.description ?? "",
      target_audience: Array.isArray(c?.target_audience) ? c.target_audience : [],
      difficulty_level: c?.difficulty_level ?? "beginner",
      estimated_minutes: c?.estimated_minutes ?? null,
      tags: Array.isArray(c?.tags) ? c.tags : [],
      is_free: c?.is_free ?? false,
      certificate_enabled: c?.certificate_enabled ?? false,
      pass_score: c?.pass_score ?? 80,
      facilitator_id: c?.facilitator_id ?? null,
      facilitator_display_name: (c as any)?.facilitator_display_name ?? null,
      // Default delivery date to today only for never-published courses still missing one
      delivery_date: existingDelivery ?? (neverPublished ? todayLocalISODate() : null),
      thumbnail_url: c?.thumbnail_url ?? null,
      thumbnail_position: c?.thumbnail_position ?? "50% 50%",
      thumbnail_fit: c?.thumbnail_fit === "contain" ? "contain" : "cover",
      thumbnail_zoom: Number(c?.thumbnail_zoom) >= 1 ? Number(c.thumbnail_zoom) : 1,
      banner_thumbnail_url: c?.banner_thumbnail_url ?? null,
      banner_thumbnail_position: c?.banner_thumbnail_position ?? "50% 50%",
      banner_thumbnail_fit: c?.banner_thumbnail_fit === "contain" ? "contain" : "cover",
      banner_thumbnail_zoom: Number(c?.banner_thumbnail_zoom) >= 1 ? Number(c.banner_thumbnail_zoom) : 1,
      webinar_series: c?.webinar_series ?? null,
      transcript: c?.transcript ?? "",
    };
  }, []);

  const [formState, setFormState] = useState<SettingsForm>(() => buildForm(course));
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);
  const [isBannerThumbnailUploading, setIsBannerThumbnailUploading] = useState(false);
  const baselineRef = useRef<SettingsForm>(formState);

  useEffect(() => {
    if (course) {
      const next = buildForm(course);
      setFormState(next);
      baselineRef.current = next;
    }
  }, [course, buildForm]);

  const isDirty = useMemo(
    () => JSON.stringify(formState) !== JSON.stringify(baselineRef.current),
    [formState]
  );

  // Distinct tag suggestions for the chip input
  const { data: distinctTags = [] } = useQuery({
    queryKey: ["academy-distinct-tags"],
    queryFn: fetchDistinctAcademyTags,
    staleTime: 5 * 60 * 1000,
  });

  // Save mutation — single explicit Save Changes button
  const saveCourseSettings = useMutation({
    mutationFn: async (payload: SettingsForm) => {
      if (!courseId) throw new Error("Missing courseId");
      const { data, error } = await supabase
        .from("academy_courses")
        .update(payload as any)
        .eq("id", courseId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Course settings saved");
      qc.invalidateQueries({ queryKey: ["academy-builder-course", courseId] });
      qc.invalidateQueries({ queryKey: ["academy-courses-admin"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save course settings"),
  });

  // Require facilitator + delivery only for never-published courses (genuinely new drafts).
  // Previously published courses missing these fields can still Save without a forced backfill.
  const requiresFacilitatorFields = !course?.published_at;

  const handleSaveSettings = () => {
    if (!isDirty || saveCourseSettings.isPending) return;
    if (requiresFacilitatorFields) {
      if (!formState.facilitator_id && !formState.facilitator_display_name) {
        toast.error("Select a facilitator before saving");
        return;
      }
      if (!formState.delivery_date) {
        toast.error("Set a date of delivery before saving");
        return;
      }
    }
    saveCourseSettings.mutate(formState);
  };

  const handleAiAssistGenerated = (result: AiAssistResult) => {
    setFormState((p) => ({
      ...p,
      title: result.title || p.title,
      short_description: result.short_description,
      description: result.description,
      target_audience: result.target_audience,
      difficulty_level: result.difficulty_level,
      tags: result.tags,
      thumbnail_url: result.thumbnail_url,
      webinar_series: result.webinar_series,
      transcript: result.transcript || p.transcript,
    }));
  };

  /** Validates and uploads a thumbnail image to Storage, returning its public URL (or null on failure). */
  const uploadThumbnailFile = async (file: File, pathPrefix: string): Promise<string | null> => {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      toast.error("Choose a JPG, PNG, or WebP image");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Thumbnail images must be 5 MB or smaller");
      return null;
    }
    if (!courseId) return null;

    try {
      const extension = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `courses/${courseId}/${pathPrefix}${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("academy-thumbnails")
        .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("academy-thumbnails").getPublicUrl(path);
      return data.publicUrl;
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload thumbnail");
      return null;
    }
  };

  const handleThumbnailUpload = async (file: File) => {
    setIsThumbnailUploading(true);
    try {
      const publicUrl = await uploadThumbnailFile(file, "");
      if (!publicUrl) return;
      setFormState((p) => ({ ...p, thumbnail_url: publicUrl }));
      toast.success("Custom thumbnail added — click Save Changes to apply it");
    } finally {
      setIsThumbnailUploading(false);
    }
  };

  const handleBannerThumbnailUpload = async (file: File) => {
    setIsBannerThumbnailUploading(true);
    try {
      const publicUrl = await uploadThumbnailFile(file, "banner-");
      if (!publicUrl) return;
      setFormState((p) => ({ ...p, banner_thumbnail_url: publicUrl }));
      toast.success("Custom banner image added — click Save Changes to apply it");
    } finally {
      setIsBannerThumbnailUploading(false);
    }
  };

  const handleRemoveBannerThumbnail = () => {
    setFormState((p) => ({
      ...p,
      banner_thumbnail_url: null,
      banner_thumbnail_position: "50% 50%",
      banner_thumbnail_fit: "cover",
      banner_thumbnail_zoom: 1,
    }));
  };

  // Note: in-app navigation guard via useBlocker requires a data router; this app uses BrowserRouter.
  // The beforeunload handler below covers tab close / reload.

  // Unsaved-changes guard (browser tab close / reload)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleAddModule = () => {
    if (!courseId) return;
    const nextOrder = modules.length > 0 ? Math.max(...modules.map(m => m.sort_order)) + 1 : 1;
    createModule.mutate({ courseId, data: { title: "New Module", sort_order: nextOrder } });
  };

  const handleModuleTitleSave = (modId: number) => {
    if (!courseId || !editModuleTitle.trim()) return;
    updateModule.mutate({ id: modId, courseId, data: { title: editModuleTitle.trim() } });
    setEditingModuleId(null);
  };

  const handlePublish = () => {
    if (!courseId) return;
    if ((formState.target_audience ?? []).length === 0) {
      toast.error("Select at least one pathway before publishing");
      return;
    }
    const hasPublishedLessons = modules.some(m => m.lessons.some(l => l.is_published));
    if (!hasPublishedLessons) {
      toast.error("Cannot publish: no published lessons");
      return;
    }
    publishCourse.mutate(courseId);
  };

  const handleBackToDraft = () => {
    if (!courseId) return;
    updateCourse.mutate({ id: courseId, data: { status: "draft" } as any });
  };

  const toggleModuleExpand = (id: number) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openLessonEditor = (moduleId: number, lesson: AcademyLesson | null = null) => {
    setEditingLesson({ lesson, moduleId, courseId: courseId! });
    setLessonEditorOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget || !courseId) return;
    if (deleteTarget.type === "module") {
      deleteModule.mutate({ id: deleteTarget.id, courseId });
    } else {
      deleteLesson.mutate({ id: deleteTarget.id, courseId });
    }
    setDeleteTarget(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleModuleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!courseId) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = modules.findIndex((m) => m.id === active.id);
      const newIndex = modules.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const orderedIds = arrayMove(modules, oldIndex, newIndex).map((m) => m.id);
      reorderModules.mutate({ courseId, orderedIds });
    },
    [courseId, modules, reorderModules]
  );

  const handleLessonDragEnd = useCallback(
    (mod: AcademyModule) => (event: DragEndEvent) => {
      if (!courseId) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = mod.lessons.findIndex((l) => l.id === active.id);
      const newIndex = mod.lessons.findIndex((l) => l.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const orderedIds = arrayMove(mod.lessons, oldIndex, newIndex).map((l) => l.id);
      reorderLessons.mutate({ moduleId: mod.id, courseId, orderedIds });
    },
    [courseId, reorderLessons]
  );

  if (courseLoading) {
    return (
      <DashboardLayout>
      <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-[30%_1fr] gap-6">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
      </DashboardLayout>
    );
  }

  if (!course) {
    return (
      <DashboardLayout>
      <div className="p-6 text-center py-16">
        <p className="font-medium text-foreground">Course not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/superadmin/academy/builder")}>Back to Library</Button>
      </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/superadmin/academy/builder")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Library
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{course.title}</h1>
          <WebinarSeriesSubtitle series={formState.webinar_series} />
        </div>
        <Badge className={`${statusColors[course.status ?? "draft"]} text-xs`}>{course.status ?? "draft"}</Badge>
      </div>

      <Tabs defaultValue="structure" className="space-y-4">
        <TabsList>
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="assessment" className="flex items-center gap-1">
            <span style={{ color: "#ed1878" }}>●</span> Assessment
          </TabsTrigger>
          <TabsTrigger value="packages">Package Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="structure" className="space-y-6">
          {canEdit && (
            <AiAssistPanel
              currentTitle={formState.title}
              webinarSeries={formState.webinar_series}
              onSeriesChange={(series) => setFormState((p) => ({ ...p, webinar_series: series }))}
              onGenerated={handleAiAssistGenerated}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6">
            {/* Left Panel — Course Settings */}
            <div className="space-y-4 p-5 rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground" style={{ color: "#7130A0" }}>Course Settings</h2>
                <div className="flex items-center gap-2">
                  {course.updated_at && !isDirty && (
                    <span className="text-[11px] text-muted-foreground">
                      Saved {formatDistanceToNow(new Date(course.updated_at), { addSuffix: true })}
                    </span>
                  )}
                  {isDirty && (
                    <span className="text-[11px] text-amber-600">Unsaved</span>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      onClick={handleSaveSettings}
                      disabled={!isDirty || saveCourseSettings.isPending}
                      className="gap-1"
                    >
                      {saveCourseSettings.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Changes
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_140px] gap-3">
                <Field label="Title">
                  <Input value={formState.title} onChange={(e) => setFormState((p) => ({ ...p, title: e.target.value }))} />
                </Field>
                <Field label="Slug">
                  <Input value={formState.slug} onChange={(e) => setFormState((p) => ({ ...p, slug: e.target.value }))} className="font-mono text-xs" />
                </Field>
              </div>

              <ThumbnailPositionEditor
                label="Course card image"
                shape="square"
                imageUrl={formState.thumbnail_url}
                value={formState.thumbnail_position}
                onChange={(thumbnail_position) => setFormState((p) => ({ ...p, thumbnail_position }))}
                fit={formState.thumbnail_fit}
                onFitChange={(thumbnail_fit) => setFormState((p) => ({ ...p, thumbnail_fit }))}
                zoom={formState.thumbnail_zoom}
                onZoomChange={(thumbnail_zoom) => setFormState((p) => ({ ...p, thumbnail_zoom }))}
                onUpload={handleThumbnailUpload}
                isUploading={isThumbnailUploading}
              />

              {formState.banner_thumbnail_url ? (
                <ThumbnailPositionEditor
                  label="Course page banner image"
                  shape="video"
                  imageUrl={formState.banner_thumbnail_url}
                  value={formState.banner_thumbnail_position}
                  onChange={(banner_thumbnail_position) => setFormState((p) => ({ ...p, banner_thumbnail_position }))}
                  fit={formState.banner_thumbnail_fit}
                  onFitChange={(banner_thumbnail_fit) => setFormState((p) => ({ ...p, banner_thumbnail_fit }))}
                  zoom={formState.banner_thumbnail_zoom}
                  onZoomChange={(banner_thumbnail_zoom) => setFormState((p) => ({ ...p, banner_thumbnail_zoom }))}
                  onUpload={handleBannerThumbnailUpload}
                  isUploading={isBannerThumbnailUploading}
                  onRemove={handleRemoveBannerThumbnail}
                  removeLabel="Use course card image instead"
                />
              ) : (
                <div className="space-y-3 rounded-lg border p-3">
                  <div>
                    <Label>Course page banner image</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      No separate banner image set — the course page banner reuses the course card image above, centred. Upload a different image to frame the banner independently.
                    </p>
                  </div>
                  <div className="aspect-video max-w-[320px] overflow-hidden rounded-lg bg-muted border">
                    {formState.thumbnail_url ? (
                      <img src={formState.thumbnail_url} alt="Course page banner preview" className="h-full w-full object-cover" style={{ objectPosition: "50% 50%" }} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center p-4">Generate or add a course card image to preview the banner.</div>
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                    {isBannerThumbnailUploading ? "Uploading…" : "Upload custom banner image"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={isBannerThumbnailUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void handleBannerThumbnailUpload(file);
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label={requiresFacilitatorFields ? "Facilitator *" : "Facilitator"}>
                  <Select
                    value={formState.facilitator_id ? `staff:${formState.facilitator_id}` : formState.facilitator_display_name ? `historical:${formState.facilitator_display_name}` : undefined}
                    onValueChange={(v) => setFormState((p) => v.startsWith("staff:") ? ({ ...p, facilitator_id: v.slice(6), facilitator_display_name: null }) : ({ ...p, facilitator_id: null, facilitator_display_name: v.slice(11) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a facilitator" />
                    </SelectTrigger>
                    <SelectContent>
                      {facilitators.map((u) => (
                          <SelectItem key={u.user_uuid} value={`staff:${u.user_uuid}`}>
                          {(u.full_name?.trim() || u.user_uuid) + (u.archived || u.disabled ? " (inactive)" : "")}
                        </SelectItem>
                      ))}
                      {historicalFacilitators.map((f: any) => (
                        <SelectItem key={f.id} value={`historical:${f.display_name}`}>{f.display_name} (former/external)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!requiresFacilitatorFields && !formState.facilitator_id && !formState.facilitator_display_name && (
                    <p className="text-[11px] text-muted-foreground mt-1">Not set</p>
                  )}
                </Field>

                <Field label={requiresFacilitatorFields ? "Date of delivery *" : "Date of delivery"}>
                  <Input
                    type="date"
                    value={formState.delivery_date ?? ""}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        delivery_date: e.target.value || null,
                      }))
                    }
                  />
                  {!requiresFacilitatorFields && !formState.delivery_date && (
                    <p className="text-[11px] text-muted-foreground mt-1">Not set</p>
                  )}
                </Field>
              </div>

              <Field label="Short Description">
                <Textarea value={formState.short_description} onChange={(e) => setFormState((p) => ({ ...p, short_description: e.target.value }))} rows={2} />
              </Field>

              <Field label="Description">
                <Textarea value={formState.description} onChange={(e) => setFormState((p) => ({ ...p, description: e.target.value }))} rows={4} />
              </Field>

              <Field label="Pathways">
                <PathwayMultiSelect
                  value={formState.target_audience}
                  onChange={(v) => setFormState((p) => ({ ...p, target_audience: v }))}
                />
              </Field>

              {courseId != null && (
                <CourseResourcesSection courseId={courseId} canManage={canManageResources} />
              )}

              <div className="grid grid-cols-2 gap-3">
              <Field label="Difficulty Level">
                <Select value={formState.difficulty_level} onValueChange={(v) => setFormState((p) => ({ ...p, difficulty_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Estimated Minutes">
                <Input
                  type="number"
                  value={formState.estimated_minutes ?? ""}
                  onChange={(e) => setFormState((p) => ({ ...p, estimated_minutes: e.target.value ? parseInt(e.target.value) : null }))}
                />
                {(() => {
                  const total = courseTotals?.total_lesson_minutes ?? 0;
                  const lessonCount = courseTotals?.lesson_count ?? 0;
                  const videoLessonCount = courseTotals?.video_lesson_count ?? 0;
                  if (lessonCount === 0) {
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Add modules and lessons to see an auto-calculated total.
                      </p>
                    );
                  }
                  if (total === 0) {
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Lessons have no durations yet. Run "Backfill Video Durations" from the Academy Builder library, or set lesson minutes manually.
                      </p>
                    );
                  }
                  const matches = formState.estimated_minutes === total;
                  return (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Auto-calculated from lessons: <span className="font-medium text-foreground">{total} min</span> ({lessonCount} lesson{lessonCount === 1 ? "" : "s"}, {videoLessonCount} with video).
                      {!matches && (
                        <>
                          {" "}
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium"
                            onClick={() => setFormState((p) => ({ ...p, estimated_minutes: total }))}
                          >
                            Use this value
                          </button>
                        </>
                      )}
                    </p>
                  );
                })()}
              </Field>
              </div>

              <Field label="Sub-categories (Tags)">
                <TagChipInput
                  value={formState.tags}
                  onChange={(v) => setFormState((p) => ({ ...p, tags: v }))}
                  suggestions={distinctTags}
                />
              </Field>

              <AiDescriptionGenerator
                title={formState.title}
                targetAudience={formState.target_audience}
                difficultyLevel={formState.difficulty_level}
                tags={formState.tags}
                onGenerated={(short_desc, desc) =>
                  setFormState((p) => ({ ...p, short_description: short_desc, description: desc }))
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "hsl(var(--border))" }}>
                  <span className="text-sm text-foreground">Free Course</span>
                  <Switch checked={formState.is_free} onCheckedChange={(v) => setFormState((p) => ({ ...p, is_free: v }))} />
                </div>

                <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "hsl(var(--border))" }}>
                  <span className="text-sm text-foreground">Certificate Enabled</span>
                  <Switch checked={formState.certificate_enabled} onCheckedChange={(v) => setFormState((p) => ({ ...p, certificate_enabled: v }))} />
                </div>
              </div>

              {formState.certificate_enabled && (
                <Field label="Pass Score (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={formState.pass_score}
                    onChange={(e) => setFormState((p) => ({ ...p, pass_score: parseInt(e.target.value) || 80 }))}
                  />
                </Field>
              )}
            </div>

            {/* Right Panel — Structure */}
            <div className="space-y-4">
              {/* Status Bar */}
              <div className="flex items-center gap-3 p-4 rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
                <Badge className={`${statusColors[course.status ?? "draft"]} text-xs`}>{course.status}</Badge>
                <div className="flex-1" />
                {course.status === "draft" && canPublishOrDelete && (
                  <Button size="sm" onClick={handlePublish} className="text-white hover:opacity-90" style={{ backgroundColor: "#22c55e" }}>Publish Course</Button>
                )}
                {course.status === "published" && canPublishOrDelete && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleBackToDraft}>Back to Draft</Button>
                    <Button size="sm" variant="outline" onClick={() => courseId && archiveCourse.mutate(courseId)} className="text-amber-600 border-amber-300 hover:bg-amber-50">Archive</Button>
                  </>
                )}
                {course.status === "archived" && canPublishOrDelete && (
                  <Button size="sm" variant="outline" onClick={handleBackToDraft}>Restore to Draft</Button>
                )}
              </div>

              {canEdit && courseId != null && (
                <ShowcaseImportPanel courseId={courseId} />
              )}

              {/* Modules */}
              {modulesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleModuleDragEnd}
                  >
                    <SortableContext
                      items={modules.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {modules.map((mod) => (
                        <SortableModuleCard
                          key={mod.id}
                          mod={mod}
                          expanded={expandedModules.has(mod.id)}
                          isEditing={editingModuleId === mod.id}
                          editModuleTitle={editModuleTitle}
                          canEdit={canEdit}
                          canPublishOrDelete={canPublishOrDelete}
                          lessonSensors={sensors}
                          onToggleExpand={() => toggleModuleExpand(mod.id)}
                          onEditTitleChange={setEditModuleTitle}
                          onEditTitleSave={() => handleModuleTitleSave(mod.id)}
                          onStartEditTitle={() => { setEditingModuleId(mod.id); setEditModuleTitle(mod.title); }}
                          onTogglePublished={(v) => updateModule.mutate({ id: mod.id, courseId: courseId!, data: { is_published: v } })}
                          onDelete={() => setDeleteTarget({ type: "module", id: mod.id, name: mod.title, hasChildren: mod.lessons.length > 0 })}
                          onLessonDragEnd={handleLessonDragEnd(mod)}
                          onOpenLessonEditor={(lesson) => openLessonEditor(mod.id, lesson ?? null)}
                          onDeleteLesson={(lesson) => setDeleteTarget({ type: "lesson", id: lesson.id, name: lesson.title })}
                          onToggleLessonPublished={(lesson, v) => updateLessonMut.mutate({ id: lesson.id, courseId: courseId!, data: { is_published: v } })}
                          onImportVideos={() => setImportVideosModuleId(mod.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>

                  {canEdit && (
                    <Button variant="outline" onClick={handleAddModule} className="w-full">
                      <Plus className="h-4 w-4 mr-2" /> Add Module
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assessment">
          <AssessmentEditorTab
            courseId={courseId!}
            courseTitle={formState.title || course.title}
            courseDescription={formState.description || course.description}
            courseTargetAudience={formState.target_audience.length ? formState.target_audience : course.target_audience}
            aiTranscript={formState.transcript}
            lessonCount={
              courseTotals?.lesson_count
              ?? modules.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0)
            }
          />
        </TabsContent>

        <TabsContent value="packages">
          <PackageRulesTab courseId={courseId!} />
        </TabsContent>
      </Tabs>

      {/* Lesson Editor Panel */}
      {lessonEditorOpen && editingLesson && (
        <LessonEditorPanel
          open={lessonEditorOpen}
          onClose={() => { setLessonEditorOpen(false); setEditingLesson(null); }}
          moduleId={editingLesson.moduleId}
          courseId={editingLesson.courseId}
          lesson={editingLesson.lesson}
        />
      )}

      {/* Import Videos Panel */}
      {importVideosModuleId != null && (
        <ImportVideosPanel
          open={importVideosModuleId != null}
          onClose={() => setImportVideosModuleId(null)}
          moduleId={importVideosModuleId}
          courseId={courseId!}
          existingVideoIds={
            modules
              .find(m => m.id === importVideosModuleId)
              ?.lessons.filter(l => l.video_id).map(l => l.video_id!) ?? []
          }
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"?
              {deleteTarget?.hasChildren && " This module has lessons that will also be deleted."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AiDescriptionGenerator({
  title,
  targetAudience,
  difficultyLevel,
  tags,
  onGenerated,
}: {
  title: string;
  targetAudience: string[];
  difficultyLevel: string;
  tags: string[];
  onGenerated: (short: string, desc: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_descriptions",
          title,
          target_audience: targetAudience.length > 0 ? targetAudience.join(", ") : "training professionals",
          difficulty_level: difficultyLevel,
          tags,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      if (data?.short_description && data?.description) {
        onGenerated(data.short_description, data.description);
        toast.success("Descriptions generated — review and click Save Changes");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (e: any) {
      setError("Generation failed — check your connection and try again");
      console.error("AI generation error:", e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-1.5"
        style={{ borderColor: "#7130A0", color: "#7130A0" }}
        onClick={handleGenerate}
        disabled={!title?.trim() || generating}
      >
        {generating ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
        ) : (
          <><Sparkles className="h-3.5 w-3.5" /> Generate with AI</>
        )}
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

