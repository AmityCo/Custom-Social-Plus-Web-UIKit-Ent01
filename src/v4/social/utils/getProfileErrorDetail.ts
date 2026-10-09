import { resolveString } from '~/v4/core/localization';
import { ERROR_CODE } from '~/v4/social/constants/errorResponse';

export type ProfileErrorDetail = { title: string; content: string };

const getContentKey = (haystack: string): string => {
  if (haystack.includes(ERROR_CODE.BLOCKED_WORD)) {
    return 'amity_social_user_profile_error_blocked_word';
  }
  if (haystack.includes(ERROR_CODE.BLOCKED_URL)) {
    return 'amity_social_user_profile_error_blocked_url';
  }
  // 500000 covers both a nudity rejection and an invalid image format.
  if (haystack.includes(ERROR_CODE.IMAGE_NUDITY) || haystack.includes(ERROR_CODE.VIOLENT_CONTENT)) {
    return 'amity_social_user_profile_error_image_not_allowed';
  }
  if (haystack.includes(ERROR_CODE.DISPLAY_NAME_UPDATE)) {
    return 'amity_social_user_profile_error_display_name_admin_only';
  }
  if (haystack.includes(ERROR_CODE.GLOBAL_BAN)) {
    return 'amity_social_user_profile_error_global_ban';
  }
  if (haystack.includes(ERROR_CODE.RATE_LIMIT)) {
    return 'amity_social_user_profile_error_rate_limit';
  }
  if (/network error/i.test(haystack)) {
    return 'amity_social_user_profile_error_network';
  }
  return 'amity_social_toast_snackbar_profile_save_failed';
};

/**
 * Popup title and message for a failed profile save, shared by the create and
 * edit profile pages.
 *
 * Matching is not on `error.message` alone, because a save fails in three
 * differently-shaped ways:
 *  1. ASCError - the message is "Amity SDK (<code>): ..." and `code` is set.
 *  2. The SDK's catch-all, `throw new Error(response?.data ?? error)` - a JSON
 *     body stringifies to "[object Object]", so the code can only be on the
 *     thrown value's own `code` / `data.code`.
 *  3. No response at all - the message contains "Network Error".
 *
 * Uses resolveString (not the useString hook) so it is safe in mutation callbacks.
 */
export const getProfileErrorDetail = (
  error: unknown,
  flow: 'create' | 'edit',
): ProfileErrorDetail => {
  const raw = error as { message?: unknown; code?: unknown; data?: { code?: unknown } } | null;
  const haystack = [raw?.message, raw?.code, raw?.data?.code]
    .filter((part) => part != null)
    .join(' ');

  return {
    title: resolveString(
      flow === 'create'
        ? 'amity_social_user_profile_error_create_title'
        : 'amity_social_user_profile_error_save_title',
    ),
    content: resolveString(getContentKey(haystack)),
  };
};
