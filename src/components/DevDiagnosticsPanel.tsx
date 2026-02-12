import { useEffect, useState } from "react";
import { getVersionDiagnostics } from "@/utils/versionCheck";

/**
 * Dev-only diagnostics panel. Visible when ?dev_diag=1 query param is present.
 * Shows build ID, service worker status, and last reload reason.
 */
export function DevDiagnosticsPanel() {
  const [visible, setVisible] = useState(false);
  const [diag, setDiag] = useState<{
    currentBuildId: string;
    lastReloadTarget: string;
    isDev: boolean;
    swControlled: boolean;
    remoteBuildId: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev_diag") !== "1") return;
    setVisible(true);

    const info = getVersionDiagnostics();
    const swControlled = !!navigator.serviceWorker?.controller;

    // Fetch remote version.json
    fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setDiag({ ...info, swControlled, remoteBuildId: j.buildId || "(not set)" });
      })
      .catch(() => {
        setDiag({ ...info, swControlled, remoteBuildId: "(fetch failed)" });
      });
  }, []);

  if (!visible || !diag) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-card border border-border rounded-lg shadow-lg p-4 text-xs font-mono max-w-xs space-y-1">
      <div className="font-bold text-foreground mb-2">🦄 Build Diagnostics</div>
      <Row label="VITE_BUILD_ID" value={diag.currentBuildId} />
      <Row label="version.json" value={diag.remoteBuildId} />
      <Row
        label="Match"
        value={diag.currentBuildId === diag.remoteBuildId ? "✅ Yes" : "❌ No"}
      />
      <Row label="SW Controlled" value={diag.swControlled ? "⚠️ Yes" : "✅ No"} />
      <Row label="Last reload for" value={diag.lastReloadTarget} />
      <Row label="Environment" value={diag.isDev ? "Development" : "Production"} />
      <button
        onClick={() => setVisible(false)}
        className="mt-2 text-muted-foreground hover:text-foreground underline"
      >
        Close
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}
