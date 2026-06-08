import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useOutTonight } from '../contexts/OutTonightContext';
import UserProfile from './UserProfile';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';
import { isOutTonight, truncateName } from '../utils/outTonightUtils';

const AVATAR_SIZE = 56;

function StripAvatar({ user, isOut, isSelf, onPress }) {
  const initial = (user.name || '?').charAt(0).toUpperCase();

  return (
    <Pressable style={styles.avatarItem} onPress={onPress}>
      <View
        style={[
          styles.avatarRing,
          isOut ? styles.avatarRingOut : styles.avatarRingInactive,
        ]}
      >
        {isSelf && !isOut ? (
          <View style={[styles.avatarInner, styles.avatarInnerInactive]}>
            <Ionicons name="add" size={24} color={BeerColors.textMuted} />
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
        {isSelf ? 'You' : truncateName(user.name)}
      </Text>
    </Pressable>
  );
}

export default function WhosOutStrip({ friendIds = [] }) {
  const { isOut, name, photoURL, openGoLiveModal } = useOutTonight();
  const [friendUsers, setFriendUsers] = useState({});
  const [selectedUid, setSelectedUid] = useState(null);

  const currentUid = auth.currentUser?.uid;

  useEffect(() => {
    if (!friendIds.length) {
      setFriendUsers({});
      return;
    }

    const unsubs = friendIds.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const photoUrl = Array.isArray(data.photos) && data.photos[0] ? data.photos[0] : null;
        setFriendUsers((prev) => ({
          ...prev,
          [uid]: {
            uid,
            name: data.name || data.nickname || data.instagram || 'User',
            photoUrl,
            isOut: isOutTonight(data),
            note: data.outTonightNote,
          },
        }));
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [friendIds.join(',')]);

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
        <Text style={styles.title}>Who's out tonight</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <StripAvatar
            user={selfUser}
            isOut={isOut}
            isSelf
            onPress={handleSelfPress}
          />
          {friendsOut.map((friend) => (
            <StripAvatar
              key={friend.uid}
              user={friend}
              isOut
              isSelf={false}
              onPress={() => setSelectedUid(friend.uid)}
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

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: BeerColors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    borderColor: BeerColors.borderSoft,
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
    backgroundColor: BeerColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInnerOut: {
    backgroundColor: BeerColors.accent,
  },
  avatarInnerInactive: {
    backgroundColor: BeerColors.panelElevated,
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BeerColors.onAccent,
  },
  avatarName: {
    fontSize: 12,
    color: BeerColors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
