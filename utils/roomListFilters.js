import { parseRoomDateTime } from './dateUtils';

export const ROOM_SORT = {
  TIME: 'time',
  CROWDED: 'crowded',
  CREATED: 'created',
};

export const DEFAULT_ROOM_FILTERS = {
  name: '',
  cities: [],
  locations: [],
  day: null,
  timeStart: null,
  onlyOpenSpots: false,
  sortBy: ROOM_SORT.TIME,
};

function getRoomDateString(room) {
  if (!room?.date) return null;

  if (room.date.toDate) {
    const d = room.date.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return room.date;
}

function getRoomHour(room) {
  if (!room?.time || typeof room.time !== 'string') return null;
  const hour = parseInt(room.time.split(':')[0], 10);
  return Number.isNaN(hour) ? null : hour;
}

function getRoomTimeMs(room) {
  const dt = parseRoomDateTime(room.date, room.time);
  return dt ? dt.getTime() : Number.MAX_SAFE_INTEGER;
}

function getCreatedAtMs(room) {
  if (room?.createdAt?.toDate) return room.createdAt.toDate().getTime();
  if (room?.createdAt?.seconds) return room.createdAt.seconds * 1000;
  return 0;
}

function compareClosestToNow(a, b) {
  const now = Date.now();
  const timeA = getRoomTimeMs(a);
  const timeB = getRoomTimeMs(b);

  if (timeA === Number.MAX_SAFE_INTEGER && timeB === Number.MAX_SAFE_INTEGER) return 0;
  if (timeA === Number.MAX_SAFE_INTEGER) return 1;
  if (timeB === Number.MAX_SAFE_INTEGER) return -1;

  const distA = timeA - now;
  const distB = timeB - now;
  const aFuture = distA >= 0;
  const bFuture = distB >= 0;

  if (aFuture && bFuture) return distA - distB;
  if (aFuture && !bFuture) return -1;
  if (!aFuture && bFuture) return 1;
  return distB - distA;
}

function formatLocalDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNext7Days(locale = 'en') {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      label: d
        .toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })
        .toLowerCase(),
      value: formatLocalDateValue(d),
    });
  }
  return days;
}

export function roomMatchesTimeFilter(room, timeStart) {
  if (timeStart === null || timeStart === undefined) return true;

  const roomHour = getRoomHour(room);
  if (roomHour === null) return false;

  if (timeStart === -1) return roomHour < 18;
  if (timeStart === 24) return roomHour < 6;
  return roomHour === timeStart;
}

export function filterRooms(
  rooms,
  filters,
  { participantCounts = {}, userParticipations = {}, currentUserUid } = {}
) {
  const {
    name = '',
    cities = [],
    locations = [],
    day = null,
    timeStart = null,
    onlyOpenSpots = false,
  } = filters;

  return rooms.filter((room) => {
    if (userParticipations[room.id]) return false;

    if (onlyOpenSpots) {
      const max = room.maxParticipants || 0;
      const current = participantCounts[room.id] || 0;
      if (max > 0 && current >= max) return false;
    }

    const trimmedName = name.trim();
    if (trimmedName && !room.name?.toLowerCase().includes(trimmedName.toLowerCase())) return false;

    if (cities.length > 0) {
      const roomCity = (room.city || '').toLowerCase();
      const matchCity = cities.some((selectedCity) => roomCity === selectedCity.toLowerCase());
      if (!matchCity) return false;
    }

    if (locations.length > 0) {
      const roomLoc = (room.neighborhood || room.location || '').toLowerCase();
      const match = locations.some((selectedLoc) => roomLoc.includes(selectedLoc.toLowerCase()));
      if (!match) return false;
    }

    if (day) {
      const roomDateStr = getRoomDateString(room);
      if (roomDateStr !== day) return false;
    }

    if (!roomMatchesTimeFilter(room, timeStart)) return false;

    return true;
  });
}

export function sortRooms(rooms, sortBy, participantCounts = {}) {
  const sorted = [...rooms];

  if (sortBy === ROOM_SORT.CROWDED) {
    return sorted.sort((a, b) => {
      const countA = participantCounts[a.id] || 0;
      const countB = participantCounts[b.id] || 0;
      if (countB !== countA) return countB - countA;
      return compareClosestToNow(a, b);
    });
  }

  if (sortBy === ROOM_SORT.CREATED) {
    return sorted.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
  }

  return sorted.sort(compareClosestToNow);
}

export function applyRoomFilters(
  rooms,
  filters,
  { participantCounts = {}, userParticipations = {}, currentUserUid } = {}
) {
  const filtered = filterRooms(rooms, filters, {
    participantCounts,
    userParticipations,
    currentUserUid,
  });
  return sortRooms(filtered, filters.sortBy, participantCounts);
}
