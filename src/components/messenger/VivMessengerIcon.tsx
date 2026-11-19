import { useId } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** Spoken name. Leave out when the icon sits next to its own text or inside a labelled button. */
  title?: string;
  /** Draw the speech bubble and spark only, without the gradient disc, for use on a coloured surface. */
  bare?: boolean;
}

/**
 * The messenger's mark, drawn to match the Vivacity logo. The logo is a white shield with a cyan V on a purple to fuchsia
 * cape; this is a white speech bubble with the same cyan V on the same purple to fuchsia gradient, with a small light
 * cyan spark to say the assistant lives here too. Brand colours: Purple #7130A0, Fuchsia #ED1878, Cyan #23C0DD,
 * Light Cyan #A6F1FF.
 *
 * Dark mode: the disc is a little lighter so it holds its edge against a dark surface, and the bubble is a very soft
 * lilac instead of pure white so it does not glare.
 */
export function VivMessengerIcon({ className, title, bare }: Props) {
  const gradient = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('shrink-0 [--viv-from:#7130A0] [--viv-to:#ED1878] [--viv-bubble:#FFFFFF] dark:[--viv-from:#8E45C4] dark:[--viv-to:#FF4A9E] dark:[--viv-bubble:#F6F0FB]', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      {!bare && (
        <>
          <defs>
            <linearGradient id={gradient} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--viv-from)' }} />
              <stop offset="1" style={{ stopColor: 'var(--viv-to)' }} />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="24" fill={`url(#${gradient})`} />
        </>
      )}
      {/* The speech bubble, with a tail at the bottom left. */}
      <path d="M17 11H31Q36 11 36 16V25Q36 30 31 30H22L16.5 35V30H17Q12 30 12 25V16Q12 11 17 11Z" style={{ fill: 'var(--viv-bubble)' }} />
      {/* The V from the Vivacity mark. */}
      <path d="M19 16.4L24 25L29 16.4" fill="none" stroke="#23C0DD" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* A spark: the assistant is in here too. */}
      <path d="M38.5 5.5L39.6 8.4L42.5 9.5L39.6 10.6L38.5 13.5L37.4 10.6L34.5 9.5L37.4 8.4Z" fill="#A6F1FF" />
    </svg>
  );
}
