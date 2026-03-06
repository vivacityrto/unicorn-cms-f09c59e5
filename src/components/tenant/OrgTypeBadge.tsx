import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ExternalLink } from 'lucide-react';

type OrgType = 'rto' | 'rto_cricos' | 'cricos' | 'gto' | string;

interface OrgTypeBadgeProps {
  orgType: OrgType | null | undefined;
  rtoNumber?: string | null;
  cricosNumber?: string | null;
  className?: string;
}

const ORG_TYPE_CONFIG: Record<string, { label: string; className: string; gradient?: boolean }> = {
  rto: {
    label: 'RTO',
    className: 'bg-primary text-primary-foreground border border-white/30',
  },
  rto_cricos: {
    label: 'RTO + CRICOS',
    className: 'text-white border border-white/30',
    gradient: true,
  },
  cricos: {
    label: 'CRICOS',
    className: 'text-white border border-white/30',
    gradient: true,
  },
  gto: {
    label: 'GTO',
    className: 'bg-brand-aqua text-white border border-white/30',
  },
};

const EXCLUDED_VALUES = ['tbc', 'tba', 'na', 'n/a', ''];

function isLinkable(value: string | null | undefined): value is string {
  if (!value) return false;
  return !EXCLUDED_VALUES.includes(value.trim().toLowerCase());
}

/**
 * OrgTypeBadge — shows the tenant's organisation type with Vivacity branding.
 * Clicking on RTO/CRICOS badges opens a popover with links to external registers.
 */
export function OrgTypeBadge({ orgType, rtoNumber, cricosNumber, className }: OrgTypeBadgeProps) {
  if (!orgType) return null;

  const config = ORG_TYPE_CONFIG[orgType];

  // Build linkable codes based on org type
  const links: { label: string; code: string; url: string }[] = [];

  if (orgType === 'rto' || orgType === 'rto_cricos') {
    if (isLinkable(rtoNumber)) {
      links.push({
        label: 'RTO Number',
        code: rtoNumber.trim(),
        url: `https://training.gov.au/Organisation/Details/${encodeURIComponent(rtoNumber.trim())}`,
      });
    }
  }

  if (orgType === 'cricos' || orgType === 'rto_cricos') {
    if (isLinkable(cricosNumber)) {
      links.push({
        label: 'CRICOS Provider Code',
        code: cricosNumber.trim(),
        url: `https://cricos.education.gov.au/Institution/InstitutionDetails.aspx?ProviderCode=${encodeURIComponent(cricosNumber.trim())}`,
      });
    }
  }

  const badgeContent = (isButton: boolean) => {
    if (!config) {
      return (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-3 py-0.5 text-xs font-bold tracking-wide uppercase bg-brand-light-purple text-brand-acai border border-brand-light-purple-400/60 shadow-sm',
            isButton && 'cursor-pointer',
            className
          )}
        >
          {orgType.replace(/_/g, ' ')}
        </span>
      );
    }

    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-3 py-0.5 text-xs font-bold tracking-wide uppercase shadow-sm',
          config.className,
          isButton && 'cursor-pointer hover:opacity-90 transition-opacity',
          className
        )}
        style={config.gradient ? { backgroundImage: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--destructive)) 100%)' } : undefined}
      >
        {config.label}
      </span>
    );
  };

  // No linkable codes — render static badge
  if (links.length === 0) {
    return badgeContent(false);
  }

  // Has linkable codes — wrap in popover
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full">
          {badgeContent(true)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[200px] p-2" align="start" sideOffset={6}>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Registration Codes</p>
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors group"
            >
              <div className="min-w-0">
                <span className="text-muted-foreground text-xs">{link.label}</span>
                <p className="font-medium truncate">{link.code}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
