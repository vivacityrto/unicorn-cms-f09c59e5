# Unicorn 2.0 – Design System Reference

## 1. Brand Color System

### Core Palette

| Name | Hex | HSL Token | Role |
|------|-----|-----------|------|
| Purple | `#7130A0` | `--brand-purple-600` | Primary action – buttons, active states |
| Acai | `#44235F` | `--brand-acai-700` | Structural – headers, navigation |
| Light Purple | `#DFD8E8` | `--brand-light-purple-300` | Surface tint – background panels |
| Fuchsia | `#ED1878` | `--brand-fuchsia-600` | Accent – important actions, risk |
| Macaron | `#F9CB0C` | `--brand-macaron-500` | Warning – incomplete, pending |
| Aqua | `#23C0DD` | `--brand-aqua-500` | Info – guidance, system messages |

### Scale System (50–900)

Each brand color has a full 50–900 scale defined as CSS custom properties:
- `--brand-purple-50` through `--brand-purple-900`
- `--brand-acai-50` through `--brand-acai-900`
- `--brand-light-purple-50` through `--brand-light-purple-900`
- `--brand-fuchsia-50` through `--brand-fuchsia-900`
- `--brand-macaron-50` through `--brand-macaron-900`
- `--brand-aqua-50` through `--brand-aqua-900`

### Tailwind Usage

```tsx
// Full scale
<div className="bg-brand-purple-100 text-brand-purple-800" />
<div className="border-brand-macaron-400" />

// Semantic state
<Badge className="bg-state-compliant text-white" />
```

### Rules

- **Fuchsia** is NOT the default primary. Use only for important/risk states.
- **Macaron** is never used for decorative accents. Warning states only.
- **Aqua** is for informational states only.
- **Purple** used once per action zone (one primary button per section).

---

## 2. Semantic Compliance Mapping

| State | Token | Color |
|-------|-------|-------|
| Compliant | `--state-compliant` | Purple 600 |
| Review Required | `--state-review` | Macaron 600 |
| Risk / Error | `--state-risk` | Fuchsia 600 |
| Informational | `--state-info` | Aqua 500 |
| Draft / Neutral | `--state-draft` | Light Purple 400 |

All combinations audited for **WCAG AA 4.5:1** minimum contrast.

---

## 3. Typography System (1.25 Ratio)

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Hero | 46px (`text-4xl`) | 600 | 1.1 |
| Display | 37px (`text-3xl`) | 600 | 1.2 |
| Page title | 30px (`text-2xl`) | 600 | 1.2 |
| Section title | 24px (`text-xl`) | 600 | 1.25 |
| Card title | 18px (`text-lg`) | 600 | 1.4 |
| Body | 15px (`text-base`) | 400 | 1.5 |
| Metadata | 12px (`text-xs`) | 400 | 1.4 |

### Rules

- Acai (`text-secondary`) for major headings.
- Body text uses `text-foreground` (Acai base).
- Never use brand purple for large body text blocks.

---

## 4. Spacing System (4px Grid)

Allowed values: `4, 8, 12, 16, 24, 32, 48, 64`

| Context | Value | Tailwind |
|---------|-------|----------|
| Card padding | 24px | `p-6` |
| Modal padding | 24–32px | `p-6` or `p-8` |
| Section spacing | 32px | `space-y-8` |
| Table row padding | 12–16px | `p-3` / `p-4` |

---

## 5. Button System

| Variant | Background | Text | Hover |
|---------|-----------|------|-------|
| Primary (default) | Purple 600 | White | Purple 700 |
| Secondary/Outline | White + Purple border | Purple 600 | Light Purple 200 |
| Destructive | Fuchsia 600 | White | Fuchsia 700 |
| Warning | Macaron 500 | Acai | Macaron 600 |
| Ghost | Transparent | Foreground | Muted |
| Link | Transparent | Purple | Underline |

### Heights

| Size | Height | Tailwind |
|------|--------|----------|
| Small | 32px | `size="sm"` |
| Default | 40px | `size="default"` |
| Large | 48px | `size="lg"` |

---

## 6. Card System

- **Background:** White (`bg-card`)
- **Surface variant:** `bg-brand-light-purple-50` for grouped sections
- **Shadow:** `shadow-card` (subtle, no heavy blur)
- **Radius:** 12px (`rounded-lg`)
- **Padding:** 24px (`p-6`)

---

## 7. Data Table System

- **Header background:** Acai 50 (`bg-brand-acai-50`)
- **Header text:** Secondary color, semibold, 15px
- **Row hover:** Light Purple 100 (`hover:bg-brand-light-purple-100`)
- **Row padding:** 12–16px
- **Status chips:** Use semantic badge variants only

---

## 8. Modal System

- **Overlay:** Acai at 40% (`bg-secondary/40`)
- **Surface:** White (`bg-background`)
- **Radius:** 16px (`rounded-2xl`)
- **Primary CTA:** Purple button
- **Cancel:** Ghost or Secondary button

---

## 9. Chart Colors

Strict order for all charts (recharts, etc.):

1. **Primary trend:** Purple `#7130A0`
2. **Secondary comparison:** Aqua `#23C0DD`
3. **Warning markers:** Macaron `#F9CB0C`
4. **Risk markers:** Fuchsia `#ED1878`

Import from `src/styles/brand.ts`:
```ts
import { chartPalette } from '@/styles/brand';
```

---

## 10. Dark Mode

- **Surfaces:** Acai 800–900
- **Primary:** Purple 500–600 (adjusted for contrast)
- **Light Purple:** Never used as text in dark mode
- **All colors reference token system**

---

## Accessibility

- All text meets **WCAG AA 4.5:1** contrast minimum
- Interactive elements have visible focus rings (`ring-ring`)
- Touch targets minimum 44px
- Reduced motion support via `prefers-reduced-motion`
