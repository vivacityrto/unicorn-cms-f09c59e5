/**
 * Vivacity Brand Tokens – Unicorn 2.0 Design System
 * Central source of truth for brand colors used across the platform.
 * These map to the CSS variables defined in index.css.
 *
 * Usage: Import for JS-level logic (e.g. chart colours, inline styles).
 * For Tailwind, use the semantic classes: text-brand-purple, bg-brand-acai, etc.
 *
 * ROLE MAPPING:
 * - Primary action:     Purple #7130A0  – Buttons, active states
 * - Structural base:    Acai   #44235F  – Headers, navigation, strong anchors
 * - Surface tint:       Light Purple #DFD8E8 – Background panels
 * - Accent highlight:   Fuchsia #ED1878 – Important actions only (not default primary)
 * - Warning:            Macaron #F9CB0C – Incomplete, pending (never decorative)
 * - Info:               Aqua   #23C0DD  – Guidance, system messages
 *
 * CHART COLORS (strict order):
 * - Primary trend:      Purple
 * - Secondary compare:  Aqua
 * - Warning marker:     Macaron
 * - Risk marker:        Fuchsia
 */

export const brand = {
  purple: "#7130A0",
  acai: "#44235F",
  lightPurple: "#DFD8E8",
  fuchsia: "#ED1878",
  macaron: "#F9CB0C",
  aqua: "#23C0DD",
  gradient: "linear-gradient(90deg, #7130A0 0%, #ED1878 100%)",
} as const;

/** Chart-safe ordered palette – use in recharts, chart.js, etc. */
export const chartPalette = [
  brand.purple,   // Primary trend
  brand.aqua,     // Secondary comparison
  brand.macaron,  // Warning markers
  brand.fuchsia,  // Risk markers
  brand.acai,     // Tertiary
  brand.lightPurple, // Background fill
] as const;

/** Semantic compliance state colours for JS usage */
export const complianceColors = {
  compliant: brand.purple,
  review: brand.macaron,
  risk: brand.fuchsia,
  info: brand.aqua,
  draft: brand.lightPurple,
} as const;

export type BrandColor = keyof typeof brand;
