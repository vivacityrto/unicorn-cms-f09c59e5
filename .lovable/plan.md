

## Fix: Persist segment notes and cascading messages in EOS L10 meetings

### Problem
Three `<Textarea>` fields in `LiveMeetingView` write to local React state only and are never saved to the database:
1. **Segue notes** (segue segment) — writes to `segmentNotes[segment.id]` state
2. **General segment notes** (default case) — same local state
3. **Cascading Messages** (conclude segment) — no state binding at all

On page refresh or dialog close, all content is lost.

### No migration required
- `eos_meeting_segments.notes` (text, nullable) already exists — use for segment notes
- `eos_meetings.notes` (text, nullable) already exists — use for cascading messages

### Changes

#### 1. `src/hooks/useEosMeetingSegments.tsx` — add `updateSegmentNotes` mutation
Add a new mutation that updates the `notes` column on `eos_meeting_segments`:
```typescript
const updateSegmentNotes = useMutation({
  mutationFn: async ({ segmentId, notes }: { segmentId: string; notes: string }) => {
    const { error } = await supabase
      .from('eos_meeting_segments')
      .update({ notes })
      .eq('id', segmentId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
  },
});
```
Return it from the hook.

#### 2. `src/components/eos/LiveMeetingView.tsx` — wire up persistence

**a) Add cascading messages state + hydration:**
- New state: `const [cascadingMessages, setCascadingMessages] = useState('')`
- Hydrate from `meeting?.notes` via `useEffect`
- Initialize `segmentNotes` from `segments` data on load (populate from `segment.notes` for each segment)

**b) Add save-on-blur handler for segment notes:**
```typescript
const handleSegmentNoteBlur = (segmentId: string) => {
  const note = segmentNotes[segmentId];
  if (note !== undefined) {
    updateSegmentNotes.mutate({ segmentId, notes: note });
  }
};
```

**c) Add save-on-blur for cascading messages:**
Save to `eos_meetings.notes` via a new inline mutation or direct supabase update:
```typescript
const saveCascadingMessages = async (value: string) => {
  await supabase.from('eos_meetings').update({ notes: value }).eq('id', meetingId!);
};
```

**d) Bind `onBlur` to all three textarea locations:**
- Segue textarea: add `onBlur={() => handleSegmentNoteBlur(segment.id)}`
- Default/general textarea: add `onBlur={() => handleSegmentNoteBlur(segment.id)}`
- Cascading Messages textarea: bind `value={cascadingMessages}`, `onChange`, and `onBlur={saveCascadingMessages}`

**e) Hydration `useEffect`s:**
- Populate `segmentNotes` from fetched `segments` data (only set keys not already dirty)
- Populate `cascadingMessages` from `meeting?.notes`

### Files touched
| File | Change |
|------|--------|
| `src/hooks/useEosMeetingSegments.tsx` | Add `updateSegmentNotes` mutation, return it |
| `src/components/eos/LiveMeetingView.tsx` | Add cascading state, hydration effects, onBlur save handlers on all 3 textareas |

### What is NOT changed
- IDS dialog (already fixed)
- TodoInlineForm (already fixed)
- Meeting close logic (already fixed)
- No new DB columns or migrations

