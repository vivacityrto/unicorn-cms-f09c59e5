import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Change this (for example the open tab and conversation) to clear the error and try again. */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

/**
 * Keeps one failing part of the Inbox from blanking the whole portal. It shows a plain message with a way to try
 * again, and clears itself when the person moves to a different tab or conversation.
 */
export class InboxErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Inbox failed to render:', error.message, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
        <AlertTriangle className="h-9 w-9 text-destructive" aria-hidden />
        <p className="text-sm font-medium text-foreground">Something went wrong showing this part of your inbox.</p>
        <p className="max-w-sm text-xs text-muted-foreground">Your messages are safe. Try again, or choose another tab.</p>
        <Button size="sm" onClick={() => this.setState({ failed: false })}>Try again</Button>
      </div>
    );
  }
}
