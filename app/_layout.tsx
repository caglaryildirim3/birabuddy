import '../i18n';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import i18n from '../i18n';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NotificationProvider } from '../contexts/NotificationContext';
import NotificationBannerHost from '../components/NotificationBannerHost';
import { PostModalProvider, usePostModal } from '../contexts/PostModalContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { auth } from '../firebase/firebaseConfig';
import { recreateOrphanedUserProfile } from '../utils/authUtils';
import { isDeletedUser } from '../utils/deletedUserUtils';
import { useReporterPunishmentAlerts } from '../hooks/useReporterPunishmentAlerts';
import {
  fetchEmailModerationBlock,
  formatModerationBlockAlert,
  getModerationBlockInfo,
} from '../utils/moderationUtils';
import {
  getOwnUserData,
  getPublicUserData,
  migrateLegacyUserDocs,
  updatePrivateUser,
} from '../utils/userDocUtils';
import {
  handleNotificationNavigation,
  registerForPushNotifications,
} from '../utils/notificationUtils';

function RootLayoutContent() {
  const router = useRouter();
  const segments = useSegments();
  const { colors, isDark, ready: themeReady } = useTheme();
  const { openPostModal } = usePostModal();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionRetry, setSessionRetry] = useState(0);
  const hasRegisteredPush = useRef(false);
  const lastCheckedUid = useRef<string | null>(null);
  const sessionRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useReporterPunishmentAlerts(Boolean(sessionReady && user?.emailVerified));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      setUser(firebaseUser);
      setLoading(false);

      if (!firebaseUser) {
        hasRegisteredPush.current = false;
        setSessionRetry(0);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (sessionRetryTimer.current) {
        clearTimeout(sessionRetryTimer.current);
      }
    };
  }, []);

  // Auth + onboarding gate — runs once per uid, NOT on every tab navigation
  useEffect(() => {
    if (loading || !themeReady) return;

    if (!user) {
      lastCheckedUid.current = null;
      setSessionReady(true);
      const inAuthScreen = segments[0] === 'login' || segments[0] === 'register';
      if (!inAuthScreen) router.replace('/login');
      return;
    }

    // Unverified users can't read Firestore — stay on login/register only
    const inAuthScreen = segments[0] === 'login' || segments[0] === 'register';
    if (!user.emailVerified) {
      lastCheckedUid.current = null;
      setSessionReady(true);
      if (!inAuthScreen) {
        signOut(auth).catch(() => {});
        router.replace('/login');
      }
      return;
    }

    // Already checked this user — don't re-run on tab changes
    if (lastCheckedUid.current === user.uid) return;

    setSessionReady(false);
    getPublicUserData(user.uid)
      .then(async (publicData) => {
        const inOnboarding = segments[0] === 'onboarding';

        // Missing Firestore profile — restore if verified, otherwise sign out
        if (!publicData) {
          if (user.emailVerified) {
            await recreateOrphanedUserProfile(user);
            router.replace('/onboarding');
          } else {
            await signOut(auth);
            router.replace('/login');
          }
          return;
        }

        try {
          await migrateLegacyUserDocs(user.uid);
        } catch (migrationError) {
          console.warn('Session migration failed:', migrationError);
        }

        const userData = await getOwnUserData(user.uid);

        if (isDeletedUser(userData)) {
          await signOut(auth);
          Alert.alert(i18n.t('loginFailed'), i18n.t('accountDeleted'));
          router.replace('/login');
          return;
        }

        let blockInfo = getModerationBlockInfo(userData);
        if (!blockInfo) {
          const email = userData?.email || user.email || '';
          try {
            blockInfo = await fetchEmailModerationBlock(email);
          } catch (emailCheckError) {
            console.warn('Session email moderation check failed:', emailCheckError);
          }
        }

        if (blockInfo) {
          await signOut(auth);
          const { title, message } = formatModerationBlockAlert(blockInfo, (key, options) =>
            i18n.t(key, options)
          );
          Alert.alert(title, message);
          router.replace(`/login?blocked=${blockInfo.reason}`);
          return;
        }

        const onboardingComplete = userData?.onboardingComplete === true;

        if (!onboardingComplete) {
          if (!inOnboarding) router.replace('/onboarding');
          return;
        }

        // Onboarding done — update lastLogin and register push (not during onboarding)
        updatePrivateUser(user.uid, { lastLogin: new Date() }).catch(() => {});

        if (!hasRegisteredPush.current) {
          hasRegisteredPush.current = true;
          registerForPushNotifications(user.uid).catch(() => {
            hasRegisteredPush.current = false;
          });
        }

        if (inOnboarding || inAuthScreen) {
          router.replace('/(tabs)/feed');
        }

        lastCheckedUid.current = user.uid;
      })
      .catch((error) => {
        // Network/Firestore blips should not wipe auth or skip onboarding/moderation gates.
        console.warn('Session check failed (will retry):', error);
        if (sessionRetry < 3) {
          sessionRetryTimer.current = setTimeout(() => {
            setSessionRetry((count) => count + 1);
          }, 2000);
        }
      })
      .finally(() => {
        setSessionReady(true);
      });
  }, [user, loading, themeReady, sessionRetry]);

  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationNavigation(response.notification.request.content.data, {
        router,
        openPostModal,
      });
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleNotificationNavigation(response.notification.request.content.data, {
        router,
        openPostModal,
      });
    });

    return () => {
      responseSub.remove();
    };
  }, [router, openPostModal]);

  if (loading || !themeReady || (user && !sessionReady)) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      />
      <NotificationBannerHost />
    </>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <NotificationProvider>
          <PostModalProvider>
            <RootLayoutContent />
          </PostModalProvider>
        </NotificationProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
