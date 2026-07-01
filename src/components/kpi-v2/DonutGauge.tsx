import { cn } from "@/lib/utils";

type Tone = "brand" | "cyan" | "emerald" | "amber" | "rose" | "muted";

const TONE_STROKE: Record<Tone, string> = {
  brand: "stroke-[url(#kpiBrandGrad)]",
  cyan: "stroke-[#23C0DD]",
  emerald: "stroke-emerald-500",
  amber: "stroke-amber-500",
  rose: "stroke-rose-500",
  muted: "stroke-muted-foreground/40",
};

interface Props {
  /** 0–100. Pass null for "no data" — renders an empty track. */
  value: number | null;
  /** Visual centre content. */
  primary: string;
  secondary?: string;
  tone?: Tone;
  size?: number;
  strokeWidth?: number;
}

/**
 * DonutGauge — brand-token SVG gauge for KPI cards.
 * Uses a purple→fuchsia linear gradient (brand tone) or a solid semantic
 * status stroke. Renders a subtle track underneath, and a percentage arc
 * on top starting at 12 o'clock rotating clockwise.
 */
export function DonutGauge({
  value,
  primary,
  secondary,
  tone = "brand",
  size = 168,
  strokeWidth = 14,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value == null ? 0 : Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="kpiBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7130A0" />
            <stop offset="100%" stopColor="#ED1878" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-muted"
        />
        {/* Value arc */}
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={cn("fill-none transition-[stroke-dasharray] duration-500", TONE_STROKE[tone])}
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
        <div className="text-3xl font-bold tracking-tight text-foreground leading-none">{primary}</div>
        {secondary && (
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}
