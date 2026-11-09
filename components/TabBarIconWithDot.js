import { StyleSheet, View } from 'react-native';
import BeerColors from '../constants/BeerColors';

export default function TabBarIconWithDot({ children, showDot = false }) {
  return (
    <View style={styles.wrapper}>
      {children}
      {showDot ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BeerColors.notificationDot,
    borderWidth: 1.5,
    borderColor: BeerColors.panel,
  },
});
