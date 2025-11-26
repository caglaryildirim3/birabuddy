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

  // ✅ VALIDATION: Accepts .edu.tr OR .edu
  const validateEmail = (email) => {
    const emailLower = email.toLowerCase().trim();
    
    const isEduTr = emailLower.endsWith('.edu.tr');
    const isEdu = emailLower.endsWith('.edu');

    if (!isEduTr && !isEdu) {
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
      Alert.alert('Invalid Email', 'Please enter a valid university email ending in .edu.tr or .edu');
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
      Alert.alert('Invalid Email', 'Your email must end with .edu.tr or .edu');
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
      
      // ✅ THIS IS THE UPDATE FOR BANNED USERS
      if (error.code === 'auth/user-disabled') {
        msg = '⛔ Your account has been disabled by an administrator due to violations.';
      } 
      else if (error.code === 'auth/user-not-found') {
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
      <Text style={styles.title}>birabuddy</Text>
      
      <TextInput
        style={styles.input}
        placeholder="student email (.edu or .edu.tr)"
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
      
      {/* Main Login Button */}
      <Pressable 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>log in</Text>}
      </Pressable>

      <View style={styles.helperLinks}>
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
            onPress={handleResendVerification}
            disabled={resendLoading}
        >
            <Text style={styles.resendText}>
                {resendLoading ? "Sending..." : "resend verification"}
            </Text>
        </Pressable>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Prominent Register Button */}
      <Link href="/register" asChild>
        <Pressable style={styles.registerButton}>
          <Text style={styles.registerButtonText}>create a new account</Text>
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
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: '#333',
    borderWidth: 1,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
  helperLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingHorizontal: 4,
  },
  forgotButtonText: {
    color: '#bbb',
    fontSize: 14,
  },
  resendText: {
    color: '#bbb',
    fontSize: 14,
  },
  
  /* New Divider Styles */
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    paddingHorizontal: 10,
    fontSize: 14,
  },

  /* New Register Button Styles */
  registerButton: {
    backgroundColor: '#1e1e1e', // Dark background for contrast
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});