import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Sparkles, ExternalLink, Loader2, X, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeError } from "@/lib/academy/aiAssist";
import {
  useAdminAcademyCourses,
  useUpdateCourse,
  type AdminCourse,
} from "@/hooks/academy/useAdminAcademyCourses";
import { toast } from "sonner";

type DescStatus = "missing" | "partial" | "present";

type AiDraft = {
  short_description: string;
  description: string;
};

function descriptionStatus(course: AdminCourse): DescStatus {
  const hasShort = !!course.short_description?.trim();
  const hasLong = !!course.description?.trim();
  if (hasShort && hasLong) return "present";
  if (hasShort || hasLong) return "partial";
  return "missing";
}

const descStatusTone: Record<DescStatus, string> = {
  missing: "bg-red-100 text-red-700 border-red-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  present: "bg-green-100 text-green-800 border-green-200",
};

const descStatusLabel: Record<DescStatus, string> = {
  missing: "Missing",
  partial: "Partial",
  present: "Present",
};

const NONE_FACILITATOR = "__none__";

export default function AcademyCourseCleanupPage() {
  const [search, setSearch] = useState("");
  const [missingFacilitator, setMissingFacilitator] = useState(false);
  const [missingDeliveryDate, setMissingDeliveryDate] = useState(false);
  const [missingDescription, setMissingDescription] = useState(false);

  const [aiDrafts, setAiDrafts] = useState<Record<number, AiDraft>>({});
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  const { data: courses = [], isLoading } = useAdminAcademyCourses();
  const updateCourse = useUpdateCourse();

  const { data: facilitators = [] } = useQuery({
    queryKey: ["academy-cleanup-facilitators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, full_name, archived, disabled")
        .eq("is_vivacity_internal", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).filter((u) => !u.archived && !u.disabled);
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (missingFacilitator && c.facilitator_id) return false;
      if (missingDeliveryDate && c.delivery_date) return false;
      if (missingDescription && descriptionStatus(c) === "present") return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const title = (c.title || "").toLowerCase();
        const series = (c.webinar_series || "").toLowerCase();
        if (!title.includes(s) && !series.includes(s)) return false;
      }
      return true;
    });
  }, [courses, missingFacilitator, missingDeliveryDate, missingDescription, search]);

  const backlogCounts = useMemo(() => {
    let noFacilitator = 0;
    let noDate = 0;
    let noDesc = 0;
    for (const c of courses) {
      if (!c.facilitator_id) noFacilitator++;
      if (!c.delivery_date) noDate++;
      if (descriptionStatus(c) !== "present") noDesc++;
    }
    return { noFacilitator, noDate, noDesc, total: courses.length };
  }, [courses]);

  const filtersActive = missingFacilitator || missingDeliveryDate || missingDescription || !!search.trim();

  const persistField = async (id: number, data: Partial<AdminCourse>, fieldKey: string) => {
    setSavingField(fieldKey);
    try {
      await updateCourse.mutateAsync({ id, data });
    } finally {
      setSavingField(null);
    }
  };

  const handleFacilitatorChange = (course: AdminCourse, value: string) => {
    const facilitator_id = value === NONE_FACILITATOR ? null : value;
    void persistField(course.id, { facilitator_id }, `facilitator-${course.id}`);
  };

  const handleDeliveryDateChange = (course: AdminCourse, value: string) => {
    void persistField(
      course.id,
      { delivery_date: value || null },
      `date-${course.id}`,
    );
  };

  const handleGenerate = async (course: AdminCourse) => {
    setGeneratingId(course.id);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("academy-ai-generate", {
        body: {
          action: "generate_descriptions",
          title: course.title,
          target_audience:
            course.target_audience && course.target_audience.length > 0
              ? course.target_audience.join(", ")
              : "training professionals",
          difficulty_level: course.difficulty_level,
          tags: course.tags ?? [],
        },
      });

      if (fnError) {
        throw new Error(await extractEdgeError(fnError, fnError.message || "Generation failed"));
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.short_description || !data?.description) {
        throw new Error("Invalid response format");
      }

      setAiDrafts((prev) => ({
        ...prev,
        [course.id]: {
          short_description: data.short_description,
          description: data.description,
        },
      }));
      toast.success("Descriptions generated — review and confirm to save");
    } catch (e: any) {
      toast.error(e?.message || "Generation failed — check your connection and try again");
      console.error("AI generation error:", e);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleConfirmDraft = async (courseId: number) => {
    const draft = aiDrafts[courseId];
    if (!draft) return;
    setSavingField(`desc-${courseId}`);
    try {
      await updateCourse.mutateAsync({
        id: courseId,
        data: {
          short_description: draft.short_description,
          description: draft.description,
        },
      });
      setAiDrafts((prev) => {
        const next = { ...prev };
        delete next[courseId];
        return next;
      });
    } finally {
      setSavingField(null);
    }
  };

  const handleDiscardDraft = (courseId: number) => {
    setAiDrafts((prev) => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Course Cleanup</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Work through missing facilitators, delivery dates, and descriptions across all academy courses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{backlogCounts.total} courses</span>
          <span className="text-border">·</span>
          <span>{backlogCounts.noFacilitator} missing facilitator</span>
          <span className="text-border">·</span>
          <span>{backlogCounts.noDate} missing delivery date</span>
          <span className="text-border">·</span>
          <span>{backlogCounts.noDesc} incomplete description</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title or series…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <FilterChip
            active={missingFacilitator}
            onClick={() => setMissingFacilitator((v) => !v)}
            label="Missing facilitator"
            count={backlogCounts.noFacilitator}
          />
          <FilterChip
            active={missingDeliveryDate}
            onClick={() => setMissingDeliveryDate((v) => !v)}
            label="Missing delivery date"
            count={backlogCounts.noDate}
          />
          <FilterChip
            active={missingDescription}
            onClick={() => setMissingDescription((v) => !v)}
            label="Missing description"
            count={backlogCounts.noDesc}
          />

          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setMissingFacilitator(false);
                setMissingDeliveryDate(false);
                setMissingDescription(false);
              }}
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No courses match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Title</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead className="w-[90px] text-right">Lessons</TableHead>
                  <TableHead className="min-w-[180px]">Facilitator</TableHead>
                  <TableHead className="min-w-[150px]">Date of delivery</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((course) => {
                  const status = descriptionStatus(course);
                  const draft = aiDrafts[course.id];
                  const isGenerating = generatingId === course.id;
                  const isSavingFacilitator = savingField === `facilitator-${course.id}`;
                  const isSavingDate = savingField === `date-${course.id}`;
                  const isSavingDesc = savingField === `desc-${course.id}`;

                  return (
                    <Fragment key={course.id}>
                      <TableRow>
                        <TableCell>
                          <div className="font-medium text-foreground leading-snug">
                            {course.title}
                          </div>
                          {course.status && (
                            <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                              {course.status}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {course.webinar_series || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {course.lesson_count}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={course.facilitator_id ?? NONE_FACILITATOR}
                            onValueChange={(v) => handleFacilitatorChange(course, v)}
                            disabled={isSavingFacilitator || updateCourse.isPending}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select facilitator" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE_FACILITATOR}>— None —</SelectItem>
                              {facilitators.map((u) => (
                                <SelectItem key={u.user_uuid} value={u.user_uuid}>
                                  {u.full_name || u.user_uuid}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            className="h-9"
                            value={course.delivery_date ? String(course.delivery_date).slice(0, 10) : ""}
                            onChange={(e) => handleDeliveryDateChange(course, e.target.value)}
                            disabled={isSavingDate || updateCourse.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("font-medium", descStatusTone[status])}
                          >
                            {descStatusLabel[status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isGenerating || !course.title}
                              onClick={() => void handleGenerate(course)}
                            >
                              {isGenerating ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5 mr-1" />
                              )}
                              AI desc
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/superadmin/academy/builder/${course.id}`}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Builder
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {draft && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={7} className="p-4">
                            <div className="space-y-3 max-w-3xl">
                              <p className="text-sm font-medium text-foreground">
                                AI preview — edit if needed, then confirm to overwrite the course description
                              </p>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Short description
                                </label>
                                <Textarea
                                  rows={2}
                                  value={draft.short_description}
                                  onChange={(e) =>
                                    setAiDrafts((prev) => ({
                                      ...prev,
                                      [course.id]: {
                                        ...prev[course.id],
                                        short_description: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Description
                                </label>
                                <Textarea
                                  rows={5}
                                  value={draft.description}
                                  onChange={(e) =>
                                    setAiDrafts((prev) => ({
                                      ...prev,
                                      [course.id]: {
                                        ...prev[course.id],
                                        description: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  disabled={isSavingDesc}
                                  onClick={() => void handleConfirmDraft(course.id)}
                                >
                                  {isSavingDesc && (
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  )}
                                  Confirm & save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isSavingDesc}
                                  onClick={() => handleDiscardDraft(course.id)}
                                >
                                  Discard
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {courses.length} courses
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
      )}
    >
      {label}
      <span
        className={cn(
          "tabular-nums text-xs rounded-full px-1.5 py-0.5",
          active ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
