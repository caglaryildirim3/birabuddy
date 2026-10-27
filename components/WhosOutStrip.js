import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useOutTonight } from '../contexts/OutTonightContext';
import { useTheme } from '../contexts/ThemeContext';
import UserProfile from './UserProfile';
import { auth, db } from '../firebase/firebaseConfig';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import { resolveFirstProfilePhotoUrl } from '../utils/photoUtils';
import { isOutTonight, truncateName } from '../utils/outTonightUtils';

const AVATAR_SIZE = 56;

function StripAvatar({ user, isOut, displayName, showAddPlaceholder, onPress, styles, colors }) {
  const initial = (user.name || '?').charAt(0).toUpperCase();

  return (
    <Pressable style={styles.avatarItem} onPress={onPress}>
      <View
        style={[
          styles.avatarRing,
          isOut ? styles.avatarRingOut : styles.avatarRingInactive,
        ]}
      >
        {showAddPlaceholder ? (
          <View style={[styles.avatarInner, styles.avatarInnerInactive]}>
            <Ionicons name="add" size={24} color={colors.textMuted} />
          </View>
        ) : user.photoUrl ? (
          <Image
            source={{ uri: user.photoUrl }}
            style={styles.avatarImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatarInner, isOut && styles.avatarInnerOut]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </View>
      <Text style={styles.avatarName} numberOfLines={1}>
        {displayName}
      </Text>
    </Pressable>
  );
}

export default function WhosOutStrip({ friendIds = [] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOut, name, photoURL, openGoLiveModal } = useOutTonight();
  const [friendUsers, setFriendUsers] = useState({});
  const [selectedUid, setSelectedUid] = useState(null);
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
      if (!user) setFriendUsers({});
    });
    return unsub;
  }, []);

  const peerIds = useMemo(
    () => (currentUid ? friendIds.filter((id) => id && id !== currentUid) : []),
    [friendIds, currentUid]
  );

  useEffect(() => {
    const allowed = new Set(peerIds);
    setFriendUsers((prev) => {
      const next = {};
      Object.entries(prev).forEach(([uid, user]) => {
        if (allowed.has(uid)) next[uid] = user;
      });
      return next;
    });

    if (!currentUid || !peerIds.length) {
      return undefined;
    }

    const unsubs = peerIds.map((uid) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const baseUser = {
            uid,
            name: data.name || data.nickname || data.instagram || 'User',
            photoUrl: null,
            isOut: isOutTonight(data),
            note: data.outTonightNote,
          };
          setFriendUsers((prev) => ({
            ...prev,
            [uid]: baseUser,
          }));
          resolveFirstProfilePhotoUrl(uid, data.photos)
            .then((photoUrl) => {
              if (!photoUrl) return;
              setFriendUsers((prev) => ({
                ...prev,
                [uid]: {
                  ...(prev[uid] || baseUser),
                  photoUrl,
                },
              }));
            })
            .catch(() => {});
        },
        handleFirestoreListenerError('whos-out-friend')
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [currentUid, peerIds.join(',')]);

  const friendsOut = useMemo(
    () => Object.values(friendUsers).filter((f) => f.isOut),
    [friendUsers]
  );

  const showStrip = isOut || friendsOut.length > 0;
  if (!showStrip) return null;

  const selfUser = {
    uid: currentUid,
    name,
    photoUrl: photoURL,
  };

  const handleSelfPress = () => {
    if (isOut) {
      setSelectedUid(currentUid);
    } else {
      openGoLiveModal();
    }
  };

  return (
    <>
      <View style={styles.container}>
        <Text style={styles.title}>{t('whosLive')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <StripAvatar
            user={selfUser}
            isOut={isOut}
            displayName={t('youTag')}
            showAddPlaceholder={!isOut}
            onPress={handleSelfPress}
            styles={styles}
            colors={colors}
          />
          {friendsOut.map((friend) => (
            <StripAvatar
              key={friend.uid}
              user={friend}
              isOut
              displayName={truncateName(friend.name)}
              showAddPlaceholder={false}
              onPress={() => setSelectedUid(friend.uid)}
              styles={styles}
              colors={colors}
            />
          ))}
        </ScrollView>
      </View>

      <Modal visible={!!selectedUid} animationType="slide" presentationStyle="pageSheet">
        {selectedUid && (
          <UserProfile uid={selectedUid} onClose={() => setSelectedUid(null)} />
        )}
      </Modal>
    </>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    title: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    scrollContent: {
      gap: 14,
      paddingRight: 8,
    },
    avatarItem: {
      alignItems: 'center',
      width: 68,
    },
    avatarRing: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 3,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    avatarRingOut: {
      borderColor: '#4CAF50',
    },
    avatarRingInactive: {
      borderColor: colors.borderSoft,
    },
    avatarImage: {
      width: AVATAR_SIZE - 8,
      height: AVATAR_SIZE - 8,
      borderRadius: (AVATAR_SIZE - 8) / 2,
    },
    avatarInner: {
      width: AVATAR_SIZE - 8,
      height: AVATAR_SIZE - 8,
      borderRadius: (AVATAR_SIZE - 8) / 2,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInnerOut: {
      backgroundColor: colors.accent,
    },
    avatarInnerInactive: {
      backgroundColor: colors.panelElevated,
    },
    avatarInitial: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.onAccent,
    },
    avatarName: {
      fontSize: 12,
      color: colors.textPrimary,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
