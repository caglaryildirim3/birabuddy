import { Stack, useRouter, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import type { User } from 'firebase/auth';
import { View, ActivityIndicator } from 'react-native';

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
      <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#121212' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#121212' },
      }}
    />
  );
}
