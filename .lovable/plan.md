## Plan: MyExitInterview.tsx Layout Simplification

### Scope
A single-file, no-logic change to `src/pages/MyExitInterview.tsx`.

### Changes
1. Remove `import { DashboardLayout } from "@/components/DashboardLayout";`
2. Remove the `<DashboardLayout>` wrapper (lines 142 and 181).
3. Replace it with:
   ```tsx
   <div className="min-h-screen bg-background">
     <div className="p-6 max-w-3xl mx-auto space-y-6">
       {/* existing content unchanged */}
     </div>
   </div>
   ```
4. Insert a header block directly above the existing title `<div className="space-y-1">`:
   ```tsx
   <div className="flex items-center gap-3 mb-8">
     <span className="text-sm text-muted-foreground">Vivacity Coaching & Consulting</span>
   </div>
   ```
   (Logo path not found in `public/lovable-uploads/`, so the text fallback is used as instructed.)

### What is NOT changing
- Any form logic, data fetching, mutations, or child components (`FormView`, `ReadOnlyView`).
- The `exitInterviewSchema` import or contents.
- Any styling or behaviour inside the inner content area.