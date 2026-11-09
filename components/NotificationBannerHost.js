import { useRouter, useSegments } from 'expo-router';
import InAppNotificationBanner from './InAppNotificationBanner';
import { useNotificationIndicators } from '../contexts/NotificationContext';
import { markConversationRead } from '../utils/chatUtils';
import { buildFriendChatHref, buildRoomDetailsHref } from '../utils/notificationNavigationUtils';
import { auth } from '../firebase/firebaseConfig';

export default function NotificationBannerHost() {
  const router = useRouter();
  const segments = useSegments();
  const { activeBanner, dismissBanner } = useNotificationIndicators();

  const handlePress = (banner) => {
    dismissBanner();

    if (banner.source === 'chat' && banner.friendUid) {
      if (banner.conversationId && auth.currentUser?.uid) {
        markConversationRead(banner.conversationId, auth.currentUser.uid).catch(() => {});
      }
      router.push(buildFriendChatHref(banner.friendUid, banner));
      return;
    }

    if (banner.source === 'room' && banner.roomId) {
      router.push(buildRoomDetailsHref(banner) || `/room-details/${banner.roomId}`);
      return;
    }

    if (
      banner.type === 'friend_request' ||
      banner.type === 'friend_accepted' ||
      banner.source === 'chat'
    ) {
      router.push('/friends-list');
      return;
    }

    if (
      banner.type === 'post_like' ||
      banner.type === 'post_comment' ||
      banner.type === 'comment_like' ||
      banner.type === 'post_reaction'
    ) {
      router.push('/(tabs)/feed');
      return;
    }

    router.push('/notifications');
  };

  const activeChatUid =
    segments[0] === 'friend-chat' && segments[1] ? segments[1] : null;
  const suppressedBanner =
    activeBanner?.source === 'chat' && activeBanner?.friendUid === activeChatUid
      ? null
      : activeBanner;

  return (
    <InAppNotificationBanner
      banner={suppressedBanner}
      onDismiss={dismissBanner}
      onPress={handlePress}
    />
  );
}
