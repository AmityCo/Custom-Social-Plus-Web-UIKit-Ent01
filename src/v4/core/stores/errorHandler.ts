/**
 * Module-level registry for the host's `onError` callback, plus the helpers that
 * normalize a thrown value into an `AmityUIKitError` before reporting it.
 *
 * Why a module singleton (not React context)?
 * The errors worth reporting originate in places a context consumer cannot
 * reach:
 *   - the SDK's session / access-token renewal callbacks, which fire outside
 *     React entirely (no component is rendering when a token renewal rejects);
 *   - plain utility functions (`~/v4/core/utils/joinWithRetry`) that are called
 *     from effects and have no hooks available;
 *   - the `QueryClient`, which is a module singleton created in
 *     AmityUIKitProvider ABOVE the provider's own render, so its cache handlers
 *     are constructed before any context exists to read.
 *
 * This mirrors the React Native UIKit's error-reporting store, and follows the
 * same pattern as `~/v4/core/stores/pendingVisitorJoin`.
 *
 * Reporting is best-effort and never throws: a bug in the host's reporter must
 * not take down the UIKit (see `reportError`).
 */

import { ERROR_CODE, ERROR_RESPONSE } from '~/v4/social/constants/errorResponse';

/** Where a reported failure came from. */
export type AmityErrorSource =
  /** A React render crash caught by the UIKit's ErrorBoundary. */
  | 'render'
  /** A read failed (react-query query). */
  | 'query'
  /** A write failed (react-query mutation). */
  | 'mutation'
  /** Login, session establishment, or auth-token renewal failed. */
  | 'auth'
  /** A direct SDK call outside react-query. */
  | 'sdk';

export interface AmityUIKitError {
  source: AmityErrorSource;
  /** Human-readable message, safe to log. */
  message: string;
  /** Amity error code when the SDK supplied one, e.g. '400312' (global ban). */
  code?: string;
  /** The original thrown value, for stack traces / crash reporters. */
  cause?: unknown;
  /** Extra context: queryKey, mutationKey, componentStack, userId... */
  context?: Record<string, unknown>;
  /**
   * True when the UIKit already surfaced this to the user (an error notification,
   * or an error fallback screen). False means the failure was otherwise silent —
   * usually the ones worth alerting on.
   */
  handled: boolean;
}

export type AmityErrorHandler = (error: AmityUIKitError) => void;

let currentHandler: AmityErrorHandler | undefined;

// Monotonically increasing id handed out by `setErrorHandler`. Used to make
// unmount cleanup safe — see `releaseErrorHandler`.
let registrationCounter = 0;
let currentRegistrationId = 0;

/**
 * Install the host's error handler.
 *
 * Called during render rather than from an effect: React runs child effects
 * before parent effects, so a login failure raised inside a child provider would
 * fire before a parent effect had installed the handler — losing the very first
 * error, which is usually the most interesting one.
 *
 * @returns a registration id to pass to `releaseErrorHandler` on unmount.
 */
export const setErrorHandler = (handler?: AmityErrorHandler): number => {
  currentHandler = handler;
  registrationCounter += 1;
  currentRegistrationId = registrationCounter;
  return currentRegistrationId;
};

/**
 * Clear the handler installed by `setErrorHandler`, but ONLY if `id` is still the
 * most recent registration.
 *
 * The guard matters when a host swaps between two providers: React renders the
 * new tree before running the old tree's cleanup, so an unguarded cleanup would
 * let the outgoing provider wipe the handler the incoming one just installed.
 */
export const releaseErrorHandler = (id: number): void => {
  if (id !== currentRegistrationId) return;
  currentHandler = undefined;
};

/** Whether a host handler is currently installed. Exposed for tests. */
export const hasErrorHandler = (): boolean => currentHandler != null;

/**
 * Report a failure to the host.
 *
 * Never throws. A handler that throws (or a host reporter that is mid-teardown)
 * must not propagate into the UIKit's own control flow, so the call is wrapped
 * and any failure is swallowed.
 */
export const reportError = (error: AmityUIKitError): void => {
  const handler = currentHandler;
  if (!handler) return;

  try {
    handler(error);
  } catch {
    // Intentionally silent: the host's reporter is not allowed to break the UIKit.
  }
};

// The 6-digit Amity codes this codebase already knows about. The SDK formats its
// code into the message text (`Amity SDK (400312): ...`), so a code is matched
// against these known values before falling back to a bare digit scan.
const KNOWN_ERROR_CODES: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      [...Object.values(ERROR_RESPONSE), ...Object.values(ERROR_CODE)].filter((value) =>
        /^\d{6}$/.test(value),
      ),
    ),
  ),
);

const AMITY_CODE_PATTERN = /\b(\d{6})\b/;

/**
 * Pull the Amity error code out of a thrown value.
 *
 * Checks, in order: an explicit `code` property (what the SDK sets when it
 * supplies one), then any known code appearing in the message text, then any
 * 6-digit sequence. Returns `undefined` when there is nothing code-shaped —
 * a message-only failure is still reportable, just without a code.
 */
export const extractAmityCode = (error: unknown): string | undefined => {
  const candidate = error as { code?: unknown; message?: unknown } | null | undefined;

  if (candidate?.code != null) {
    const code = String(candidate.code).trim();
    if (code !== '') return code;
  }

  const message = typeof candidate?.message === 'string' ? candidate.message : String(error ?? '');

  const known = KNOWN_ERROR_CODES.find((code) => message.includes(code));
  if (known) return known;

  return message.match(AMITY_CODE_PATTERN)?.[1];
};

/**
 * Normalize any thrown value into a string suitable for `AmityUIKitError.message`.
 *
 * Anything can be thrown in JS — an Error, a string, a rejected value, or
 * `undefined` — so this collapses all of it to something safe to log, using
 * `fallback` when there is no usable message.
 */
export const errorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string' && error.trim() !== '') return error;

  const message = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message.trim() !== '') return message;

  if (error == null) return fallback;

  // An Error whose `message` was empty has nothing better to offer — `String()`
  // on it yields the bare class name ('Error'), which is noise, not a message.
  if (error instanceof Error) return fallback;

  const stringified = String(error);
  return stringified === '[object Object]' || stringified.trim() === '' ? fallback : stringified;
};

/**
 * Report a failure that the UIKit catches and only logs — the user sees nothing.
 *
 * Keeps the existing `console.error` output so hosts that rely on reading the
 * console lose nothing, and additionally reports it with `handled: false`
 * (a silent failure is usually the kind worth alerting on).
 */
export const reportSwallowed = (location: string, error: unknown): void => {
  console.error(`${location}:`, error);

  reportError({
    source: 'sdk',
    message: errorMessage(error, location),
    code: extractAmityCode(error),
    cause: error,
    context: { location },
    handled: false,
  });
};
