import { StyleSheet, View } from 'react-native';
import BeerColors from '../constants/BeerColors';

export default function RoomCardDot({ visible = false }) {
  if (!visible) return null;

  return <View style={styles.dot} />;
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BeerColors.notificationDot,
    borderWidth: 1.5,
    borderColor: BeerColors.panel,
  },
});
