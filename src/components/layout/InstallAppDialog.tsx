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

/**
 * Steps to start Unicorn when the person signs in. The browser's own setting comes first:
 * Edge and Chrome control auto-start, and a website cannot switch it on for them.
 */
function StartupSteps({ platform }: { platform: Platform }) {
  const strong = 'font-medium text-foreground';
  if (platform === 'windows') {
    return (
      <ul className="space-y-3 text-sm text-muted-foreground">
        <li>
          <span className={strong}>In Edge:</span> when you install Unicorn, tick <span className={strong}>Auto-start on device login</span>.
          To change it later, open <span className="font-mono text-foreground">edge://apps</span>, select the more options button beside Unicorn, and choose Auto-start on device login.
        </li>
        <li>
          <span className={strong}>In Chrome:</span> open <span className="font-mono text-foreground">chrome://apps</span>, right-click Unicorn, and choose <span className={strong}>Launch at startup</span>.
          Deselect it to turn it off.
        </li>
      </ul>
    );
  }
  if (platform === 'mac') {
    return (
      <ul className="space-y-3 text-sm text-muted-foreground">
        <li>
          <span className={strong}>In Chrome:</span> open <span className="font-mono text-foreground">chrome://apps</span>, right-click Unicorn, and choose <span className={strong}>Launch at startup</span>.
        </li>
        <li>
          <span className={strong}>Or in macOS:</span> open <span className={strong}>System Settings → General → Login Items</span>, then under "Open at Login" click <span className={strong}>+</span>, choose Unicorn, and click Add.
        </li>
      </ul>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      In Chrome or Edge, open the app list (chrome://apps or edge://apps), right-click Unicorn, and turn on the startup option.
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

        <div className="space-y-4">
          {installed ? (
            <p className="text-sm text-muted-foreground">Unicorn is already installed on this device.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">1. Install the app</p>
              {canInstall ? (
                <>
                  <Button onClick={install} disabled={installing} className="min-h-11 gap-2 sm:min-h-9">
                    <Download aria-hidden className="h-4 w-4" />
                    Install Unicorn
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    In Edge, the install dialog includes an Auto-start on device login option. Tick it to open Unicorn when you sign in.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Use your browser's menu (the three dots, or the install icon in the address bar) and choose
                  "Install Unicorn" or "Install app". If you can't see it, your browser may not support installing sites.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{installed ? '1. Open it when you sign in' : '2. Open it when you sign in'}</p>
            <StartupSteps platform={platform} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-foreground min-h-11 sm:min-h-9">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
