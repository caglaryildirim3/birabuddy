import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LanguagePicker from '../components/LanguagePicker';
import LegalDocumentModal from '../components/LegalDocumentModal';
import {
  getPrivacyDocumentPath,
  getTermsDocumentPath,
} from '../utils/legalDocumentUtils';
import { useTheme } from '../contexts/ThemeContext';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { auth, db } from '../firebase/firebaseConfig';
import {
  changeUserEmail,
  changeUserPassword,
  cleanInstagramHandle,
  formatUniversityDisplay,
  getCredentialChangeErrorMessage,
  isInstagramHandle,
  parseUniversityFromEmail,
  updateLoginHandle,
} from '../utils/authUtils';
import { getBlockedUserIds, unblockUser } from '../utils/blockUtils';
import {
  deleteMyAccount,
  getAccountDeleteErrorMessage,
} from '../utils/accountDeleteUtils';
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  updateNotificationPrefs,
} from '../utils/settingsUtils';
import { getOwnUserData, getPublicUserData, persistUserField } from '../utils/userDocUtils';

const SUPPORT_EMAIL = 'birabuddy@gmail.com';

function SettingRow({ label, subtitle, right, onPress, colors, destructive, isLast }) {
  const content = (
    <View
      style={[
        rowStyles.row,
        { borderBottomColor: colors.borderSoft },
        isLast && rowStyles.rowLast,
      ]}
    >
      <View style={rowStyles.rowText}>
        <Text
          style={[rowStyles.rowLabel, { color: destructive ? colors.danger : colors.textPrimary }]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={[rowStyles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && rowStyles.rowPressed}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 3, lineHeight: 18 },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors, isDark, setDarkMode } = useTheme();
  const { isAdmin } = useIsAdmin();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = auth.currentUser;

  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [savingPref, setSavingPref] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountUniversity, setAccountUniversity] = useState('');
  const [accountInstagram, setAccountInstagram] = useState('');
  const [accountLoginHandle, setAccountLoginHandle] = useState('');
  const [displayEmail, setDisplayEmail] = useState(user?.email || '');
  const [legalModal, setLegalModal] = useState(null);
  const [credentialModal, setCredentialModal] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [newInstagramUsername, setNewInstagramUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingCredential, setSavingCredential] = useState(false);

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const accountEmail = displayEmail || user?.email || '';

  const loadSettings = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const [prefs, blockedIds, userData] = await Promise.all([
        getNotificationPrefs(user.uid),
        getBlockedUserIds(user.uid),
        getOwnUserData(user.uid),
      ]);

      setNotificationPrefs(prefs);

      if (userData) {
        setAccountName(userData.name || userData.nickname || userData.instagram || '');
        setAccountInstagram(userData.instagram || '');
        setAccountLoginHandle(userData.loginHandle || userData.instagram || '');
        setAccountUniversity(
          formatUniversityDisplay(
            userData.university || parseUniversityFromEmail(userData.email)
          )
        );
        setDisplayEmail(auth.currentUser?.email || userData.email || '');
      } else {
        setDisplayEmail(auth.currentUser?.email || '');
      }

      const users = await Promise.all(
        blockedIds.map(async (uid) => {
          try {
            const data = await getPublicUserData(uid);
            if (!data) return { uid, name: 'Unknown user' };
            return {
              uid,
              name: data.name || data.nickname || data.instagram || 'Unknown user',
            };
          } catch {
            return { uid, name: 'Unknown user' };
          }
        })
      );
      setBlockedUsers(users);
    } catch (error) {
      if (error?.code !== 'auth/network-request-failed') {
        console.error('Failed to load settings:', error);
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSettings();
  }, [loadSettings]);

  const updatePref = async (key, value) => {
    if (!user?.uid) return;
    Haptics.selectionAsync();
    const prev = notificationPrefs;
    const next = { ...prev, [key]: value };
    setNotificationPrefs(next);
    setSavingPref(true);
    try {
      await updateNotificationPrefs(user.uid, next);
    } catch (error) {
      setNotificationPrefs(prev);
      Alert.alert(t('error'), t('failedToUpdateSettings'));
    } finally {
      setSavingPref(false);
    }
  };

  const handleUnblock = (blockedUid, name) => {
    Alert.alert(t('unblockUser'), t('unblockUserConfirm', { name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unblock'),
        onPress: async () => {
          try {
            await unblockUser(user.uid, blockedUid);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setBlockedUsers((prev) => prev.filter((u) => u.uid !== blockedUid));
          } catch (error) {
            Alert.alert(t('error'), t('failedToUnblock'));
          }
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace('/login');
          } catch (error) {
            Alert.alert(t('error'), t('failedToSignOut'));
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('deleteAccount'), t('deleteAccountConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteForever'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('finalWarning'), t('absolutelySure'), [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('yesDeleteEverything'),
              style: 'destructive',
              onPress: async () => {
                if (!user || deletingAccount) return;
                setDeletingAccount(true);
                try {
                  await deleteMyAccount();
                  await signOut(auth);
                  router.replace('/login');
                } catch (err) {
                  Alert.alert(t('error'), getAccountDeleteErrorMessage(err, t));
                } finally {
                  setDeletingAccount(false);
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const openSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=BiraBuddy%20Support`);
  };

  const closeCredentialModal = () => {
    setCredentialModal(null);
    setNewEmail('');
    setNewInstagramUsername('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const openCredentialModal = (type) => {
    setCredentialModal(type);
    setNewEmail('');
    setNewInstagramUsername(type === 'instagram' ? accountInstagram : '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSaveEmail = async () => {
    if (!user?.uid) return;
    if (!newEmail.trim() || !currentPassword) {
      Alert.alert(t('error'), t('enterEmailAndPassword'));
      return;
    }

    setSavingCredential(true);
    try {
      const updatedEmail = await changeUserEmail({
        newEmail,
        currentPassword,
        uid: user.uid,
        instagram: accountInstagram,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDisplayEmail(updatedEmail);
      setAccountUniversity(formatUniversityDisplay(parseUniversityFromEmail(updatedEmail)));
      closeCredentialModal();
      Alert.alert(t('success'), t('emailChangedSuccess'));
    } catch (error) {
      Alert.alert(t('error'), getCredentialChangeErrorMessage(error, t));
    } finally {
      setSavingCredential(false);
    }
  };

  const handleSaveInstagram = async () => {
    if (!user?.uid) return;

    const valueToSave = cleanInstagramHandle(newInstagramUsername);
    if (!isInstagramHandle(valueToSave)) {
      Alert.alert(t('invalidUsername'), t('enterValidInstagram'));
      return;
    }
    if (valueToSave === accountInstagram) {
      closeCredentialModal();
      return;
    }

    const email = (displayEmail || user.email || '').toLowerCase();
    if (!email) {
      Alert.alert(t('error'), t('loginFailed'));
      return;
    }

    setSavingCredential(true);
    try {
      await updateLoginHandle({
        oldHandle: accountLoginHandle || accountInstagram,
        newHandle: valueToSave,
        email,
        uid: user.uid,
      });
      await persistUserField(user.uid, 'instagram', valueToSave);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAccountInstagram(valueToSave);
      setAccountLoginHandle(valueToSave);
      closeCredentialModal();
      Alert.alert(t('success'), t('instagramUpdated'));
    } catch (error) {
      if (error?.code === 'handle-taken') {
        Alert.alert(t('invalidUsername'), t('usernameAlreadyTaken'));
      } else {
        Alert.alert(t('error'), t('failedToUpdateProfile', { error: error.message }));
      }
    } finally {
      setSavingCredential(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('error'), t('passwordsDoNotMatch'));
      return;
    }

    setSavingCredential(true);
    try {
      await changeUserPassword({ currentPassword, newPassword });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeCredentialModal();
      Alert.alert(t('success'), t('passwordChangedSuccess'));
    } catch (error) {
      Alert.alert(t('error'), getCredentialChangeErrorMessage(error, t));
    } finally {
      setSavingCredential(false);
    }
  };

  const switchProps = {
    trackColor: { false: colors.borderSoft, true: colors.accent },
    thumbColor: colors.white,
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Account summary */}
        <View style={styles.accountCard}>
          <View style={styles.accountIcon}>
            <Ionicons name="person-circle-outline" size={40} color={colors.accent} />
          </View>
          <View style={styles.accountInfo}>
            {accountName ? <Text style={styles.accountName}>{accountName}</Text> : null}
            {accountEmail ? <Text style={styles.accountEmail}>{accountEmail}</Text> : null}
            {accountUniversity ? (
              <Text style={styles.accountUniversity}>{accountUniversity}</Text>
            ) : null}
          </View>
        </View>
        <Pressable
          style={styles.editProfileButton}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Ionicons name="create-outline" size={18} color={colors.accent} />
          <Text style={styles.editProfileText}>{t('editProfile')}</Text>
        </Pressable>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>{t('appearance')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('darkMode')}
            subtitle={t('darkModeHint')}
            colors={colors}
            isLast
            right={
              <Switch
                value={isDark}
                onValueChange={(v) => {
                  Haptics.selectionAsync();
                  setDarkMode(v);
                }}
                {...switchProps}
              />
            }
          />
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>{t('notifications')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('friendRequestNotifs')}
            subtitle={t('friendRequestNotifsHint')}
            colors={colors}
            right={
              <Switch
                value={notificationPrefs.friendRequests}
                onValueChange={(v) => updatePref('friendRequests', v)}
                disabled={savingPref}
                {...switchProps}
              />
            }
          />
          <SettingRow
            label={t('socialActivityNotifs')}
            subtitle={t('socialActivityNotifsHint')}
            colors={colors}
            right={
              <Switch
                value={notificationPrefs.socialActivity}
                onValueChange={(v) => updatePref('socialActivity', v)}
                disabled={savingPref}
                {...switchProps}
              />
            }
          />
          <SettingRow
            label={t('roomActivityNotifs')}
            subtitle={t('roomActivityNotifsHint')}
            colors={colors}
            right={
              <Switch
                value={notificationPrefs.roomActivity}
                onValueChange={(v) => updatePref('roomActivity', v)}
                disabled={savingPref}
                {...switchProps}
              />
            }
          />
          <SettingRow
            label={t('messageNotifs')}
            subtitle={t('messageNotifsHint')}
            colors={colors}
            isLast
            right={
              <Switch
                value={notificationPrefs.messages}
                onValueChange={(v) => updatePref('messages', v)}
                disabled={savingPref}
                {...switchProps}
              />
            }
          />
        </View>

        {/* Privacy */}
        <Text style={styles.sectionLabel}>{t('privacyAndSafety')}</Text>
        <View style={styles.card}>
          {blockedUsers.length === 0 ? (
            <View style={styles.emptyBlocked}>
              <Text style={styles.emptyBlockedText}>{t('noBlockedUsers')}</Text>
            </View>
          ) : (
            blockedUsers.map((blocked, index) => (
              <SettingRow
                key={blocked.uid}
                label={blocked.name}
                subtitle={t('blockedUser')}
                colors={colors}
                isLast={index === blockedUsers.length - 1}
                right={
                  <Pressable
                    style={styles.unblockButton}
                    onPress={() => handleUnblock(blocked.uid, blocked.name)}
                  >
                    <Text style={styles.unblockButtonText}>{t('unblock')}</Text>
                  </Pressable>
                }
              />
            ))
          )}
        </View>

        {/* Language */}
        <Text style={styles.sectionLabel}>{t('language')}</Text>
        <View style={styles.card}>
          <LanguagePicker showLabel={false} />
        </View>

        {isAdmin ? (
          <>
            <Text style={styles.sectionLabel}>{t('adminSection')}</Text>
            <View style={styles.card}>
              <SettingRow
                label={t('adminReportsTitle')}
                subtitle={t('adminReportsHint')}
                colors={colors}
                isLast
                onPress={() => router.push('/admin/reports')}
                right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              />
            </View>
          </>
        ) : null}

        {/* Legal & support */}
        <Text style={styles.sectionLabel}>{t('legalAndSupport')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('kvkkText')}
            colors={colors}
            onPress={() =>
              setLegalModal({
                title: t('registerPrivacyModalTitle'),
                documentPath: getPrivacyDocumentPath(i18n.language),
              })
            }
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            label={t('termsAndPrivacy')}
            colors={colors}
            onPress={() =>
              setLegalModal({
                title: t('registerTermsModalTitle'),
                documentPath: getTermsDocumentPath(i18n.language),
              })
            }
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            label={t('contactSupport')}
            subtitle={SUPPORT_EMAIL}
            colors={colors}
            isLast
            onPress={openSupport}
            right={<Ionicons name="mail-outline" size={20} color={colors.textMuted} />}
          />
        </View>

        {/* Account actions */}
        <Text style={styles.sectionLabel}>{t('account')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('changeEmail')}
            subtitle={t('changeEmailHint')}
            colors={colors}
            onPress={() => openCredentialModal('email')}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            label={t('changeInstagramUsername')}
            subtitle={
              accountInstagram ? `@${accountInstagram}` : t('changeInstagramUsernameHint')
            }
            colors={colors}
            onPress={() => openCredentialModal('instagram')}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            label={t('changePassword')}
            subtitle={t('changePasswordHint')}
            colors={colors}
            onPress={() => openCredentialModal('password')}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            label={t('signOut')}
            colors={colors}
            onPress={handleSignOut}
            right={<Ionicons name="log-out-outline" size={20} color={colors.textMuted} />}
          />
          <SettingRow
            label={t('deleteAccount')}
            colors={colors}
            destructive
            isLast
            onPress={handleDeleteAccount}
            right={<Ionicons name="trash-outline" size={20} color={colors.danger} />}
          />
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>{t('about')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('appVersion')}
            colors={colors}
            isLast
            right={<Text style={styles.versionText}>{appVersion}</Text>}
          />
        </View>
      </ScrollView>

      <LegalDocumentModal
        visible={Boolean(legalModal)}
        title={legalModal?.title || ''}
        documentPath={legalModal?.documentPath}
        onClose={() => setLegalModal(null)}
      />

      <Modal
        visible={Boolean(credentialModal)}
        animationType="slide"
        transparent
        onRequestClose={closeCredentialModal}
      >
        <KeyboardAvoidingView
          style={styles.credentialOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.credentialBackdrop} onPress={closeCredentialModal} />
          <View style={styles.credentialSheet}>
            <Text style={styles.credentialTitle}>
              {credentialModal === 'email'
                ? t('changeEmail')
                : credentialModal === 'instagram'
                  ? t('changeInstagramUsername')
                  : t('changePassword')}
            </Text>

            {credentialModal === 'email' ? (
              <>
                <Text style={styles.credentialLabel}>{t('newEmail')}</Text>
                <TextInput
                  style={styles.credentialInput}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder={t('studentEmailPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
              </>
            ) : credentialModal === 'instagram' ? (
              <>
                <Text style={styles.credentialLabel}>{t('instagramUsername')}</Text>
                <TextInput
                  style={styles.credentialInput}
                  value={newInstagramUsername}
                  onChangeText={setNewInstagramUsername}
                  placeholder={t('instagramEditPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                />
                <Text style={styles.credentialHint}>{t('dontIncludeAt')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.credentialLabel}>{t('newPassword')}</Text>
                <TextInput
                  style={styles.credentialInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t('passwordPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                />
                <Text style={styles.credentialLabel}>{t('confirmNewPassword')}</Text>
                <TextInput
                  style={styles.credentialInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={t('confirmNewPassword')}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                />
              </>
            )}

            {credentialModal !== 'instagram' ? (
              <>
                <Text style={styles.credentialLabel}>{t('currentPassword')}</Text>
                <TextInput
                  style={styles.credentialInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder={t('currentPassword')}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                />
              </>
            ) : null}

            <View style={styles.credentialActions}>
              <Pressable style={styles.credentialCancel} onPress={closeCredentialModal}>
                <Text style={styles.credentialCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.credentialSave, savingCredential && styles.credentialSaveDisabled]}
                onPress={
                  credentialModal === 'email'
                    ? handleSaveEmail
                    : credentialModal === 'instagram'
                      ? handleSaveInstagram
                      : handleSavePassword
                }
                disabled={savingCredential}
              >
                {savingCredential ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={styles.credentialSaveText}>{t('save')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    headerSpacer: { width: 40 },
    content: {
      padding: 20,
      paddingBottom: 48,
    },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.panel,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    accountIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.panelElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountInfo: { flex: 1, gap: 2 },
    accountName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    accountEmail: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    accountUniversity: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    editProfileButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      marginBottom: 12,
    },
    editProfileText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.accent,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.panel,
      borderRadius: 16,
      paddingHorizontal: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    emptyBlocked: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    emptyBlockedText: {
      color: colors.textMuted,
      fontSize: 14,
    },
    unblockButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    unblockButtonText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    languageRow: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 14,
    },
    languageOption: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    languageOptionActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    languageOptionText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    languageOptionTextActive: {
      color: colors.onAccent,
    },
    versionText: {
      fontSize: 15,
      color: colors.textMuted,
      fontWeight: '600',
    },
    credentialOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    credentialBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    credentialSheet: {
      backgroundColor: colors.panel,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 32,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    credentialTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    credentialLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 6,
      marginTop: 10,
    },
    credentialInput: {
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.textPrimary,
    },
    credentialHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
      lineHeight: 17,
    },
    credentialActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 24,
    },
    credentialCancel: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    credentialCancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    credentialSave: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.accent,
    },
    credentialSaveDisabled: {
      opacity: 0.7,
    },
    credentialSaveText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.onAccent,
    },
  });
}
