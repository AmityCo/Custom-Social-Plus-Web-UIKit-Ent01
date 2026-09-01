import './index.css';
import '~/v4/styles/global.css';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import SDKConnectorProvider from '~/v4/core/providers/SDKConnectorProvider';
import {
  initialSDKContext,
  SDKContext,
  type SDKContextType,
} from '~/v4/core/providers/SDKProvider';
import NavigationProvider from './NavigationProvider';

import ConfigProvider from '~/v4/social/providers/ConfigProvider';
import { ConfirmModal } from '~/v4/core/components/ConfirmModal';
import { NotificationsContainer } from '~/v4/core/components/Notification';
import { DrawerContainer } from '~/v4/core/components/Drawer';

import { LocaleProvider, defaultLocaleMap, type LocaleBundle } from '~/v4/core/localization';

import {
  defaultConfig,
  Config,
  CustomizationProvider,
} from '~/v4/core/providers/CustomizationProvider';
import { ThemeProvider } from './ThemeProvider';
import { PageBehavior, PageBehaviorProvider } from './PageBehaviorProvider';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AmityUIKitManager } from '~/v4/core/AmityUIKitManager';
import { ConfirmProvider } from '~/v4/core/providers/ConfirmProvider';
import { NotificationProvider, useNotifications } from '~/v4/core/providers/NotificationProvider';
import { DrawerProvider } from '~/v4/core/providers/DrawerProvider';
import { CustomReactionProvider } from './CustomReactionProvider';
import { AdEngineProvider } from './AdEngineProvider';
import { AdEngine } from '~/v4/core/AdEngine';
import { GlobalFeedProvider } from '~/v4/social/providers/GlobalFeedProvider';
import { PopupProvider } from '~/v4/core/providers/PopupProvider';
import { Popup } from '~/v4/core/components/AriaPopup';
import { CommunitySetupProvider } from '~/v4/social/providers/CommunitySetupProvider';
import { LayoutProvider } from '~/v4/social/providers/LayoutProvider';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useNetworkConfig } from '~/v4/core/hooks/useNetworkConfig';
import { ClipProvider } from '~/v4/social/providers/ClipProvider';
import { FeedScrollProvider } from '~/v4/core/providers/FeedScrollProvider';
import { SearchResultProvider } from '~/v4/social/providers/SearchResultProvider';
import { GlobalBan } from '~/v4/social/internal-components/GlobalBan';
import { VisitorUsageLimitPage } from '~/v4/social/pages/VisitorUsageLimitPage';
import { AppBootstrapSkeleton } from '~/v4/social/internal-components/AppBootstrapSkeleton';
import { ERROR_CODE, ERROR_RESPONSE } from '~/v4/social/constants/errorResponse';
import { Client, UserTypeEnum } from '@amityco/ts-sdk';
import { FailedToShow } from '~/v4/social/internal-components/FailedToShow';
import { UserCacheProvider } from '~/v4/core/providers/UserCacheProvider';
import {
  peekPendingVisitorJoin,
  clearPendingVisitorJoin,
  beginVisitorAutoJoin,
  completeVisitorAutoJoin,
} from '~/v4/core/stores/pendingVisitorJoin';
import { joinCommunityWithOutcome } from '~/v4/core/utils/joinWithRetry';
import { ErrorBoundary } from '~/v4/core/components/ErrorBoundary';
import { type AmityFontConfig } from '~/v4/core/fonts';
import {
  type AmityErrorHandler,
  errorMessage,
  extractAmityCode,
  releaseErrorHandler,
  reportError,
  setErrorHandler,
} from '~/v4/core/stores/errorHandler';

