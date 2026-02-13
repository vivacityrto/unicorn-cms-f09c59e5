/**
 * Celebration System – Unicorn 2.0
 *
 * Canvas-based fireworks engine using only brand colours.
 * Three tiers: spark (subtle corner), milestone (overlay), enterprise (full-screen).
 *
 * Usage:
 *   import { useCelebration } from '@/hooks/use-celebration';
 *   const { celebrate } = useCelebration();
 *   celebrate({ tier: 'spark', message: 'Section Complete.' });
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

// Brand-only particle colors
const PARTICLE_COLORS = [brand.purple, brand.fuchsia, brand.aqua, brand.macaron];

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

  const particleCount = tier === 'spark' ? 30 : tier === 'milestone' ? 80 : 150;

  // Spawn origin based on tier
  function spawnBurst() {
    const originX =
      tier === 'spark'
        ? rect.width * 0.85 // corner
        : rect.width * 0.5;
    const originY =
      tier === 'spark'
        ? rect.height * 0.15
        : rect.height * 0.4;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 3 * (tier === 'enterprise' ? 1.5 : 1);
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        size: 2 + Math.random() * 3,
        alpha: 1,
        decay: 0.008 + Math.random() * 0.012,
        gravity: 0.03 + Math.random() * 0.02,
      });
    }
  }

  spawnBurst();
  if (tier === 'enterprise') {
    setTimeout(spawnBurst, 400);
    setTimeout(spawnBurst, 800);
  }

  function frame(now: number) {
    const dt = Math.min(now - lastTime, 32); // cap at ~30fps min
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

/** Default durations per tier */
export const TIER_DURATION: Record<CelebrationTier, number> = {
  spark: 1500,
  milestone: 2000,
  enterprise: 3000,
};
