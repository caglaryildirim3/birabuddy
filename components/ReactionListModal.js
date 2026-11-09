import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../firebase/firebaseConfig';
import { getUserDisplayName } from '../utils/authUtils';
import { resolveFirstProfilePhotoUrl } from '../utils/photoUtils';
import { useUserProfileModal } from '../hooks/useUserProfileModal';
import PressableUserAvatar from './PressableUserAvatar';

export default function ReactionListModal({ visible, emoji, userIds = [], onClose }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { openProfile, ProfileModal } = useUserProfileModal();
  const [reactors, setReactors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !emoji || userIds.length === 0) {
      setReactors([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      userIds.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          const data = snap.exists() ? snap.data() : {};
          const photoURL = await resolveFirstProfilePhotoUrl(uid, data.photos);
          return {
            uid,
            name: getUserDisplayName(data),
            photoURL,
          };
        } catch {
          return { uid, name: t('unknown'), photoURL: null };
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      setReactors(rows);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, emoji, userIds.join(','), t]);

  if (!visible) return null;

  return (
    <>
      <Modal
        visible
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {emoji}
                {userIds.length}
              </Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <FlatList
                data={reactors}
                keyExtractor={(item) => item.uid}
                renderItem={({ item }) => (
                  <Pressable style={styles.row} onPress={() => openProfile(item.uid)}>
                    <PressableUserAvatar
                      uid={item.uid}
                      snapshot={{ name: item.name, photoURL: item.photoURL }}
                      size={40}
                      onPress={openProfile}
                    />
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowEmoji}>{emoji}</Text>
                  </Pressable>
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
              />
            )}
          </View>
        </View>
      </Modal>
      <ProfileModal />
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    sheet: {
      maxHeight: '55%',
      backgroundColor: colors.panel,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    loadingWrap: {
      paddingVertical: 32,
      alignItems: 'center',
    },
    listContent: {
      paddingVertical: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    name: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    rowEmoji: {
      fontSize: 20,
    },
  });
}
