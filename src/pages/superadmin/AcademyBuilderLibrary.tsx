import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminAcademyCourses, useDeleteCourse, usePermanentDeleteCourse, type AdminCourse } from "@/hooks/academy/useAdminAcademyCourses";
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
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { MultiSelect } from "@/components/documents/bulk-generate/MultiSelect";
import {
  Search, GraduationCap, BookOpen, Video, Award, Clock, RefreshCw, Loader2, Sparkles, ListPlus, MoreVertical, Trash2, Archive, Filter, Users, User, Calendar,
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
  const [openSections, setOpenSections] = useState<string[]>([]);
  const seenSectionKeysRef = useRef<Set<string>>(new Set());
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminCourse | null>(null);
  const qc = useQueryClient();

  // ── RBAC gates ──
  const canCreateCourse = usePermission('academy.builder.edit');
  const canBackfill = usePermission('academy.builder.publish');

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

  const sections = useMemo(
    () => groupCoursesBySeries(filteredCourses),
    [filteredCourses],
  );

  // Auto-expand only the first time a section becomes visible; preserve manual toggles.
  useEffect(() => {
    const visibleKeys = sections.map((s) => s.key);
    const newlyVisible = visibleKeys.filter((key) => !seenSectionKeysRef.current.has(key));
    if (newlyVisible.length === 0) return;
    for (const key of newlyVisible) seenSectionKeysRef.current.add(key);
    setOpenSections((prev) => {
      const next = new Set(prev);
      for (const key of newlyVisible) next.add(key);
      return [...next];
    });
  }, [sections]);

  const allVisibleExpanded =
    sections.length > 0 && sections.every((s) => openSections.includes(s.key));

  const archiveCourse = useDeleteCourse();
  const deleteCourse = usePermanentDeleteCourse();

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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
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
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
      </div>

      {/* Course sections */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                if (allVisibleExpanded) {
                  setOpenSections([]);
                } else {
                  setOpenSections(sections.map((s) => s.key));
                }
              }}
            >
              {allVisibleExpanded ? "Collapse all" : "Expand all"}
            </Button>
          </div>
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={setOpenSections}
            className="space-y-3"
          >
            {sections.map((section) => (
              <AccordionItem
                key={section.key}
                value={section.key}
                className="border rounded-lg px-4"
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <span className="text-sm font-semibold text-foreground">
                    {section.label} ({section.courses.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {section.courses.map((course) => {
                      const audiencePreview = formatAudiencePreview(course.target_audience);
                      return (
                        <Card
                          key={course.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          style={{ borderLeft: "4px solid #7130A0" }}
                          onClick={() => navigate(`/superadmin/academy/builder/${course.id}`)}
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
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

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
