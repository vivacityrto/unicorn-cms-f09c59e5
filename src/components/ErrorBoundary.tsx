import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Global Error Boundary component that catches React rendering errors
 * and provides a user-friendly fallback UI with recovery options.
 * 
 * Integration: Wrap at the top level of the app, inside providers but
 * outside the main content area.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log error for debugging - could be extended to send to audit_events
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // In production, you could log to an audit table here:
    // supabase.from('audit_events').insert({
    //   entity: 'error_boundary',
    //   entity_id: crypto.randomUUID(),
    //   action: 'render_error',
    //   details: { message: error.message, stack: error.stack, componentStack: errorInfo.componentStack }
    // });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/dashboard';
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card rounded-lg border shadow-lg p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <div>
                <h1 className="text-xl font-semibold">Something went wrong</h1>
                <p className="text-sm text-muted-foreground">
                  An unexpected error occurred while rendering this page.
                </p>
              </div>
            </div>

            {/* Error details (development only) */}
            {isDev && this.state.error && (
              <div className="bg-muted/50 rounded-md p-4 space-y-2">
                <p className="font-mono text-sm text-destructive font-medium">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      Stack trace
                    </summary>
                    <pre className="mt-2 overflow-auto max-h-48 whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
                {this.state.errorInfo?.componentStack && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      Component stack
                    </summary>
                    <pre className="mt-2 overflow-auto max-h-48 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Recovery actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="default"
                onClick={this.handleReload}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex-1"
              >
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>

            {/* Try again button */}
            <div className="text-center">
              <button
                onClick={this.handleReset}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Try rendering again
              </button>
            </div>

            {/* Support info */}
            <p className="text-xs text-muted-foreground text-center">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
