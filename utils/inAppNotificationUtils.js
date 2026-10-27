import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { resolveFirstProfilePhotoUrl } from './photoUtils';

export function getActivityBannerTitle(type, t) {
  switch (type) {
    case 'friend_request':
      return t('notificationFriendRequest');
    case 'friend_accepted':
      return t('notificationFriendAccepted');
    case 'post_like':
      return t('notificationPostLike');
    case 'post_comment':
      return t('notificationPostComment');
    case 'comment_like':
      return t('notificationCommentLike');
    case 'post_reaction':
      return t('notificationPostReaction');
    case 'friend_nudge':
      return t('notificationFriendNudge');
    case 'friend_nudge_back':
      return t('notificationFriendNudgeBack');
    case 'report_punishment':
      return t('notificationReportPunishment');
    default:
      return t('notifications');
  }
}

export function getActivityBannerMessage(notification, t) {
  const name = notification.senderName || t('aFriend');
  switch (notification.type) {
    case 'friend_request':
      return t('notificationFriendRequestMessage', { name });
    case 'friend_accepted':
      return t('notificationFriendAcceptedMessage', { name });
    case 'post_like':
      return t('notificationPostLikeMessage', { name });
    case 'post_comment':
      return notification.preview
        ? t('notificationPostCommentPreviewMessage', { name, preview: notification.preview })
        : t('notificationPostCommentMessage', { name });
    case 'comment_like':
      return t('notificationCommentLikeMessage', { name });
    case 'post_reaction':
      return t('notificationPostReactionMessage', { name, emoji: notification.emoji || '✨' });
    case 'friend_nudge':
      return t('notificationFriendNudgeMessage', { name });
    case 'friend_nudge_back':
      return t('notificationFriendNudgeBackMessage', { name });
    case 'report_punishment':
      return notification.message || t('notificationReportPunishmentMessage');
    default:
      return notification.message || t('notifications');
  }
}

export function buildActivityBanner(notification, t) {
  return {
    id: `activity-${notification.id}`,
    source: 'activity',
    type: notification.type,
    title: getActivityBannerTitle(notification.type, t),
    message: getActivityBannerMessage(notification, t),
    senderId: notification.senderId || null,
    postId: notification.postId || null,
    roomId: notification.roomId || null,
    notificationId: notification.id,
  };
}

export function buildRoomBanner(notification, t) {
  return {
    id: `room-${notification.id}`,
    source: 'room',
    type: notification.type || 'room',
    title: notification.title || t('notifications'),
    message: notification.message || t('notifications'),
    roomId: notification.roomId || null,
    notificationId: notification.id,
  };
}

export async function buildChatBanner(conversation, currentUid, t) {
  const friendUid =
    conversation.user1Id === currentUid ? conversation.user2Id : conversation.user1Id;
  const message = conversation.lastMessage || '';

  let senderName = t('aFriend');
  let senderPhotoUrl = null;

  try {
    const snap = await getDoc(doc(db, 'users', friendUid));
    if (snap.exists()) {
      const data = snap.data();
      senderName = data.name || data.nickname || data.instagram || senderName;
      senderPhotoUrl = await resolveFirstProfilePhotoUrl(friendUid, data.photos);
    }
  } catch {
    // fall back to generic sender label
  }

  return {
    id: `chat-${conversation.id}-${conversation.lastMessageAt?.toMillis?.() || Date.now()}`,
    source: 'chat',
    type: 'chat_message',
    title: senderName,
    message,
    senderName,
    senderPhotoUrl,
    friendUid,
    conversationId: conversation.id,
    createdAt: conversation.lastMessageAt || null,
  };
}
