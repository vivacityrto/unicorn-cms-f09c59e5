import { useEffect, useState } from 'react';

/**
 * True once the page has been scrolled far enough that a pinned header should shrink out of the way, and false again
 * only when the person is back near the top. The two thresholds differ on purpose (hysteresis): shrinking the header
 * changes the page height, and with a single threshold that can flip it back and forth while scrolling at the edge.
 */
export function useCondensedHeader(enterAt = 48, leaveAt = 8): boolean {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      setCondensed((was) => (was ? y > leaveAt : y > enterAt));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enterAt, leaveAt]);

  return condensed;
}
