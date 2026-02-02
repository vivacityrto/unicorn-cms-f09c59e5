

# Fix IDS Workflow: Auto-Transition Through Discussing to Solved

## Problem

The IDS dialog allows users to navigate to the "Solve" tab and click "Mark as Solved" even when the issue is still "Open". The status transition rules require:
- Open → Discussing → Solved

But the current `handleSolve` function only attempts Open → Solved, which fails.

## Solution

Modify the `handleSolve` function to perform a **sequential status transition** when needed:
1. If current status is "Open", first transition to "Discussing"
2. Then transition to "Solved"

This respects the defined status workflow while providing a smooth user experience.

---

## Implementation Details

### File: src/components/eos/IDSDialog.tsx

Update the `handleSolve` function to check the current status and perform intermediate transitions if needed:

```typescript
const handleSolve = async () => {
  if (!solution.trim()) {
    toast({ title: 'Please enter a solution', variant: 'destructive' });
    return;
  }

  try {
    const currentStatus = issue?.status || 'Open';
    
    // If status is Open, we need to transition through Discussing first
    if (currentStatus === 'Open') {
      await setStatus.mutateAsync({ 
        status: 'Discussing', 
        autoAdvanceTab: false 
      });
    }
    
    // Now transition to Solved (from Discussing or Actioning)
    await setStatus.mutateAsync({ 
      status: 'Solved', 
      solutionText: solution 
    });
    
    if (todos.length > 0) {
      await createTodos.mutateAsync();
    }

    onOpenChange(false);
  } catch (error) {
    // Error already handled by mutation onError
  }
};
```

### Additional Improvement: Show Status Context

Add a status indicator in the dialog footer so users understand the current state:

```typescript
{isFacilitator && activeTab === 'solve' && (
  <DialogFooter className="flex items-center justify-between">
    <div className="text-sm text-muted-foreground">
      Current status: <Badge variant="outline">{issue.status}</Badge>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        onClick={handleSolve}
        disabled={!solution.trim() || setStatus.isPending || createTodos.isPending}
      >
        {setStatus.isPending ? 'Processing...' : 'Mark as Solved'}
      </Button>
    </div>
  </DialogFooter>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/eos/IDSDialog.tsx` | Update `handleSolve` to auto-transition through "Discussing" when needed |

---

## Expected Behavior After Fix

1. User opens issue in "Open" status
2. User navigates to "Solve" tab
3. User enters solution and clicks "Mark as Solved"
4. System automatically:
   - Transitions Open → Discussing (silently)
   - Transitions Discussing → Solved (with solution text)
5. Issue is marked as solved without error

---

## Alternative Approach (Simpler)

If sequential transitions feel too complex, an alternative is to **disable the Solve tab** when status is "Open" and require users to click "Start Discussing" first. This enforces the workflow more explicitly:

```typescript
<TabsTrigger 
  value="solve" 
  disabled={issue.status === 'Open'}
  title={issue.status === 'Open' ? 'Start discussion first' : ''}
>
  Solve
</TabsTrigger>
```

Both approaches are valid - the first is more user-friendly (auto-transition), the second is more explicit about the workflow.

