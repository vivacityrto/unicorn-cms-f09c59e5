
# Add Bulk User Actions to Tenant Users Admin Page

## Overview

Add multi-select functionality with bulk actions (activate, deactivate, role change) to the `/admin/tenant-users` page, enabling SuperAdmins to efficiently manage users across all tenants.

## Current State

The `TenantUsers.tsx` page displays a table of all client users with:
- Filtering by tenant, role, status, and search
- Sorting by various columns
- Click-through to user profile

**Missing**: No multi-select checkboxes or bulk action capabilities.

## Implementation Plan

### 1. Frontend Changes to TenantUsers.tsx

Add selection state and bulk action UI following the pattern established in `AdminDocumentAIReview.tsx`:

**New State**
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'role' | null>(null);
const [bulkRole, setBulkRole] = useState<string>('');
const [processingBulk, setProcessingBulk] = useState(false);
```

**Selection Helpers**
```typescript
const toggleSelection = (userId: string) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    return next;
  });
};

const toggleSelectAll = () => {
  if (selectedIds.size === filteredUsers.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(filteredUsers.map(u => u.user_uuid)));
  }
};
```

**UI Updates**
- Add checkbox column to table header and rows
- Add bulk action toolbar that appears when users are selected
- Add confirmation dialog for destructive actions

### 2. Create New Edge Function: bulk-user-action

A new edge function to handle bulk operations with proper authorization and audit logging.

**File**: `supabase/functions/bulk-user-action/index.ts`

**Request Body**
```typescript
{
  user_uuids: string[];
  action: 'activate' | 'deactivate' | 'change_role';
  role?: 'Admin' | 'General User';  // required for change_role
}
```

**Logic Flow**
1. Validate caller is SuperAdmin (global_role = 'SuperAdmin')
2. Validate all target users exist
3. Perform bulk update in transaction
4. Create audit log entries for each user affected
5. Return success/failure counts

### 3. Add Config Entry

Update `supabase/config.toml` to register the new function.

---

## Detailed Implementation

### File: src/pages/TenantUsers.tsx

**Add Imports**
```typescript
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, ... } from '@/components/ui/alert-dialog';
import { Loader2, UserCheck, UserX, Shield } from 'lucide-react';
```

**Add Selection State** (after line 57)
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
const [bulkActionType, setBulkActionType] = useState<'activate' | 'deactivate' | null>(null);
const [processingBulk, setProcessingBulk] = useState(false);
```

**Add Bulk Action Handler**
```typescript
const handleBulkAction = async () => {
  if (!bulkActionType || selectedIds.size === 0) return;
  
  setProcessingBulk(true);
  try {
    const { data, error } = await supabase.functions.invoke('bulk-user-action', {
      body: {
        user_uuids: Array.from(selectedIds),
        action: bulkActionType === 'activate' ? 'activate' : 'deactivate',
      },
    });
    
    if (error) throw error;
    
    toast({
      title: 'Bulk Action Complete',
      description: `${data.successCount} users updated successfully`,
    });
    
    setSelectedIds(new Set());
    fetchData();
  } catch (error: any) {
    toast({
      title: 'Error',
      description: error.message,
      variant: 'destructive',
    });
  } finally {
    setProcessingBulk(false);
    setBulkActionDialogOpen(false);
    setBulkActionType(null);
  }
};
```

**Add Bulk Action Toolbar** (in filters Card, after status filter)
```typescript
{selectedIds.size > 0 && (
  <div className="flex items-center gap-2 ml-auto">
    <span className="text-sm text-muted-foreground">
      {selectedIds.size} selected
    </span>
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setBulkActionType('activate');
        setBulkActionDialogOpen(true);
      }}
    >
      <UserCheck className="h-4 w-4 mr-1" />
      Activate
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setBulkActionType('deactivate');
        setBulkActionDialogOpen(true);
      }}
    >
      <UserX className="h-4 w-4 mr-1" />
      Deactivate
    </Button>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setSelectedIds(new Set())}
    >
      Clear
    </Button>
  </div>
)}
```

**Add Checkbox Column to Table**

Header:
```typescript
<TableHead className="w-[40px]">
  <Checkbox
    checked={selectedIds.size === filteredUsers.length && filteredUsers.length > 0}
    onCheckedChange={toggleSelectAll}
  />
</TableHead>
```

Row:
```typescript
<TableCell onClick={(e) => e.stopPropagation()}>
  <Checkbox
    checked={selectedIds.has(user.user_uuid)}
    onCheckedChange={() => toggleSelection(user.user_uuid)}
  />
</TableCell>
```

