import { cn } from '@/lib/utils';

type OrgType = 'rto' | 'rto_cricos' | 'cricos' | 'gto' | string;

interface OrgTypeBadgeProps {
  orgType: OrgType | null | undefined;
  className?: string;
}

const ORG_TYPE_CONFIG: Record<string, { label: string; className: string; gradient?: boolean }> = {
  rto: {
    label: 'RTO',
    className: 'bg-primary text-primary-foreground',
  },
  rto_cricos: {
    label: 'RTO + CRICOS',
    className: 'text-white',
    gradient: true,
  },
  cricos: {
    label: 'CRICOS',
    className: 'text-white',
    gradient: true,
  },
  gto: {
    label: 'GTO',
    className: 'bg-brand-aqua text-white',
  },
};

/**
 * OrgTypeBadge — shows the tenant's organisation type with Vivacity branding.
 * RTO: Purple solid | CRICOS/RTO+CRICOS: Purple→Fuchsia gradient | GTO: Aqua | Other: Light Purple
 */
export function OrgTypeBadge({ orgType, className }: OrgTypeBadgeProps) {
  if (!orgType) return null;

  const config = ORG_TYPE_CONFIG[orgType];

  if (!config) {
    // "Other" / unknown org_type
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-brand-light-purple text-brand-acai',
          className
        )}
      >
        {orgType.replace(/_/g, ' ').toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        config.className,
        className
      )}
      style={config.gradient ? { backgroundImage: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--destructive)) 100%)' } : undefined}
    >
      {config.label}
    </span>
  );
}
