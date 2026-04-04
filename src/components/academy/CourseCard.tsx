import { useState } from "react";
import {
  Play,
  Clock,
  Video,
  Star,
  Award,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface CourseCardData {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: string;
  lessons: number;
  totalLessons: number;
  difficulty: string;
  status: "In Progress" | "Not Started" | "Completed";
  progress?: number;
}

interface CourseCardProps {
  course: CourseCardData;
  accentColor?: string;
}

export function CourseCard({ course, accentColor = "#23c0dd" }: CourseCardProps) {
  const completedLessons = course.progress
    ? Math.round((course.progress / 100) * course.totalLessons)
    : course.status === "Completed"
    ? course.totalLessons
    : 0;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div
        className="relative h-40 flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #23c0dd 0%, #7130A0 100%)",
        }}
      >
        {/* Category badge */}
        <Badge className="absolute top-3 left-3 bg-black/40 text-white border-0 text-[10px] font-medium backdrop-blur-sm">
          {course.category}
        </Badge>

        {/* Play icon */}
        <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Play className="h-5 w-5 text-white fill-white ml-0.5" />
        </div>

        {/* Progress bar on thumbnail */}
        {course.status === "In Progress" && course.progress != null && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
            <div
              className="h-full rounded-r-full"
              style={{ width: `${course.progress}%`, backgroundColor: accentColor }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2">
          {course.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {course.description}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {course.duration}
          </span>
          <span className="flex items-center gap-1">
            <Video className="h-3.5 w-3.5" />
            {course.totalLessons} lessons
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5" />
            {course.difficulty}
          </span>
        </div>

        {/* Progress info */}
        {course.status === "In Progress" && course.progress != null && (
          <div className="mt-3 space-y-1">
            <Progress
              value={course.progress}
              className="h-1.5 [&>div]:bg-[#23c0dd]"
            />
            <p className="text-[11px] text-muted-foreground">
              {course.progress}% complete · {completedLessons} of {course.totalLessons} lessons
            </p>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="mt-4">
          {course.status === "In Progress" && (
            <Button
              size="sm"
              className="w-full text-xs"
              style={{ backgroundColor: accentColor, color: "#fff" }}
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {course.status === "Not Started" && (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs border-[#7130A0] text-[#7130A0] hover:bg-[#7130A0]/10"
            >
              Start Course
            </Button>
          )}
          {course.status === "Completed" && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium" style={{ color: "#D4A017" }}>
              <Award className="h-4 w-4" />
              Certificate Earned
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
