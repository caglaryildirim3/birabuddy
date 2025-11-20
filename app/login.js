import { Link, useRouter } from 'expo-router';
import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();

  // ✅ VALIDATION: Accepts ANY email ending in .edu.tr
  const validateEmail = (email) => {
    const emailLower = email.toLowerCase().trim();
    if (!emailLower.endsWith('.edu.tr')) {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailLower);
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your student email first.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid university email ending in .edu.tr');
      return;
    }

    setForgotLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      Alert.alert('Reset Email Sent! 📧', `Check your inbox at ${trimmedEmail}.`);
    } catch (error) {
      let msg = 'Failed to send reset email.';
      if (error.code === 'auth/user-not-found') msg = 'No account found. Please register first.';
      Alert.alert('Error', msg);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail || !password) {
      Alert.alert('Missing Info', 'Enter email and password to resend verification.');
      return;
    }

    setResendLoading(true);
    try {
      // We must sign in to send the email
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      
      if (userCredential.user.emailVerified) {
        Alert.alert('Already Verified', 'Your email is already verified! You can log in.');
      } else {
        await sendEmailVerification(userCredential.user);
        await signOut(auth);
        Alert.alert('Sent! 📧', 'Verification email sent. Please check your inbox and spam folder.');
      }
    } catch (error) {
      console.log('Resend error:', error);
      let msg = 'Could not send email.';
      
      // 🔍 DIAGNOSIS MESSAGES
      if (error.code === 'auth/user-not-found') msg = 'No account exists with this email. Please Register first.';
      else if (error.code === 'auth/wrong-password') msg = 'Wrong password.';
      else if (error.code === 'auth/too-many-requests') msg = 'Too many attempts. Please wait a while.';
      
      Alert.alert('Error', msg);
    } finally {
      setResendLoading(false);
    }
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Your email must end with .edu.tr');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      
      // Refresh user data to check verification status
      await userCredential.user.reload();
      
      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        Alert.alert(
          'Email Not Verified',
          'Please verify your email before logging in.',
          [
            { text: 'OK' },
            { text: 'Resend Email', onPress: handleResendVerification }
          ]
        );
        return;
      }

      // Update last login
      try {
        await updateDoc(doc(db, 'users', userCredential.user.uid), {
          lastLogin: new Date(),
          emailVerified: true
        });
      } catch (e) {
        console.log('Firestore update ignored');
      }

      router.replace('/');

    } catch (error) {
      console.log('Login error:', error);
      let msg = 'Login failed.';
      
      // 🔍 DETAILED ERROR MESSAGES FOR DEBUGGING
      if (error.code === 'auth/user-not-found') {
        msg = 'No account found. Please go to Register.';
      } else if (error.code === 'auth/wrong-password') {
        msg = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Invalid email format.';
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Account temporarily locked due to many failed attempts. Reset password or wait.';
      }
      
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>welcome back :3</Text>
      
      <TextInput
        style={styles.input}
        placeholder="student email (ending with .edu.tr)"
        placeholderTextColor="#aaa"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      
      <TextInput
        style={styles.input}
        placeholder="password"
        placeholderTextColor="#aaa"
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
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>log in</Text>}
      </Pressable>

      <Pressable 
        style={styles.forgotButton} 
        onPress={handleForgotPassword}
        disabled={forgotLoading}
      >
        <Text style={styles.forgotButtonText}>
            {forgotLoading ? "Sending..." : "forgot password?"}
        </Text>
      </Pressable>

      <Pressable 
        style={styles.resendButton} 
        onPress={handleResendVerification}
        disabled={resendLoading}
      >
        <Text style={styles.resendButtonText}>
            {resendLoading ? "Sending..." : "resend verification email"}
        </Text>
      </Pressable>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ⚠️ If "Resend" fails with "No account found", you must Register first.
        </Text>
      </View>

      <Link href="/register" asChild>
        <Pressable>
          <Text style={styles.link}>don't have an account? register</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderColor: '#444',
    borderWidth: 1,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#333',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotButton: {
    alignItems: 'center',
    marginBottom: 12,
  },
  forgotButtonText: {
    color: '#bbb',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  resendButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  resendButtonText: {
    color: '#bbb',
    fontSize: 14,
  },
  infoBox: {
    backgroundColor: 'rgba(51, 51, 51, 0.5)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    color: '#bbb',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  link: {
    color: '#bbb',
    textAlign: 'center',
    marginTop: 10,
    textDecorationLine: 'underline',
  },
});