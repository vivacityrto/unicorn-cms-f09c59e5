import { cn } from "@/lib/utils";

export interface WebinarSeriesSubtitleProps {
  series: string | null | undefined;
  className?: string;
}

/** Small muted line under a course title. Renders nothing when series is unset. */
export default function WebinarSeriesSubtitle({
  series,
  className,
}: WebinarSeriesSubtitleProps) {
  const value = series?.trim();
  if (!value) return null;

  return (
    <p className={cn("text-xs text-muted-foreground truncate", className)}>
      {value}
    </p>
  );
}
