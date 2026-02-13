/**
 * WinBanner – Unicorn 2.0
 *
 * Subtle banner shown when weekly win conditions are met.
 * Triggers Tier 1 celebration on first appearance.
 * Internal only.
 */

import { useEffect, useRef } from 'react';
import { X, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWinBanner } from '@/hooks/useWinBanner';
import { useCelebration } from '@/hooks/use-celebration';

interface WinBannerProps {
  userUuid: string | null;
  onScrollToWins?: () => void;
  className?: string;
}

export function WinBanner({ userUuid, onScrollToWins, className }: WinBannerProps) {
  const { activeCondition, dismiss, markTriggered } = useWinBanner(userUuid);
  const { trigger } = useCelebration();
  const firedRef = useRef(false);

  useEffect(() => {
    if (activeCondition && !firedRef.current) {
      firedRef.current = true;
      markTriggered(activeCondition.type);
      trigger({
        tier: 'spark',
        message: activeCondition.title,
        subtitle: activeCondition.subtitle,
      });
    }
  }, [activeCondition, trigger, markTriggered]);

  if (!activeCondition) return null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 border-primary bg-brand-light-purple/30 ${className ?? ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-acai">{activeCondition.title}</p>
        <p className="text-xs text-muted-foreground">{activeCondition.subtitle}</p>
      </div>
      {onScrollToWins && (
        <Button variant="ghost" size="sm" onClick={onScrollToWins} className="gap-1 text-xs shrink-0">
          <ArrowDown className="h-3 w-3" /> View wins
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={dismiss} className="h-7 w-7 p-0 shrink-0">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
