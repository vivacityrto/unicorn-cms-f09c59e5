import { useNavigate } from "react-router-dom";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Play, CheckCircle2 } from "lucide-react";
import {
  useMyEnrolledCourses,
  type MyEnrolledCourse,
} from "@/hooks/academy/useMyEnrolledCourses";
import { useEnrolCourse } from "@/hooks/academy/useEnrolCourse";
import { resolveCourseBannerImage } from "@/lib/academy/thumbnails";

const ACCENT = "#23c0dd";

function durationLabel(minutes: number | null): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round(minutes / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

function statusMeta(c: MyEnrolledCourse) {
  if (c.enrollment_status === "completed" || c.has_certificate) {
    return { variant: "default" as const, label: "Completed" };
  }
  if (c.enrollment_status === "active") {
    return { variant: "secondary" as const, label: "In Progress" };
  }
  return { variant: "outline" as const, label: "Not Started" };
}

export default function AcademyCoursesListPage() {
  const navigate = useNavigate();
  const { data: courses, isLoading } = useMyEnrolledCourses();
  const enrol = useEnrolCourse();

  const handleCta = async (c: MyEnrolledCourse) => {
    // Completed → review course detail
    if (c.enrollment_status === "completed" || c.has_certificate) {
      navigate(`/academy/course/${c.course_slug}`);
      return;
    }
    // Active enrolment with a next lesson → continue
    if (c.enrollment_status === "active" && c.next_lesson) {
      navigate(`/academy/course/${c.next_lesson.slug}/lesson/${c.next_lesson.lessonId}`);
      return;
    }
    // Active enrolment but no incomplete lesson → review
    if (c.enrollment_status === "active") {
      navigate(`/academy/course/${c.course_slug}`);
      return;
    }
    // No enrolment → enrol then go to first lesson if available
    await enrol.mutateAsync(c.course_id);
    if (c.next_lesson) {
      navigate(`/academy/course/${c.next_lesson.slug}/lesson/${c.next_lesson.lessonId}`);
    } else {
      navigate(`/academy/course/${c.course_slug}`);
    }
  };

  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Courses</h1>
          <p className="text-muted-foreground">
            Continue your enrolled Vivacity Academy courses
          </p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && (!courses || courses.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                You haven't enrolled in any courses yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A course catalog is coming soon.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && courses && courses.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map((course) => {
              const meta = statusMeta(course);
              const isCompleted = course.enrollment_status === "completed" || course.has_certificate;
              const ctaLabel = isCompleted
                ? "Review Course"
                : course.enrollment_status === "active"
                  ? "Continue"
                  : "Start Course";
              const bannerImage = resolveCourseBannerImage(course);
              return (
                <Card key={course.enrollment_id} className="overflow-hidden">
                  <div
                    className="relative aspect-video w-full flex items-center justify-center overflow-hidden"
                    style={{
                      background: bannerImage
                        ? undefined
                        : `linear-gradient(135deg, ${ACCENT} 0%, #7130A0 100%)`,
                    }}
                  >
                    {bannerImage && (
                      <img
                        src={bannerImage.url}
                        alt={course.course_title}
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{
                          objectFit: bannerImage.fit,
                          objectPosition: bannerImage.position,
                          transform: `scale(${bannerImage.zoom})`,
                          transformOrigin: bannerImage.position,
                        }}
                      />
                    )}
                    {isCompleted ? (
                      <CheckCircle2 className="relative h-12 w-12 text-white/80" />
                    ) : (
                      <BookOpen className="relative h-12 w-12 text-white/80" />
                    )}
                  </div>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base leading-tight">
                        {course.course_title}
                      </h3>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    {course.course_description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {course.course_description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {durationLabel(course.estimated_minutes)}
                      </span>
                      <span>
                        {course.module_count} module{course.module_count === 1 ? "" : "s"}
                      </span>
                      <span>
                        {course.total_lessons} lesson{course.total_lessons === 1 ? "" : "s"}
                      </span>
                    </div>

                    {course.progress_percentage > 0 && !isCompleted && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">
                            {course.progress_percentage}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${course.progress_percentage}%`,
                              backgroundColor: ACCENT,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full text-white hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                      onClick={() => handleCta(course)}
                      disabled={enrol.isPending}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {ctaLabel}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AcademyLayout>
  );
}
