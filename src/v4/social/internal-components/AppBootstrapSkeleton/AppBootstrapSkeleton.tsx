import React from 'react';
import { MainLayout } from '~/v4/social/layouts/Main';
import { CommunitySideBar } from '~/v4/social/components/CommunitySideBar';
import { SocialHomePage } from '~/v4/social/pages/SocialHomePage';
import { CommunitySideBarTitle } from '~/v4/social/elements/CommunitySideBarTitle';
import styles from './AppBootstrapSkeleton.module.css';

/**
 * Loading state shown while the session handshake (registerDevice → network
 * config) completes.
 *
 * The provider previously rendered `null` for this window, which reads as a
 * blank page for as long as the login round trips take — worse the further the
 * client is from the API region. The wait itself is unavoidable (the feed needs
 * an authenticated client), so this makes it legible rather than shorter.
 *
 * Deliberately composed from the SAME skeletons the app already shows while
 * resolving the For You setting — CommunitySideBar.MenuSkeleton and
 * SocialHomePage.FeedSkeleton — so the placeholder is identical to the one users
 * see a moment later and there is no visual jump when the real UI takes over.
 *
 * Only the skeleton halves are reused, not the full CommunitySideBar /
 * SocialHomePage: those read from the SDK client (useSDK, SearchResultProvider,
 * NavigationProvider), which by definition does not exist yet at this point.
 */
export const AppBootstrapSkeleton = () => (
  <div
    className={styles.appBootstrapSkeleton}
    data-testid="app_bootstrap_skeleton"
    /*
     * Announce as busy rather than exposing the placeholder shapes to assistive
     * tech, which would otherwise read as meaningless empty content.
     */
    role="status"
    aria-busy="true"
    aria-live="polite"
    aria-label="Loading"
  >
    <MainLayout
      aside={
        <div className={styles.appBootstrapSkeleton__aside}>
          <div className={styles.appBootstrapSkeleton__asideHeader}>
            <CommunitySideBarTitle />
          </div>
          <CommunitySideBar.MenuSkeleton />
        </div>
      }
    >
      <SocialHomePage.FeedSkeleton />
    </MainLayout>
  </div>
);
