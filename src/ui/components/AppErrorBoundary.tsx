import { Component, type ErrorInfo, type ReactNode } from 'react';
import { postEvent } from '@/lib/bridge';
import { ErrorState } from './ErrorState';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps a render crash from leaving the plugin window blank. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorState
          message={`The plugin window ran into an error: ${this.state.error.message}`}
          actionLabel="Try again"
          onAction={() => {
            this.setState({ error: null });
            postEvent({ type: 'ui:ready' });
          }}
        />
      );
    }

    return this.props.children;
  }
}
