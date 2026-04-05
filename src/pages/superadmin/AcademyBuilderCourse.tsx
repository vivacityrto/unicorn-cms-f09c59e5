import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useModulesWithLessons, useCreateModule, useUpdateModule, useDeleteModule, useReorderModules, useCreateLesson, useUpdateLesson, useDeleteLesson, useReorderLessons, type AcademyModule, type AcademyLesson } from "@/hooks/academy/useAcademyModulesLessons";
import { useUpdateCourse, usePublishCourse, useDeleteCourse } from "@/hooks/academy/useAdminAcademyCourses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, GripVertical, Trash2, ChevronDown, ChevronRight, Edit2, Play, FileText, BookOpen, Paperclip } from "lucide-react";
import { toast } from "sonner";
import LessonEditorPanel from "@/components/academy/builder/LessonEditorPanel";
import AssessmentEditorTab from "@/components/academy/builder/AssessmentEditorTab";
import PackageRulesTab from "@/components/academy/builder/PackageRulesTab";

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

export default function AcademyBuilderCourse() {
  const { courseId: courseIdParam } = useParams<{ courseId: string }>();
  const courseId = courseIdParam ? parseInt(courseIdParam, 10) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<{ lesson: AcademyLesson | null; moduleId: number; courseId: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "module" | "lesson"; id: number; name: string; hasChildren?: boolean } | null>(null);

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

  // Modules & lessons
  const { data: modules = [], isLoading: modulesLoading } = useModulesWithLessons(courseId);

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

  // Auto-save field
  const autoSave = useCallback((field: string, value: any) => {
    if (!courseId) return;
    updateCourse.mutate({ id: courseId, data: { [field]: value } as any });
  }, [courseId, updateCourse]);

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

  // Drag-drop for modules (simplified with move up/down for now since @dnd-kit needs more wiring)
  const moveModule = (idx: number, direction: -1 | 1) => {
    if (!courseId) return;
    const ids = modules.map(m => m.id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    reorderModules.mutate({ courseId, orderedIds: ids });
  };

  const moveLesson = (mod: AcademyModule, lessonIdx: number, direction: -1 | 1) => {
    if (!courseId) return;
    const ids = mod.lessons.map(l => l.id);
    const newIdx = lessonIdx + direction;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[lessonIdx], ids[newIdx]] = [ids[newIdx], ids[lessonIdx]];
    reorderLessons.mutate({ moduleId: mod.id, courseId, orderedIds: ids });
  };

  if (courseLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-[30%_1fr] gap-6">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-6 text-center py-16">
        <p className="font-medium text-foreground">Course not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/superadmin/academy/builder")}>Back to Library</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/superadmin/academy/builder")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Library
        </Button>
        <h1 className="text-xl font-bold text-foreground truncate">{course.title}</h1>
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

        <TabsContent value="structure">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Left Panel — Course Settings */}
            <div className="space-y-4 p-5 rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-sm font-semibold text-foreground" style={{ color: "#7130A0" }}>Course Settings</h2>

              <Field label="Title">
                <Input defaultValue={course.title} onBlur={(e) => autoSave("title", e.target.value)} />
              </Field>

              <Field label="Slug">
                <Input defaultValue={course.slug} onBlur={(e) => autoSave("slug", e.target.value)} className="font-mono text-xs" />
              </Field>

              <Field label="Short Description">
                <Textarea defaultValue={course.short_description ?? ""} onBlur={(e) => autoSave("short_description", e.target.value)} rows={2} />
              </Field>

              <Field label="Description">
                <Textarea defaultValue={course.description ?? ""} onBlur={(e) => autoSave("description", e.target.value)} rows={4} />
              </Field>

              <Field label="Target Audience">
                <Input defaultValue={course.target_audience ?? ""} onBlur={(e) => autoSave("target_audience", e.target.value)} />
              </Field>

              <Field label="Difficulty Level">
                <Select defaultValue={course.difficulty_level ?? "beginner"} onValueChange={(v) => autoSave("difficulty_level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Estimated Minutes">
                <Input type="number" defaultValue={course.estimated_minutes ?? ""} onBlur={(e) => autoSave("estimated_minutes", e.target.value ? parseInt(e.target.value) : null)} />
              </Field>

              <Field label="Tags (comma-separated)">
                <Input defaultValue={(course.tags ?? []).join(", ")} onBlur={(e) => autoSave("tags", e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean))} />
              </Field>

              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Free Course</span>
                <Switch checked={course.is_free ?? false} onCheckedChange={(v) => autoSave("is_free", v)} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Certificate Enabled</span>
                <Switch checked={course.certificate_enabled ?? false} onCheckedChange={(v) => autoSave("certificate_enabled", v)} />
              </div>

              {course.certificate_enabled && (
                <Field label="Pass Score (%)">
                  <Input type="number" min={0} max={100} defaultValue={course.pass_score ?? 80} onBlur={(e) => autoSave("pass_score", parseInt(e.target.value) || 80)} />
                </Field>
              )}
            </div>

            {/* Right Panel — Structure */}
            <div className="space-y-4">
              {/* Status Bar */}
              <div className="flex items-center gap-3 p-4 rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
                <Badge className={`${statusColors[course.status ?? "draft"]} text-xs`}>{course.status}</Badge>
                <div className="flex-1" />
                {course.status === "draft" && (
                  <Button size="sm" onClick={handlePublish} className="text-white hover:opacity-90" style={{ backgroundColor: "#22c55e" }}>Publish Course</Button>
                )}
                {course.status === "published" && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleBackToDraft}>Back to Draft</Button>
                    <Button size="sm" variant="outline" onClick={() => courseId && archiveCourse.mutate(courseId)} className="text-amber-600 border-amber-300 hover:bg-amber-50">Archive</Button>
                  </>
                )}
                {course.status === "archived" && (
                  <Button size="sm" variant="outline" onClick={handleBackToDraft}>Restore to Draft</Button>
                )}
              </div>

              {/* Modules */}
              {modulesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {modules.map((mod, modIdx) => {
                    const expanded = expandedModules.has(mod.id);
                    const isEditing = editingModuleId === mod.id;
                    return (
                      <div key={mod.id} className="rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
                        {/* Module header */}
                        <div className="flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors">
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => moveModule(modIdx, -1)} disabled={modIdx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs">▲</button>
                            <button onClick={() => moveModule(modIdx, 1)} disabled={modIdx === modules.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs">▼</button>
                          </div>

                          <button onClick={() => toggleModuleExpand(mod.id)} className="p-1">
                            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>

                          {isEditing ? (
                            <Input
                              value={editModuleTitle}
                              onChange={(e) => setEditModuleTitle(e.target.value)}
                              onBlur={() => handleModuleTitleSave(mod.id)}
                              onKeyDown={(e) => e.key === "Enter" && handleModuleTitleSave(mod.id)}
                              className="h-8 text-sm flex-1"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="text-sm font-semibold text-foreground flex-1 cursor-pointer"
                              onDoubleClick={() => { setEditingModuleId(mod.id); setEditModuleTitle(mod.title); }}
                            >
                              {mod.title}
                            </span>
                          )}

                          <span className="text-xs text-muted-foreground">{mod.lessons.length} lessons</span>

                          <div className="flex items-center gap-1">
                            <Switch
                              checked={mod.is_published !== false}
                              onCheckedChange={(v) => updateModule.mutate({ id: mod.id, courseId: courseId!, data: { is_published: v } })}
                            />
                            <button onClick={() => { setEditingModuleId(mod.id); setEditModuleTitle(mod.title); }} className="p-1 hover:bg-muted rounded">
                              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ type: "module", id: mod.id, name: mod.title, hasChildren: mod.lessons.length > 0 })}
                              className="p-1 hover:bg-destructive/10 rounded"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>
                        </div>

                        {/* Lessons */}
                        {expanded && (
                          <div className="border-t px-3 pb-3 space-y-1" style={{ borderColor: "hsl(var(--border))" }}>
                            {mod.lessons.map((lesson, lessonIdx) => (
                              <div
                                key={lesson.id}
                                className="flex items-center gap-2 py-2 px-3 rounded hover:bg-muted/50 transition-colors text-sm group"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <button onClick={() => moveLesson(mod, lessonIdx, -1)} disabled={lessonIdx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px]">▲</button>
                                  <button onClick={() => moveLesson(mod, lessonIdx, 1)} disabled={lessonIdx === mod.lessons.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px]">▼</button>
                                </div>

                                <span className="text-sm">{lessonTypeEmoji(lesson.lesson_type)}</span>
                                <span className="text-foreground flex-1 truncate">{lesson.title}</span>

                                {lesson.is_preview && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Preview</Badge>
                                )}

                                <Switch
                                  checked={lesson.is_published !== false}
                                  onCheckedChange={(v) => updateLessonMut.mutate({ id: lesson.id, courseId: courseId!, data: { is_published: v } })}
                                />

                                <button onClick={() => openLessonEditor(mod.id, lesson)} className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget({ type: "lesson", id: lesson.id, name: lesson.title })}
                                  className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              </div>
                            ))}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openLessonEditor(mod.id)}
                              className="w-full mt-1 text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add Lesson
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button variant="outline" onClick={handleAddModule} className="w-full">
                    <Plus className="h-4 w-4 mr-2" /> Add Module
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assessment">
          <AssessmentEditorTab courseId={courseId!} />
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
