/**
 * Generic error boundary. Catches render/lifecycle errors in its subtree,
 * reports them to Sentry, and shows a fallback instead of a white screen.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function reload() {
  window.location.reload();
}

/** Theme-aware fallback for the whole app (admin may be in dark mode). */
export function AppErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="text-xl font-semibold tracking-tight">Une erreur est survenue</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Quelque chose s'est mal passé. Rechargez la page&nbsp;; si le problème persiste, réessayez
        plus tard.
      </p>
      <button
        onClick={reload}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <RefreshCw className="h-4 w-4" />
        Recharger
      </button>
    </div>
  );
}

/** Light-only fallback for public menu pages (public pages never use dark mode). */
export function PublicErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center font-sans text-slate-900">
      <h1 className="text-xl font-semibold tracking-tight">Menu momentanément indisponible</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Nous n'avons pas pu afficher le menu. Merci de réessayer dans un instant.
      </p>
      <button
        onClick={reload}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        <RefreshCw className="h-4 w-4" />
        Réessayer
      </button>
    </div>
  );
}