const InternalComponent = ({
  apiKey,
  apiRegion,
  apiEndpoint,
  userId,
  displayName,
  theme = {},
  children,
  socialCommunityCreationButtonVisible,
  hideExplore,
  pageBehavior,
  onConnectionStatusChange,
  onConnected,
  onDisconnected,
  getAuthToken,
  getAuthSignature,
  authSignatureExpiresAt,
  configs,
  activeRoute,
  onRouteChange,
  seoOptimizationEnabled = false,
  syncNetworkConfig = false,
  onEmptyNavigationStack,
}: AmityUIKitProviderProps) => {
  const { error } = useNotifications();
  const [client, setClient] = useState<Amity.Client | null>(null);
  const { networkConfig, isNetworkConfigLoading } = useNetworkConfig(client);
  const [isGlobalBanned, setIsGlobalBanned] = useState<boolean>(false);
  const [isUserDeleted, setIsUserDeleted] = useState<boolean>(false);
  const [isVisitorUsageLimitReached, setIsVisitorUsageLimitReached] = useState<boolean>(false);
  const isVisitorUsageLimitReachedRef = useRef<boolean>(false);
  const autoJoinInFlightRef = useRef<boolean>(false);

  const sdkContextValue: SDKContextType = useMemo(() => {
    if (!client) return initialSDKContext;

    const currentUser = Client.getCurrentUser();

    // Throws ('Connect client first') if the user type is not populated yet.
    // Treating that as visitor keeps the read-only guards on (the safe default —
    // it never grants write affordances the session may not have); a later
    // re-render recomputes this once the type is known.
    let userType: ReturnType<typeof Client.getCurrentUserType> | undefined;
    try {
      userType = Client.getCurrentUserType();
    } catch {
      userType = undefined;
    }

    return {
      client,
      currentUserId: currentUser?.userId,
      userRoles: currentUser?.roles || [],
      currentUser,
      isVisitorOrBot: userType !== UserTypeEnum.SIGNED_IN,
      getAuthToken,
    };
  }, [client, userId, getAuthToken]);

  const initialConfig = useMemo(() => {
    let initialConfig = { ...defaultConfig };

    if (configs) {
      initialConfig = {
        ...initialConfig,
        ...configs,
        theme: {
          light: { ...initialConfig.theme.light, ...configs.theme?.light },
          dark: { ...initialConfig.theme.dark, ...configs.theme?.dark },
        },
      };
    }

    if (networkConfig && syncNetworkConfig) {
      if (
        networkConfig.config?.preferred_theme === 'dark' ||
        networkConfig.config?.preferred_theme === 'light'
      )
        initialConfig = {
          ...initialConfig,
          ...networkConfig.config,
        };
    }

    return initialConfig;
  }, [configs, networkConfig]);

  const onGlobalBanned = (payload: Amity.UserPayload) => {
    if (payload.users.find((user) => user.userId === userId)?.isGlobalBan) {
      // `handled: true` — the GlobalBan screen replaces the UIKit's whole tree.
      reportError({
        source: 'auth',
        message: 'The current user has been globally banned',
        code: ERROR_RESPONSE.GLOBAL_BAN,
        context: { userId, reason: 'globalBan' },
        handled: true,
      });
      setIsGlobalBanned(true);
    }
  };

  const onVisitorUsageLimitReached = () => {
    // `handled: true` on both branches — either the host's own behavior handles
    // it, or the UIKit shows VisitorUsageLimitPage.
    reportError({
      source: 'auth',
      message: 'The visitor usage limit has been reached',
      code: ERROR_CODE.VISITOR_USAGE_LIMIT,
      context: { userId, reason: 'visitorUsageLimit' },
      handled: true,
    });

    if (pageBehavior?.AmityGlobalBehavior?.handleVisitorUsageLimitReached) {
      pageBehavior.AmityGlobalBehavior.handleVisitorUsageLimitReached();
    } else {
      isVisitorUsageLimitReachedRef.current = true;
      setIsVisitorUsageLimitReached(true);
    }
  };

  const onUserDeleted = (payload: Amity.UserPayload) => {
    if (payload.users.find((user) => user.userId === userId)?.isGlobalBan) {
      // `handled: true` — the FailedToShow screen replaces the UIKit's tree.
      reportError({
        source: 'auth',
        message: 'The current user has been deleted',
        context: { userId, reason: 'userDeleted' },
        handled: true,
      });
      setIsUserDeleted(true);
    }
  };

  // Auto-join the community a visitor tapped "Join" on before signing in.
  //
  // A visitor's join intent is recorded (module-level, so it survives the
  // provider remount that the visitor -> signed-in transition triggers) in
  // useCommunityProfileGlobalBehavior. Once we connect as a signed-in user, we
  // consume that intent and join on their behalf. The newsfeed watches the
  // auto-join status and holds a loading state until it settles, so it renders
  // ONCE with the just-joined community included instead of flashing an empty /
  // pre-join feed and re-fetching. Runs on every connect (via onConnected) but
  // is a no-op unless there is a pending id AND the session is now signed-in —
  // so a reconnect as a visitor never triggers it.
  const autoJoinPendingCommunity = () => {
    // getCurrentUserType() THROWS ('Connect client first') when the session is
    // established but the user type has not been populated yet. Returning early
    // on a throw — rather than letting it escape — keeps the exception from
    // aborting the caller (which would also skip the host's onConnected below);
    // the next connect event runs this again once the type is available.
    let isSignedIn: boolean;
    try {
      isSignedIn = Client.getCurrentUserType() === UserTypeEnum.SIGNED_IN;
    } catch {
      return;
    }
    if (!isSignedIn) return;

    // Peek, don't consume: the intent must survive a failed attempt so a later
    // connect can retry it. It is cleared only after the join is confirmed.
    const pendingCommunityId = peekPendingVisitorJoin();
    if (!pendingCommunityId) return;

    // onConnected can fire again (reconnect) while a join is still in flight.
    // Since the id is no longer cleared up-front, that would double-join without
    // this guard.
    if (autoJoinInFlightRef.current) return;
    autoJoinInFlightRef.current = true;

    // Enter the loading state before the network call so a newsfeed mounting
    // during the transition waits rather than rendering the pre-join feed.
    beginVisitorAutoJoin();

    // We only have the communityId here (the intent is stored by id so it can
    // survive the visitor -> signed-in provider remount). The live community
    // object's `.join()` is not available without first observing it, so this
    // goes through the id-based repository call, wrapped in backoff retries
    // because a join issued moments after sign-in can race token propagation.
    joinCommunityWithOutcome(pendingCommunityId)
      .then(async ({ joined, retryable }) => {
        // Drop the intent once the join succeeds, and also when it failed for a
        // reason no retry can fix (needs approval, no permission) — otherwise it
        // would linger in storage and re-attempt on every future connect. A
        // merely transient failure is left in place so the next connect retries
        // instead of silently never joining.
        if (joined || !retryable) clearPendingVisitorJoin();
        if (!joined) return;

        // The join request has resolved, but the global feed's server-side view
        // of the new membership can lag a beat behind. Wait briefly before
        // releasing the newsfeed so its first (and only) query already includes
        // the joined community's posts — no empty-then-populated flicker.
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      })
      .finally(() => {
        autoJoinInFlightRef.current = false;
        // Release the newsfeed whether the join succeeded or failed, so it never
        // stays stuck in a loading state.
        completeVisitorAutoJoin();
      });
  };

  useEffect(() => {
    const setup = async () => {
      let authToken;

      // Only mint a token when there is a userId to mint it for. Without a
      // userId the session logs in as a visitor (see connectAndLogin), which
      // ignores authToken entirely — so calling the host's getAuthToken here
      // is both useless and a likely error: a secure-mode token endpoint has
      // no id to sign against yet and typically rejects, which would surface
      // as a setup failure and block the visitor session from connecting.
      if (getAuthToken && userId) {
        try {
          authToken = await getAuthToken(userId.toString());
        } catch (_error) {
          // Report, then re-throw so the failure keeps propagating exactly as it
          // did before: this call sits outside the try/catch below, so a rejection
          // here has always aborted setup silently. `handled: false` — nothing is
          // shown to the user on this path.
          reportError({
            source: 'auth',
            message: errorMessage(_error, 'Failed to mint an Amity auth token'),
            code: extractAmityCode(_error),
            cause: _error,
            context: { userId, phase: 'getAuthToken' },
            handled: false,
          });
          throw _error;
        }
      }

      try {
        // Set up the AmityUIKitManager
        AmityUIKitManager.setup({ apiKey, apiRegion, apiEndpoint, seoOptimizationEnabled });
        AdEngine.instance;

        const newClient = AmityUIKitManager.getClient();
        const deviceId = await newClient?.getVisitorDeviceId();

        let authSignatureParams;

        if (getAuthSignature && authSignatureExpiresAt && deviceId) {
          const authSignature = await getAuthSignature({
            deviceId,
            authSignatureExpiresAt,
          });

          authSignatureParams = {
            authSignature,
            authSignatureExpiresAt,
          };
        }

        // Register the device and get the client instance
        await AmityUIKitManager.registerDevice({
          userId: userId?.toString(),
          displayName: displayName?.toString(),
          sessionHandler: {
            sessionWillRenewAccessToken: (renewal) => {
              // Handle access token renewal.
              //
              // A visitor session (no userId) renews without a token — asking
              // the host to mint one has no id to key against and would reject.
              // renewal MUST be called exactly once on every path, including
              // when the host's mint fails: an unresolved renewal leaves the
              // session unable to refresh, so fall back to a plain renew()
              // rather than dropping the callback on a rejected promise.
              if (getAuthToken && userId) {
                getAuthToken(userId.toString())
                  .then((newToken) => {
                    renewal.renewWithAuthToken(newToken);
                  })
                  .catch((_error) => {
                    console.error('Error renewing access token:', _error);
                    // Silent to the user — the session falls back to a plain
                    // renew() below and the UI carries on — so `handled: false`.
                    reportError({
                      source: 'auth',
                      message: errorMessage(_error, 'Failed to renew the Amity access token'),
                      code: extractAmityCode(_error),
                      cause: _error,
                      context: { userId, phase: 'sessionWillRenewAccessToken' },
                      handled: false,
                    });
                    renewal.renew();
                  });
              } else {
                renewal.renew();
              }
            },
          },
          authToken,
          authSignatureParams,
          onConnectionStatusChange,
          onConnected: () => {
            // Auto-join any community a visitor tapped Join on before signing in
            // (no-op unless there is a pending id and the session is signed-in),
            // then forward to the host's onConnected callback.
            autoJoinPendingCommunity();
            onConnected?.();
          },
          onDisconnected,
          onGlobalBanned,
          onUserDeleted,
          onVisitorUsageLimitReached,
        });

        // Only expose the client to the render tree if the visitor usage limit
        // was not already hit synchronously during registerDevice. This prevents
        // a single-frame flash of the main community content before the
        // VisitorUsageLimitPage guard kicks in.
        if (!isVisitorUsageLimitReachedRef.current) {
          setClient(newClient);
        }
      } catch (_error) {
        console.error('Error setting up AmityUIKitManager:', _error);

        // The user sees something on both Error branches below (the GlobalBan
        // screen, or an error toast), so those report `handled: true`. A non-Error
        // throw falls through showing nothing at all — reported as unhandled.
        const isSurfacedToUser = _error instanceof Error;

        reportError({
          source: 'auth',
          message: errorMessage(_error, 'Failed to set up the Amity UIKit session'),
          code: extractAmityCode(_error),
          cause: _error,
          context: { userId, phase: 'registerDevice' },
          handled: isSurfacedToUser,
        });

        if (_error instanceof Error) {
          if (_error.message.includes(ERROR_RESPONSE.GLOBAL_BAN)) {
            setIsGlobalBanned(true);
          } else {
            error({ content: _error.message });
          }
        }
      }
    };

    setup();
  }, [userId, displayName, onConnectionStatusChange, onConnected, onDisconnected]);

  if (isGlobalBanned) return <GlobalBan />;

  if (isUserDeleted) return <FailedToShow />;

  if (isVisitorUsageLimitReached) {
    const handleSignIn = pageBehavior?.AmityGlobalBehavior?.handleVisitorUsageLimitSignIn
      ? () =>
          pageBehavior.AmityGlobalBehavior!.handleVisitorUsageLimitSignIn!({ alignment: 'fixed' })
      : undefined;
    return (
      <div className="asc-uikit">
        <CustomizationProvider initialConfig={initialConfig}>
          <VisitorUsageLimitPage onSignIn={handleSignIn} />
        </CustomizationProvider>
      </div>
    );
  }

  // The session handshake (registerDevice → network config) has not finished, so
  // there is no authenticated client to render a feed with yet. Show a skeleton
  // instead of `null`: the wait is legitimate, but a blank page reads as a broken
  // app — especially where round trips to the API region are slow.
  //
  // Rendered inside CustomizationProvider so it picks up the same theme CSS
  // variables as the real UI (matching the VisitorUsageLimitPage branch above)
  // and does not flash light-on-dark for dark-theme integrations. The skeleton
  // reuses the app's existing sidebar/feed skeletons, so it is the same
  // placeholder the user sees a moment later — no visual jump on handover.
  if (!client || isNetworkConfigLoading) {
    return (
      <div className="asc-uikit">
        <CustomizationProvider initialConfig={initialConfig}>
          <AppBootstrapSkeleton />
        </CustomizationProvider>
      </div>
    );
  }

  return (
    <div className="asc-uikit">
      <CustomizationProvider initialConfig={initialConfig}>
        <CustomReactionProvider>
          <AdEngineProvider>
            <FeedScrollProvider>
              <SDKContext.Provider value={sdkContextValue}>
                <UserCacheProvider>
                  <SDKConnectorProvider>
                    <ConfigProvider
                      config={{
                        socialCommunityCreationButtonVisible:
                          socialCommunityCreationButtonVisible ?? true,
                        hideExplore: hideExplore ?? false,
                      }}
                    >
                      <LayoutProvider>
                        <NavigationProvider
                          activeRoute={activeRoute}
                          onRouteChange={onRouteChange}
                          onEmptyNavigationStack={onEmptyNavigationStack}
                        >
                          <PageBehaviorProvider pageBehavior={pageBehavior}>
                            <SearchResultProvider>
                              <ClipProvider>
                                <CommunitySetupProvider>
                                  <DrawerProvider>
                                    <GlobalFeedProvider>
                                      <PopupProvider>
                                        <Popup />
                                        {children}
                                      </PopupProvider>
                                    </GlobalFeedProvider>
                                    <DrawerContainer />
                                  </DrawerProvider>
                                </CommunitySetupProvider>
                              </ClipProvider>
                            </SearchResultProvider>
                          </PageBehaviorProvider>
                        </NavigationProvider>
                      </LayoutProvider>
                    </ConfigProvider>
                  </SDKConnectorProvider>
                </UserCacheProvider>
              </SDKContext.Provider>
            </FeedScrollProvider>
          </AdEngineProvider>
        </CustomReactionProvider>
      </CustomizationProvider>
    </div>
  );
};

