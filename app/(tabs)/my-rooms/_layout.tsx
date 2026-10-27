import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';

export default function MyRoomsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    />
  );
}
