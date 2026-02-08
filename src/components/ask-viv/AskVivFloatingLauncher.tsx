import { Bot } from "lucide-react";
import { useAskViv } from "@/hooks/useAskViv";
import { useAskVivFeatureFlags } from "@/hooks/useAskVivFeatureFlags";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";

/**
 * AskVivFloatingLauncher - Floating action button to open Ask Viv
 * Controlled by feature flag (disabled by default)
 */
export function AskVivFloatingLauncher() {
  const { isOpen, openPanel } = useAskViv();
  const { flags, isLoading } = useAskVivFeatureFlags();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const { profile, loading: authLoading } = useAuth();

  // Wait for auth and flags to load
  if (authLoading || isLoading || !profile) {
    return null;
  }

  // Only render for Vivacity Team (includes SuperAdmins)
  if (!isSuperAdmin && !isVivacityTeam) {
    return null;
  }

  // Feature flag controls visibility
  if (!flags.floatingLauncherEnabled) {
    return null;
  }

  // Don't show when panel is open
  if (isOpen) {
    return null;
  }

  return (
    <button
      onClick={openPanel}
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105"
      aria-label="Open Ask Viv"
    >
      <Bot className="h-7 w-7 group-hover:scale-110 transition-transform" />
      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[hsl(var(--success,142_76%_36%))] border-2 border-background animate-pulse" />
    </button>
  );
}
