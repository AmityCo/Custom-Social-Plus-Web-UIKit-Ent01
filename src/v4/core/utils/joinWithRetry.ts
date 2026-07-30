import { CommunityRepository } from '@amityco/ts-sdk';
import { ERROR_CODE, ERROR_RESPONSE } from '~/v4/social/constants/errorResponse';

// Backoff delays between attempts: 3 attempts total, waiting 1s / 2s / 4s after
// a recoverable failure. Chosen to span the window where a just-issued session
// token is still propagating server-side — the dominant cause of a first-attempt
// join failing immediately after sign-in.
const RETRY_DELAYS_MS = [1000, 2000, 4000];

// Failures that will never succeed on retry, so retrying only delays the
// inevitable and burns the user's session on pointless calls. Matched against
// both `error.code` and the message, because the SDK's ASCError formats its code
// into the message (`Amity SDK (<code>): ...`) and different layers surface one
// or the other — the same dual matching the rest of the codebase does.
const NON_RECOVERABLE_CODES = [
  ERROR_RESPONSE.GLOBAL_BAN, // globally banned: session is revoked
  ERROR_CODE.VISITOR_USAGE_LIMIT, // visitor quota spent: needs sign-in, not a retry
  '400301', // forbidden / not authorized to join
  '400300', // permission denied
  '429000', // rate limited: retrying is what caused it
];

const isNonRecoverable = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = candidate?.code != null ? String(candidate.code) : '';
  const message = typeof candidate?.message === 'string' ? candidate.message : '';

  return NON_RECOVERABLE_CODES.some(
    (nonRecoverable) => code === nonRecoverable || message.includes(nonRecoverable),
  );
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Outcome of a join attempt. `retryable: false` on a failure means a later
 * attempt cannot succeed either, so a caller holding a stored join intent should
 * drop it rather than keep re-trying it on every reconnect forever.
 */
export type JoinOutcome = { joined: boolean; retryable: boolean };

/**
 * Join a community by id, retrying recoverable failures with exponential
 * backoff (3 attempts: 1s / 2s / 4s).
 *
 * Never rejects — callers are background effects with no UI to surface a
 * rejection to, and an unhandled rejection there would be worse than a result
 * they can branch on.
 */
export const joinCommunityWithOutcome = async (communityId: string): Promise<JoinOutcome> => {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await CommunityRepository.joinCommunity(communityId);
      return { joined: true, retryable: false };
    } catch (error) {
      if (isNonRecoverable(error)) {
        console.error('Join community failed (not retryable):', error);
        return { joined: false, retryable: false };
      }

      const isLastAttempt = attempt === RETRY_DELAYS_MS.length - 1;
      if (isLastAttempt) {
        console.error('Join community failed after all retries:', error);
        // Exhausted, but the failure itself was transient — worth another try on
        // a later connect.
        return { joined: false, retryable: true };
      }

      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }

  return { joined: false, retryable: true };
};

/**
 * Boolean-only form of `joinCommunityWithOutcome`, for callers that re-derive
 * their join targets from a live collection and so do not need to distinguish
 * transient from permanent failure.
 *
 * @returns whether the user is now a member of the community.
 */
export const joinCommunityWithRetry = async (communityId: string): Promise<boolean> =>
  (await joinCommunityWithOutcome(communityId)).joined;

/**
 * Same retry semantics as `joinCommunityWithRetry`, but for a community observed
 * from a live collection — `join()` is attached to the live object at runtime
 * (`Amity.CommunityLinkedObject`) while the collection's item type does not
 * declare it, so it is accessed defensively and falls back to the id-based call.
 *
 * `join()` can throw synchronously as well as reject, so the call is wrapped
 * rather than assumed thenable.
 */
export const joinLiveCommunityWithRetry = (community: Amity.Community): Promise<boolean> => {
  const join = (community as Amity.Community & Partial<Amity.CommunityLinkedObject>).join;

  if (typeof join !== 'function') {
    return joinCommunityWithRetry(community.communityId);
  }

  const attemptJoin = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await join.call(community);
        return true;
      } catch (error) {
        if (isNonRecoverable(error)) return false;

        const isLastAttempt = attempt === RETRY_DELAYS_MS.length - 1;
        if (isLastAttempt) return false;

        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }

    return false;
  };

  return attemptJoin();
};
