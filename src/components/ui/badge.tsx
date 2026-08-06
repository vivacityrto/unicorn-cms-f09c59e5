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
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border border-primary bg-primary/10 text-primary hover:bg-primary/20",
        // Themed via CSS vars (--badge-*), not dark: utilities - see the
        // comment on --badge-warning-bg in index.css for why: a dark:
        // utility matches ANY .dark ancestor regardless of a nearer
        // .light scope (e.g. the client portal preview), so it would
        // leak staff dark-mode colours into a client-facing view.
        secondary: "border border-[var(--badge-secondary-border)] bg-[var(--badge-secondary-bg)] text-[var(--badge-secondary-fg)] hover:bg-secondary/20",
        destructive: "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline: "border border-border bg-muted/50 text-foreground hover:bg-muted",
        warning: "border border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)] hover:bg-brand-macaron-100",
        info: "border border-[var(--badge-info-border)] bg-[var(--badge-info-bg)] text-[var(--badge-info-fg)] hover:bg-brand-aqua-100",
        draft: "border border-[var(--badge-draft-border)] bg-[var(--badge-draft-bg)] text-[var(--badge-draft-fg)] hover:bg-brand-light-purple-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