export type AmityUIKitConfig = Config;

export type AmityRoute = {
  route: string;
  id?: string;
};

interface AmityUIKitProviderProps {
  apiKey: string;
  apiRegion: string;
  apiEndpoint?: {
    http?: string;
    mqtt?: string;
    upload?: string;
  };
  userId?: string;
  displayName?: string;
  theme?: Record<string, unknown>;
  children?: React.ReactNode;
  socialCommunityCreationButtonVisible?: boolean;
  hideExplore?: boolean;
  actionHandlers?: {
    onChangePage?: (data: { type: string; [x: string]: string | boolean }) => void;
    onClickCategory?: (categoryId: string) => void;
    onClickCommunity?: (communityId: string) => void;
    onClickUser?: (userId: string) => void;
    onCommunityCreated?: (communityId: string) => void;
    onEditCommunity?: (communityId: string, options?: { tab?: string }) => void;
    onEditUser?: (userId: string) => void;
    onMessageUser?: (userId: string) => void;
  };
  pageBehavior?: PageBehavior;
  onConnectionStatusChange?: (state: Amity.SessionStates) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  // Optionally receives the resolved userId, so flows that mint the userId at
  // login time (e.g. CreateUserProfilePage) can request a token keyed to it.
  // The argument is optional and unused by the provider's own login, so existing
  // arg-less callers remain valid.
  getAuthToken?: (userId?: string) => Promise<string>;
  authSignatureExpiresAt?: string;
  getAuthSignature?: ({
    deviceId,
    authSignatureExpiresAt,
  }: {
    deviceId: string;
    authSignatureExpiresAt: string;
  }) => Promise<string>;
  isBotUser?: boolean;
  configs?: AmityUIKitConfig;
  activeRoute?: AmityRoute;
  onRouteChange?: (route: AmityRoute) => void;
  seoOptimizationEnabled?: boolean;
  syncNetworkConfig?: boolean;
  onEmptyNavigationStack?: () => void;
  /**
   * Localization configuration for the UIKit.
   * - `localeBundle`: initial Level 3 locale bundle (key → translated string)
   * - `overrides`: initial Level 2 programmatic overrides (merge with locale)
   * - `localeMap`: map of locale code → bundle for automatic device-language detection.
   *   When `localeBundle` is not set the provider checks `navigator.language` against
   *   this map (exact match, then language-prefix). Falls back to English if no match.
   *
   * @example
   *   localization={{ localeBundle: jaLocale }}
   * @example
   *   localization={{ localeMap: { ja: jaLocale, th: thLocale } }}
   */
  localization?: {
    localeBundle?: LocaleBundle;
    overrides?: LocaleBundle;
    localeMap?: Record<string, LocaleBundle>;
  };
  /**
   * Font family configuration for the UIKit. Omit it and the UIKit keeps its own
   * default font.
   *
   * - `fontFamily`: used for any weight with no more specific entry
   * - `regular` / `medium` / `semiBold` / `bold` / `extraBold`: per-weight
   *   families, applied to font-weight 400 / 500 / 600 / 700 / 800-900
   *
   * The shape matches the React Native UIKit's `AmityFontConfig`, so the same
   * config object can be shared between both SDKs. Load the font itself as usual
   * (a `@font-face` rule or a stylesheet link) — the UIKit only selects it.
   *
   * @example
   *   fonts={{ fontFamily: 'Roboto' }}
   * @example
   *   fonts={{ fontFamily: 'Inter', semiBold: 'Inter SemiBold', bold: 'Inter Bold' }}
   */
  fonts?: AmityFontConfig;
  /**
   * Called whenever the UIKit encounters an error, for logging and crash
   * reporting. Purely an observer: the UIKit still shows all of its own
   * notifications, banners and fallback screens exactly as it does without it.
   *
   * `error.source` is one of `'render' | 'query' | 'mutation' | 'auth' | 'sdk'`,
   * and `error.handled` is `true` when the UIKit already surfaced the failure to
   * the user — so `handled: false` reports are the ones usually worth alerting on.
   *
   * @example
   *   onError={(error) => console.warn(error.source, error.message)}
   * @example
   *   onError={(error) => {
   *     if (!error.handled) Sentry.captureException(error.cause ?? error.message, {
   *       tags: { source: error.source, code: error.code },
   *       extra: error.context,
   *     });
   *   }}
   */
  onError?: AmityErrorHandler;
}

