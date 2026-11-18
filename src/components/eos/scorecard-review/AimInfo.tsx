import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { aimLadder, directionSentence, standingSentence } from '@/features/eos-scorecard/aimExplainer';
import { aimText, type Measure } from '@/features/eos-scorecard/scorecardView';
import { STATUS_STYLE } from './statusStyle';

interface AimInfoProps {
  measure: Pick<Measure, 'name' | 'unit' | 'target' | 'direction' | 'value' | 'status' | 'source'>;
  /** On a dark background the button is white. */
  onDark?: boolean;
  className?: string;
}

function Row({ tone, label, range }: { tone: 'on_track' | 'nearly' | 'off_track'; label: string; range: string }) {
  return (
    <li className="grid grid-cols-[0.5rem_6.5rem_minmax(0,1fr)] items-start gap-x-2 text-xs">
      <span aria-hidden className={cn('mt-1 h-2 rounded-full', STATUS_STYLE[tone].bar)} />
      <span className="font-semibold">{label}</span>
      <span className="text-muted-foreground">{range}</span>
    </li>
  );
}

/**
 * A small "?" that opens a plain explanation of how this measure's aim works: which way is good, where the lines
 * between on track, nearly there and off track fall for this measure, how to read the bar, and where the number comes from.
 */
export function AimInfo({ measure, onDark = false, className }: AimInfoProps) {
  const ladder = aimLadder(measure);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`How the aim works for ${measure.name}`}
          title="How the aim works"
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            onDark ? 'text-white/85 hover:text-white' : 'text-primary hover:bg-primary/10',
            className,
          )}
        >
          <CircleHelp className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      {/* The shared popover caps at 400px with a hidden scrollbar, which silently cut this off. Give it the room the screen has. */}
      <PopoverContent align="start" collisionPadding={12} className="max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-[min(92vw,21rem)] space-y-2.5 p-3.5 text-foreground">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How the aim works</p>
          <h4 className="text-sm font-bold leading-snug">Aim: {aimText(measure)}</h4>
          <p className="text-xs text-muted-foreground">{directionSentence(measure)}</p>
        </div>

        <div className="space-y-1.5">
          <h5 className="text-xs font-bold">Where the lines are for this measure</h5>
          <ul className="space-y-1.5">
            <Row tone="on_track" label="On track" range={ladder.onTrack} />
            <Row tone="nearly" label="Nearly there" range={ladder.nearly} />
            <Row tone="off_track" label="Off track" range={ladder.offTrack} />
          </ul>
          <p className="text-[11px] text-muted-foreground">“Nearly there” means within 10% of the aim.</p>
        </div>

        <p className="rounded-lg bg-muted/50 p-2 text-xs font-semibold leading-snug">{standingSentence(measure)}</p>

        <div className="space-y-1">
          <h5 className="text-xs font-bold">Reading the bar</h5>
          <p className="text-[11px] leading-snug text-muted-foreground">The coloured bar is this week’s number and the dark tick is the aim. The colour is the status.</p>
        </div>

        <div className="space-y-1">
          <h5 className="text-xs font-bold">Where the number comes from</h5>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {measure.source === 'automatic'
              ? 'Unicorn works this number out by itself every week. Nobody types it in.'
              : 'The measure’s owner types this number in each week. Until they do, it shows “Needs a number”.'}{' '}
            The aim is set per measure on the Scorecard page.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
