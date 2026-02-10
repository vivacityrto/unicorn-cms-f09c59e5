import { FloatingChatbot } from "@/components/help-center/FloatingChatbot";

/**
 * Floating chatbot launcher for client portal.
 * Bottom-right, persistent across all client pages, above footer.
 */
export function ClientChatbotLauncher() {
  return <FloatingChatbot />;
}
