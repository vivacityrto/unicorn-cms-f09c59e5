## Real-time client message notifier in ClientLayout

Add a single `useEffect` inside `ClientLayoutInner` (in `src/components/layout/ClientLayout.tsx`) that subscribes to new `tenant_messages` for the active tenant and surfaces a toast + invalidates inbox queries so unread badges and lists refresh without a reload.

### Changes — `src/components/layout/ClientLayout.tsx`

1. **Imports** (add to existing import block):
   - `import { useEffect } from "react";` (extend existing react import)
   - `import { useNavigate } from "react-router-dom";`
   - `import { useQueryClient } from "@tanstack/react-query";`
   - `import { toast } from "sonner";`
   - `import { supabase } from "@/integrations/supabase/client";`
   - `import { useAuth } from "@/hooks/useAuth";`

2. **Inside `ClientLayoutInner`**, after the existing `useClientTenant()` / `useClientRequestActions()` calls:
   ```ts
   const { profile } = useAuth();
   const navigate = useNavigate();
   const queryClient = useQueryClient();
   const currentUserUuid = profile?.user_uuid ?? null;

   useEffect(() => {
     if (!activeTenantId) return;

     const channel = supabase
       .channel(`client-inbox-notifier-${activeTenantId}`)
       .on(
         "postgres_changes",
         {
           event: "INSERT",
           schema: "public",
           table: "tenant_messages",
           filter: `tenant_id=eq.${activeTenantId}`,
         },
         (payload: any) => {
           const row = payload?.new;
           if (!row) return;
           if (currentUserUuid && row.sender_user_uuid === currentUserUuid) return;

           toast("New message received", {
             description: "You have a new message in your inbox.",
             action: {
               label: "View",
               onClick: () =>
                 navigate(
                   `/client/inbox?tab=messages&thread=${row.conversation_id}`
                 ),
             },
           });

           queryClient.invalidateQueries({ queryKey: ["client-conversations"] });
           queryClient.invalidateQueries({ queryKey: ["client-inbox"] });
         }
       )
       .subscribe();

     return () => {
       supabase.removeChannel(channel);
     };
   }, [activeTenantId, currentUserUuid, navigate, queryClient]);
   ```

### Out of scope
- No changes to `useClientCommunications.ts`, `useClientInbox.ts`, `ClientSidebar.tsx`, `MessageTab.tsx`, `TeamCommunicationsPage.tsx`, EOS, or Administration code.
- No DB / RLS / migration changes; relies on existing realtime publication for `tenant_messages`.
- No change to the staff-side `useTeamUnreadCount` notifier.