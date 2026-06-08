import { Stack } from 'expo-router';
import BeerColors from '../../../constants/BeerColors';

export default function DiscoverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: BeerColors.background },
        animation: 'fade',
      }}
    />
  );
}
