import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, FileText, ArrowRight, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import CourseCard from "@/components/academy/CourseCard";
import { Card, CardContent } from "@/components/ui/card";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { useAcademyCourses, formatDuration, mapEnrollmentStatus, getCourseCategory } from "@/hooks/useAcademyCourses";
import { Skeleton } from "@/components/ui/skeleton";

const ACCENT = "#ed1878";
const AUDIENCE_KEY = "compliance_manager";

const categoryTabs: { label: string; tags: string[] }[] = [
  { label: "All", tags: [] },
  { label: "Standards", tags: ["standards", "srto-2025", "standards-2025"] },
  { label: "CRICOS", tags: ["cricos"] },
  { label: "Audits", tags: ["audit"] },
  { label: "Workshops", tags: ["workshop"] },
  { label: "Webinars", tags: ["webinar"] },
];

const matchesTab = (course: { tags?: string[] | null }, tags: string[]) =>
  tags.length === 0 || (course.tags ?? []).some((t) => tags.includes(t));

const resources = [
  "SRTO 2025 Quick Reference Checklist",
  "ASQA Evidence Matrix Template",
  "RTO Self-Assessment Workbook",
];

export default function ComplianceManagerPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const navigate = useNavigate();
  const { data: courses = [], isLoading } = useAcademyCourses({ audienceKey: AUDIENCE_KEY });

  const activeTab = categoryTabs.find((t) => t.label === activeFilter) ?? categoryTabs[0];
  const filtered = courses.filter((c) => matchesTab(c, activeTab.tags));

  return (
    <AcademyPageWrapper
      title="Compliance Manager"
      subtitle="Standards, audits, quality assurance, and regulatory compliance training"
      icon={<ShieldCheck className="h-6 w-6" />}
      accentColour={ACCENT}
    >
      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
        {categoryTabs.map((cat) => {
          const count = courses.filter((c) => matchesTab(c, cat.tags)).length;
          return (
            <button
              key={cat.label}
              onClick={() => setActiveFilter(cat.label)}
              className={cn(
                "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors",
                activeFilter === cat.label ? "border-b-2" : "text-muted-foreground hover:text-foreground"
              )}
              style={activeFilter === cat.label ? { color: ACCENT, borderColor: ACCENT } : undefined}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

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

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-foreground">No courses available yet</p>
          <p className="text-sm text-muted-foreground mt-1">More courses coming soon — check back shortly</p>
        </div>
      )}

      {/* Compliance Resources */}
      <div className="space-y-3 pt-4">
        <h2 className="text-lg font-semibold text-foreground">Compliance Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {resources.map((title) => (
            <Card key={title} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="py-4 px-5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${ACCENT}15` }}>
                  <FileText className="h-4 w-4" style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{title}</p>
                </div>
                <span className="text-xs font-medium flex items-center gap-0.5 flex-shrink-0" style={{ color: ACCENT }}>
                  View <ArrowRight className="h-3 w-3" />
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AcademyPageWrapper>
  );
}
