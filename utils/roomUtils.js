import { parseRoomDateTime } from './dateUtils';

export const ROOM_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};

export const ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function isRoomPublic(room) {
  return room?.visibility !== ROOM_VISIBILITY.PRIVATE;
}

export function canViewRoom(room, viewerUid, friendIds = []) {
  if (!room || !viewerUid) return false;
  if (room.createdBy === viewerUid) return true;
  if (isRoomPublic(room)) return true;
  if (room.participants?.includes(viewerUid)) return true;
  if (room.requests?.includes(viewerUid)) return true;
  if (room.invites?.includes(viewerUid)) return true;
  return friendIds.includes(room.createdBy);
}

export function canRequestJoinRoom(room, viewerUid, friendIds = []) {
  if (!room || !viewerUid || room.createdBy === viewerUid) return false;
  if (room.participants?.includes(viewerUid)) return false;
  return canViewRoom(room, viewerUid, friendIds);
}

export function getRoomExpiryDateTime(dateVal, timeStr) {
  const eventDateTime = parseRoomDateTime(dateVal, timeStr);
  if (!eventDateTime) return null;
  return new Date(eventDateTime.getTime() + ROOM_EXPIRY_MS);
}

export function isRoomExpired(dateVal, timeStr, now = new Date()) {
  const expiryDateTime = getRoomExpiryDateTime(dateVal, timeStr);
  if (!expiryDateTime) return false;
  return now > expiryDateTime;
}
