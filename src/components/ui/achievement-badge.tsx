import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { LucideIcon, Shield, Zap, CheckCircle2, Star, Award } from 'lucide-react';

/**
 * Achievement Badge – Unicorn 2.0 Design System
 *
 * Displays earned compliance/progress milestones.
 * Minimal styling, no decorative excess.
 *
 * Examples: "Audit Ready", "Zero Risk Flags", "100% Generated"
 */

const achievementVariants = cva(
  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        compliant: 'border-primary/30 bg-primary/5 text-primary',
        success: 'border-primary/30 bg-primary/5 text-primary',
        milestone: 'border-brand-aqua-500/30 bg-brand-aqua-50 text-brand-aqua-800',
        excellence: 'border-brand-macaron-500/30 bg-brand-macaron-50 text-brand-macaron-800',
      },
    },
    defaultVariants: {
      variant: 'compliant',
    },
  },
);

const VARIANT_ICONS: Record<string, LucideIcon> = {
  compliant: Shield,
  success: CheckCircle2,
  milestone: Zap,
  excellence: Award,
};

interface AchievementBadgeProps extends VariantProps<typeof achievementVariants> {
  label: string;
  icon?: LucideIcon;
  className?: string;
}

export function AchievementBadge({ label, variant = 'compliant', icon, className }: AchievementBadgeProps) {
  const Icon = icon || VARIANT_ICONS[variant || 'compliant'] || Star;

  return (
    <div className={cn(achievementVariants({ variant }), className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
