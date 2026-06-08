import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import BeerColors from '../constants/BeerColors';
import { useOutTonight } from '../contexts/OutTonightContext';
import { usePostModal } from '../contexts/PostModalContext';

export function CenterFabButton(_props: BottomTabBarButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { openPostModal } = usePostModal();
  const { isOut, openGoLiveModal, cancelStatus } = useOutTonight();
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

  const handleOutTonight = () => {
    closeSheet();
    if (isOut) {
      cancelStatus();
    } else {
      openGoLiveModal();
    }
  };

  const handleShareMemory = () => {
    closeSheet();
    openPostModal();
  };

  return (
    <>
      <View style={styles.fabSlot}>
        <Pressable style={styles.fab} onPress={openSheet}>
          <Ionicons name="add" size={32} color={BeerColors.onAccent} />
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={sheetVisible}
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.overlay} onPress={closeSheet}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Pressable style={styles.sheetOption} onPress={handleOutTonight}>
              <Ionicons
                name={isOut ? 'home-outline' : 'radio-button-on'}
                size={22}
                color={isOut ? BeerColors.danger : '#4CAF50'}
              />
              <Text style={styles.sheetOptionText}>
                {isOut ? "I'm home 🔴" : 'Go live!'}
              </Text>
            </Pressable>

            <Pressable style={styles.sheetOption} onPress={handleCreateRoom}>
              <Ionicons name="beer-outline" size={22} color={BeerColors.iconPrimary} />
              <Text style={styles.sheetOptionText}>{t('createARoom')}</Text>
            </Pressable>

            <Pressable
              style={styles.sheetOption}
              onPress={handleShareMemory}
            >
              <Ionicons name="camera-outline" size={22} color={BeerColors.iconPrimary} />
              <Text style={styles.sheetOptionText}>Share a memory</Text>
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={closeSheet}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: BeerColors.accent,
    borderWidth: 1,
    borderColor: BeerColors.borderStrong,
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
    backgroundColor: BeerColors.overlayHeavy,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BeerColors.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BeerColors.borderStrong,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  sheetOptionText: {
    color: BeerColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: BeerColors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
