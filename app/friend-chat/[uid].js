import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import FriendChat from '../../components/FriendChat';
import BeerColors from '../../constants/BeerColors';
import { db } from '../../firebase/firebaseConfig';

export default function FriendChatScreen() {
  const router = useRouter();
  const { uid } = useLocalSearchParams();
  const friendUid = Array.isArray(uid) ? uid[0] : uid;
  const [friend, setFriend] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!friendUid) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadFriend = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', friendUid));
        if (cancelled) return;

        if (snap.exists()) {
          const data = snap.data();
          setFriend({
            uid: friendUid,
            name: data.name || data.nickname || data.instagram || 'User',
            photoUrl: Array.isArray(data.photos) && data.photos[0] ? data.photos[0] : null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFriend();

    return () => {
      cancelled = true;
    };
  }, [friendUid]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BeerColors.accent} />
      </View>
    );
  }

  if (!friend) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  return (
    <FriendChat
      friendUid={friend.uid}
      friendName={friend.name}
      friendPhotoUrl={friend.photoUrl}
      onClose={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BeerColors.background,
  },
  errorText: {
    color: BeerColors.textMuted,
    fontSize: 16,
  },
});
