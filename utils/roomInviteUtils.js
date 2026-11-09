import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserDisplayName } from './authUtils';

const storageKey = (uid) => `birabuddy_seen_room_invites_${uid}`;

export function toInviteMillis(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export async function loadSeenRoomInvites(uid) {
  if (!uid) return {};
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function markRoomInviteSeen(uid, roomId) {
  if (!uid || !roomId) return {};
  const seen = await loadSeenRoomInvites(uid);
  seen[roomId] = Date.now();
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(seen));
  return seen;
}

export function isUnreadRoomInvite(room, userUid, seenMap) {
  if (!userUid || !room?.invites?.includes(userUid)) return false;

  const seenAt = seenMap[room.id];
  if (!seenAt) return true;

  const inviteAt = toInviteMillis(room.inviteMeta?.[userUid]?.invitedAt);
  if (!inviteAt) return false;

  return inviteAt > seenAt;
}

export function buildInviteFriendEntry(userData, uid, { invited = false, fallbackName = 'Friend' } = {}) {
  const photoURL =
    Array.isArray(userData?.photos) && userData.photos[0] ? userData.photos[0] : null;

  return {
    uid,
    nickname: getUserDisplayName(userData) || fallbackName,
    major: userData?.major || '',
    photoURL,
    invited,
  };
}

export function countUnreadRoomInvites(rooms, userUid, seenMap, userParticipations = {}) {
  if (!userUid) return 0;
  return rooms.filter(
    (room) =>
      !userParticipations[room.id] && isUnreadRoomInvite(room, userUid, seenMap)
  ).length;
}
