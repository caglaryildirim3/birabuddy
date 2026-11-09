import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import { CenterFabButton } from '../../components/CenterFabButton';
import { DiscoverTabButton } from '../../components/DiscoverTabButton';
import { HapticTab } from '../../components/HapticTab';
import TabBarIconWithDot from '../../components/TabBarIconWithDot';
import { useNotificationIndicators } from '../../contexts/NotificationContext';
import { OutTonightProvider } from '../../contexts/OutTonightContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function TabLayout() {
  const { t } = useTranslation();
  const { showProfileDot, showMyRoomsDot, showDiscoverDot } = useNotificationIndicators();
  const { colors } = useTheme();

  return (
    <OutTonightProvider>
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
            title: t('tabFeed'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: t('tabDiscover'),
            tabBarIcon: ({ color, size }) => (
              <TabBarIconWithDot showDot={showDiscoverDot}>
                <Ionicons name="search-outline" size={size} color={color} />
              </TabBarIconWithDot>
            ),
            tabBarButton: (props) => <DiscoverTabButton {...props} />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
            },
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
            title: t('tabMyRooms'),
            tabBarIcon: ({ color, size }) => (
              <TabBarIconWithDot showDot={showMyRoomsDot}>
                <Ionicons name="beer-outline" size={size} color={color} />
              </TabBarIconWithDot>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabProfile'),
            tabBarIcon: ({ color, size }) => (
              <TabBarIconWithDot showDot={showProfileDot}>
                <Ionicons name="person-outline" size={size} color={color} />
              </TabBarIconWithDot>
            ),
          }}
        />
      </Tabs>
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
