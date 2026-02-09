/**
 * Vivacity Brand Tokens
 * Central source of truth for brand colors used across the platform.
 * These map to the CSS variables defined in index.css.
 *
 * Usage: Import for JS-level logic (e.g. chart colours, inline styles).
 * For Tailwind, use the semantic classes: text-brand-purple, bg-brand-light-purple, etc.
 */

export const brand = {
  cyan: "#23c0dd",
  cyanLight: "#A6F1FF",
  acai: "#44235F",
  purple: "#7130A0",
  purpleLight: "#DFD8E8",
  fuchsia: "#ed1878",
  macaron: "#f9cb0c",
  gradient: "linear-gradient(90deg, #7130A0 0%, #ed1878 100%)",
} as const;

export type BrandColor = keyof typeof brand;
