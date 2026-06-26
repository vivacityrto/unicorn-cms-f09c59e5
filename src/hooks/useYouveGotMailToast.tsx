import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SESSION_KEY = "ygm_shown";

/**
 * "You've got mail" toast — fires once per fresh login for Vivacity internal staff
 * when there are unread client messages.
 */
export function useYouveGotMailToast() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) return;
    if (!profile.is_vivacity_internal) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "true") return;

    let cancelled = false;

    (async () => {
      try {
        // Get all conversations + last_read_at for current user
        const { data: parts } = await (supabase as any)
          .from("conversation_participants")
          .select("conversation_id, last_read_at")
          .eq("user_id", user.id);

        const readMap = new Map<string, string | null>();
        (parts ?? []).forEach((p: any) =>
          readMap.set(p.conversation_id, p.last_read_at),
        );

        // Pull all client messages — filter unread in JS
        const { data: msgs, error } = await (supabase as any)
          .from("tenant_messages")
          .select("id, conversation_id, created_at, sender_type")
          .eq("sender_type", "client")
          .order("created_at", { ascending: false })
          .limit(1000);

        if (error || cancelled) return;

        const unreadConvos = new Set<string>();
        let unreadMessages = 0;
        for (const m of msgs ?? []) {
          const lastRead = readMap.get(m.conversation_id);
          if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
            unreadMessages++;
            unreadConvos.add(m.conversation_id);
          }
        }

        // Always set the flag so we don't re-check on refresh
        sessionStorage.setItem(SESSION_KEY, "true");

        if (unreadMessages === 0 || cancelled) return;

        const c = unreadConvos.size;
        let body: string;
        if (unreadMessages === 1) {
          body = "You have 1 unread message from a client.";
        } else if (c === 1) {
          body = `You have ${unreadMessages} unread messages in 1 conversation.`;
        } else {
          body = `You have ${unreadMessages} unread messages across ${c} conversations.`;
        }

        toast.custom(
          (t) => (
            <div
              role="alert"
              className="ygm-toast"
              style={{
                width: "min(360px, calc(100vw - 32px))",
                background: "#FFFFFF",
                borderLeft: "6px solid #ED1878",
                borderRadius: 12,
                boxShadow: "0 10px 30px rgba(17, 17, 17, 0.15)",
                padding: "16px 16px 16px 18px",
                position: "relative",
                fontFamily:
                  "Inter, Calibri, ui-sans-serif, system-ui, sans-serif",
                color: "#1A1A1A",
              }}
            >
              <button
                aria-label="Dismiss"
                onClick={() => {
                  sessionStorage.setItem(SESSION_KEY, "true");
                  toast.dismiss(t);
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 10,
                  background: "transparent",
                  border: "none",
                  color: "#888",
                  fontSize: 18,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#7130A0",
                  marginBottom: 8,
                  paddingRight: 16,
                }}
              >
                <span style={{ marginRight: 6 }}>✉️</span>
                You've got mail!
              </div>
              <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.4 }}>
                {body}
              </div>
              <button
                onClick={() => {
                  sessionStorage.setItem(SESSION_KEY, "true");
                  toast.dismiss(t);
                  navigate("/communications");
                }}
                style={{
                  width: "100%",
                  background: "#ED1878",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                View Messages
              </button>
            </div>
          ),
          {
            duration: Infinity,
            position: "top-center",
          },
        );
      } catch {
        // fail silently
        try {
          sessionStorage.setItem(SESSION_KEY, "true");
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, profile, loading, navigate]);
}
