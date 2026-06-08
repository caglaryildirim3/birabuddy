import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import i18n from '../i18n';
import { getBlockedUserIds, unblockUser } from '../utils/blockUtils';
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  updateNotificationPrefs,
} from '../utils/settingsUtils';

function SettingRow({ label, subtitle, right, onPress, colors, destructive }) {
  const content = (
    <View style={[rowStyles.row, { borderBottomColor: colors.borderSoft }]}>
      <View style={rowStyles.rowText}>
        <Text style={[rowStyles.rowLabel, { color: destructive ? colors.danger : colors.textPrimary }]}>
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
    return <Pressable onPress={onPress}>{content}</Pressable>;
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
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 3, lineHeight: 18 },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { t, i18n: i18nInstance } = useTranslation();
  const { colors, isDark, setDarkMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [savingPref, setSavingPref] = useState(false);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const loadSettings = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);

    try {
      const prefs = await getNotificationPrefs(user.uid);
      setNotificationPrefs(prefs);
    } catch (error) {
      console.error('Failed to load notification prefs:', error);
    }

    try {
      const blockedIds = await getBlockedUserIds(user.uid);
      const users = await Promise.all(
        blockedIds.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (!snap.exists()) return { uid, name: 'Unknown user' };
            const data = snap.data();
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
      console.error('Failed to load blocked users:', error);
      setBlockedUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updatePref = async (key, value) => {
    if (!user?.uid) return;
    const next = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(next);
    setSavingPref(true);
    try {
      await updateNotificationPrefs(user.uid, next);
    } catch (error) {
      setNotificationPrefs(notificationPrefs);
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
                try {
                  await deleteDoc(doc(db, 'users', user.uid));
                  await user.delete();
                  router.replace('/login');
                } catch (err) {
                  Alert.alert(t('error'), t('failedToDelete', { error: err.message }));
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <Text style={styles.sectionLabel}>{t('appearance')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('darkMode')}
            subtitle={t('darkModeHint')}
            colors={colors}
            right={
              <Switch
                value={isDark}
                onValueChange={setDarkMode}
                trackColor={{ false: colors.borderSoft, true: colors.accent }}
                thumbColor={colors.white}
              />
            }
          />
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>{t('notifications')}</Text>
        <View style={styles.card}>
          <SettingRow
            label={t('friendRequestNotifs')}
            colors={colors}
            right={
              <Switch
                value={notificationPrefs.friendRequests}
                onValueChange={(v) => updatePref('friendRequests', v)}
                disabled={savingPref}
                trackColor={{ false: colors.borderSoft, true: colors.accent }}
                thumbColor={colors.white}
              />
            }
          />
          <SettingRow
            label={t('roomActivityNotifs')}
            colors={colors}
            right={
              <Switch
                value={notificationPrefs.roomActivity}
                onValueChange={(v) => updatePref('roomActivity', v)}
                disabled={savingPref}
                trackColor={{ false: colors.borderSoft, true: colors.accent }}
                thumbColor={colors.white}
              />
            }
          />
          <SettingRow
            label={t('messageNotifs')}
            colors={colors}
            right={
              <Switch
                value={notificationPrefs.messages}
                onValueChange={(v) => updatePref('messages', v)}
                disabled={savingPref}
                trackColor={{ false: colors.borderSoft, true: colors.accent }}
                thumbColor={colors.white}
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
            blockedUsers.map((blocked) => (
              <SettingRow
                key={blocked.uid}
                label={blocked.name}
                subtitle={t('blockedUser')}
                colors={colors}
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
          <View style={styles.languageRow}>
            <Pressable
              style={[
                styles.languageOption,
                i18nInstance.language === 'en' && styles.languageOptionActive,
              ]}
              onPress={() => changeLanguage('en')}
            >
              <Text
                style={[
                  styles.languageOptionText,
                  i18nInstance.language === 'en' && styles.languageOptionTextActive,
                ]}
              >
                English
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.languageOption,
                i18nInstance.language === 'tr' && styles.languageOptionActive,
              ]}
              onPress={() => changeLanguage('tr')}
            >
              <Text
                style={[
                  styles.languageOptionText,
                  i18nInstance.language === 'tr' && styles.languageOptionTextActive,
                ]}
              >
                Türkçe
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>{t('account')}</Text>
        <View style={styles.card}>
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
            right={<Text style={styles.versionText}>{appVersion}</Text>}
          />
        </View>
      </ScrollView>
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
  });
}
