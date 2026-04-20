import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  reloading: boolean;
}

const RELOAD_FLAG = 'chunk-reload-attempted';

/**
 * Catches dynamic-import / lazy chunk load failures that occur after a
 * redeploy when the user's browser still references stale chunk hashes.
 *
 * Strategy: on first detection, automatically reload once (using
 * sessionStorage to prevent infinite loops). If the error persists after
 * reload, render a manual "Reload" card so the user is never stuck on
 * an infinite white spinner.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, reloading: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const msg = (error?.message || '').toLowerCase();
    const name = (error?.name || '').toLowerCase();
    const isChunkError =
      name.includes('chunkloaderror') ||
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('importing a module script failed') ||
      msg.includes('loading chunk') ||
      msg.includes('loading css chunk');

    if (!isChunkError) {
      // Re-throw to outer boundary for non-chunk errors
      throw error;
    }
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    const alreadyTried = sessionStorage.getItem(RELOAD_FLAG);
    if (!alreadyTried) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      this.setState({ reloading: true });
      // Small delay so React commits state before reload
      setTimeout(() => window.location.reload(), 100);
    } else {
      console.error('[ChunkErrorBoundary] Chunk load failed after reload:', error);
    }
  }

  handleManualReload = (): void => {
    sessionStorage.removeItem(RELOAD_FLAG);
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.state.reloading) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="flex items-center gap-3 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Loading new version…</span>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card rounded-lg border shadow-lg p-6 space-y-4 text-center">
            <h1 className="text-lg font-semibold">A new version is available</h1>
            <p className="text-sm text-muted-foreground">
              We couldn't load part of the app. This usually means a new version was just
              deployed. Please reload to continue.
            </p>
            <Button onClick={this.handleManualReload} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;
