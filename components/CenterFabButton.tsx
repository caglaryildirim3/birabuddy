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
import { usePostModal } from '../contexts/PostModalContext';

export function CenterFabButton(_props: BottomTabBarButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { openPostModal } = usePostModal();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openSheet = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSheetVisible(true);
  };

  const closeSheet = () => setSheetVisible(false);

  const handleCreateRoom = () => {
    closeSheet();
    router.push('/create-room');
  };

  const handleShareMemory = () => {
    closeSheet();
    openPostModal();
  };

  return (
    <>
      <View style={styles.fabSlot}>
        <Pressable style={styles.fab} onPress={openSheet}>
          <Ionicons name="add" size={32} color={colors.onAccent} />
        </Pressable>
      </View>

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
            <Pressable style={styles.sheetOption} onPress={handleCreateRoom}>
              <Ionicons name="beer-outline" size={22} color={colors.iconPrimary} />
              <Text style={styles.sheetOptionText}>{t('createARoom')}</Text>
            </Pressable>

            <Pressable
              style={styles.sheetOption}
              onPress={handleShareMemory}
            >
              <Ionicons name="camera-outline" size={22} color={colors.iconPrimary} />
              <Text style={styles.sheetOptionText}>{t('shareMemory')}</Text>
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
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -18,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
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
