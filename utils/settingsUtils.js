import { getPrivateUserData, setPrivateUser } from './userDocUtils';

export const DEFAULT_NOTIFICATION_PREFS = {
  friendRequests: true,
  socialActivity: true,
  roomActivity: true,
  messages: true,
};

export const SOCIAL_ACTIVITY_NOTIFICATION_TYPES = [
  'post_like',
  'post_comment',
  'comment_like',
  'post_reaction',
];

export function isSocialActivityNotification(type) {
  return SOCIAL_ACTIVITY_NOTIFICATION_TYPES.includes(type);
}

export async function getNotificationPrefs(uid) {
  if (!uid) return DEFAULT_NOTIFICATION_PREFS;

  const data = await getPrivateUserData(uid);
  if (!data) return DEFAULT_NOTIFICATION_PREFS;

  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(data.notificationPrefs || {}),
  };
}

export async function updateNotificationPrefs(uid, prefs) {
  if (!uid) return;
  await setPrivateUser(uid, { notificationPrefs: prefs });
}
