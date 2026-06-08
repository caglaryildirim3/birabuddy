import { StyleSheet, View } from 'react-native';
import BeerColors from '../constants/BeerColors';

export default function LiveStatusDot({ isLive, size = 8, style }) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        isLive ? styles.live : styles.home,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 1.5,
    borderColor: BeerColors.background,
  },
  live: {
    backgroundColor: '#4CAF50',
  },
  home: {
    backgroundColor: '#E53935',
  },
});
