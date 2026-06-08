import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BeerColors from '../constants/BeerColors';

export default function PressableUserAvatar({
  uid,
  snapshot,
  size = 40,
  onPress,
  style,
}) {
  const name = snapshot?.name || 'U';
  const initial = name.charAt(0).toUpperCase();
  const radius = size / 2;

  const avatar = snapshot?.photoURL ? (
    <Image
      source={{ uri: snapshot.photoURL }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
    />
  ) : (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );

  if (!uid || !onPress) {
    return <View style={style}>{avatar}</View>;
  }

  return (
    <Pressable onPress={() => onPress(uid)} hitSlop={6} style={style}>
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
