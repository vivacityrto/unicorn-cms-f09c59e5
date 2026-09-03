import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminAcademyCourses, useDeleteCourse, usePermanentDeleteCourse, useUpdateCourse, type AdminCourse } from "@/hooks/academy/useAdminAcademyCourses";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MultiSelect } from "@/components/documents/bulk-generate/MultiSelect";
import {
  Search, GraduationCap, BookOpen, Video, Award, Clock, RefreshCw, Loader2, Sparkles, ListPlus, MoreVertical, Trash2, Archive, Filter, Users, User, Calendar, LayoutGrid, List, Pencil, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/hooks/usePermission";
import { formatTargetAudienceLabel } from "@/lib/academy/pathways";
import { formatDeliveryDate } from "@/lib/academy/formatDeliveryDate";
import { useStaffFacilitatorNames } from "@/hooks/academy/useStaffFacilitatorNames";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const FIXED_SERIES_ORDER = [
  "AI in Your RTO",
  "Inside VET",
  "Trainers Edge",
  "8 Critical Drivers to RTO Success",
  "Superhero Tools Unleashed",
  "The Compliance Lab",
  "CRICOS",
  "Courses",
] as const;

const STANDALONE_KEY = "__standalone__";
const STANDALONE_LABEL = "Standalone Courses";
const AUDIENCE_PREVIEW_COUNT = 3;

type CourseSection = {
  key: string;
  label: string;
  courses: AdminCourse[];
};

type ViewMode = "grid" | "list";
type CourseSort = "created_desc" | "created_asc" | "updated_desc" | "title_asc" | "title_desc" | "delivery_asc" | "delivery_desc" | "status";

const sortOptions: Array<{ value: CourseSort; label: string }> = [
  { value: "created_desc", label: "Newest created" },
  { value: "created_asc", label: "Oldest created" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "title_asc", label: "Title: A–Z" },
  { value: "title_desc", label: "Title: Z–A" },
  { value: "delivery_asc", label: "Delivery date: soonest" },
  { value: "delivery_desc", label: "Delivery date: latest" },
  { value: "status", label: "Status" },
];

function seriesKeyForCourse(course: AdminCourse): string {
  const series = course.webinar_series?.trim();
  return series ? series : STANDALONE_KEY;
}

function formatAudiencePreview(audience: string[] | null | undefined): string | null {
  if (!audience?.length) return null;
  const labels = audience.map(formatTargetAudienceLabel);
  if (labels.length <= AUDIENCE_PREVIEW_COUNT) return labels.join(", ");
  const shown = labels.slice(0, AUDIENCE_PREVIEW_COUNT).join(", ");
  return `${shown} +${labels.length - AUDIENCE_PREVIEW_COUNT} more`;
}

function formatDeliveryDateLabel(dateString: string | null | undefined): string {
  return formatDeliveryDate(dateString) ?? "Not set";
}

function sortCourses(courses: AdminCourse[], sort: CourseSort): AdminCourse[] {
  return [...courses].sort((a, b) => {
    if (sort === "title_asc" || sort === "title_desc") {
      const result = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
      return sort === "title_asc" ? result : -result;
    }
    if (sort === "status") {
      const rank: Record<string, number> = { draft: 0, published: 1, archived: 2 };
      return (rank[a.status ?? "draft"] ?? 9) - (rank[b.status ?? "draft"] ?? 9) || a.title.localeCompare(b.title);
    }
    const field: "updated_at" | "delivery_date" | "created_at" = sort.startsWith("updated") ? "updated_at" : sort.startsWith("delivery") ? "delivery_date" : "created_at";
    const aValue = a[field] ? new Date(a[field] as string).getTime() : null;
    const bValue = b[field] ? new Date(b[field] as string).getTime() : null;
    if (aValue == null && bValue == null) return a.title.localeCompare(b.title);
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    const descending = sort.endsWith("desc");
    return descending ? bValue - aValue : aValue - bValue;
  });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
function groupCoursesBySeries(courses: AdminCourse[]): CourseSection[] {
  const byKey = new Map<string, AdminCourse[]>();
  for (const course of courses) {
    const key = seriesKeyForCourse(course);
    const list = byKey.get(key);
    if (list) list.push(course);
    else byKey.set(key, [course]);
  }

  const sections: CourseSection[] = [];
  for (const label of FIXED_SERIES_ORDER) {
    const list = byKey.get(label);
    if (list?.length) {
      sections.push({ key: label, label, courses: list });
      byKey.delete(label);
    }
  }

  const standalone = byKey.get(STANDALONE_KEY);
  if (standalone?.length) {
    sections.push({ key: STANDALONE_KEY, label: STANDALONE_LABEL, courses: standalone });
    byKey.delete(STANDALONE_KEY);
  }

  const extras = [...byKey.entries()]
    .filter(([, list]) => list.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [label, list] of extras) {
    sections.push({ key: label, label, courses: list });
  }

  return sections;
}


export default function AcademyBuilderLibrary() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<CourseSort>("created_desc");
  const [selectedSeries, setSelectedSeries] = useState<string>("all");
  const [quickEditCourse, setQuickEditCourse] = useState<AdminCourse | null>(null);
  const [quickEditTitle, setQuickEditTitle] = useState("");
  const [quickEditStatus, setQuickEditStatus] = useState("draft");
  const [quickEditSeries, setQuickEditSeries] = useState("");
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminCourse | null>(null);
  const qc = useQueryClient();

  // ── RBAC gates ──
  const canCreateCourse = usePermission('academy.builder.edit');
  const canBackfill = usePermission('academy.builder.publish');
  const updateCourse = useUpdateCourse();

  const { data: courses = [], isLoading } = useAdminAcademyCourses({
    status: statusFilter,
    search: search || undefined,
  });

  const facilitatorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const course of courses) {
      if (course.facilitator_id) ids.add(course.facilitator_id);
    }
    return [...ids];
  }, [courses]);

  const { data: facilitatorNameById = {} } = useStaffFacilitatorNames(facilitatorIds);

  const userTypeOptions = useMemo(() => {
    const distinct = new Set<string>();
    for (const course of courses) {
      for (const role of course.target_audience ?? []) {
        if (role) distinct.add(role);
      }
    }
    return [...distinct]
      .map((value) => ({ value, label: formatTargetAudienceLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [courses]);

  const filteredCourses = useMemo(() => {
    if (userTypeFilter.length === 0) return courses;
    const selected = new Set(userTypeFilter);
    return courses.filter((course) =>
      (course.target_audience ?? []).some((role) => selected.has(role)),
    );
  }, [courses, userTypeFilter]);

  const sortedCourses = useMemo(() => sortCourses(filteredCourses, sort), [filteredCourses, sort]);
  const sections = useMemo(() => groupCoursesBySeries(sortedCourses), [sortedCourses]);
  const selectedCourses = useMemo(
    () => selectedSeries === "all" ? sortedCourses : sortedCourses.filter((course) => seriesKeyForCourse(course) === selectedSeries),
    [selectedSeries, sortedCourses],
  );
  const selectedSectionLabel = selectedSeries === "all"
    ? "All courses"
    : sections.find((section) => section.key === selectedSeries)?.label ?? STANDALONE_LABEL;
  const seriesOptions = useMemo(() => sections.map((section) => ({ key: section.key, label: section.label, count: section.courses.length })), [sections]);

  const archiveCourse = useDeleteCourse();
  const deleteCourse = usePermanentDeleteCourse();

  const openQuickEdit = (course: AdminCourse) => {
    setQuickEditCourse(course);
    setQuickEditTitle(course.title);
    setQuickEditStatus(course.status ?? "draft");
    setQuickEditSeries(course.webinar_series ?? "");
  };

  const saveQuickEdit = () => {
    if (!quickEditCourse || !quickEditTitle.trim()) return;
    updateCourse.mutate(
      {
        id: quickEditCourse.id,
        data: {
          title: quickEditTitle.trim(),
          webinar_series: quickEditSeries.trim() || null,
        },
      },
      { onSuccess: () => setQuickEditCourse(null) },
    );
  };

  const runBackfill = async () => {
    setBackfillRunning(true);
    const tId = toast.loading("Backfilling video durations from Vimeo…");
    try {
      const { data, error } = await supabase.functions.invoke("backfill-vimeo-durations", {
        body: { batchSize: 200 },
      });
      if (error) throw error;
      const updated = data?.updated ?? 0;
      const skipped = data?.skipped ?? 0;
      const errors = data?.errors ?? 0;
      const remaining = data?.remaining_null ?? 0;
      toast.dismiss(tId);
      if (remaining > 0) {
        toast.success(`Updated ${updated}, skipped ${skipped}, errors ${errors}. Remaining: ${remaining}.`, {
          action: {
            label: "Run again",
            onClick: () => { void runBackfill(); },
          },
          duration: 10000,
        });
      } else {
        toast.success(`Updated ${updated}, skipped ${skipped}, errors ${errors}. All videos have durations.`);
      }
      qc.invalidateQueries({ queryKey: ["video-library"] });
      qc.invalidateQueries({ queryKey: ["training-videos-picker"] });
      qc.invalidateQueries({ queryKey: ["academy-course-total-minutes"] });
    } catch (e: unknown) {
      toast.dismiss(tId);
      toast.error(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBackfillRunning(false);
    }
  };

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6" style={{ color: "#7130A0" }} />
            Academy Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage training courses for Vivacity Academy</p>
        </div>
        <div className="flex items-center gap-2">
          {canBackfill && (
            <Button
              variant="outline"
              onClick={() => setBackfillConfirmOpen(true)}
              disabled={backfillRunning}
            >
              {backfillRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Backfill Video Durations
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate("/superadmin/academy/course-cleanup")}>
            <Filter className="h-4 w-4 mr-2" /> Course Cleanup
          </Button>
          {canCreateCourse && (
            <Button variant="outline" onClick={() => navigate("/superadmin/academy/bulk-import")}>
              <ListPlus className="h-4 w-4 mr-2" /> Bulk Import
            </Button>
          )}
          {canCreateCourse && (
            <Button
              onClick={() => navigate("/superadmin/academy/add-course")}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#23c0dd" }}
            >
              <Sparkles className="h-4 w-4 mr-2" /> Add Course
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <MultiSelect
          options={userTypeOptions}
          values={userTypeFilter}
          onChange={setUserTypeFilter}
          placeholder="User Type"
          searchPlaceholder="Search user types..."
          emptyText="No user types found."
          className="w-[240px]"
          maxSelectedDisplay={2}
        />
        <Select value={sort} onValueChange={(value) => setSort(value as CourseSort)}>
          <SelectTrigger className="w-[210px]">
            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center rounded-md border p-1" style={{ borderColor: "hsl(var(--border))" }}>
          <Button type="button" variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}>
            <LayoutGrid className="h-4 w-4 mr-1.5" /> Grid
          </Button>
          <Button type="button" variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
            <List className="h-4 w-4 mr-1.5" /> List
          </Button>
        </div>
      </div>

      {/* Course groups and courses */}
      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No courses found</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first course to get started</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-medium text-foreground">No courses match</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
          <nav aria-label="Course groups" className="space-y-1 lg:sticky lg:top-4">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Course groups</p>
            <Button type="button" variant={selectedSeries === "all" ? "secondary" : "ghost"} className="w-full justify-between" onClick={() => setSelectedSeries("all")}>
              <span>All courses</span><span className="text-xs text-muted-foreground">{sortedCourses.length}</span>
            </Button>
            {seriesOptions.map((option) => (
              <Button key={option.key} type="button" variant={selectedSeries === option.key ? "secondary" : "ghost"} className="w-full justify-between text-left" onClick={() => setSelectedSeries(option.key)}>
                <span className="truncate">{option.label}</span><span className="text-xs text-muted-foreground">{option.count}</span>
              </Button>
            ))}
          </nav>

          <section className="min-w-0 space-y-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedSectionLabel}</h2>
                <p className="text-sm text-muted-foreground">{selectedCourses.length} course{selectedCourses.length === 1 ? "" : "s"} · {sortOptions.find((option) => option.value === sort)?.label}</p>
              </div>
              {selectedSeries !== "all" && <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedSeries("all")}>Show all courses</Button>}
            </div>

            {viewMode === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
                {selectedCourses.map((course) => {
                      const audiencePreview = formatAudiencePreview(course.target_audience);
                      return (
                        <Card
                          key={course.id}
                          className="hover:shadow-md transition-shadow"
                          style={{ borderLeft: "4px solid #7130A0" }}
                        >
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between">
                              <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 min-h-9">{course.title}</h3>
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Badge className={`text-[10px] ${statusColors[course.status ?? "draft"]}`}>
                                  {course.status ?? "draft"}
                                </Badge>
                                {canCreateCourse && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreVertical className="h-3.5 w-3.5" />
                                        <span className="sr-only">Course actions</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                      {course.status !== "archived" && (
                                        <DropdownMenuItem onSelect={() => archiveCourse.mutate(course.id)}>
                                          <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() => setDeleteTarget(course)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete permanently
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </div>

                            {audiencePreview && (
                              <p className="text-xs text-muted-foreground flex items-start gap-1.5 line-clamp-2">
                                <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{audiencePreview}</span>
                              </p>
                            )}

                            <div className="space-y-1">
                              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                <User className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>
                                  Facilitator:{" "}
                                  {course.facilitator_display_name?.trim()
                                    || (course.facilitator_id ? (facilitatorNameById[course.facilitator_id] ?? "Not set") : "Not set")}
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                <Calendar className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>
                                  Date of delivery: {formatDeliveryDateLabel(course.delivery_date)}
                                </span>
                              </p>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <BookOpen className="h-3.5 w-3.5" /> {course.module_count} modules
                              </span>
                              <span className="flex items-center gap-1">
                                <Video className="h-3.5 w-3.5" /> {course.lesson_count} lessons
                              </span>
                              {course.certificate_enabled && (
                                <span className="flex items-center gap-1 text-amber-600">
                                  <Award className="h-3.5 w-3.5" /> Certificate
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="capitalize">{course.difficulty_level ?? "beginner"}</span>
                              {course.estimated_minutes && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {course.estimated_minutes}m
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <Button type="button" size="sm" className="flex-1" onClick={() => navigate(`/superadmin/academy/builder/${course.id}`)}>
                                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit course
                              </Button>
                              {canCreateCourse && <Button type="button" variant="outline" size="sm" onClick={() => openQuickEdit(course)}>Quick edit</Button>}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[minmax(260px,2fr)_minmax(130px,1fr)_100px_150px_auto] gap-4 px-4 py-3 text-xs font-medium text-muted-foreground border-b" style={{ borderColor: "hsl(var(--border))" }}>
                    <span>Course</span><span>Group</span><span>Status</span><span>Content</span><span>Actions</span>
                  </div>
                  {selectedCourses.map((course) => (
                    <div key={course.id} className="grid grid-cols-[minmax(260px,2fr)_minmax(130px,1fr)_100px_150px_auto] gap-4 items-center px-4 py-3 border-b last:border-b-0" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="min-w-0"><p className="font-medium text-sm truncate">{course.title}</p><p className="text-xs text-muted-foreground truncate">{formatAudiencePreview(course.target_audience) ?? "No audience set"}</p></div>
                      <span className="text-xs text-muted-foreground truncate">{seriesKeyForCourse(course) === STANDALONE_KEY ? STANDALONE_LABEL : course.webinar_series}</span>
                      <Badge className={`w-fit text-[10px] ${statusColors[course.status ?? "draft"]}`}>{course.status ?? "draft"}</Badge>
                      <span className="text-xs text-muted-foreground">{course.module_count} modules · {course.lesson_count} lessons</span>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="sm" onClick={() => navigate(`/superadmin/academy/builder/${course.id}`)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                        {canCreateCourse && <Button type="button" variant="ghost" size="icon" onClick={() => openQuickEdit(course)} aria-label={`Quick edit ${course.title}`}><MoreVertical className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <Sheet open={!!quickEditCourse} onOpenChange={(open) => !open && setQuickEditCourse(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Quick edit course</SheetTitle>
            <SheetDescription>Update common details without leaving the course library.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 py-6">
            <Field label="Course title"><Input value={quickEditTitle} onChange={(e) => setQuickEditTitle(e.target.value)} /></Field>
            <Field label="Course group"><Input value={quickEditSeries} placeholder="Standalone course" onChange={(e) => setQuickEditSeries(e.target.value)} /></Field>
            <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "hsl(var(--border))" }}>
              <span className="text-sm">Current status</span><Badge className={`text-[10px] ${statusColors[quickEditStatus]}`}>{quickEditStatus}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Use the full builder for publishing, structure, lessons, assessments, package rules, and image settings.</p>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setQuickEditCourse(null)}>Cancel</Button>
            <Button onClick={saveQuickEdit} disabled={!quickEditTitle.trim() || updateCourse.isPending}>{updateCourse.isPending ? "Saving…" : "Save changes"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Backfill Confirmation */}
      <AlertDialog open={backfillConfirmOpen} onOpenChange={setBackfillConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backfill Video Durations from Vimeo</AlertDialogTitle>
            <AlertDialogDescription>
              This will fetch durations from Vimeo for all videos missing duration data. It runs in batches and can be re-clicked safely. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void runBackfill(); }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}” permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the course along with its modules and lessons. Videos stay in the library.
              This cannot be undone. Courses with existing enrolments can only be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCourse.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteCourse.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
              }}
            >
              {deleteCourse.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
