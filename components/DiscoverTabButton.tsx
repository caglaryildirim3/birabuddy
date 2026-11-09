import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useNotificationIndicators } from '../contexts/NotificationContext';

export function DiscoverTabButton({ children, ...props }: BottomTabBarButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { showFriendsDot } = useNotificationIndicators();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openSheet = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSheetVisible(true);
  };

  const closeSheet = () => setSheetVisible(false);

  const handleFriends = () => {
    closeSheet();
    router.push('/friends-list');
  };

  const handleRooms = () => {
    closeSheet();
    router.navigate('/(tabs)/discover');
  };

  return (
    <>
      <Pressable {...props} onPress={openSheet}>
        {children}
      </Pressable>

      {sheetVisible ? (
        <Modal
          animationType="slide"
          transparent
          visible
          presentationStyle="overFullScreen"
          onRequestClose={closeSheet}
        >
          <Pressable style={styles.overlay} onPress={closeSheet}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <Pressable style={styles.sheetOption} onPress={handleFriends}>
                <Ionicons name="people-outline" size={22} color={colors.iconPrimary} />
                <Text style={styles.sheetOptionText}>{t('friendsNav')}</Text>
                {showFriendsDot ? <View style={styles.optionDot} /> : null}
              </Pressable>
              <Pressable style={styles.sheetOption} onPress={handleRooms}>
                <Ionicons name="search-outline" size={22} color={colors.iconPrimary} />
                <Text style={styles.sheetOptionText}>{t('roomsNav')}</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={closeSheet}>
                <Text style={styles.cancelText}>{t('cancel')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayHeavy,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.panel,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 36,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      alignSelf: 'center',
      marginBottom: 20,
    },
    sheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.panelElevated,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    optionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.notificationDot,
      marginLeft: 'auto',
    },
    sheetOptionText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButton: {
      marginTop: 8,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
