import { useMemo } from 'react';
import useSDK from '~/v4/core/hooks/useSDK';
import { useUser } from '~/v4/core/hooks/objects/useUser';
import { isAdmin } from '~/v4/social/utils';

/**
 * Global, role-derived capabilities for the current user.
 *
 * Amity grants every permission through a role, so a user with NO roles has no
 * permissions — that is what "normal user" means here. There is no API to
 * enumerate a user's permissions (`client.hasPermission()` is a per-permission
 * check), so the roles on the user object are the check.
 *
 * Community moderators deliberately do not qualify: a community's creator
 * automatically becomes that community's moderator, so granting moderators these
 * capabilities would let the privilege propagate on its own. `community-moderator`
 * is also a per-community membership role that never appears in the current
 * user's global roles, so a moderator-based rule would need an async membership
 * lookup per post target. Global roles only.
 */
export const useUserCapabilities = () => {
  const { currentUserId } = useSDK();
  const { user } = useUser({ userId: currentUserId });

  return useMemo(() => {
    const roles = user?.roles;

    // Roles resolve asynchronously. While `user` is still null this evaluates as
    // a normal user, so restricted affordances stay hidden rather than appearing
    // and then being taken away — which would otherwise give the user a moment
    // to tap something they are not allowed to use.
    const isNormalUser = !roles?.length;
    const isGlobalAdmin = isAdmin(roles);

    return {
      isNormalUser,
      canPostVideo: isGlobalAdmin,
      canCreateCommunity: isGlobalAdmin,
    };
  }, [user?.roles]);
};

export default useUserCapabilities;
