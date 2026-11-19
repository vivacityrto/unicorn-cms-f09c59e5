import { useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { canPromptInstall, isRunningInstalled, promptInstall, subscribeInstall } from '@/lib/pwaInstall';

type Platform = 'windows' | 'mac' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  return 'other';
}

/** Steps to start Unicorn when the person signs in. Menu names can differ slightly between versions. */
function StartupSteps({ platform }: { platform: Platform }) {
  if (platform === 'windows') {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Open the Start menu, find <span className="font-medium text-foreground">Unicorn</span>, right-click it, then choose <span className="font-medium text-foreground">More → Open file location</span>.</li>
        <li>Copy the Unicorn shortcut in that folder.</li>
        <li>Press <kbd className="rounded border px-1">Win</kbd> + <kbd className="rounded border px-1">R</kbd>, type <span className="font-mono text-foreground">shell:startup</span>, and press Enter.</li>
        <li>Paste the shortcut into that folder. Unicorn will open each time you sign in to Windows.</li>
      </ol>
    );
  }
  if (platform === 'mac') {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Open the Unicorn app from your Applications folder or Launchpad.</li>
        <li>Open <span className="font-medium text-foreground">System Settings → General → Login Items</span>.</li>
        <li>Under "Open at Login", click <span className="font-medium text-foreground">+</span>, choose Unicorn, then click Add.</li>
      </ol>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Set Unicorn to open when you sign in using your computer's startup or login settings.
    </p>
  );
}

export function InstallAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const canInstall = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [installing, setInstalling] = useState(false);
  const [platform] = useState<Platform>(detectPlatform);
  const installed = isRunningInstalled();

  const install = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install Unicorn</DialogTitle>
          <DialogDescription>
            Get Unicorn in its own window, with its own icon, and open it when you sign in.
          </DialogDescription>
        </DialogHeader>

        {installed ? (
          <p className="text-sm text-muted-foreground">Unicorn is already installed on this device.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">1. Install the app</p>
              {canInstall ? (
                <Button onClick={install} disabled={installing} className="min-h-11 gap-2 sm:min-h-9">
                  <Download aria-hidden className="h-4 w-4" />
                  Install Unicorn
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Use your browser's menu (the three dots, or the install icon in the address bar) and choose
                  "Install Unicorn" or "Install app". If you can't see it, your browser may not support installing sites.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">2. Open it when you sign in</p>
              <StartupSteps platform={platform} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-foreground min-h-11 sm:min-h-9">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
