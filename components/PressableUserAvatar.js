import { Image } from 'expo-image';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BeerColors from '../constants/BeerColors';
import { db } from '../firebase/firebaseConfig';
import { isPersistablePhotoUrl, resolveFirstProfilePhotoUrl } from '../utils/photoUtils';

function isRenderablePhotoUrl(url) {
  return typeof url === 'string' && isPersistablePhotoUrl(url);
}

export default function PressableUserAvatar({
  uid,
  snapshot,
  size = 40,
  onPress,
  style,
}) {
  const [resolvedPhotoURL, setResolvedPhotoURL] = useState(null);
  const snapshotPhoto = snapshot?.photoURL;
  const name = snapshot?.name || 'U';
  const initial = name.charAt(0).toUpperCase();
  const radius = size / 2;

  useEffect(() => {
    if (isRenderablePhotoUrl(snapshotPhoto)) {
      setResolvedPhotoURL(snapshotPhoto);
      return undefined;
    }

    if (!uid) {
      setResolvedPhotoURL(null);
      return undefined;
    }

    let cancelled = false;
    const loadPhoto = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists() || cancelled) return;
        const photoUrl = await resolveFirstProfilePhotoUrl(uid, snap.data().photos);
        if (!cancelled) setResolvedPhotoURL(photoUrl);
      } catch {
        if (!cancelled) setResolvedPhotoURL(null);
      }
    };

    loadPhoto();
    return () => {
      cancelled = true;
    };
  }, [uid, snapshotPhoto]);

  const photoURL = isRenderablePhotoUrl(snapshotPhoto) ? snapshotPhoto : resolvedPhotoURL;

  const avatar = photoURL ? (
    <Image
      source={{ uri: photoURL }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
      pointerEvents="none"
    />
  ) : (
    <View
      pointerEvents="none"
      style={[styles.placeholder, { width: size, height: size, borderRadius: radius }]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );

  if (!uid || !onPress) {
    return <View style={style}>{avatar}</View>;
  }

  return (
    <Pressable
      onPress={() => onPress(uid)}
      hitSlop={8}
      style={[style, { width: size, height: size }]}
    >
      {avatar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: BeerColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    color: BeerColors.onAccent,
    fontWeight: 'bold',
  },
});
