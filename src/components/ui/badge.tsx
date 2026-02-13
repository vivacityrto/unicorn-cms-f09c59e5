import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge System – Unicorn 2.0 Design System
 *
 * Semantic compliance mapping:
 * - default (compliant): Purple border/tint
 * - secondary: Acai/muted
 * - destructive (risk): Fuchsia border/tint
 * - outline: Neutral border
 * - warning: Macaron border/tint
 * - info: Aqua border/tint
 * - draft: Light Purple
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border border-primary bg-primary/10 text-primary hover:bg-primary/20",
        secondary: "border border-secondary/30 bg-secondary/10 text-secondary hover:bg-secondary/20",
        destructive: "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline: "border border-border bg-muted/50 text-foreground hover:bg-muted",
        warning: "border border-brand-macaron-600/40 bg-brand-macaron-50 text-brand-macaron-800 hover:bg-brand-macaron-100",
        info: "border border-brand-aqua-500/40 bg-brand-aqua-50 text-brand-aqua-800 hover:bg-brand-aqua-100",
        draft: "border border-brand-light-purple-400/40 bg-brand-light-purple-100 text-brand-acai-600 hover:bg-brand-light-purple-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
