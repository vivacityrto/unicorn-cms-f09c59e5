import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, GraduationCap, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOverflowTabs } from "@/hooks/useOverflowTabs";
import { formatDeliveryDate } from "@/lib/academy/formatDeliveryDate";
import CourseCard from "@/components/academy/CourseCard";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  AcademyCourse,
  formatDuration,
  getCourseCategory,
  mapEnrollmentStatus,
  useAcademyCourses,
} from "@/hooks/useAcademyCourses";
import {
  MyEnrolledCourse,
  useMyEnrolledCourses,
} from "@/hooks/academy/useMyEnrolledCourses";
import { useEnrolCourse } from "@/hooks/academy/useEnrolCourse";

export type AudienceKey =
  | "trainer"
  | "compliance_manager"
  | "governance_person"
  | "student_support_officer"
  | "administration_assistant";

export interface AudienceHubPageProps {
  audienceKey: AudienceKey;
  title: string;
  description: string;
  icon: ReactNode;
  accentColour?: string;
  /** Optional content rendered below the course grid (e.g. Resources cards). */
  extras?: ReactNode;
}

const ALL_TAB = "__all__";
const ALL_SERIES = "__all__";
const ALL_DATES = "__all__";
const UNDATED_BUCKET = "__undated__";

const collator = new Intl.Collator("en-AU", { sensitivity: "base" });

interface TagBucket {
  tag: string;
  count: number;
}

function buildTagBuckets(courses: AcademyCourse[]): TagBucket[] {
  const counts = new Map<string, number>();
  for (const c of courses) {
    for (const t of c.tags ?? []) {
      const tag = t?.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return collator.compare(a.tag, b.tag);
    });
}

interface SeriesOption {
  value: string;
  count: number;
}

function buildSeriesOptions(courses: AcademyCourse[]): SeriesOption[] {
  const counts = new Map<string, number>();
  for (const c of courses) {
    const value = c.webinar_series?.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => collator.compare(a.value, b.value));
}

