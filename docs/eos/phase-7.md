# Phase 7: Advanced Enhancements (AI, Chat Integrations, Cross-Client)

## Overview

Phase 7 adds advanced functionality to the Unicorn 2.0 EOS system:
- **AI Assistant**: Context-aware suggestions for facilitators
- **Chat Integrations**: Slack and Microsoft Teams notifications
- **Multi-Client Meetings**: Cross-client cascading and visibility controls

## AI Assistant

### Features
- Analyzes scorecard data, issues, rocks, and to-dos
- Provides actionable suggestions during meetings
- Three suggestion types:
  - **Issue**: New issues to add based on patterns
  - **Priority**: Top 3 issues to prioritize for IDS
  - **Todo**: Suggested to-dos with owners and due dates

### Implementation
```typescript
// Generate suggestions
const { generateSuggestions } = useAISuggestions(meetingId, tenantId);
await generateSuggestions.mutate({ meeting_id: meetingId, tenant_id: tenantId });

// Accept a suggestion
await acceptSuggestion.mutate(suggestionId);

// Dismiss a suggestion
await dismissSuggestion.mutate(suggestionId);
```

### UI Component
```tsx
<AISidebar 
  meetingId={meetingId}
  tenantId={tenantId}
  isFacilitator={isFacilitator}
/>
```

### Security & Audit
- All suggestions are stored in `ai_suggestions` table
- Accept/dismiss actions are logged in `audit_eos_events`
- AI never auto-mutates data - always requires human approval
- Input fingerprints track what data was used for each suggestion

## Chat Integrations

### Supported Platforms
1. **Slack**
   - OAuth integration
   - Channel or DM delivery
   - Respects quiet hours

2. **Microsoft Teams**
   - Incoming webhook integration
   - Channel notifications
   - Respects quiet hours

### Notification Events
- Meeting reminders (24h & 10min before)
- Overdue to-dos (D+1)
- Issue assignments (immediate)
- Rock off-track (weekly)
- Missing metrics (T-1d before meeting)
- Meeting summaries (after completion)

### Setup
1. **Admin enables integration**:
   - Navigate to Settings → Integrations
   - Connect Slack or Teams via OAuth
   - Configure default channel

2. **Users set preferences**:
   - Navigate to Settings → Integrations
   - Choose channel or DM preference
   - Test notification

### Implementation
```typescript
// Send notification
await supabase.functions.invoke('notify-chat', {
  body: {
    event_type: 'meeting_reminder_24h',
    tenant_id: tenantId,
    user_id: userId,
    payload: { meeting_title: 'Weekly L10' }
  }
});
```

### Quiet Hours
Users can set quiet hours in notification preferences to suppress notifications during specific times (e.g., 22:00-07:00).

## Multi-Client Meetings

### Features
- Single meeting can span multiple clients (Vivacity internal use)
- Items can be tagged to multiple clients
- Clients see only their tagged items in their portal
- Facilitators see all items with client filters

### Database Design
```sql
-- Flag meeting as multi-client
UPDATE eos_meetings SET is_multi_client = true WHERE id = meeting_id;

-- Tag items to multiple clients
INSERT INTO eos_item_clients (tenant_id, item_type, item_id, client_id)
VALUES (tenant_id, 'issue', issue_id, client_id);
```

### Cascading Items
```typescript
// Cascade item to multiple clients
const { data: newItemIds } = await supabase.rpc('cascade_items', {
  p_target_client_ids: [clientId1, clientId2],
  p_source_item_id: sourceItemId,
  p_item_type: 'issue'
});
```

### UI Components
```tsx
// Multi-client selector
<MultiClientSelector
  clients={availableClients}
  selectedClientIds={selectedClientIds}
  onChange={setSelectedClientIds}
/>
```

### Security
- Client viewers can only see items tagged to their `client_id`
- RLS policies enforce strict client isolation
- Multi-client meetings require admin/facilitator role
- All cascades are audited

## Database Tables

### ai_suggestions
```sql
CREATE TABLE public.ai_suggestions (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  meeting_id UUID REFERENCES eos_meetings,
  scope TEXT CHECK (scope IN ('pre_meeting', 'in_meeting')),
  suggestion_type TEXT CHECK (suggestion_type IN ('issue', 'priority', 'todo')),
  payload JSONB NOT NULL,
  inputs_fingerprint TEXT,
  status TEXT CHECK (status IN ('shown', 'accepted', 'dismissed')),
  acted_entity_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### integration_slack & integration_teams
```sql
CREATE TABLE public.integration_slack (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  oauth_token TEXT NOT NULL,
  bot_user_id TEXT,
  default_channel TEXT,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### user_integration_prefs
```sql
CREATE TABLE public.user_integration_prefs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id BIGINT NOT NULL,
  slack_channel TEXT,
  teams_channel TEXT,
  wants_dm BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);
```

### eos_item_clients
```sql
CREATE TABLE public.eos_item_clients (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  item_type TEXT CHECK (item_type IN ('issue', 'headline', 'rock', 'todo')),
  item_id UUID NOT NULL,
  client_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, item_type, client_id)
);
```

## API Functions

### accept_ai_suggestion(suggestion_id)
Accepts an AI suggestion and creates the corresponding entity (issue or to-do).

### cascade_items(target_client_ids[], source_item_id, item_type)
Cascades an item to multiple clients by creating copies tagged to each client.

## Edge Functions

### ai-generate-suggestions
- Fetches meeting context data
- Calls Lovable AI API
- Returns structured suggestions
- Never writes to database directly

### notify-chat
- Checks user preferences and quiet hours
- Sends notifications to Slack/Teams
- Queues in-app notifications
- Handles retries and failures

## Security Notes

1. **AI Assistant**:
   - Only facilitators can see/use AI suggestions
   - All actions require explicit user approval
   - Complete audit trail maintained

2. **Chat Integrations**:
   - OAuth tokens encrypted at rest
   - Webhook URLs validated
   - Respects user preferences and quiet hours

3. **Multi-Client**:
   - Client viewers NEVER see other clients' data
   - RLS policies enforce strict isolation
   - Only admins can cascade items
   - All cascades logged in audit

## Testing

### AI Suggestions
1. Generate suggestions for a meeting
2. Accept a suggestion → verify entity created
3. Dismiss a suggestion → verify status updated
4. Check audit logs for all actions

### Chat Integrations
1. Connect Slack/Teams integration
2. Configure user preferences
3. Send test notification
4. Verify quiet hours respected
5. Check notification queue and delivery logs

### Multi-Client
1. Create multi-client meeting
2. Tag items to specific clients
3. Cascade item to multiple clients
4. Verify client viewer sees only their items
5. Check audit logs for cascades

## Rollback Plan

If issues arise:
1. Disable AI suggestion generation
2. Disable chat integrations
3. Restrict multi-client meetings to admin-only
4. All data remains intact; features can be re-enabled after fixes

## Future Enhancements

- Voice-to-text for meeting notes
- Automated meeting summaries via AI
- Integration with more platforms (Discord, Webhooks)
- Advanced AI features (trend analysis, predictive metrics)
- Bulk cascading operations
