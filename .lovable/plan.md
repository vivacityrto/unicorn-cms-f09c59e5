# Plan: AcademyLayout PDP Navigation Updates

## Goal
Update the Academy sidebar navigation to add the "My PDP" entry and resolve the duplicate ClipboardList icon by changing Administration Assistant to Briefcase.

## Changes

### 1. Insert "My PDP" into `academyMainItems`
In `src/components/layout/AcademyLayout.tsx`, insert a new entry into the `academyMainItems` array between "My Courses" and "Certificates":

```ts
{ icon: ClipboardList, label: "My PDP", path: "/academy/pdp" }
```

`ClipboardList` is already imported from `lucide-react` in the file.

### 2. Change Administration Assistant icon to Briefcase
In `src/components/layout/AcademyLayout.tsx`, update the `Administration Assistant` entry in `academyPathwaysItems` (line 37):

- Replace `ClipboardList` with `Briefcase`
- Import `Briefcase` from `lucide-react` (add to the existing import block if not present)

## Scope
- Only `src/components/layout/AcademyLayout.tsx` will be modified.
- No sidebar component files, no other navigation files, and no business logic changes.
