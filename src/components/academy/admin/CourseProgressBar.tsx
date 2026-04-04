import { cn } from "@/lib/utils";

interface CourseProgressBarProps {
  percentage: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

function getColor(p: number) {
  if (p >= 100) return "#22c55e";
  if (p >= 67) return "#23c0dd";
  if (p >= 34) return "#f59e0b";
  return "#f87171";
}

export default function CourseProgressBar({ percentage, showLabel, size = "sm" }: CourseProgressBarProps) {
  const h = size === "md" ? "h-2.5" : "h-1.5";
  const clamped = Math.min(100, Math.max(0, percentage));

  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 rounded-full bg-muted overflow-hidden", h)}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: getColor(clamped) }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{clamped}% complete</span>
      )}
    </div>
  );
}
