import { useResponsive } from '~/v4/core/hooks/useResponsive';
import { CreatePostButton } from '~/v4/social/elements/CreatePostButton';
import { CreatePollButton } from '~/v4/social/elements/CreatePollButton';
import { CreateClipButton } from '~/v4/social/elements/CreateClipButton';
import { usePageBehavior } from '~/v4/core/providers/PageBehaviorProvider';
import { useClipFeatureFlags } from '~/v4/social/hooks/useClipFeatureFlags';
import styles from './CreatePostMenu.module.css';

type CreatePostMenuProps = {
  pageId: string;
};

export function CreatePostMenu({ pageId }: CreatePostMenuProps) {
  const componentId = 'create_post_menu';

  const { isDesktop } = useResponsive();
  const { AmityCreatePostMenuComponentBehavior } = usePageBehavior();
  const { canCreateClip } = useClipFeatureFlags();

  return (
    <div className={styles.createPostMenu}>
      <CreatePostButton
        pageId={pageId}
        componentId={componentId}
        onClick={() => AmityCreatePostMenuComponentBehavior?.goToSelectPostTargetPage?.()}
      />
      <CreatePollButton
        pageId={pageId}
        componentId={componentId}
        onClick={() => AmityCreatePostMenuComponentBehavior?.goToSelectPollPostTargetPage?.()}
      />
      {!isDesktop && canCreateClip && (
        <CreateClipButton
          pageId={pageId}
          componentId={componentId}
          onClick={() =>
            AmityCreatePostMenuComponentBehavior?.goToSelectClipPostTargetPage?.({
              isClipPost: true,
            })
          }
        />
      )}
    </div>
  );
}