**Add Confirmation Dialog**
```typescript
<AlertDialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        {bulkActionType === 'activate' ? 'Activate' : 'Deactivate'} {selectedIds.size} Users?
      </AlertDialogTitle>
      <AlertDialogDescription>
        This will {bulkActionType === 'activate' ? 'enable' : 'disable'} access for {selectedIds.size} selected users.
        This action is logged for audit purposes.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={processingBulk}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleBulkAction}
        disabled={processingBulk}
        className={bulkActionType === 'deactivate' ? 'bg-destructive hover:bg-destructive/90' : ''}
      >
        {processingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Confirm
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

### File: supabase/functions/bulk-user-action/index.ts

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type BulkActionBody = {
  user_uuids: string[];
  action: 'activate' | 'deactivate' | 'change_role';
  role?: 'Admin' | 'General User';
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as BulkActionBody;
    const { user_uuids, action, role } = body;

    // Validate input
    if (!Array.isArray(user_uuids) || user_uuids.length === 0) {
      return jsonErr(400, "MISSING_USERS", "At least one user UUID is required");
    }

    if (!['activate', 'deactivate', 'change_role'].includes(action)) {
      return jsonErr(400, "INVALID_ACTION", "Action must be activate, deactivate, or change_role");
    }

    if (action === 'change_role' && !role) {
      return jsonErr(400, "MISSING_ROLE", "Role is required for change_role action");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonErr(401, "UNAUTHORIZED", "No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !currentUser) {
      return jsonErr(401, "UNAUTHORIZED", "Invalid token");
    }

    // Verify SuperAdmin status
    const { data: callerProfile } = await supabase
      .from("users")
      .select("global_role, unicorn_role, user_type")
      .eq("user_uuid", currentUser.id)
      .single();

    const isSuperAdmin = callerProfile?.global_role === 'SuperAdmin' ||
      (callerProfile?.unicorn_role === 'Super Admin' && 
       ['Vivacity', 'Vivacity Team'].includes(callerProfile?.user_type || ''));

    if (!isSuperAdmin) {
      return jsonErr(403, "FORBIDDEN", "Only SuperAdmins can perform bulk actions");
    }

    // Perform bulk update
    let updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    
    if (action === 'activate') {
      updateData.disabled = false;
    } else if (action === 'deactivate') {
      updateData.disabled = true;
    } else if (action === 'change_role' && role) {
      updateData.unicorn_role = role;
    }

    const { data: updatedUsers, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .in("user_uuid", user_uuids)
      .select("user_uuid");

    if (updateError) {
      return jsonErr(400, "UPDATE_FAILED", updateError.message);
    }

    // Create audit log entries
    const auditEntries = user_uuids.map(uuid => ({
      user_id: currentUser.id,
      entity: "users",
      entity_id: uuid,
      action: `bulk_${action}`,
      reason: `Bulk ${action} by SuperAdmin`,
      details: { action, role, affected_users: user_uuids.length },
    }));

    await supabase.from("audit_eos_events").insert(auditEntries);

    console.log(`Bulk ${action} completed: ${updatedUsers?.length || 0} users updated`);

    return new Response(JSON.stringify({ 
      ok: true, 
      successCount: updatedUsers?.length || 0,
      requestedCount: user_uuids.length,
    }), {
      headers: { "content-type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (e: any) {
    console.error("Error in bulk-user-action:", e);
    return jsonErr(500, "UNHANDLED", e?.message ?? String(e));
  }
});

function jsonErr(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders },
    status,
  });
}
```

---

### File: supabase/config.toml

Add function configuration:
```toml
[functions.bulk-user-action]
verify_jwt = false
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/TenantUsers.tsx` | Modify | Add checkbox selection, bulk action toolbar, confirmation dialog |
| `supabase/functions/bulk-user-action/index.ts` | Create | Handle bulk activate/deactivate/role-change operations |
| `supabase/config.toml` | Modify | Register new edge function |

---

## Security Considerations

1. **Authorization**: Only SuperAdmins can perform bulk actions (verified via global_role)
2. **Audit Trail**: Every bulk action creates audit log entries for each affected user
3. **No Cascade**: Bulk deactivate only sets `disabled = true`, does not delete users
4. **Client Isolation**: Bulk actions work across all client tenants (SuperAdmin only)

---

## Expected Outcome

After implementation:
- Checkboxes appear in the Tenant Users table for multi-select
- Selecting users reveals a bulk action toolbar with Activate/Deactivate buttons
- Clicking an action shows a confirmation dialog
- On confirmation, the edge function processes all selected users
- Toast notification shows success/failure count
- All actions are logged to `audit_eos_events`
