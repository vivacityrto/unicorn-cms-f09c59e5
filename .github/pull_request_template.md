# Pull Request

## Description

<!-- Brief description of changes -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] UI/UX improvement
- [ ] Refactoring
- [ ] Documentation
- [ ] Other: ___________

## Related Issues

<!-- Link to related issues, e.g., Fixes #123 -->

---

## UI Definition of Done

> **Required for all UI changes.** See [docs/ui-definition-of-done.md](../docs/ui-definition-of-done.md) for details.

### Responsive Layout (Required)

- [ ] Tested at **320px** width
- [ ] Tested at **375px** width  
- [ ] Tested at **768px** width
- [ ] Tested at **1024px** width
- [ ] Tested at **1280px** width
- [ ] **No page-level horizontal scroll** at any breakpoint
- [ ] Ran QA Harness at `/admin/qa/responsive`

### Modal/Drawer Changes (If applicable)

- [ ] Uses unified modal system (`AppModal`, `FormModal`, `ConfirmDialog`, `AppDrawer`)
- [ ] Focus is trapped inside modal
- [ ] ESC key closes modal
- [ ] Body scrolls, header/footer are sticky
- [ ] Tested on mobile viewport

### Table/List Changes (If applicable)

- [ ] Uses `ResponsiveTableShell` wrapper
- [ ] Has mobile card fallback (`ResponsiveListCards`)
- [ ] Column visibility classes applied (`columnVisibility.lg`, etc.)
- [ ] Long text doesn't break layout

### Accessibility (Required for UI changes)

- [ ] Form inputs have labels
- [ ] Interactive elements have visible focus states
- [ ] Tab order is logical

### Data Edge Cases (Required)

- [ ] Tested with long names/emails
- [ ] Empty states render cleanly
- [ ] Loading states use consistent skeletons

---

## Screenshots

<!-- Add before/after screenshots for UI changes -->

| Before | After |
|--------|-------|
| | |

## Additional Notes

<!-- Any additional context or notes for reviewers -->

---

## Reviewer Checklist

- [ ] Code follows project conventions
- [ ] UI changes pass Definition of Done
- [ ] No console errors or warnings
- [ ] Tested at mobile and desktop widths
