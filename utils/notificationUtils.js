import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { updatePrivateUser } from './userDocUtils';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function registerForPushNotifications(uid) {
  if (!uid) return null;
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const token = tokenResponse.data;

  await updatePrivateUser(uid, { expoPushToken: token });

  return token;
}

export async function syncAppBadgeCount(count) {
  if (!Device.isDevice) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count || 0));
  } catch {
    // badge unsupported on some platforms
  }
}

export function handleNotificationNavigation(data, { router, openPostModal }) {
  if (!data?.type) return;

  switch (data.type) {
    case 'friend_request':
    case 'friend_accepted':
    case 'friend_suggestion':
      router.push('/friends-list');
      break;
    case 'room_request':
    case 'room_approved':
    case 'room_full':
    case 'message':
    case 'invite':
    case 'request':
      if (data.roomId) {
        router.push(`/room-details/${data.roomId}`);
      }
      break;
    case 'chat_message':
    case 'friend_nudge':
    case 'friend_nudge_back':
    case 'friend_live':
      if (data.senderId) {
        router.push(`/friend-chat/${data.senderId}`);
      } else {
        router.push('/friends-list');
      }
      break;
    case 'post_like':
    case 'post_comment':
    case 'comment_like':
    case 'post_reaction':
      if (data.postId) {
        router.push('/(tabs)/feed');
      } else {
        router.push('/(tabs)/feed');
      }
      break;
    case 'report_punishment':
      router.push('/notifications');
      break;
    case 'memory_prompt':
      openPostModal?.({
        venueTag: typeof data.venueTag === 'string' ? data.venueTag : '',
      });
      break;
    case 'friend_posts_digest':
      router.push('/(tabs)/feed?segment=friends');
      break;
    default:
      break;
  }
}
