import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LanguagePicker from '../components/LanguagePicker';
import { useTheme } from '../contexts/ThemeContext';
import { auth } from '../firebase/firebaseConfig';
import {
  ensureLoginHandleForUser,
  getUserDisplayName,
  parseUniversityFromEmail,
  recreateOrphanedUserProfile,
  resolveLoginEmail,
} from '../utils/authUtils';
import { DELETED_USER_NAME, isDeletedUser } from '../utils/deletedUserUtils';
import {
  fetchEmailModerationBlock,
  formatModerationBlockAlert,
  getModerationBlockInfo,
} from '../utils/moderationUtils';
import {
  getOwnUserData,
  migrateLegacyUserDocs,
  setPrivateUser,
  updatePublicUser,
} from '../utils/userDocUtils';

export default function Login() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();
  const { registered, email: registeredEmail, blocked } = useLocalSearchParams();
  const showVerifyBanner = registered === '1';
  const showBannedBanner = blocked === 'banned';
  const showSuspendedBanner = blocked === 'suspended';

  const moderationAlertShown = useRef(false);

  useEffect(() => {
    if (typeof registeredEmail === 'string' && registeredEmail.trim()) {
      setIdentifier(registeredEmail.trim());
    }
  }, [registeredEmail]);

  useEffect(() => {
    if (moderationAlertShown.current || !blocked) return;
    if (blocked !== 'banned' && blocked !== 'suspended') return;

    moderationAlertShown.current = true;
    showModerationBlockAlert({ reason: blocked });
  }, [blocked]);

  const showModerationBlockAlert = (blockInfo) => {
    const { title, message } = formatModerationBlockAlert(blockInfo, t);
    Alert.alert(title, message);
  };

  const getAuthErrorMessage = (error, { context = 'login' } = {}) => {
    const code = error?.code || '';

    if (code === 'missing-identifier') return t('enterIdentifierAndPassword');
    if (code === 'invalid-email') return t('yourEmailMustEnd');
    if (code === 'invalid-instagram') return t('invalidInstagramLogin');
    if (code === 'user-not-found') return t('noAccountFoundRegister');

    if (code === 'auth/user-not-found') return t('noAccountFoundRegister');
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials'
    ) {
      return t('incorrectPassword');
    }
    if (code === 'auth/user-disabled') return t('accountDisabled');
    if (code === 'auth/invalid-email') return t('invalidEmailFormat');
    if (code === 'auth/too-many-requests') {
      return context === 'login' ? t('accountLocked') : t('tooManyAttempts');
    }

    return context === 'login' ? t('loginFailed') : t('couldNotSendEmail');
  };

  const handleForgotPassword = async () => {
    if (!identifier.trim()) {
      Alert.alert(t('emailRequired'), t('enterLoginIdentifier'));
      return;
    }

    setForgotLoading(true);
    try {
      const resolvedEmail = await resolveLoginEmail(identifier);
      await sendPasswordResetEmail(auth, resolvedEmail);
    } catch (error) {
      if (error.code === 'missing-identifier' || error.code === 'invalid-email' || error.code === 'invalid-instagram') {
        Alert.alert(t('error'), getAuthErrorMessage(error));
      } else {
        let msg = t('failedToSendReset');
        if (error.code === 'auth/user-not-found' || error.code === 'user-not-found') {
          msg = t('noAccountFound');
        }
        Alert.alert(t('error'), msg);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert(t('missingInfo'), t('enterIdentifierAndPassword'));
      return;
    }

    setResendLoading(true);
    try {
      const resolvedEmail = await resolveLoginEmail(identifier);
      const userCredential = await signInWithEmailAndPassword(auth, resolvedEmail, password);

      if (userCredential.user.emailVerified) {
        await migrateLegacyUserDocs(userCredential.user.uid);
        const userData = await getOwnUserData(userCredential.user.uid);
        const blockInfo = userData ? getModerationBlockInfo(userData) : null;
        if (blockInfo) {
          await signOut(auth);
          showModerationBlockAlert(blockInfo);
        } else if (userData?.onboardingComplete !== true) {
          router.replace('/onboarding');
        } else {
          router.replace('/(tabs)/feed');
        }
      } else {
        await sendEmailVerification(userCredential.user);
        await signOut(auth);
      }
    } catch (error) {
      console.log('Resend error:', error);
      Alert.alert(t('error'), getAuthErrorMessage(error, { context: 'resend' }));
    } finally {
      setResendLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert(t('missingFields'), t('enterIdentifierAndPassword'));
      return;
    }

    setLoading(true);

    try {
      const resolvedEmail = await resolveLoginEmail(identifier);

      let emailBlock = null;
      try {
        emailBlock = await fetchEmailModerationBlock(resolvedEmail);
      } catch (emailCheckError) {
        console.warn('Email moderation check failed:', emailCheckError);
      }
      if (emailBlock) {
        showModerationBlockAlert(emailBlock);
        return;
      }

      const userCredential = await signInWithEmailAndPassword(auth, resolvedEmail, password);

      await userCredential.user.reload();

      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        Alert.alert(t('emailNotVerified'), t('pleaseVerifyEmail'), [
          { text: t('ok') },
          { text: t('resendEmail'), onPress: handleResendVerification },
        ]);
        return;
      }

      try {
        const uid = userCredential.user.uid;
        let userData = await getOwnUserData(uid);

        if (!userData) {
          await recreateOrphanedUserProfile(userCredential.user);
          userData = {
            email: userCredential.user.email?.toLowerCase() || '',
            name: getUserDisplayName({}, userCredential.user.email),
            university: parseUniversityFromEmail(userCredential.user.email),
            onboardingComplete: false,
          };
        } else {
          try {
            await migrateLegacyUserDocs(uid);
          } catch (migrationError) {
            console.warn('Login migration failed:', migrationError);
          }
          userData = (await getOwnUserData(uid)) || userData;
        }

        if (
          userData?.name === DELETED_USER_NAME &&
          userData?.isDeleted !== true
        ) {
          const repairedName = getUserDisplayName(userData, userCredential.user.email);
          await updatePublicUser(uid, { name: repairedName });
          userData = (await getOwnUserData(uid)) || { ...userData, name: repairedName };
        }

        if (isDeletedUser(userData)) {
          await signOut(auth);
          Alert.alert(t('loginFailed'), t('accountDeleted'));
          return;
        }

        const blockInfo = getModerationBlockInfo(userData);
        if (blockInfo) {
          await signOut(auth);
          showModerationBlockAlert(blockInfo);
          return;
        }

        const privateUpdates = {
          email: userCredential.user.email?.toLowerCase() || userData.email || '',
          lastLogin: new Date(),
          emailVerified: true,
        };
        const publicUpdates = {};
        if (!userData.name) {
          publicUpdates.name = getUserDisplayName(userData, userCredential.user.email);
        }
        await setPrivateUser(uid, privateUpdates);
        if (Object.keys(publicUpdates).length > 0) {
          await updatePublicUser(uid, publicUpdates);
        }
        await ensureLoginHandleForUser(uid, {
          ...userData,
          email: privateUpdates.email,
        });

        if (userData.onboardingComplete !== true) {
          router.replace('/onboarding');
        } else {
          router.replace('/(tabs)/feed');
        }
      } catch (e) {
        console.log('Login profile sync failed:', e);
        await signOut(auth).catch(() => {});

        try {
          const fallbackUserData = await getOwnUserData(userCredential.user.uid);
          const uidBlock = getModerationBlockInfo(fallbackUserData);
          if (uidBlock) {
            showModerationBlockAlert(uidBlock);
            return;
          }

          const fallbackEmailBlock = await fetchEmailModerationBlock(resolvedEmail);
          if (fallbackEmailBlock) {
            showModerationBlockAlert(fallbackEmailBlock);
            return;
          }
        } catch (moderationCheckError) {
          console.warn('Moderation fallback check failed:', moderationCheckError);
        }

        Alert.alert(t('loginFailed'), e?.message || t('loginFailed'));
      }
    } catch (error) {
      console.log('Login error:', error);

      Alert.alert(t('loginFailed'), getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.langTopRight}>
        <LanguagePicker minimal showLabel={false} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      {showVerifyBanner ? (
        <View style={styles.verifyBanner}>
          <Ionicons name="mail-outline" size={22} color={colors.accent} />
          <View style={styles.verifyBannerText}>
            <Text style={styles.verifyBannerTitle}>{t('registrationVerifyTitle')}</Text>
            <Text style={styles.verifyBannerBody}>
              {t('registrationVerifyMessage', {
                email: typeof registeredEmail === 'string' ? registeredEmail : '',
              })}
            </Text>
          </View>
        </View>
      ) : null}

      {showBannedBanner ? (
        <View style={styles.blockBanner}>
          <Ionicons name="ban-outline" size={22} color={colors.danger ?? '#c0392b'} />
          <View style={styles.verifyBannerText}>
            <Text style={styles.verifyBannerTitle}>{t('accountBannedTitle')}</Text>
            <Text style={styles.verifyBannerBody}>{t('accountBannedMessage')}</Text>
          </View>
        </View>
      ) : null}

      {showSuspendedBanner ? (
        <View style={styles.blockBanner}>
          <Ionicons name="time-outline" size={22} color={colors.danger ?? '#c0392b'} />
          <View style={styles.verifyBannerText}>
            <Text style={styles.verifyBannerTitle}>{t('accountSuspendedTitle')}</Text>
            <Text style={styles.verifyBannerBody}>{t('accountSuspendedLoginHint')}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.title}>{t('appName')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('loginIdentifierPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
      />

      <TextInput
        style={styles.input}
        placeholder={t('passwordPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.buttonText}>{t('logIn')}</Text>
        )}
      </Pressable>

      <View style={styles.helperLinks}>
        <Pressable style={styles.helperButton} onPress={handleForgotPassword} disabled={forgotLoading}>
          <Text style={styles.helperText}>
            {forgotLoading ? t('sending') : t('forgotPassword')}
          </Text>
        </Pressable>

        <Pressable
          style={styles.helperButton}
          onPress={handleResendVerification}
          disabled={resendLoading}
        >
          <Text style={styles.helperText}>
            {resendLoading ? t('sending') : t('resendVerification')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('or')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <Link href="/register" asChild>
        <Pressable style={styles.registerButton}>
          <Text style={styles.registerButtonText}>{t('createNewAccount')}</Text>
        </Pressable>
      </Link>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors, safeTop = 0) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  langTopRight: {
    position: 'absolute',
    top: safeTop + 12,
    right: 16,
    zIndex: 10,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: safeTop + 48,
    paddingBottom: 40,
  },
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.danger ?? '#c0392b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  verifyBannerText: {
    flex: 1,
    gap: 4,
  },
  verifyBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  verifyBannerBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 28,
    color: colors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: colors.panel,
    color: colors.textPrimary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  helperLinks: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  helperButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  dividerText: {
    color: colors.textMuted,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  registerButton: {
    backgroundColor: colors.panel,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  registerButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
