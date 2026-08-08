import { ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, GraduationCap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import CourseCard from "@/components/academy/CourseCard";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
const VISIBLE_TAB_LIMIT = 6; // includes the "All" pill

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

function prettyTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
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

  const visibleTags = tagBuckets.slice(0, VISIBLE_TAB_LIMIT - 1);
  const overflowTags = tagBuckets.slice(VISIBLE_TAB_LIMIT - 1);

  const filtered = useMemo(() => {
    if (activeTag === ALL_TAB) return courses;
    return courses.filter((c) => (c.tags ?? []).includes(activeTag));
  }, [courses, activeTag]);

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
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
        {renderTabButton(`All`, courses.length, ALL_TAB)}
        {visibleTags.map((b) => renderTabButton(prettyTag(b.tag), b.count, b.tag))}
        {overflowTags.length > 0 && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors flex items-center gap-1",
                  overflowTags.some((b) => b.tag === activeTag)
                    ? "border-b-2"
                    : "text-muted-foreground hover:text-foreground",
                )}
                style={
                  overflowTags.some((b) => b.tag === activeTag)
                    ? { color: accentColour, borderColor: accentColour }
                    : undefined
                }
              >
                More <ChevronDown className="h-3.5 w-3.5" />
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
                        value={prettyTag(b.tag)}
                        onSelect={() => {
                          setActiveTag(b.tag);
                          setMoreOpen(false);
                        }}
                      >
                        {prettyTag(b.tag)} ({b.count})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[14px] border border-border overflow-hidden">
              <Skeleton className="h-[148px] w-full rounded-none" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
          <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-foreground">
            No courses available for this audience yet
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            More courses coming soon — check back shortly
          </p>
        </div>
      )}

      {extras}
    </AcademyPageWrapper>
  );
}
