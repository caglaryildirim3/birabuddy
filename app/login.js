import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth'; // 👈 ADDED sendPasswordResetEmail
import { auth, db } from '../firebase/firebaseConfig';
import { Link, useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false); // 👈 ADDED forgot password loading state
  const router = useRouter();

  const allowedDomain = "@std.bogazici.edu.tr";

  const validateEmail = (email) => {
    // Check if email ends with allowed domain (case insensitive)
    if (!email.toLowerCase().endsWith(allowedDomain.toLowerCase())) {
      return false;
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // 👈 ADDED forgot password function
  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your student email first, then tap "forgot password?"');
      return;
    }

    // Validate email domain
    if (!validateEmail(trimmedEmail)) {
      Alert.alert(
        'Invalid Email',
        `Please use your Boğaziçi University student email (${allowedDomain})`
      );
      return;
    }

    setForgotLoading(true);
    
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      
      Alert.alert(
        'Reset Email Sent! 📧',
        `We've sent a password reset link to ${trimmedEmail}. Check your student mail inbox and spam folder.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.log('Password reset error:', error);
      
      let errorMessage = 'Failed to send reset email. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address. Please register first.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many reset requests. Please wait before trying again.';
      }
      
      Alert.alert('Reset Failed', errorMessage);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail || !password) {
      Alert.alert('Missing Information', 'Please enter your email and password first.');
      return;
    }

    setResendLoading(true);
    
    try {
      // Sign in the user temporarily to send verification email
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      
      // Send verification email
      await sendEmailVerification(userCredential.user);
      
      // Sign them out immediately
      await signOut(auth);
      
      Alert.alert(
        'Verification Email Sent',
        'A new verification email has been sent to your inbox. Please check your email and click the verification link, then try logging in again.'
      );
    } catch (error) {
      console.log('Resend verification error:', error);
      
      let errorMessage = 'Failed to send verification email. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please register first.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please enter the correct password to resend verification email.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please wait a moment before trying again.';
      }
      
      Alert.alert('Error', errorMessage);
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

    // Validate email domain
    if (!validateEmail(trimmedEmail)) {
      Alert.alert(
        'Invalid Email',
        `Please use your Boğaziçi University student email (${allowedDomain})`
      );
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      
      // Reload user to get the latest emailVerified status
      await userCredential.user.reload();
      
      // Check if email is verified (using the refreshed user data)
      if (!userCredential.user.emailVerified) {
        await signOut(auth); // Log them out immediately
        
        Alert.alert(
          'Email Not Verified',
          'You must verify your email before logging in. Check your inbox for the verification link.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Resend Email',
              onPress: handleResendVerification
            }
          ]
        );
        return;
      }

      // Update last login time and verification status in Firestore
      try {
        await updateDoc(doc(db, 'users', userCredential.user.uid), {
          lastLogin: new Date(),
          emailVerified: true
        });
      } catch (error) {
        // Don't block login if this fails
        console.log('Failed to update last login:', error);
      }

      // Successfully logged in
      router.replace('/');

    } catch (error) {
      console.log('Login error:', error);
      
      let errorMessage = 'Login failed. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please register first.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Contact support.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      }
      
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>welcome back :3</Text>
      <Text style={styles.subtitle}></Text>
      
      <TextInput
        style={styles.input}
        placeholder="student email (@std.bogazici.edu.tr)"
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
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>log in</Text>
        )}
      </Pressable>

      {/* 👈 ADDED forgot password button */}
      <Pressable 
        style={[styles.forgotButton, forgotLoading && styles.buttonDisabled]} 
        onPress={handleForgotPassword}
        disabled={forgotLoading}
      >
        {forgotLoading ? (
          <ActivityIndicator size="small" color="#bbb" />
        ) : (
          <Text style={styles.forgotButtonText}>forgot password?</Text>
        )}
      </Pressable>

      {/* Standalone resend button */}
      <Pressable 
        style={[styles.resendButton, resendLoading && styles.buttonDisabled]} 
        onPress={handleResendVerification}
        disabled={resendLoading}
      >
        {resendLoading ? (
          <ActivityIndicator size="small" color="#bbb" />
        ) : (
          <Text style={styles.resendButtonText}>resend verification email</Text>
        )}
      </Pressable>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ⚠️ You must verify your email before you can log in. Check your student mail inbox!
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
  subtitle: {
    fontSize: 14,
    color: '#bbb',
    marginBottom: 30,
    textAlign: 'center',
    opacity: 0.8,
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
  // 👈 ADDED forgot password button styles
  forgotButton: {
    backgroundColor: 'transparent',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  forgotButtonText: {
    color: '#bbb',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  resendButton: {
    backgroundColor: 'transparent',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    borderColor: '#444',
    borderWidth: 1,
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