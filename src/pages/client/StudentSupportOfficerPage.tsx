import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeartHandshake, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import CourseCard from "@/components/academy/CourseCard";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { useAcademyCourses, formatDuration, mapEnrollmentStatus, getCourseCategory } from "@/hooks/useAcademyCourses";
import { Skeleton } from "@/components/ui/skeleton";

const ACCENT = "#23c0dd";
const AUDIENCE_KEY = "student_support_officer";

const categoryTabs = ["All", "Online Delivery", "Student Engagement", "Support Services"];

export default function StudentSupportOfficerPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const navigate = useNavigate();
  const { data: courses = [], isLoading } = useAcademyCourses({ audienceKey: AUDIENCE_KEY });

  const filtered = activeFilter === "All"
    ? courses
    : courses.filter((c) => (c.tags ?? []).some(t => t === activeFilter));

  return (
    <AcademyPageWrapper
      title="Student Support Officer"
      subtitle="Resources for online delivery, student engagement, and support services"
      icon={<HeartHandshake className="h-6 w-6" />}
      accentColour={ACCENT}
    >
      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
        {categoryTabs.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors",
              activeFilter === cat
                ? "text-[#23c0dd] border-b-2 border-[#23c0dd]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Loading state */}
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

      {/* Course grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((course) => {
            const status = mapEnrollmentStatus(course.enrollment_status, course.has_certificate);
            return (
              <CourseCard
                key={course.id}
                title={course.title}
                category={getCourseCategory(course.tags, course.target_audience)}
                duration={formatDuration(course.estimated_minutes)}
                lessonCount={course.total_lessons}
                difficulty={(course.difficulty_level as "Beginner" | "Intermediate" | "Advanced") ?? "Beginner"}
                status={status}
                progressPercent={course.progress_percentage}
                completedLessons={course.completed_lessons}
                totalLessons={course.total_lessons}
                accentColour={ACCENT}
                onClick={() => navigate(`/academy/course/${course.slug}`)}
                onStart={() => navigate(`/academy/course/${course.slug}`)}
                onContinue={() => navigate(`/academy/course/${course.slug}`)}
              />
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-foreground">No courses available yet</p>
          <p className="text-sm text-muted-foreground mt-1">More courses coming soon — check back shortly</p>
        </div>
      )}
    </AcademyPageWrapper>
  );
}
