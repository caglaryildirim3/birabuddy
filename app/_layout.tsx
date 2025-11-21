import { Stack, usePathname, useRouter } from 'expo-router';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../firebase/firebaseConfig';

export default function Layout() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== '/login' && pathname !== '/register') {
        router.replace('/login');
      } else if (user && (pathname === '/login' || pathname === '/register')) {
        router.replace('/');
      }
    }
  }, [user, loading, pathname]);

  if (loading) {
    return (
      // Updated loading screen to match your Pink/Purple theme
      <View style={{ flex: 1, backgroundColor: '#4A3B47', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#E8A4C7" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false, // 👈 THIS removes the black border/header
        contentStyle: { backgroundColor: '#4A3B47' }, // 👈 Matches your app theme
        animation: 'fade', // Optional: Makes screen transitions smoother
      }}
    />
  );
}