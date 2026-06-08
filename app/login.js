import { Link, useRouter } from 'expo-router';
import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';
import { ensureLoginHandleForUser, resolveLoginEmail } from '../utils/authUtils';

export default function Login() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();

  const getLoginErrorMessage = (error) => {
    if (error.code === 'missing-identifier') return t('enterIdentifierAndPassword');
    if (error.code === 'invalid-email') return t('yourEmailMustEnd');
    if (error.code === 'invalid-instagram') return t('invalidInstagramLogin');
    if (error.code === 'user-not-found') return t('noAccountFoundRegister');
    return t('loginFailed');
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
        Alert.alert(t('error'), getLoginErrorMessage(error));
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
        router.replace('/(tabs)/feed');
      } else {
        await sendEmailVerification(userCredential.user);
        await signOut(auth);
      }
    } catch (error) {
      console.log('Resend error:', error);
      if (error.code === 'missing-identifier' || error.code === 'invalid-email' || error.code === 'invalid-instagram' || error.code === 'user-not-found') {
        Alert.alert(t('error'), getLoginErrorMessage(error));
        return;
      }

      let msg = t('couldNotSendEmail');
      if (error.code === 'auth/user-not-found') msg = t('noAccountWithEmail');
      else if (error.code === 'auth/wrong-password') msg = t('wrongPassword');
      else if (error.code === 'auth/too-many-requests') msg = t('tooManyAttempts');

      Alert.alert(t('error'), msg);
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
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userSnap = await getDoc(userRef);
        await updateDoc(userRef, {
          lastLogin: new Date(),
          emailVerified: true,
        });
        if (userSnap.exists()) {
          await ensureLoginHandleForUser(userCredential.user.uid, userSnap.data());
        }
      } catch (e) {
        console.log('Firestore update ignored');
      }

      router.replace('/(tabs)/feed');
    } catch (error) {
      console.log('Login error:', error);

      if (error.code === 'missing-identifier' || error.code === 'invalid-email' || error.code === 'invalid-instagram' || error.code === 'user-not-found') {
        Alert.alert(t('loginFailed'), getLoginErrorMessage(error));
        return;
      }

      let msg = t('loginFailed');
      if (error.code === 'auth/user-disabled') {
        msg = t('accountDisabled');
      } else if (error.code === 'auth/user-not-found') {
        msg = t('noAccountFoundRegister');
      } else if (error.code === 'auth/wrong-password') {
        msg = t('incorrectPassword');
      } else if (error.code === 'auth/invalid-email') {
        msg = t('invalidEmailFormat');
      } else if (error.code === 'auth/too-many-requests') {
        msg = t('accountLocked');
      }

      Alert.alert(t('loginFailed'), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('appName')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('loginIdentifierPlaceholder')}
        placeholderTextColor={BeerColors.textMuted}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
      />

      <TextInput
        style={styles.input}
        placeholder={t('passwordPlaceholder')}
        placeholderTextColor={BeerColors.textMuted}
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
          <ActivityIndicator color={BeerColors.onAccent} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    color: BeerColors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: BeerColors.panel,
    color: BeerColors.textPrimary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: BeerColors.borderSoft,
    borderWidth: 1,
    fontSize: 16,
  },
  button: {
    backgroundColor: BeerColors.accent,
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
    color: BeerColors.onAccent,
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
    color: BeerColors.textSecondary,
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
    backgroundColor: BeerColors.borderSoft,
  },
  dividerText: {
    color: BeerColors.textMuted,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  registerButton: {
    backgroundColor: BeerColors.panel,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BeerColors.accent,
  },
  registerButtonText: {
    color: BeerColors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
