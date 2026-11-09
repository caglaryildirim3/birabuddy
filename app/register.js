import { Link, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, signOut } from 'firebase/auth';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LanguagePicker from '../components/LanguagePicker';
import LegalDocumentModal from '../components/LegalDocumentModal';
import { useTheme } from '../contexts/ThemeContext';
import { auth } from '../firebase/firebaseConfig';
import {
  cleanInstagramHandle,
  getUserDisplayName,
  isInstagramHandle,
  isLoginHandleAvailable,
  isValidPassword,
  parseUniversityFromEmail,
  setLoginHandle,
} from '../utils/authUtils';
import {
  getPrivacyDocumentPath,
  getTermsDocumentPath,
} from '../utils/legalDocumentUtils';
import { fetchEmailModerationBlock } from '../utils/moderationUtils';
import { setPrivateUser, setPublicUser } from '../utils/userDocUtils';

export default function Register() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [instagramUsername, setInstagramUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalModal, setLegalModal] = useState(null);

  const router = useRouter();

  const validateEmail = (email) => {
    const emailLower = email.toLowerCase().trim();

    const isEduTr = emailLower.endsWith('.edu.tr');
    const isEdu = emailLower.endsWith('.edu');

    if (!isEduTr && !isEdu) {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateInstagramUsername = (username) => isInstagramHandle(username);

  const openPrivacyDocument = () => {
    setLegalModal({
      title: t('registerPrivacyModalTitle'),
      documentPath: getPrivacyDocumentPath(i18n.language),
    });
  };

  const openTermsDocument = () => {
    setLegalModal({
      title: t('registerTermsModalTitle'),
      documentPath: getTermsDocumentPath(i18n.language),
    });
  };

  const handleRegister = async () => {
    const trimmedEmail = email.trim();
    const trimmedInstagramUsername = cleanInstagramHandle(instagramUsername);

    if (!trimmedEmail || !password || !trimmedInstagramUsername) {
      Alert.alert(t('missingFields'), t('missingFieldsRegister'));
      return;
    }

    if (!kvkkAccepted) {
      Alert.alert(t('kvkkRequired'), t('kvkkRequiredMessage'));
      return;
    }

    if (!ageConfirmed) {
      Alert.alert(t('ageConfirmRequired'), t('ageConfirmMessage'));
      return;
    }

    if (!termsAccepted) {
      Alert.alert(t('termsRequired'), t('termsRequiredMessage'));
      return;
    }

    if (!validateInstagramUsername(trimmedInstagramUsername)) {
      Alert.alert(
        t('invalidUsername'),
        t('invalidInstagramUsername')
      );
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert(
        t('invalidEmail'),
        t('invalidEmailRegister')
      );
      return;
    }

    if (!isValidPassword(password)) {
      Alert.alert(
        t('weakPassword'),
        t('weakPassword')
      );
      return;
    }

    setLoading(true);
    let userCredential = null;

    try {
      const emailBlock = await fetchEmailModerationBlock(trimmedEmail);
      if (emailBlock) {
        if (emailBlock.reason === 'banned') {
          Alert.alert(t('accountBannedTitle'), t('registrationEmailBanned'));
        } else {
          const untilStr = emailBlock.until?.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
          Alert.alert(
            t('accountSuspendedTitle'),
            t('registrationEmailSuspended', { date: untilStr || '' })
          );
        }
        return;
      }

      const handleAvailable = await isLoginHandleAvailable(trimmedInstagramUsername, null);
      if (!handleAvailable) {
        Alert.alert(t('invalidUsername'), t('usernameAlreadyTaken'));
        return;
      }

      console.log('Creating user account...');
      userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      console.log('User account created successfully');

      console.log('Sending verification email...');
      try {
        await sendEmailVerification(userCredential.user);
        console.log('Verification email sent');
      } catch (emailError) {
        console.log('Email verification error:', emailError);
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {}

        Alert.alert(
          t('registrationFailed'),
          t('registrationFailed')
        );
        return;
      }

      const university = parseUniversityFromEmail(trimmedEmail);

      console.log('Saving user data to Firestore...');
      try {
        const uid = userCredential.user.uid;
        await setPublicUser(uid, {
          name: getUserDisplayName({}, trimmedEmail),
          instagram: trimmedInstagramUsername,
          university: university,
        }, false);
        await setPrivateUser(uid, {
          email: trimmedEmail,
          emailVerified: false,
          loginHandle: trimmedInstagramUsername,
          createdAt: new Date(),
          lastLogin: null,
          kvkkConsent: true,
          kvkkConsentDate: new Date(),
          kvkkConsentVersion: '1.0',
          ageConfirmed: true,
          ageConfirmationDate: new Date(),
          termsAccepted: true,
          termsAcceptanceDate: new Date(),
          termsVersion: '1.0',
          onboardingComplete: false,
        }, false);

        await setLoginHandle({
          handle: trimmedInstagramUsername,
          email: trimmedEmail,
          uid: userCredential.user.uid,
        });
      } catch (firestoreError) {
        console.log('Firestore error during registration:', firestoreError);
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {}

        Alert.alert(t('registrationFailed'), t('registrationFailed'));
        return;
      }

      console.log('Signing out user...');
      await signOut(auth);

      Alert.alert(
        t('registrationVerifyTitle'),
        t('registrationVerifyMessage', { email: trimmedEmail }),
        [
          {
            text: t('ok'),
            onPress: () =>
              router.replace({
                pathname: '/login',
                params: { registered: '1', email: trimmedEmail },
              }),
          },
        ],
        { cancelable: false }
      );

    } catch (error) {
      console.log('Registration error:', error);

      if (userCredential?.user) {
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {}
      }

      let errorMessage = t('registrationFailedGeneric');

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = t('emailAlreadyInUse');
      } else if (error.code === 'auth/weak-password') {
        errorMessage = t('passwordTooWeak');
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = t('invalidEmailAddress');
      }

      Alert.alert(t('registrationFailed'), errorMessage);
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
        <Text style={styles.title}>{t('joinMeetups')}</Text>
        <Text style={styles.subtitle}>{t('forUniversityStudents')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('instagramUsernamePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={instagramUsername}
          onChangeText={setInstagramUsername}
          maxLength={30}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder={t('studentEmailRegister')}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
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

        <View style={styles.agreementsContainer}>
          <View style={styles.agreementItem}>
            <View style={styles.checkboxRow}>
              <Pressable onPress={() => setKvkkAccepted(!kvkkAccepted)} hitSlop={6}>
                <View style={[styles.checkbox, kvkkAccepted && styles.checkboxChecked]}>
                  {kvkkAccepted ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
              </Pressable>
              <Text style={styles.checkboxText}>
                {t('registerPrivacyPrefix')}
                <Text style={styles.linkText} onPress={openPrivacyDocument}>
                  {t('registerPrivacyLink')}
                </Text>
              </Text>
            </View>
          </View>

          <View style={styles.agreementItem}>
            <View style={styles.checkboxRow}>
              <Pressable onPress={() => setAgeConfirmed(!ageConfirmed)} hitSlop={6}>
                <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                  {ageConfirmed ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
              </Pressable>
              <Pressable style={styles.labelPress} onPress={() => setAgeConfirmed(!ageConfirmed)}>
                <Text style={styles.checkboxText}>{t('ageConfirmation')}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.agreementItem}>
            <View style={styles.checkboxRow}>
              <Pressable onPress={() => setTermsAccepted(!termsAccepted)} hitSlop={6}>
                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                  {termsAccepted ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
              </Pressable>
              <Text style={styles.checkboxText}>
                {t('registerTermsPrefix')}
                <Text style={styles.linkText} onPress={openTermsDocument}>
                  {t('registerTermsLink')}
                </Text>
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('createAccount')}</Text>
          )}
        </Pressable>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            📧 {t('verificationEmailInfo')}
          </Text>
        </View>

        <Link href="/login" asChild>
          <Pressable>
            <Text style={styles.link}>{t('alreadyHaveAccount')}</Text>
          </Pressable>
        </Link>
      </ScrollView>

      <LegalDocumentModal
        visible={Boolean(legalModal)}
        title={legalModal?.title || ''}
        documentPath={legalModal?.documentPath}
        onClose={() => setLegalModal(null)}
      />
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
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: safeTop + 48,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 30,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    backgroundColor: colors.panel,
    color: colors.textPrimary,
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 12,
  },
  agreementsContainer: {
    marginBottom: 16,
    backgroundColor: colors.panelSoft,
    padding: 12,
    borderRadius: 8,
  },
  agreementItem: {
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labelPress: {
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: colors.borderSoft,
    borderRadius: 3,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxText: {
    color: colors.textPrimary,
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  linkText: {
    color: colors.textPrimary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: colors.panelSoft,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  link: {
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
});
