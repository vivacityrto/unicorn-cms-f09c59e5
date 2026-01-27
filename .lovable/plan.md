
# Plan: Fix Edit Button on Risks and Opportunities Page

## Problem
The Edit button on the Risks and Opportunities page is non-functional. It renders as a static button with no click handler, preventing users from editing existing Risk or Opportunity items.

## Root Cause
In `src/pages/EosRisksOpportunities.tsx` at line 336:
```tsx
<Button variant="outline" size="sm">Edit</Button>
```
This button has no `onClick` property and no supporting state or dialog logic to enable editing.

## Solution
Add edit functionality by:
1. Creating state to track which item is being edited
2. Adding a Dialog for the edit form
3. Connecting the Edit button to open the dialog with the selected item
4. Adding a handler to call the existing `updateItem` mutation

---

## Implementation Details

### Step 1: Add State Variables
Add two new state variables to manage the edit dialog:
- `isEditOpen`: boolean to control dialog visibility
- `editingItem`: the item currently being edited (or null)

### Step 2: Add Edit Handler
Create a `handleEdit` function that:
- Receives the item to edit
- Sets the `editingItem` state
- Opens the edit dialog

### Step 3: Add Update Handler
Create a `handleUpdate` function that:
- Takes form data and calls `updateItem.mutateAsync`
- Includes the item ID from `editingItem`
- Closes the dialog on success

### Step 4: Add Edit Dialog
Add a second Dialog component (similar to create dialog) that:
- Uses the same `RiskOpportunityForm` component
- Passes `initialValues` from `editingItem`
- Sets `submitLabel` to "Save Changes"
- Calls `handleUpdate` on submit

### Step 5: Connect Edit Button
Update the Edit button to call `handleEdit(item)` on click.

---

## File Changes

| File | Change |
|------|--------|
| `src/pages/EosRisksOpportunities.tsx` | Add edit state, handlers, dialog, and button onClick |

---

## Code Changes Summary

```text
+-----------------------------------------------+
|  EosRisksOpportunities.tsx                    |
+-----------------------------------------------+
|  + const [isEditOpen, setIsEditOpen]          |
|  + const [editingItem, setEditingItem]        |
|                                               |
|  + handleEdit(item) => opens dialog           |
|  + handleUpdate(formData) => calls updateItem |
|                                               |
|  + <Dialog> for Edit with RiskOpportunityForm |
|                                               |
|  ~ Edit button: onClick={() => handleEdit()}  |
+-----------------------------------------------+
```

---

## Expected Behavior After Fix
1. Click "Edit" button on any Risk or Opportunity item
2. Edit dialog opens with current item data pre-filled
3. Modify fields and click "Save Changes"
4. Item updates in database and UI refreshes
5. Success toast confirms the update

---

## No Changes Required
- `RiskOpportunityForm` already supports `initialValues` and custom `submitLabel`
- `useRisksOpportunities` hook already provides `updateItem` mutation
- Type definitions are complete in `src/types/risksOpportunities.ts`
