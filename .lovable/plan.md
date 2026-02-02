

# Live Meeting Online User Tracking and Auto-Attendance

## Overview

Enhance the EOS live meeting experience to:
1. Display a visual list of who is currently online in the meeting (with user details, not just a count)
2. Automatically add users who join the meeting page as attendees and mark them as "present"

Currently, the system only tracks `online_at` timestamp in presence data and shows "X online" count. Users must be manually added and marked present.

---

## Current State Analysis

### Existing Infrastructure

**Realtime Presence** (`useMeetingRealtime.tsx`):
- Tracks presence via Supabase Realtime channel `meeting:{meetingId}`
- Currently only sends `online_at` timestamp when joining
- Returns `onlineUsers` array (flat list from presence state)
- Has `updatePresence()` function for updating tracked data

**Attendance System** (`useMeetingAttendance.tsx`):
- `addGuest()` - Adds user during live meeting
- `updateAttendance()` - Updates status to attended/late/etc.
- `addAttendee()` - Adds user before meeting starts

**LiveMeetingView** (line 603-606):
- Shows simple `{onlineUsers.length} online` text
- Uses `useMeetingRealtime` hook but doesn't leverage user identity data

**Problem**: 
- Presence only tracks `online_at`, not user identity
- No visual indicator of WHO is online
- No auto-add logic when users join

---

## Implementation Plan

### 1. Enhance Presence Data with User Identity

Update `useMeetingRealtime.tsx` to include user identity in the presence payload:

```typescript
// When tracking presence, include user details
await meetingChannel.track({
  user_id: userId,
  name: userName,
  avatar_initials: initials,
  online_at: new Date().toISOString(),
});
```

Add new props to the hook:
- `userId` - Current user's UUID
- `userName` - Display name
- `avatarInitials` - For avatar display

### 2. Create OnlineUsersIndicator Component

New component to show who is currently online:

**Features**:
- Popover triggered by clicking the "X online" badge
- Shows list of online users with avatars and names
- Green dot indicator for online status
- Optionally highlight if user is already an attendee

```
┌──────────────────────────────┐
│  Online Now (3)              │
├──────────────────────────────┤
│  [AJ] Andrew Jones    ✓      │
│  [SK] Sarah Kim       ✓      │
│  [TB] Tom Brown       ●      │  <- Not yet an attendee
└──────────────────────────────┘
```

### 3. Auto-Add Online Users as Attendees

Implement logic in `LiveMeetingView` to automatically:
1. Detect when a user joins the meeting page
2. Check if they're already in the attendees list
3. If not, auto-add them as a guest (during live meeting) or attendee (before start)
4. Mark them as "attended" (present)

**Logic Flow**:
```
User opens meeting page
    ↓
useMeetingRealtime tracks presence
    ↓
useEffect monitors onlineUsers changes
    ↓
For current user (profile.user_uuid):
  - If not in attendees list → addGuest()
  - If in attendees but not "attended" → updateAttendance()
```

### 4. Update AttendancePanel with Online Indicators

Enhance the AttendancePanel to show which attendees are currently online:
- Green dot next to online users
- Sort online users to top of list (optional)
- Indicate when user joined (joined_at timestamp)

---

## Technical Implementation

### File Changes

| File | Action | Changes |
|------|--------|---------|
| `src/hooks/useMeetingRealtime.tsx` | Modify | Accept user identity props, include in presence tracking |
| `src/components/eos/OnlineUsersIndicator.tsx` | Create | New popover component showing online users |
| `src/components/eos/LiveMeetingView.tsx` | Modify | Use enhanced realtime hook, add auto-attendance logic, add OnlineUsersIndicator |
| `src/components/eos/AttendancePanel.tsx` | Modify | Add online status indicators, accept onlineUsers prop |
| `src/hooks/useMeetingAttendance.tsx` | Modify | Add silent mutation for auto-attendance (no toast) |

---

### Detailed Changes

#### 1. useMeetingRealtime.tsx

Add user identity to presence:

