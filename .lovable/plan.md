Fix the final breadcrumb segment on five Academy sub-pages by adding their routes to the title map in `TopBar.tsx`.

### What to change
- File: `src/components/layout/TopBar.tsx`
- Add 5 missing entries to the `routeTitles` record (line ~40):

```
"/superadmin/academy/certificates": "Certificates",
"/superadmin/academy/enrolments": "Enrolments",
"/superadmin/academy/tenant-access": "Tenant Access",
"/superadmin/academy/builder": "Academy Builder",
"/superadmin/academy/package-course": "Package → Course Mapping",
```

### How it works
`TopBar.tsx` builds breadcrumbs from `routeTitles` and falls back to capitalising the URL segment when a route is missing. Because the `/superadmin/academy/*` routes are absent, the final crumb currently renders as "Page" (the capitalised last segment). Adding the entries lets the breadcrumb generator pick the correct label.

No other files need to change.
