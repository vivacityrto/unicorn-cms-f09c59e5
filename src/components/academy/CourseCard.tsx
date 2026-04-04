import {
  Play,
  Clock,
  Video,
  Star,
  Award,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

export interface CourseCardProps {
  title: string;
  category: string;
  duration: string;
  lessonCount: number;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  status: "not_started" | "in_progress" | "completed";
  progressPercent?: number;
  completedLessons?: number;
  totalLessons?: number;
  accentColour?: string;
  onContinue?: () => void;
  onStart?: () => void;
  onClick?: () => void;
}

/** Also re-export the legacy interface so existing pages keep compiling during migration. */
export interface CourseCardData {
  id: string;
  title: string;
  description?: string;
  category: string;
  duration: string;
  lessons?: number;
  totalLessons: number;
  difficulty: string;
  status: "In Progress" | "Not Started" | "Completed";
  progress?: number;
}

const statusBadge = {
  in_progress: { bg: "#23c0dd", text: "#fff", label: "In Progress" },
  completed: { bg: "#22c55e", text: "#fff", label: "Completed" },
  not_started: { bg: "#e8e4ef", text: "#6b7280", label: "Not Started" },
} as const;

export default function CourseCard({
  title,
  category,
  duration,
  lessonCount,
  difficulty,
  status,
  progressPercent = 0,
  completedLessons = 0,
  totalLessons,
  accentColour = "#23c0dd",
  onContinue,
  onStart,
}: CourseCardProps) {
  const total = totalLessons ?? lessonCount;
  const badge = statusBadge[status];

  return (
    <div
      className="flex flex-col overflow-hidden bg-white"
      style={{
        border: "1px solid #e8e4ef",
        borderRadius: 14,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 8px 24px rgba(113,48,160,0.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* ── Thumbnail ── */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: 148,
          background: `linear-gradient(135deg, ${accentColour} 0%, #7130A0 100%)`,
        }}
      >
        {/* Category badge – top-left */}
        <span className="absolute top-3 left-3 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-medium text-white">
          {category}
        </span>

        {/* Play button */}
        <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Play className="h-5 w-5 text-white fill-white ml-0.5" />
        </div>

        {/* Progress bar pinned to bottom (only in_progress) */}
        {status === "in_progress" && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
            <div
              className="h-full rounded-r-full"
              style={{
                width: `${Math.min(100, progressPercent)}%`,
                backgroundColor: accentColour,
              }}
            />
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col flex-1 p-4">
        {/* Category tag + status badge row */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: accentColour }}
          >
            {category}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: badge.bg, color: badge.text }}
          >
            {badge.label}
          </span>
        </div>

        {/* Title */}
        <h3
          className="font-bold leading-snug line-clamp-2"
          style={{ fontSize: 15, color: "#44235F" }}
        >
          {title}
        </h3>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {duration}
          </span>
          <span className="flex items-center gap-1">
            <Video className="h-3.5 w-3.5" /> {lessonCount} lessons
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5" /> {difficulty}
          </span>
        </div>

        {/* Progress bar + label (only in_progress) */}
        {status === "in_progress" && (
          <div className="mt-3 space-y-1">
            <div className="h-1.5 rounded-full bg-[#e8e4ef] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, progressPercent)}%`,
                  backgroundColor: accentColour,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {progressPercent}% complete · {completedLessons} of {total} lessons
            </p>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Footer ── */}
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e8e4ef" }}>
          {status === "in_progress" && (
            <button
              onClick={onContinue}
              className="w-full flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accentColour }}
            >
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {status === "not_started" && (
            <button
              onClick={onStart}
              className="w-full flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-colors"
              style={{
                border: `1.5px solid ${accentColour}`,
                color: accentColour,
                backgroundColor: "transparent",
              }}
            >
              Start Course
            </button>
          )}
          {status === "completed" && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#D4A017" }}>
                <Award className="h-4 w-4" /> 🏆 Completed
              </div>
              <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                View Certificate <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Legacy adapter — wraps the old CourseCardData interface for backwards-compat.
 * Consumer pages that still use <CourseCardLegacy course={…} /> will keep working.
 */
export function CourseCardLegacy({
  course,
  accentColor = "#23c0dd",
}: {
  course: CourseCardData;
  accentColor?: string;
}) {
  const statusMap: Record<string, CourseCardProps["status"]> = {
    "In Progress": "in_progress",
    "Not Started": "not_started",
    Completed: "completed",
  };

  return (
    <CourseCard
      title={course.title}
      category={course.category}
      duration={course.duration}
      lessonCount={course.totalLessons}
      difficulty={course.difficulty as CourseCardProps["difficulty"]}
      status={statusMap[course.status] ?? "not_started"}
      progressPercent={course.progress}
      completedLessons={
        course.progress
          ? Math.round((course.progress / 100) * course.totalLessons)
          : course.status === "Completed"
          ? course.totalLessons
          : 0
      }
      totalLessons={course.totalLessons}
      accentColour={accentColor}
    />
  );
}
