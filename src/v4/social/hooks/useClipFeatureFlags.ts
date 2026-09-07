import { useCustomization } from '~/v4/core/providers/CustomizationProvider';
import type { UserAccess } from '~/v4/core/providers/CustomizationProvider/CustomizationProvider';
import useSDK from '~/v4/core/hooks/useSDK';

// Literals rather than the UserAccessTypes const enum: importing a const enum
// across module boundaries is not reliably inlined by the bundler.
// NOTE: 'singed_in_user_only' is the spelling used in the config schema.
const ALL: UserAccess = 'all';
const NONE: UserAccess = 'none';
const SIGNED_IN_USER_ONLY: UserAccess = 'singed_in_user_only';

const resolveAccess = (access: UserAccess | undefined, isVisitorOrBot: boolean): boolean => {
  switch (access) {
    case ALL:
      return true;
    case SIGNED_IN_USER_ONLY:
      return !isVisitorOrBot;
    case NONE:
      return false;
    // Clips are OFF unless a host app explicitly opts in. `feature_flags` is
    // merged shallowly by AmityUIKitProvider, so a host that sets any
    // feature_flags at all replaces this block wholesale — defaulting to
    // hidden means a partial config can't silently switch clips back on.
    default:
      return false;
  }
};

/**
 * Resolves the clip feature flags from `feature_flags.post.clip` in the UIKit
 * config against the current user.
 *
 * - `canCreateClip` gates every "create a clip" affordance.
 * - `canViewClipTab` gates the Clips tabs that browse existing clips.
 *
 * Clips are hidden by default. To bring them back, a host app sets the flags
 * in the config it passes to `AmityUIKitProvider`:
 *
 *   "feature_flags": { "post": { "clip": {
 *      "can_create": "all", "can_view_tab": "singed_in_user_only" } } }
 *
 * Note this hides UI only — clip posts already in a feed still render.
 */
export function useClipFeatureFlags() {
  const { config } = useCustomization();
  const { isVisitorOrBot } = useSDK();
  const clipFlags = config?.feature_flags?.post?.clip;

  return {
    canCreateClip: resolveAccess(clipFlags?.can_create, isVisitorOrBot),
    canViewClipTab: resolveAccess(clipFlags?.can_view_tab, isVisitorOrBot),
  };
}