// Cache-level error handlers, so every react-query read/write failure is reported
// from one place instead of each call site having to opt in.
//
// `handled: false` on both: reaching the cache handler says nothing about whether
// any UI surfaced the failure, and most of these are silent (a background refetch,
// a retry that exhausted). Call sites that DO show something to the user report
// their own `handled: true` alongside it.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportError({
        source: 'query',
        message: errorMessage(error, 'An Amity UIKit query failed'),
        code: extractAmityCode(error),
        cause: error,
        context: { queryKey: query?.queryKey },
        handled: false,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportError({
        source: 'mutation',
        message: errorMessage(error, 'An Amity UIKit mutation failed'),
        code: extractAmityCode(error),
        cause: error,
        context: { mutationKey: mutation?.options?.mutationKey },
        handled: false,
      });
    },
  }),
});

/**
 * Install the host's `onError` callback in the module-level registry.
 *
 * Registration happens DURING RENDER, not in an effect: React runs child effects
 * before parent effects, so a login failure raised inside a child provider would
 * fire before a parent effect had installed the handler — losing the first (and
 * usually most useful) error. The ref guard keeps repeat renders from
 * re-registering when the callback has not actually changed.
 */
const useErrorHandlerRegistration = (onError?: AmityErrorHandler) => {
  const registeredHandlerRef = useRef<AmityErrorHandler | undefined>(undefined);
  const hasRegisteredRef = useRef(false);

  if (!hasRegisteredRef.current || registeredHandlerRef.current !== onError) {
    hasRegisteredRef.current = true;
    registeredHandlerRef.current = onError;
    setErrorHandler(onError);
  }

  useEffect(() => {
    // Re-assert the registration on mount.
    //
    // StrictMode (on by default in dev templates) runs mount -> unmount ->
    // remount, and React 18 can remount an offscreen tree the same way. The
    // unmount runs the cleanup below, which releases the handler — while the
    // render-phase registration above does NOT re-run, because its refs survive
    // the simulated remount. Without re-registering here the handler would stay
    // cleared for the rest of the session and onError would never fire in dev.
    const registrationId = setErrorHandler(onError);

    // Release only THIS registration. `releaseErrorHandler` no-ops when the id
    // is no longer the most recent, so a provider being swapped out cannot wipe
    // the handler the incoming provider just installed (React renders the new
    // tree before running the old tree's cleanup). Capturing the id in a local
    // rather than a ref is what makes that guard meaningful — a ref would have
    // been overwritten by the newer registration before this cleanup ran.
    return () => releaseErrorHandler(registrationId);
  }, [onError]);
};

const AmityUIKitProvider: React.FC<AmityUIKitProviderProps> = (props) => {
  useErrorHandlerRegistration(props.onError);

  return (
    <ErrorBoundary>
      <LocaleProvider
        initialLocaleBundle={props.localization?.localeBundle}
        initialOverrides={props.localization?.overrides}
        localeMap={props.localization?.localeMap ?? defaultLocaleMap}
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider config={props.configs} fonts={props.fonts}>
            <NotificationProvider>
              <ConfirmProvider>
                <InternalComponent {...props} />
                <NotificationsContainer />
                <ConfirmModal />
              </ConfirmProvider>
            </NotificationProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
};

export default AmityUIKitProvider;
