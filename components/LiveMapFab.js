import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAnyFriendLive } from '../hooks/useAnyFriendLive';

export default function LiveMapFab() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const anyFriendLive = useAnyFriendLive();

  return (
    <Pressable
      style={styles.fab}
      onPress={() => router.push('/live-map')}
      accessibilityLabel="Live map"
    >
      <Ionicons name="globe-outline" size={26} color={colors.onAccent} />
      {anyFriendLive ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: 110,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 8,
      zIndex: 20,
    },
    dot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#4CAF50',
      borderWidth: 2,
      borderColor: colors.accent,
    },
  });
