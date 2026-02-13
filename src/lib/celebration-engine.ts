/**
 * Celebration System – Unicorn 2.0
 *
 * Canvas-based fireworks engine using only brand colours.
 * Three tiers: spark (subtle corner), milestone (overlay), enterprise (full-screen).
 *
 * Colour distribution: 60% Purple, 20% Fuchsia, 15% Aqua, 5% Macaron
 * Particle counts: Tier 1 (8–12), Tier 2 (20–30), Tier 3 (max 40)
 * Timing: Burst 200ms, Arc 600–800ms, Fade 400ms
 */

import { brand } from '@/styles/brand';

export type CelebrationTier = 'spark' | 'milestone' | 'enterprise';

export interface CelebrationConfig {
  tier: CelebrationTier;
  message?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaAction?: () => void;
  duration?: number; // ms override
}

// Brand-only particle colors – weighted distribution
// 60% Purple, 20% Fuchsia, 15% Aqua, 5% Macaron
const WEIGHTED_COLORS = [
  brand.purple, brand.purple, brand.purple, brand.purple, brand.purple, brand.purple,
  brand.purple, brand.purple, brand.purple, brand.purple, brand.purple, brand.purple,
  brand.fuchsia, brand.fuchsia, brand.fuchsia, brand.fuchsia,
  brand.aqua, brand.aqua, brand.aqua,
  brand.macaron,
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  gravity: number;
}

const PARTICLE_COUNTS: Record<CelebrationTier, [number, number]> = {
  spark: [8, 12],
  milestone: [20, 30],
  enterprise: [30, 40],
};

/** Default durations per tier */
export const TIER_DURATION: Record<CelebrationTier, number> = {
  spark: 1500,
  milestone: 2000,
  enterprise: 2500,
};

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Lightweight canvas fireworks renderer.
 * Returns a cleanup function.
 */
export function createFireworks(
  canvas: HTMLCanvasElement,
  tier: CelebrationTier,
  durationMs: number,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const particles: Particle[] = [];
  let animId: number;
  let elapsed = 0;
  let lastTime = performance.now();

  const [minCount, maxCount] = PARTICLE_COUNTS[tier];
  const particleCount = Math.floor(randomInRange(minCount, maxCount));

  // Anchor points for Tier 2: 3 burst origins
  function getAnchors(): Array<{ x: number; y: number }> {
    if (tier === 'spark') {
      return [{ x: rect.width * 0.85, y: rect.height * 0.15 }];
    }
    if (tier === 'milestone') {
      return [
        { x: rect.width * 0.3, y: rect.height * 0.35 },
        { x: rect.width * 0.5, y: rect.height * 0.3 },
        { x: rect.width * 0.7, y: rect.height * 0.35 },
      ];
    }
    // enterprise: centre
    return [{ x: rect.width * 0.5, y: rect.height * 0.4 }];
  }

  function spawnBurst() {
    const anchors = getAnchors();
    const countPerAnchor = Math.ceil(particleCount / anchors.length);

    for (const anchor of anchors) {
      for (let i = 0; i < countPerAnchor; i++) {
        const angle = (Math.PI * 2 * i) / countPerAnchor + (Math.random() - 0.5) * 0.5;
        const speed = 1.5 + Math.random() * 3 * (tier === 'enterprise' ? 1.5 : 1);
        particles.push({
          x: anchor.x,
          y: anchor.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: WEIGHTED_COLORS[Math.floor(Math.random() * WEIGHTED_COLORS.length)],
          size: randomInRange(4, 8),
          alpha: randomInRange(0.8, 1),
          decay: 0.008 + Math.random() * 0.012,
          gravity: 0.03 + Math.random() * 0.02,
        });
      }
    }
  }

  spawnBurst();
  if (tier === 'enterprise') {
    setTimeout(spawnBurst, 400);
    setTimeout(spawnBurst, 800);
  }

  function frame(now: number) {
    const dt = Math.min(now - lastTime, 32);
    lastTime = now;
    elapsed += dt;

    ctx!.clearRect(0, 0, rect.width, rect.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx!.globalAlpha = p.alpha;
      ctx!.fillStyle = p.color;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx!.fill();
    }

    ctx!.globalAlpha = 1;

    if (elapsed < durationMs && particles.length > 0) {
      animId = requestAnimationFrame(frame);
    }
  }

  animId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(animId);
    particles.length = 0;
    ctx?.clearRect(0, 0, rect.width, rect.height);
  };
}
