## Fix: Equalize Book consult tile size with sibling QuickAction tiles

Cause: In `QuickActionsRow` (`src/components/client/ClientHomePage.tsx`), tiles with a `to` prop are wrapped in a `<Link>` that has no height styling. The grid stretches the `<Link>` to full row height, but the inner `<Card>` doesn't fill the link, so the Book consult card collapses to its content height while the sibling tiles (rendered as bare `<Card onClick>`) stretch via the grid's default `align: stretch`.

### Change (lines 312–323)

Add `block h-full` to the wrapping `<Link>` and `h-full` to both `<Card>` renderings so all four tiles fill the grid row equally:

```tsx
if (a.to) {
  return (
    <Link key={a.label} to={a.to} className="block h-full">
      <Card className={`${cardCls} h-full`}>{inner}</Card>
    </Link>
  );
}
return (
  <Card key={a.label} onClick={a.onClick} className={`${cardCls} h-full`}>
    {inner}
  </Card>
);
```

### Out of scope
- CSCCard buttons
- Inner padding, icon size, typography