```typescript
interface UseRealtimeOptions {
  meetingId: string;
  userId?: string;        // NEW
  userName?: string;      // NEW
  avatarUrl?: string;     // NEW
  onSegmentChange?: (payload: any) => void;
  onHeadlineChange?: (payload: any) => void;
  onTodoChange?: (payload: any) => void;
  onPresenceChange?: (payload: any) => void;
}

// In track() call:
await meetingChannel.track({
  user_id: userId,
  name: userName,
  avatar_url: avatarUrl,
  online_at: new Date().toISOString(),
});
```

Add typed interface for online user:

```typescript
export interface OnlineUser {
  user_id: string;
  name: string;
  avatar_url?: string;
  online_at: string;
}
```

#### 2. OnlineUsersIndicator Component

```typescript
interface OnlineUsersIndicatorProps {
  onlineUsers: OnlineUser[];
  attendees?: MeetingAttendee[];
}

// Popover showing online users with:
// - Avatar with initials
// - User name
// - Checkmark if they're in attendees list
// - "Present" badge if marked attended
```

#### 3. LiveMeetingView Auto-Attendance

```typescript
// Get user name for presence
const userName = profile 
  ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
  : 'Unknown';

// Enhanced realtime hook
const { onlineUsers, updatePresence } = useMeetingRealtime({
  meetingId: meetingId!,
  userId: profile?.user_uuid,
  userName,
  avatarUrl: profile?.avatar_url,
  onSegmentChange: () => { /* ... */ },
});

// Auto-add current user as attendee when they join
useEffect(() => {
  if (!profile?.user_uuid || !meetingId || !attendees) return;
  
  const isAttendee = attendees.some(a => a.user_id === profile.user_uuid);
  const isPresent = attendees.some(
    a => a.user_id === profile.user_uuid && 
    (a.attendance_status === 'attended' || a.attendance_status === 'late')
  );
  
  // Auto-add and mark present
  if (!isAttendee && meetingStarted) {
    addGuestSilent.mutate({ userId: profile.user_uuid });
  } else if (isAttendee && !isPresent && meetingStarted) {
    updateAttendanceSilent.mutate({ 
      userId: profile.user_uuid, 
      status: 'attended' 
    });
  }
}, [profile?.user_uuid, attendees, meetingStarted]);
```

#### 4. AttendancePanel Online Indicators

Add `onlineUsers` prop and show green dots:

```typescript
interface AttendancePanelProps {
  meetingId: string;
  meetingType: string;
  meetingStatus?: string;
  isLive?: boolean;
  canEdit?: boolean;
  onlineUsers?: OnlineUser[];  // NEW
}

// In attendee row, add online indicator:
{isOnline(attendee.user_id) && (
  <span className="w-2 h-2 rounded-full bg-green-500" title="Online" />
)}
```

---

## Security Considerations

1. **Presence data is scoped to meeting channel** - Only users with access to the meeting can see presence
2. **Auto-add uses existing RLS** - `add_meeting_guest` RPC already validates permissions
3. **No sensitive data in presence** - Only user_id, name, avatar (already public in UI)

---

## Expected Outcome

After implementation:

1. **Header shows clickable online indicator** - "3 online" badge opens popover with user list
2. **Online users shown with identity** - Avatars, names, and status visible
3. **Users auto-added when joining** - Opening the live meeting page adds you as an attendee
4. **Auto-marked as present** - Your attendance status updates to "attended" automatically
5. **Attendance panel shows online status** - Green dots indicate who is currently viewing the meeting

---

## Files to Create/Modify Summary

| File | Purpose |
|------|---------|
| `src/hooks/useMeetingRealtime.tsx` | Enhanced with user identity in presence |
| `src/components/eos/OnlineUsersIndicator.tsx` | New popover showing online users |
| `src/components/eos/LiveMeetingView.tsx` | Auto-attendance logic + UI updates |
| `src/components/eos/AttendancePanel.tsx` | Online status indicators |
| `src/hooks/useMeetingAttendance.tsx` | Silent mutations for auto-attendance |

