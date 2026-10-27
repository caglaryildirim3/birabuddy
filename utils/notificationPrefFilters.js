import { isSocialActivityNotification } from './settingsUtils';

export function isActivityAllowedByPrefs(notification, prefs) {
  const type = notification?.type;
  if (type === 'friend_request' || type === 'friend_accepted') {
    return prefs.friendRequests !== false;
  }
  if (type === 'friend_nudge' || type === 'friend_nudge_back' || type === 'friend_live') {
    return prefs.messages !== false;
  }
  if (type === 'report_punishment') return true;
  if (isSocialActivityNotification(type)) {
    return prefs.socialActivity !== false;
  }
  return true;
}

export function isRoomNotificationAllowedByPrefs(prefs) {
  return prefs.roomActivity !== false;
}

export function isChatAllowedByPrefs(prefs) {
  return prefs.messages !== false;
}
