import { cn } from '@/lib/utils';

interface SparklinePoint {
  quarter: string;
  yesRate: number;
}

interface GWCSparklineProps {
  data: SparklinePoint[];
  height?: number;
  width?: number;
  className?: string;
  showLabels?: boolean;
}

export function GWCSparkline({ 
  data, 
  height = 40, 
  width = 120,
  className,
  showLabels = false,
}: GWCSparklineProps) {
  if (data.length === 0) {
    return (
      <div 
        className={cn('flex items-center justify-center text-xs text-muted-foreground', className)}
        style={{ height, width }}
      >
        No data
      </div>
    );
  }

  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Calculate points
  const points = data.map((d, i) => ({
    x: padding + (data.length > 1 ? (i / (data.length - 1)) * chartWidth : chartWidth / 2),
    y: padding + chartHeight - (d.yesRate * chartHeight),
    rate: d.yesRate,
    quarter: d.quarter,
  }));
  
  // Create SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  
  // Determine line color based on trend
  const firstRate = points[0]?.rate || 0;
  const lastRate = points[points.length - 1]?.rate || 0;
  const trend = lastRate - firstRate;
  
  const lineColor = trend > 0.1 
    ? 'stroke-emerald-500' 
    : trend < -0.1 
      ? 'stroke-destructive' 
      : 'stroke-muted-foreground';
  
  const dotColor = lastRate >= 0.8 
    ? 'fill-emerald-500' 
    : lastRate >= 0.5 
      ? 'fill-amber-500' 
      : 'fill-destructive';

  return (
    <div className={cn('relative', className)}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Background reference line at 80% */}
        <line
          x1={padding}
          y1={padding + chartHeight * 0.2}
          x2={width - padding}
          y2={padding + chartHeight * 0.2}
          className="stroke-muted/30"
          strokeWidth={1}
          strokeDasharray="2,2"
        />
        
        {/* Main trend line */}
        <path
          d={pathD}
          fill="none"
          className={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={i === points.length - 1 ? 4 : 2}
            className={i === points.length - 1 ? dotColor : 'fill-muted-foreground/50'}
          />
        ))}
      </svg>
      
      {/* Labels */}
      {showLabels && data.length > 0 && (
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{data[0].quarter}</span>
          <span>{data[data.length - 1].quarter}</span>
        </div>
      )}
    </div>
  );
}
