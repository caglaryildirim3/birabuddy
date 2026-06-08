import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { CenterFabButton } from '../../components/CenterFabButton';
import { HapticTab } from '../../components/HapticTab';
import { OutTonightProvider } from '../../contexts/OutTonightContext';
import { useTheme } from '../../contexts/ThemeContext';
import { PostModalProvider } from '../../contexts/PostModalContext';
import { useIncomingFriendRequestCount } from '../../hooks/useIncomingFriendRequestCount';

export default function TabLayout() {
  const incomingFriendRequests = useIncomingFriendRequestCount();
  const { colors } = useTheme();

  return (
    <OutTonightProvider>
    <PostModalProvider>
    <Tabs
      initialRouteName="feed"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarButton: HapticTab,
        tabBarStyle: [styles.tabBar, { backgroundColor: colors.panel, borderTopColor: colors.accent }],
        tabBarLabelStyle: styles.tabBarLabel,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fab"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: (props) => <CenterFabButton {...props} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="my-rooms"
        options={{
          title: 'My Rooms',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="beer-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarBadge: incomingFriendRequests > 0 ? incomingFriendRequests : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
    </PostModalProvider>
    </OutTonightProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    ...Platform.select({
      ios: {
        position: 'absolute',
      },
      default: {},
    }),
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