interface DateBucket {
  /** "month:2026-06" | "year:2024" | UNDATED_BUCKET */
  value: string;
  label: string;
  count: number;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

/**
 * Data-derived "when delivered" buckets — built only from months/years that
 * actually have a course in them, never a full calendar grid (see
 * docs — the Academy Timeline design proposal). Real delivery dates are
 * heavily front-loaded into the last few months with a long, sparse tail
 * behind them, so a year only expands into per-month entries when it has
 * enough in it to make that granularity useful (>=6 courses or >=3 distinct
 * months); otherwise it collapses to a single year entry. Undated courses
 * get their own explicit bucket rather than being silently dropped.
 */
function buildDateBuckets(courses: AcademyCourse[]): DateBucket[] {
  const monthCounts = new Map<string, number>();
  let undatedCount = 0;
  for (const c of courses) {
    if (!c.delivery_date) {
      undatedCount++;
      continue;
    }
    const month = c.delivery_date.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  const yearMonths = new Map<string, Map<string, number>>();
  for (const [month, count] of monthCounts) {
    const year = month.slice(0, 4);
    if (!yearMonths.has(year)) yearMonths.set(year, new Map());
    yearMonths.get(year)!.set(month, count);
  }

  const buckets: DateBucket[] = [];
  const years = Array.from(yearMonths.keys()).sort((a, b) => b.localeCompare(a));
  for (const year of years) {
    const months = yearMonths.get(year)!;
    const totalInYear = Array.from(months.values()).reduce((sum, n) => sum + n, 0);
    if (totalInYear >= 6 || months.size >= 3) {
      const sortedMonths = Array.from(months.keys()).sort((a, b) => b.localeCompare(a));
      for (const month of sortedMonths) {
        buckets.push({ value: `month:${month}`, label: monthLabel(month), count: months.get(month)! });
      }
    } else {
      buckets.push({ value: `year:${year}`, label: year, count: totalInYear });
    }
  }

  if (undatedCount > 0) {
    buckets.push({ value: UNDATED_BUCKET, label: "Date not recorded", count: undatedCount });
  }

  return buckets;
}

function courseMatchesDateBucket(course: AcademyCourse, bucketValue: string): boolean {
  if (bucketValue === ALL_DATES) return true;
  if (bucketValue === UNDATED_BUCKET) return !course.delivery_date;
  if (!course.delivery_date) return false;
  if (bucketValue.startsWith("month:")) return course.delivery_date.slice(0, 7) === bucketValue.slice(6);
  if (bucketValue.startsWith("year:")) return course.delivery_date.slice(0, 4) === bucketValue.slice(5);
  return true;
}

type SortMode = "recommended" | "recent" | "oldest" | "az";

const SORT_LABELS: Record<SortMode, string> = {
  recommended: "Recommended",
  recent: "Most recent first",
  oldest: "Oldest first",
  az: "A–Z",
};

function courseMatchesSearch(course: AcademyCourse, query: string): boolean {
  if (!query) return true;
  const haystacks: string[] = [
    course.title ?? "",
    course.short_description ?? "",
    course.webinar_series ?? "",
    ...(course.tags ?? []),
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

interface FacetFilters {
  series: string;
  tag: string;
  date: string;
  search: string;
}

/**
 * Applies whichever facets are passed. Each facet's own option list is
 * built by calling this with that facet reset to "all" but the *other*
 * three still applied — standard faceted-search composition, so picking a
 * series narrows which tags/dates are offered (and their counts), and
 * vice versa, rather than every facet independently showing whole-pathway
 * counts that don't reflect what's actually still reachable.
 */
function applyFacetFilters(courses: AcademyCourse[], filters: FacetFilters): AcademyCourse[] {
  return courses.filter((c) => {
    if (filters.series !== ALL_SERIES && c.webinar_series?.trim() !== filters.series) return false;
    if (!courseMatchesSearch(c, filters.search)) return false;
    if (filters.tag !== ALL_TAB && !(c.tags ?? []).includes(filters.tag)) return false;
    if (!courseMatchesDateBucket(c, filters.date)) return false;
    return true;
  });
}

// Sector acronyms that should render fully uppercase rather than
// title-cased (e.g. "rto compliance" -> "RTO Compliance", not "Rto
// Compliance") — evidence-based from the actual tags in use, see
// docs/audit-log/entries/2026-08-13-academy-tag-cleanup.md.
const TAG_ACRONYMS = new Set([
  "asqa", "rto", "vet", "ai", "tas", "aqf", "rpl", "cricos", "eos", "tae", "srto", "pd",
]);

function prettyTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      if (TAG_ACRONYMS.has(lower)) return lower.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export default function AudienceHubPage({
  audienceKey,
  title,
  description,
  icon,
  accentColour = "#23c0dd",
  extras,
}: AudienceHubPageProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTag, setActiveTag] = useState<string>(ALL_TAB);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeries, setActiveSeries] = useState<string>(ALL_SERIES);
  const [activeDateBucket, setActiveDateBucket] = useState<string>(ALL_DATES);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: courses = [], isLoading, isError, error } = useAcademyCourses({
    audienceKey,
  });
  const { data: enrolled = [], refetch: refetchEnrolled } =
    useMyEnrolledCourses();
  const enrolMutation = useEnrolCourse();

  const enrolledByCourseId = useMemo(() => {
    const m = new Map<number, MyEnrolledCourse>();
    for (const e of enrolled) m.set(e.course_id, e);
    return m;
  }, [enrolled]);

  const trimmedSearch = searchQuery.trim().toLowerCase();

  // Each facet's own options/counts come from the courses matching every
  // *other* active facet, never itself — so selecting a series narrows the
  // tag pills and date buckets (and their counts) to what's actually still
  // reachable, instead of every facet independently showing whole-pathway
  // numbers that stop meaning anything once another filter is active.
  const coursesForTagFacet = useMemo(
    () => applyFacetFilters(courses, { series: activeSeries, tag: ALL_TAB, date: activeDateBucket, search: trimmedSearch }),
    [courses, activeSeries, activeDateBucket, trimmedSearch],
  );
  const coursesForSeriesFacet = useMemo(
    () => applyFacetFilters(courses, { series: ALL_SERIES, tag: activeTag, date: activeDateBucket, search: trimmedSearch }),
    [courses, activeTag, activeDateBucket, trimmedSearch],
  );
  const coursesForDateFacet = useMemo(
    () => applyFacetFilters(courses, { series: activeSeries, tag: activeTag, date: ALL_DATES, search: trimmedSearch }),
    [courses, activeSeries, activeTag, trimmedSearch],
  );

  const tagBuckets = useMemo(() => buildTagBuckets(coursesForTagFacet), [coursesForTagFacet]);
  const seriesOptions = useMemo(() => buildSeriesOptions(coursesForSeriesFacet), [coursesForSeriesFacet]);
  const dateBuckets = useMemo(() => buildDateBuckets(coursesForDateFacet), [coursesForDateFacet]);

  // If a choice made earlier is no longer reachable once another facet
  // narrows things (e.g. picking a series that has zero courses under the
  // currently-active tag), reset that stale selection back to "all" rather
  // than leaving it selected-but-invisible with the grid just showing zero
  // results and no visible way to tell what's still filtering it.
  useEffect(() => {
    if (activeTag !== ALL_TAB && !tagBuckets.some((b) => b.tag === activeTag)) {
      setActiveTag(ALL_TAB);
    }
  }, [tagBuckets, activeTag]);
  useEffect(() => {
    if (activeSeries !== ALL_SERIES && !seriesOptions.some((s) => s.value === activeSeries)) {
      setActiveSeries(ALL_SERIES);
    }
  }, [seriesOptions, activeSeries]);
  useEffect(() => {
    if (activeDateBucket === ALL_DATES) return;
    // Not a plain "is this value still in the list" check like tag/series
    // above — a date bucket's own granularity reshapes between month:YYYY-MM
    // and year:YYYY as other facets narrow the data (see buildDateBuckets'
    // coarsening rule), so a selection can still match real courses even
    // when its exact bucket string briefly isn't one of the currently-listed
    // options. Only reset when it truly matches nothing any more.
    const stillMatchesSomething = coursesForDateFacet.some((c) =>
      courseMatchesDateBucket(c, activeDateBucket),
    );
    if (!stillMatchesSomething) {
      setActiveDateBucket(ALL_DATES);
    }
  }, [coursesForDateFacet, activeDateBucket]);

  // "All" is a pill like any other tag bucket for width-measurement/overflow
  // purposes, so it shares the same array the fit calculation runs over.
  // Its count reflects the other active facets (series/date/search), same
  // as every real tag bucket does.
  const allBuckets = useMemo<TagBucket[]>(
    () => [{ tag: ALL_TAB, count: coursesForTagFacet.length }, ...tagBuckets],
    [tagBuckets, coursesForTagFacet.length],
  );
  const bucketLabel = (b: TagBucket) => (b.tag === ALL_TAB ? "All" : prettyTag(b.tag));

  const { containerRef, itemRef, moreMeasureRef, activeMoreMeasureRef, visibleCount } =
    useOverflowTabs(allBuckets.length, 4); // matches the row's gap-1 (4px)
  const visibleTags = allBuckets.slice(0, visibleCount);
  const overflowTags = allBuckets.slice(visibleCount);
  const activeOverflowTag = overflowTags.find((b) => b.tag === activeTag);

  const hasActiveFilters =
    trimmedSearch.length > 0 ||
    activeSeries !== ALL_SERIES ||
    activeDateBucket !== ALL_DATES ||
    activeTag !== ALL_TAB;

  const filtered = useMemo(
    () => applyFacetFilters(courses, { series: activeSeries, tag: activeTag, date: activeDateBucket, search: trimmedSearch }),
    [courses, activeTag, activeSeries, activeDateBucket, trimmedSearch],
  );

  // "Recommended" keeps the server order (curator sort_order, then title).
  // The date sorts always collect undated courses at the end, under a
  // divider, rather than interleaving them arbitrarily among real dates.
  const sortedResult = useMemo(() => {
    if (sortMode === "az") {
      return { ordered: [...filtered].sort((a, b) => collator.compare(a.title, b.title)), dividerIndex: null as number | null };
    }
    if (sortMode === "recent" || sortMode === "oldest") {
      const dated = filtered.filter((c) => c.delivery_date);
      const undated = filtered.filter((c) => !c.delivery_date);
      dated.sort((a, b) =>
        sortMode === "recent"
          ? b.delivery_date!.localeCompare(a.delivery_date!)
          : a.delivery_date!.localeCompare(b.delivery_date!),
      );
      return {
        ordered: [...dated, ...undated],
        dividerIndex: dated.length > 0 && undated.length > 0 ? dated.length : null,
      };
    }
    return { ordered: filtered, dividerIndex: null as number | null };
  }, [filtered, sortMode]);

  const handleStart = async (course: AcademyCourse) => {
    try {
      await enrolMutation.mutateAsync(course.id);
      // Refetch so next_lesson is populated for the new enrolment.
      await qc.invalidateQueries({ queryKey: ["academy-my-enrolled-courses"] });
      const refetched = await refetchEnrolled();
      const fresh = (refetched.data ?? []).find((e) => e.course_id === course.id);
      if (fresh?.next_lesson) {
        navigate(
          `/academy/course/${fresh.next_lesson.slug}/lesson/${fresh.next_lesson.lessonId}`,
        );
      } else {
        navigate(`/academy/course/${course.slug}`);
      }
    } catch {
      // toast already shown by useEnrolCourse onError
    }
  };

  const handleContinue = (course: AcademyCourse) => {
    const e = enrolledByCourseId.get(course.id);
    if (e?.next_lesson) {
      navigate(
        `/academy/course/${e.next_lesson.slug}/lesson/${e.next_lesson.lessonId}`,
      );
    } else {
      navigate(`/academy/course/${course.slug}`);
    }
  };

  const handleReview = (course: AcademyCourse) => {
    navigate(`/academy/course/${course.slug}`);
  };

  const renderTabButton = (label: string, count: number, value: string) => {
    const isActive = activeTag === value;
    return (
      <button
        key={value}
        onClick={() => setActiveTag(value)}
        className={cn(
          "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors",
          isActive ? "border-b-2" : "text-muted-foreground hover:text-foreground",
        )}
        style={isActive ? { color: accentColour, borderColor: accentColour } : undefined}
      >
        {label} ({count})
      </button>
    );
  };

  return (
    <AcademyPageWrapper
      title={title}
      subtitle={description}
      icon={icon}
      accentColour={accentColour}
    >
      {/* Search + Series + When delivered + Sort filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search courses or series..."
            className="pl-9"
            aria-label="Search courses or series"
          />
        </div>
        {seriesOptions.length > 0 && (
          <Select value={activeSeries} onValueChange={setActiveSeries}>
            <SelectTrigger className="sm:w-[220px]" aria-label="Filter by series">
              <SelectValue placeholder="All series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SERIES}>All series ({coursesForSeriesFacet.length})</SelectItem>
              {seriesOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.value} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {dateBuckets.length > 0 && (
          <Select value={activeDateBucket} onValueChange={setActiveDateBucket}>
            <SelectTrigger className="sm:w-[190px]" aria-label="Filter by when delivered">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DATES}>Any time ({coursesForDateFacet.length})</SelectItem>
              {dateBuckets.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label} ({b.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="sm:w-[190px]" aria-label="Sort courses">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {SORT_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sub-tabs — as many pills render directly as fit the available width
          (see useOverflowTabs); the rest collapse into "More", which swaps
          its own label to the active tag when that tag is one of the
          overflowed ones, so the active filter is never hidden behind an
          anonymous "More". */}
      <div ref={containerRef} className="flex items-center gap-1 pb-1 border-b min-w-0">
        {visibleTags.map((b) => renderTabButton(bucketLabel(b), b.count, b.tag))}
        {overflowTags.length > 0 && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors flex items-center gap-1 shrink-0",
                  activeOverflowTag ? "border-b-2" : "text-muted-foreground hover:text-foreground",
                )}
                style={activeOverflowTag ? { color: accentColour, borderColor: accentColour } : undefined}
              >
                {activeOverflowTag ? (
                  <>
                    {bucketLabel(activeOverflowTag)} ({activeOverflowTag.count})
                  </>
                ) : (
                  "More"
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start" collisionPadding={16}>
              <Command>
                <CommandInput placeholder="Search categories..." />
                <CommandList>
                  <CommandEmpty>No categories found.</CommandEmpty>
                  <CommandGroup>
                    {overflowTags.map((b) => (
                      <CommandItem
                        key={b.tag}
                        value={bucketLabel(b)}
                        onSelect={() => {
                          setActiveTag(b.tag);
                          setMoreOpen(false);
                        }}
                      >
                        {bucketLabel(b)} ({b.count})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Hidden clones used only to measure each pill's natural rendered
          width for the fit calculation above — never shown. The unwrapped
          flex row is far wider than the viewport (every tag on the page,
          unwrapped, plus every active-More variant), so it needs its own
          clipped, positioned parent — AcademyLayout's <main> has no
          overflow-x constraint (unlike ClientLayout, where this pattern
          originated), so without this the wide invisible row blows out
          horizontal scroll on any pathway with more tags than fit on
          screen. */}
      <div className="relative h-0 overflow-hidden !mt-0">
        <div aria-hidden className="absolute invisible flex items-center gap-1 pointer-events-none">
          {allBuckets.map((b, i) => (
            <button
              key={b.tag}
              ref={itemRef(i) as React.Ref<HTMLButtonElement>}
              type="button"
              tabIndex={-1}
              className="px-3 py-2 text-sm font-medium whitespace-nowrap"
            >
              {bucketLabel(b)} ({b.count})
            </button>
          ))}
          <button ref={moreMeasureRef as React.Ref<HTMLButtonElement>} type="button" tabIndex={-1} className="px-3 py-2 text-sm font-medium flex items-center gap-1">
            More <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {allBuckets.map((b, i) => (
            <button
              key={`more-${b.tag}`}
              ref={activeMoreMeasureRef(i) as React.Ref<HTMLButtonElement>}
              type="button"
              tabIndex={-1}
              className="px-3 py-2 text-sm font-medium flex items-center gap-1"
            >
              {bucketLabel(b)} ({b.count})
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[14px] border border-border overflow-hidden">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-8 w-full mt-4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className="text-center py-16">
          <p className="font-medium text-foreground">
            Couldn't load courses — please refresh or contact support
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      )}

      {/* Course grid */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedResult.ordered.map((course, index) => {
            const status = mapEnrollmentStatus(
              course.enrollment_status,
              course.has_certificate,
            );
            const onClickCard = () => navigate(`/academy/course/${course.slug}`);
            return (
              <Fragment key={course.id}>
                {index === sortedResult.dividerIndex && (
                  <div className="col-span-full flex items-center gap-3 py-1 text-xs text-muted-foreground">
                    <span className="flex-1 border-t border-border" />
                    Date not recorded
                    <span className="flex-1 border-t border-border" />
                  </div>
                )}
                <CourseCard
                  title={course.title}
                  category={getCourseCategory(course.tags, course.target_audience)}
                  duration={formatDuration(course.estimated_minutes)}
                  lessonCount={course.total_lessons}
                  difficulty={
                    (course.difficulty_level as "Beginner" | "Intermediate" | "Advanced") ??
                    "Beginner"
                  }
                  status={status}
                  progressPercent={course.progress_percentage}
                  completedLessons={course.completed_lessons}
                  totalLessons={course.total_lessons}
                  accentColour={accentColour}
                  thumbnailUrl={course.thumbnail_url}
                  thumbnailPosition={course.thumbnail_position}
                  thumbnailFit={course.thumbnail_fit}
                  thumbnailZoom={course.thumbnail_zoom}
                  deliveryDateLabel={formatDeliveryDate(course.delivery_date)}
                  facilitatorName={course.facilitator_name}
                  webinarSeries={course.webinar_series}
                  onClick={
                    status === "completed"
                      ? () => handleReview(course)
                      : onClickCard
                  }
                  onStart={() => handleStart(course)}
                  onContinue={() => handleContinue(course)}
                />
              </Fragment>
            );
          })}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="text-center py-16">
          {hasActiveFilters ? (
            <p className="font-medium text-foreground">
              No courses match — try a different search, series, or date range
            </p>
          ) : (
            <>
              <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-medium text-foreground">
                No courses available for this audience yet
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                More courses coming soon — check back shortly
              </p>
            </>
          )}
        </div>
      )}

      {extras}
    </AcademyPageWrapper>
  );
}
