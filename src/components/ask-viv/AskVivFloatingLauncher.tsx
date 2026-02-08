import { useAskViv } from "@/hooks/useAskViv";
import { useAskVivFeatureFlags } from "@/hooks/useAskVivFeatureFlags";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import vivIcon from "@/assets/viv-icon.png";

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
      className="fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full bg-background shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105 border border-border"
      aria-label="Open Ask Viv"
    >
      <img src={vivIcon} alt="Ask Viv" className="h-12 w-12 object-contain group-hover:scale-110 transition-transform" />
      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[hsl(var(--success,142_76%_36%))] border-2 border-background animate-pulse" />
    </button>
  );
}
