# Print and PDF Export Standards

This document defines the standards for print-friendly and PDF-export-ready content in Unicorn 2.0.

## Quick Reference

| Attribute | Purpose |
|-----------|---------|
| `data-print="hide"` | Element hidden in print |
| `data-print="content"` | Main printable area |
| `data-print="show"` | Force show (e.g., specific headers) |
| `class="no-print"` | Alternative hide method |
| `class="print-only"` | Only visible in print |

---

## Global Print Styles

Print styles are defined in `src/index.css` under `@media print`. These apply automatically to all pages.

### What's Hidden by Default

- Navigation (`nav`, `[role="navigation"]`)
- Sidebars (`aside`, `.sidebar`, `[role="complementary"]`)
- Toasts and notifications
- Fixed/sticky elements (unless marked `data-print="show"`)
- Modal overlays and backdrops
- Buttons (unless marked `data-print="show"`)

### Typography

| Element | Print Size |
|---------|------------|
| Body text | 11pt |
| H1 | 18pt |
| H2 | 14pt |
| H3 | 12pt |
| Table text | 10pt |

---

## Components

### PrintHeader

Evidence-ready header for printed documents:

```tsx
import { PrintHeader } from "@/components/ui/print";

<PrintHeader 
  title="EOS Meeting Minutes" 
  tenantName="Acme Training Pty Ltd"
  packageName="KickStart Package - Phase 2"
  documentRef="MTG-2024-0042"
/>
```

Displays:
- Document title
- Organisation/tenant name
- Package/phase (if provided)
- Export date and time
- Document reference (if provided)

### PrintWrapper

Wraps printable content with optional header:

```tsx
import { PrintWrapper } from "@/components/ui/print";

<PrintWrapper 
  header={{ 
    title: "Compliance Report",
    tenantName: tenant.name,
  }}
>
  <ReportContent />
</PrintWrapper>
```

### PrintButton

Triggers print dialog (hidden in print output):

```tsx
import { PrintButton } from "@/components/ui/print";

<PrintButton>Export as PDF</PrintButton>
```

### PrintStatusBadge

Status badge that prints clearly:

```tsx
import { PrintStatusBadge } from "@/components/ui/print";

<PrintStatusBadge status="success">Completed</PrintStatusBadge>
// Prints as: ✓ Completed
```

### PageBreak

Force page breaks:

```tsx
import { PageBreak } from "@/components/ui/print";

<Section1 />
<PageBreak />
<Section2 />
```

---

## Table Print Behaviour

Tables automatically:
- Repeat headers on each page (`thead { display: table-header-group }`)
- Avoid row breaks across pages
- Remove sticky positioning
- Use 10pt font with visible borders

### Manual Table Optimization

For complex tables, add these classes:

```tsx
<table className="print:text-[10pt]">
  <thead className="print:bg-gray-100">
    <tr>
      <th>Column</th>
    </tr>
  </thead>
  <tbody>
    <tr className="no-page-break">
      <td>Important row that shouldn't break</td>
    </tr>
  </tbody>
</table>
```

---

## Modal/Drawer Printing

**Default behaviour**: Modals are hidden in print.

**To print modal content**:

1. Close modal and print underlying page, OR
2. Create a dedicated print view:

```tsx
// Option 1: Print view route
<Route path="/reports/:id/print" element={<ReportPrintView />} />

// Option 2: Query param trigger
const isPrintMode = searchParams.get('print') === '1';

return isPrintMode ? <PrintView /> : <InteractiveView />;
```

---

## Evidence-Ready Formatting

### Required Elements

All audit/compliance exports must include:

1. **Header block** with:
   - Document title
   - Tenant name
   - Export date/time
   - Document reference (if applicable)

2. **Status indicators** that print as text:
   - ✓ Success/Complete
   - ⚠ Warning
   - ✗ Error/Failed
   - ℹ Info

3. **Links** that show URLs:
   - Automatic for `http://` links
   - Add `data-print="no-url"` to suppress

### Example

```tsx
<PrintWrapper 
  header={{
    title: "Audit Trail Report",
    tenantName: tenant.name,
    documentRef: `AUD-${audit.id}`,
  }}
>
  <Table>
    <TableBody>
      {items.map(item => (
        <TableRow key={item.id} className="no-page-break">
          <TableCell>{item.date}</TableCell>
          <TableCell>{item.action}</TableCell>
          <TableCell>
            <PrintStatusBadge status={item.status}>
              {item.statusLabel}
            </PrintStatusBadge>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</PrintWrapper>
```

---

## Testing Checklist

Before release, verify print on these page types:

### Page Types
- [ ] Long table (50+ rows)
- [ ] Long narrative/text page
- [ ] Mixed layout (cards + tables)
- [ ] Form-heavy page
- [ ] Meeting minutes or report

### Checks
- [ ] No navigation/sidebar visible
- [ ] Headers visible and correct
- [ ] Table headers repeat on new pages
- [ ] No rows cut in half
- [ ] Status badges readable (not color-only)
- [ ] Links show URLs where appropriate
- [ ] Export date/time displayed
- [ ] Tenant name displayed

### Browsers
- [ ] Chrome
- [ ] Edge
- [ ] Firefox (optional)

---

## Page Break Control

### Avoid Breaks

```tsx
// Single element
<div className="no-page-break">
  Important content that shouldn't split
</div>

// Table row
<tr className="no-page-break">...</tr>

// Card
<Card className="no-page-break">...</Card>
```

### Force Breaks

```tsx
<Section1 />
<div className="page-break-after" />
<Section2 />

// Or use component
<PageBreak position="after" />
```

---

## Conditional Rendering

### Print-Only Content

```tsx
<div className="print-only">
  This only appears when printed
</div>
```

### Screen-Only Content

```tsx
<div className="no-print">
  This only appears on screen
</div>

// Or
<div data-print="hide">
  Same effect
</div>
```

---

## Migration Guide

### Before (no print consideration)

```tsx
<div className="p-6">
  <Badge variant="success">Complete</Badge>
  <Table>...</Table>
</div>
```

### After (print-ready)

```tsx
<PrintWrapper 
  header={{ title: "Report", tenantName: tenant.name }}
>
  <PrintStatusBadge status="success">Complete</PrintStatusBadge>
  <Table>
    <TableBody>
      {rows.map(row => (
        <TableRow key={row.id} className="no-page-break">
          ...
        </TableRow>
      ))}
    </TableBody>
  </Table>
</PrintWrapper>
```
