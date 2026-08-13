import { ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, GraduationCap, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOverflowTabs } from "@/hooks/useOverflowTabs";
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

function buildSeriesOptions(courses: AcademyCourse[]): string[] {
  const series = new Set<string>();
  for (const c of courses) {
    const value = c.webinar_series?.trim();
    if (value) series.add(value);
  }
  return Array.from(series).sort((a, b) => collator.compare(a, b));
}

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

  const tagBuckets = useMemo(() => buildTagBuckets(courses), [courses]);
  const seriesOptions = useMemo(() => buildSeriesOptions(courses), [courses]);

  // "All" is a pill like any other tag bucket for width-measurement/overflow
  // purposes, so it shares the same array the fit calculation runs over.
  const allBuckets = useMemo<TagBucket[]>(
    () => [{ tag: ALL_TAB, count: courses.length }, ...tagBuckets],
    [tagBuckets, courses.length],
  );
  const bucketLabel = (b: TagBucket) => (b.tag === ALL_TAB ? "All" : prettyTag(b.tag));

  const { containerRef, itemRef, moreMeasureRef, activeMoreMeasureRef, visibleCount } =
    useOverflowTabs(allBuckets.length, 4); // matches the row's gap-1 (4px)
  const visibleTags = allBuckets.slice(0, visibleCount);
  const overflowTags = allBuckets.slice(visibleCount);
  const activeOverflowTag = overflowTags.find((b) => b.tag === activeTag);

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const hasSearchOrSeriesFilter =
    trimmedSearch.length > 0 || activeSeries !== ALL_SERIES;

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (activeSeries !== ALL_SERIES && c.webinar_series?.trim() !== activeSeries) {
        return false;
      }
      if (!courseMatchesSearch(c, trimmedSearch)) return false;
      if (activeTag !== ALL_TAB && !(c.tags ?? []).includes(activeTag)) {
        return false;
      }
      return true;
    });
  }, [courses, activeTag, activeSeries, trimmedSearch]);

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
      {/* Search + Series filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 min-w-0">
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
            <SelectTrigger className="sm:w-[280px]" aria-label="Filter by series">
              <SelectValue placeholder="All series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SERIES}>All series</SelectItem>
              {seriesOptions.map((series) => (
                <SelectItem key={series} value={series}>
                  {series}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
      <div className="relative h-0 overflow-hidden">
        <div aria-hidden className="absolute invisible flex items-center gap-1 pointer-events-none">
          {allBuckets.map((b, i) => (
            <button
              key={b.tag}
              ref={itemRef(i)}
              type="button"
              tabIndex={-1}
              className="px-3 py-2 text-sm font-medium whitespace-nowrap"
            >
              {bucketLabel(b)} ({b.count})
            </button>
          ))}
          <button ref={moreMeasureRef} type="button" tabIndex={-1} className="px-3 py-2 text-sm font-medium flex items-center gap-1">
            More <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {allBuckets.map((b, i) => (
            <button
              key={`more-${b.tag}`}
              ref={activeMoreMeasureRef(i)}
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
          {filtered.map((course) => {
            const status = mapEnrollmentStatus(
              course.enrollment_status,
              course.has_certificate,
            );
            const onClickCard = () => navigate(`/academy/course/${course.slug}`);
            return (
              <CourseCard
                key={course.id}
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
                onClick={
                  status === "completed"
                    ? () => handleReview(course)
                    : onClickCard
                }
                onStart={() => handleStart(course)}
                onContinue={() => handleContinue(course)}
              />
            );
          })}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="text-center py-16">
          {hasSearchOrSeriesFilter ? (
            <p className="font-medium text-foreground">
              No courses match — try a different search or series
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
