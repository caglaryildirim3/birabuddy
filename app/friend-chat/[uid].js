import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import FriendChat from '../../components/FriendChat';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase/firebaseConfig';
import { getUserDisplayName } from '../../utils/authUtils';
import { resolveFirstProfilePhotoUrl } from '../../utils/photoUtils';

export default function FriendChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { uid, messageId, scrollToNudge, at, messagePreview } = useLocalSearchParams();
  const friendUid = Array.isArray(uid) ? uid[0] : uid;
  const initialScrollToMessageId = Array.isArray(messageId) ? messageId[0] : messageId;
  const shouldScrollToNudge = (Array.isArray(scrollToNudge) ? scrollToNudge[0] : scrollToNudge) === '1';
  const nudgeAtSeconds = Number(Array.isArray(at) ? at[0] : at) || null;
  const previewMessage = Array.isArray(messagePreview) ? messagePreview[0] : messagePreview;
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
          const photoUrl = await resolveFirstProfilePhotoUrl(friendUid, data.photos);
          setFriend({
            uid: friendUid,
            name: data.name || data.nickname || data.instagram || 'User',
            instagram: data.instagram || data.nickname || null,
            photoUrl,
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
        <ActivityIndicator size="large" color={colors.accent} />
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
      initialScrollToMessageId={initialScrollToMessageId || null}
      scrollToNudge={shouldScrollToNudge}
      nudgeAtSeconds={nudgeAtSeconds}
      messagePreview={previewMessage || null}
      onClose={() => router.back()}
    />
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 16,
    },
  });
