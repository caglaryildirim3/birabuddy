import { isNudgeNotificationType } from './friendNudgeUtils';

export function buildFriendChatHref(senderId, notification) {
  if (!senderId) return '/friends-list';

  const params = new URLSearchParams();
  if (notification && isNudgeNotificationType(notification.type)) {
    params.set('scrollToNudge', '1');
    if (notification.createdAt?.seconds) {
      params.set('at', String(notification.createdAt.seconds));
    }
  }

  const qs = params.toString();
  return qs ? `/friend-chat/${senderId}?${qs}` : `/friend-chat/${senderId}`;
}

export function buildRoomDetailsHref(notification) {
  if (!notification?.roomId) return null;

  return `/room-details/${notification.roomId}?openChat=1`;
}
