import { parseRoomDateTime } from './dateUtils';

export const ROOM_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};

export const ROOM_EXPIRY_MS = 5 * 60 * 60 * 1000;

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

export function canSeeRoomExactLocation(room, viewerUid, { isParticipant = false } = {}) {
  if (!room || !viewerUid) return false;
  return isParticipant || room.createdBy === viewerUid;
}

export function getRoomDisplayLocation(
  room,
  { isParticipant = false, viewerUid, t } = {}
) {
  if (!room) return t?.('notSpecified') ?? 'not specified';

  const neighborhood = room.neighborhood || room.location;
  const city = room.city;
  const canSeeExact = canSeeRoomExactLocation(room, viewerUid, { isParticipant });

  if (canSeeExact) {
    if (room.barName && neighborhood) return `${room.barName}, ${neighborhood}`;
    if (room.fullLocation) return room.fullLocation;
    if (neighborhood && city) return `${neighborhood}, ${city}`;
    return neighborhood || t?.('locationDetailsShared') || 'location details shared';
  }

  if (neighborhood && city) return `${neighborhood}, ${city}`;
  if (neighborhood) return neighborhood;
  return t?.('locationSharedAfterJoining') || 'location shared after joining';
}
