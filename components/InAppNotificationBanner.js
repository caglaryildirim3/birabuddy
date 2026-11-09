import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

const AUTO_DISMISS_MS = 4500;

export default function InAppNotificationBanner({ banner, onDismiss, onPress }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-120);
  const dismissTimerRef = useRef(null);

  const hideBanner = () => {
    translateY.value = withTiming(-120, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onDismiss)();
    });
  };

  useEffect(() => {
    if (!banner) return undefined;

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    translateY.value = withTiming(0, { duration: 240 });
    dismissTimerRef.current = setTimeout(hideBanner, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [banner?.id]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!banner) return null;

  const iconName =
    banner.source === 'chat'
      ? 'chatbubble-outline'
      : banner.type === 'friend_request'
        ? 'person-add-outline'
        : banner.source === 'room'
          ? 'notifications-outline'
          : 'heart-outline';

  const avatarInitial = (banner.senderName || banner.title || '?').charAt(0).toUpperCase();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + 8 }, animatedStyle]}
    >
      <Pressable style={styles.banner} onPress={() => onPress?.(banner)}>
        {banner.senderPhotoUrl ? (
          <Image
            source={{ uri: banner.senderPhotoUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={styles.iconWrap}>
            {banner.source === 'chat' ? (
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            ) : (
              <Ionicons name={iconName} size={20} color={colors.accent} />
            )}
          </View>
        )}
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {banner.message}
          </Text>
        </View>
        <Pressable style={styles.closeButton} onPress={hideBanner} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 9999,
      elevation: 12,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.panel,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.panelElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: '700',
    },
    textWrap: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 2,
    },
    message: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    closeButton: {
      padding: 4,
    },
  });
