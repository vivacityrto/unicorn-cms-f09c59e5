## Plan: In-Meeting Rock Editing (Rock Review Segment)

### Scope
Single-file change in `src/components/eos/LiveMeetingView.tsx` only. No other components, hooks, or database changes.

### Changes

1. **Import**
   - Add `import { RockFormDialog } from '@/components/eos/RockFormDialog';`

2. **State**
   - Add `const [editingRock, setEditingRock] = useState<any>(null);`
   - Add `const [rockFormOpen, setRockFormOpen] = useState(false);`
   - Place near the other dialog state variables (around line 55).

3. **Rock card edit button**
   - In the `case 'rocks'` section of `renderSegmentContent`, inside the `currentQuarterRocks.map` rock card.
   - Place a small edit button alongside `RockProgressControl` at the bottom of each card.
   - Use `Pencil` icon from `lucide-react`.
   - Button: `size="sm"`, `variant="ghost"`.
   - On click: `setEditingRock(rock); setRockFormOpen(true);`.
   - No facilitator gate — any participant can use it.

4. **Dialog placement**
   - At the bottom of the component where other dialogs (`IDSDialog`, `CreateIssueDialog`, etc.) are rendered, add:
     ```tsx
     <RockFormDialog
       open={rockFormOpen}
       onOpenChange={(open) => { setRockFormOpen(open); if (!open) setEditingRock(null); }}
       rock={editingRock}
     />
     ```

### Preserved Behaviour
- Rock filtering logic (current quarter, company + team only, not complete) stays untouched.
- `RockProgressControl` on each card continues to work.
- Agenda sidebar, segment navigation, IDS queue, and all other meeting segments are unaffected.
- `RockFormDialog` component itself is not modified.