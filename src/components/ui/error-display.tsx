import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Error Display – Unicorn 2.0 Design System
 *
 * Standardised error, warning, and info display.
 *
 * Header:   "Action could not be completed."
 * Includes: Clear reason, suggested fix, expandable technical detail.
 *
 * Colour mapping:
 *   Error:   Fuchsia (destructive)
 *   Warning: Macaron
 *   Info:    Aqua
 */

const errorVariants = cva(
  'rounded-lg border p-4 space-y-2',
  {
    variants: {
      variant: {
        error: 'border-destructive/30 bg-destructive/5',
        warning: 'border-brand-macaron-500/30 bg-brand-macaron-50',
        info: 'border-brand-aqua-500/30 bg-brand-aqua-50',
      },
    },
    defaultVariants: {
      variant: 'error',
    },
  },
);

const ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const ICON_CLASSES = {
  error: 'text-destructive',
  warning: 'text-brand-macaron-700',
  info: 'text-brand-aqua-700',
};

const TITLE_CLASSES = {
  error: 'text-destructive',
  warning: 'text-brand-macaron-800',
  info: 'text-brand-aqua-800',
};

interface ErrorDisplayProps extends VariantProps<typeof errorVariants> {
  /** Main error title */
  title?: string;
  /** Clear reason for the error */
  reason: string;
  /** Suggested fix */
  suggestion?: string;
  /** Technical detail (expandable) */
  technicalDetail?: string;
  className?: string;
}

export function ErrorDisplay({
  variant = 'error',
  title,
  reason,
  suggestion,
  technicalDetail,
  className,
}: ErrorDisplayProps) {
  const [expanded, setExpanded] = React.useState(false);
  const v = variant || 'error';
  const Icon = ICONS[v];

  return (
    <div className={cn(errorVariants({ variant }), className)} role="alert">
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', ICON_CLASSES[v])} />
        <div className="flex-1 min-w-0 space-y-1">
          <p className={cn('text-sm font-semibold', TITLE_CLASSES[v])}>
            {title || 'Action could not be completed.'}
          </p>
          <p className="text-sm text-foreground">{reason}</p>
          {suggestion && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Suggested fix:</span> {suggestion}
            </p>
          )}
        </div>
      </div>

      {technicalDetail && (
        <div className="pl-8">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Technical details
          </button>
          {expanded && (
            <pre className="mt-2 text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">
              {technicalDetail}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
