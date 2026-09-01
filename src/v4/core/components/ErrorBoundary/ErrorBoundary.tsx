import React from 'react';

import { errorMessage, extractAmityCode, reportError } from '~/v4/core/stores/errorHandler';
import styles from './ErrorBoundary.module.css';

type ErrorBoundaryProps = {
  children?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Catches render crashes anywhere inside the UIKit, shows a fallback screen
 * instead of unmounting the host's whole app, and reports the crash through the
 * `onError` callback with `source: 'render'`.
 *
 * Deliberately self-contained: this wraps the provider tree from the outside, so
 * it renders in situations where LocaleProvider, ThemeProvider and the
 * navigation context may not exist (or may be the very thing that threw). It
 * therefore uses no hooks, no localized strings and no theme tokens for color —
 * anything it depended on could be the thing that is broken.
 *
 * On the success path it renders `children` untouched and adds no DOM of its own.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // `handled: true` — the user is already looking at the fallback below.
    reportError({
      source: 'render',
      message: errorMessage(error, 'A render error occurred in the Amity UIKit'),
      code: extractAmityCode(error),
      cause: error,
      context: { componentStack: errorInfo?.componentStack },
      handled: true,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className={styles.errorBoundary} data-testid="asc-uikit-error-boundary" role="alert">
        <p className={styles.errorBoundary__title}>Something went wrong</p>
        <p className={styles.errorBoundary__description}>
          This content could not be displayed. Please try again.
        </p>
        <button type="button" className={styles.errorBoundary__button} onClick={this.handleRetry}>
          Try again
        </button>
      </div>
    );
  }
}
