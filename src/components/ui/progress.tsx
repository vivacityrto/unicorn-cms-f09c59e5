import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/**
 * Progress – Unicorn 2.0 Design System
 *
 * Animated fill with smooth transitions.
 * Supports label and percentage display.
 */

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string;
  /** Show percentage text */
  showValue?: boolean;
  /** Label above the bar */
  label?: string;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, indicatorClassName, showValue, label, ...props }, ref) => (
  <div className="w-full">
    {(label || showValue) && (
      <div className="flex items-center justify-between mb-1.5">
        {label && <span className="text-xs font-medium text-foreground">{label}</span>}
        {showValue && (
          <span className="text-xs text-muted-foreground">{Math.round(value || 0)}%</span>
        )}
      </div>
    )}
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary rounded-full transition-transform duration-500 ease-smooth",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  </div>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
