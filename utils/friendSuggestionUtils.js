import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  formatUniversityDisplay,
  getUniversityQueryValues,
  isSameUniversityIdentity,
  parseUniversityFromEmail,
} from './authUtils';
import { getSharedMeetupFromAttendance, recordMeetupAttendance } from './meetupAttendanceUtils';
import { parseRoomDateTime } from './dateUtils';
import { db } from '../firebase/firebaseConfig';
import { isDeletedUser } from './deletedUserUtils';
import { getFriendIds, getMutualFriendCount, getOtherUserId } from './friendUtils';

const MAX_SUGGESTIONS = 5;
const SUGGESTION_POOL_SIZE = 40;
const MAX_ROOMS_TO_SCAN = 40;

function seededShuffle(items, seed) {
  const arr = [...items];
  let s = Math.abs(seed) || 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function getExcludedUidSet(currentUid) {
  const excluded = new Set([currentUid]);
  const friendIds = await getFriendIds(currentUid);
  friendIds.forEach((id) => excluded.add(id));

  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, 'friendships'), where('user1Id', '==', currentUid))),
    getDocs(query(collection(db, 'friendships'), where('user2Id', '==', currentUid))),
  ]);

  for (const snap of [snap1, snap2]) {
    snap.docs.forEach((friendshipDoc) => {
      const data = friendshipDoc.data();
      if (data.status === 'pending' || data.status === 'accepted') {
        excluded.add(getOtherUserId(data, currentUid));
      }
    });
  }

  return excluded;
}

async function getMutualFriendCounts(currentUid, excluded) {
  const myFriendIds = await getFriendIds(currentUid);
  const counts = new Map();

  await Promise.all(
    myFriendIds.map(async (friendId) => {
      const theirFriendIds = await getFriendIds(friendId);
      theirFriendIds.forEach((uid) => {
        if (excluded.has(uid)) return;
        counts.set(uid, (counts.get(uid) || 0) + 1);
      });
    })
  );

  return counts;
}

async function getMeetupCandidates(currentUid, excluded) {
  const candidates = new Map();

  const [createdSnap, joinedSnap] = await Promise.all([
    getDocs(query(collection(db, 'rooms'), where('createdBy', '==', currentUid))),
    getDocs(query(collection(db, 'rooms'), where('participants', 'array-contains', currentUid))),
  ]);

  const roomMap = new Map();
  for (const roomDoc of [...createdSnap.docs, ...joinedSnap.docs]) {
    roomMap.set(roomDoc.id, { id: roomDoc.id, ...roomDoc.data() });
  }

  const rooms = Array.from(roomMap.values())
    .sort((a, b) => {
      const timeA = parseRoomDateTime(a.date, a.time)?.getTime() || 0;
      const timeB = parseRoomDateTime(b.date, b.time)?.getTime() || 0;
      return timeB - timeA;
    })
    .slice(0, MAX_ROOMS_TO_SCAN);

  await Promise.all(
    rooms.map(async (room) => {
      const participantsSnap = await getDocs(
        collection(db, 'rooms', room.id, 'participants')
      );
      const participantUids = participantsSnap.docs.map((d) => d.id);
      if (!participantUids.includes(currentUid)) return;

      const eventTimeMs = parseRoomDateTime(room.date, room.time)?.getTime() || 0;

      participantUids.forEach((otherUid) => {
        if (excluded.has(otherUid)) return;

        const existing = candidates.get(otherUid);
        if (!existing || eventTimeMs > existing.eventTimeMs) {
          candidates.set(otherUid, {
            eventTimeMs,
            roomDate: room.date,
            roomTime: room.time,
          });
        }
      });
    })
  );

  return candidates;
}

async function getUniversityCandidates(currentUid, excluded) {
  const userSnap = await getDoc(doc(db, 'users', currentUid));
  if (!userSnap.exists()) return new Map();

  const userData = userSnap.data();
  const university =
    userData.university || parseUniversityFromEmail(userData.email);
  const queryValues = getUniversityQueryValues(university);
  if (!queryValues.length) return new Map();

  const candidates = new Map();
  const seenUids = new Set();

  await Promise.all(
    queryValues.map(async (uniValue) => {
      const snap = await getDocs(
        query(collection(db, 'users'), where('university', '==', uniValue))
      );
      snap.docs.forEach((userDoc) => {
        if (
          userDoc.id === currentUid ||
          excluded.has(userDoc.id) ||
          seenUids.has(userDoc.id) ||
          isDeletedUser(userDoc.data())
        ) {
          return;
        }
        seenUids.add(userDoc.id);
        candidates.set(userDoc.id, {
          university: formatUniversityDisplay(uniValue),
        });
      });
    })
  );

  return candidates;
}

function normalizeMajor(major) {
  return (major || '').trim().toLowerCase();
}

function getRoomParticipantUids(room, participantsSnap) {
  const uids = new Set(participantsSnap.docs.map((participantDoc) => participantDoc.id));
  if (room.createdBy) uids.add(room.createdBy);
  (room.participants || []).forEach((participantUid) => {
    if (participantUid) uids.add(participantUid);
  });
  return uids;
}

async function getParticipatedRooms(uid) {
  const [createdSnap, joinedSnap] = await Promise.all([
    getDocs(query(collection(db, 'rooms'), where('createdBy', '==', uid))),
    getDocs(query(collection(db, 'rooms'), where('participants', 'array-contains', uid))),
  ]);

  const roomMap = new Map();
  for (const roomDoc of [...createdSnap.docs, ...joinedSnap.docs]) {
    roomMap.set(roomDoc.id, { id: roomDoc.id, ...roomDoc.data() });
  }

  return Array.from(roomMap.values()).sort((a, b) => {
    const timeA = parseRoomDateTime(a.date, a.time)?.getTime() || 0;
    const timeB = parseRoomDateTime(b.date, b.time)?.getTime() || 0;
    return timeB - timeA;
  });
}

function isSameMajor(majorA, majorB) {
  const a = normalizeMajor(majorA);
  const b = normalizeMajor(majorB);
  return Boolean(a && b && a === b);
}

async function getSharedMeetupFromLiveRooms(currentUid, targetUid) {
  const [currentRooms, targetRooms] = await Promise.all([
    getParticipatedRooms(currentUid),
    getParticipatedRooms(targetUid),
  ]);

  const targetRoomIds = new Set(targetRooms.map((room) => room.id));
  const sharedRooms = currentRooms
    .filter((room) => targetRoomIds.has(room.id))
    .slice(0, MAX_ROOMS_TO_SCAN);

  let best = null;

  for (const room of sharedRooms) {
    const participantsSnap = await getDocs(collection(db, 'rooms', room.id, 'participants'));
    const participantUids = getRoomParticipantUids(room, participantsSnap);
    if (!participantUids.has(currentUid) || !participantUids.has(targetUid)) continue;

    const eventTimeMs = parseRoomDateTime(room.date, room.time)?.getTime() || 0;
    if (!best || eventTimeMs > best.eventTimeMs) {
      best = { eventTimeMs, roomDate: room.date, roomTime: room.time };
    }
  }

  return best;
}

function getPostTimestampMs(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt.toDate === 'function') return createdAt.toDate().getTime();
  const parsed = new Date(createdAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getPostDayKey(createdAt) {
  const timestampMs = getPostTimestampMs(createdAt);
  if (!timestampMs) return null;
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** All of the target's posts if we're friends; rules deny that for strangers, so fall back to public. */
async function getReadablePostsByUser(targetUid) {
  try {
    return await getDocs(query(collection(db, 'posts'), where('userId', '==', targetUid)));
  } catch (error) {
    if (error?.code !== 'permission-denied') throw error;
    return getDocs(
      query(
        collection(db, 'posts'),
        where('userId', '==', targetUid),
        where('visibility', '==', 'public')
      )
    );
  }
}

async function getSharedMeetupFromPosts(currentUid, targetUid) {
  const [currentPostsSnap, targetPostsSnap] = await Promise.all([
    getDocs(query(collection(db, 'posts'), where('userId', '==', currentUid))),
    getReadablePostsByUser(targetUid),
  ]);

  const currentPosts = currentPostsSnap.docs.map((postDoc) => postDoc.data());
  const targetPostsByDay = new Map();

  targetPostsSnap.docs.forEach((postDoc) => {
    const post = postDoc.data();
    const dayKey = getPostDayKey(post.createdAt);
    if (!dayKey) return;
    if (!targetPostsByDay.has(dayKey)) targetPostsByDay.set(dayKey, []);
    targetPostsByDay.get(dayKey).push(post);
  });

  let best = null;

  currentPosts.forEach((post) => {
    const dayKey = getPostDayKey(post.createdAt);
    if (!dayKey || !targetPostsByDay.has(dayKey)) return;

    const venue = (post.venueTag || '').trim().toLowerCase();
    const eventTimeMs = getPostTimestampMs(post.createdAt);

    targetPostsByDay.get(dayKey).forEach((targetPost) => {
      const targetVenue = (targetPost.venueTag || '').trim().toLowerCase();
      if (!venue || !targetVenue || venue !== targetVenue) return;

      if (!best || eventTimeMs > best.eventTimeMs) {
        const eventDate = new Date(eventTimeMs);
        const roomDate = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        best = {
          eventTimeMs,
          roomDate,
          roomTime: null,
        };
      }
    });
  });

  return best;
}

async function safeMeetupLookup(fetcher) {
  try {
    return await fetcher();
  } catch {
    return null;
  }
}

async function getSharedMeetup(currentUid, targetUid) {
  if (!currentUid || !targetUid || currentUid === targetUid) return null;

  const [fromAttendance, fromLiveRooms, fromPosts] = await Promise.all([
    safeMeetupLookup(() => getSharedMeetupFromAttendance(currentUid, targetUid)),
    safeMeetupLookup(() => getSharedMeetupFromLiveRooms(currentUid, targetUid)),
    safeMeetupLookup(() => getSharedMeetupFromPosts(currentUid, targetUid)),
  ]);

  const candidates = [fromAttendance, fromLiveRooms, fromPosts].filter(Boolean);
  if (!candidates.length) return null;

  return candidates.reduce((latest, candidate) =>
    candidate.eventTimeMs > latest.eventTimeMs ? candidate : latest
  );
}

export { recordMeetupAttendance };

export function buildProfileMeetupLabel(meetup, locale, t) {
  const eventDate = parseRoomDateTime(meetup.roomDate, meetup.roomTime);
  if (!eventDate) return null;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const daysAgo = Math.floor((Date.now() - meetup.eventTimeMs) / 86400000);

  if (isSameCalendarDay(eventDate, yesterday)) {
    return t('profileConnectionSameRoomYesterday');
  }

  if (daysAgo <= 14) {
    const dayName = eventDate
      .toLocaleDateString(locale, { weekday: 'long' })
      .toLowerCase()
      .replace(/\./g, '');

    return t('profileConnectionSameRoomOnDay', { day: dayName });
  }

  const weeksAgo = Math.max(1, Math.round(daysAgo / 7));
  return t('profileConnectionSameRoomWeeksAgo', { count: weeksAgo });
}

export function buildProfileConnectionStats({
  mutualCount = 0,
  meetup,
  sameUniversity = false,
  sameMajor = false,
  locale,
  t,
}) {
  const stats = [];

  if (mutualCount >= 3) {
    stats.push(t('profileConnectionMutualFriendsPlus', { count: mutualCount }));
  } else if (mutualCount > 0) {
    stats.push(t('profileConnectionMutualFriends', { count: mutualCount }));
  }

  if (meetup) {
    const label = buildProfileMeetupLabel(meetup, locale, t);
    if (label) stats.push(label);
  }

  if (sameUniversity) {
    stats.push(t('profileConnectionSameUniversity'));
  }

  if (sameMajor) {
    stats.push(t('profileConnectionSameMajor'));
  }

  return stats;
}

export async function loadProfileConnectionStats(
  currentUid,
  targetUid,
  { locale = 'en', t, targetProfile } = {}
) {
  if (!currentUid || !targetUid || currentUid === targetUid || !t) return [];

  const [currentSnap, targetSnap] = await Promise.all([
    getDoc(doc(db, 'users', currentUid)),
    getDoc(doc(db, 'users', targetUid)),
  ]);

  const currentData = currentSnap.exists() ? currentSnap.data() : {};
  const targetData = targetSnap.exists() ? targetSnap.data() : targetProfile || {};

  let mutualCount = 0;
  let meetup = null;

  try {
    mutualCount = await getMutualFriendCount(currentUid, targetUid);
  } catch {
    mutualCount = 0;
  }

  try {
    meetup = await getSharedMeetup(currentUid, targetUid);
  } catch {
    meetup = null;
  }

  return buildProfileConnectionStats({
    mutualCount,
    meetup,
    sameUniversity: isSameUniversityIdentity(
      currentData.university,
      currentData.email,
      targetData.university,
      targetData.email
    ),
    sameMajor: isSameMajor(currentData.major, targetData.major),
    locale,
    t,
  });
}

export function buildMeetupReasonLabel({ roomDate, roomTime }, locale, t) {
  const eventDate = parseRoomDateTime(roomDate, roomTime);
  if (!eventDate) return null;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(eventDate, yesterday)) {
    return t('suggestionMeetupYesterday');
  }

  const dayName = eventDate
    .toLocaleDateString(locale, { weekday: 'long' })
    .toLowerCase()
    .replace(/\./g, '');

  return t('suggestionMeetupOnDay', { day: dayName });
}

function buildPrimaryReason({
  mutualCount = 0,
  meetup,
  university,
  locale,
  t,
}) {
  if (mutualCount >= 3) {
    return {
      text: t('suggestionMutualFriendsPlus', { count: mutualCount }),
      score: 100 + mutualCount,
      type: 'mutual',
    };
  }

  if (meetup) {
    const daysAgo = (Date.now() - meetup.eventTimeMs) / 86400000;
    if (daysAgo <= 14) {
      const text = buildMeetupReasonLabel(meetup, locale, t);
      if (text) {
        return {
          text,
          score: 80 - Math.min(daysAgo, 30),
          type: 'meetup',
        };
      }
    }
  }

  if (mutualCount > 0) {
    return {
      text: t('suggestionMutualFriends', { count: mutualCount }),
      score: 40 + mutualCount,
      type: 'mutual',
    };
  }

  if (university) {
    return {
      text: t('suggestionSameUniversity', { university }),
      score: 20,
      type: 'university',
    };
  }

  return null;
}

async function fetchUserPreview(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;

  const data = snap.data();
  if (isDeletedUser(data)) return null;
  const photoUrl = Array.isArray(data.photos) && data.photos[0] ? data.photos[0] : null;

  return {
    uid,
    name: data.name || data.nickname || data.instagram || 'User',
    university: formatUniversityDisplay(
      data.university || parseUniversityFromEmail(data.email)
    ),
    photoUrl,
  };
}

export async function loadFriendSuggestions(
  currentUid,
  { locale = 'en', t, refreshSeed = 0, excludeUids = [] } = {}
) {
  if (!currentUid || !t) return [];

  const excluded = await getExcludedUidSet(currentUid);
  const [mutualCounts, meetupMap, universityMap] = await Promise.all([
    getMutualFriendCounts(currentUid, excluded),
    getMeetupCandidates(currentUid, excluded),
    getUniversityCandidates(currentUid, excluded),
  ]);

  const candidateUids = new Set([
    ...mutualCounts.keys(),
    ...meetupMap.keys(),
    ...universityMap.keys(),
  ]);

  const ranked = [];

  for (const uid of candidateUids) {
    const mutualCount = mutualCounts.get(uid) || 0;
    const meetup = meetupMap.get(uid);
    const universityEntry = universityMap.get(uid);
    const reason = buildPrimaryReason({
      mutualCount,
      meetup,
      university: universityEntry?.university,
      locale,
      t,
    });

    if (!reason) continue;

    ranked.push({
      uid,
      reasonText: reason.text,
      score: reason.score,
      reasonType: reason.type,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const pool = ranked.slice(0, SUGGESTION_POOL_SIZE);

  let top;
  if (refreshSeed === 0 && excludeUids.length === 0) {
    top = pool.slice(0, MAX_SUGGESTIONS);
  } else {
    const excludeSet = new Set(excludeUids);
    const available = pool.filter((item) => !excludeSet.has(item.uid));
    const source = available.length >= MAX_SUGGESTIONS ? available : pool;
    top = seededShuffle(source, refreshSeed).slice(0, MAX_SUGGESTIONS);
  }

  const previews = await Promise.all(top.map((item) => fetchUserPreview(item.uid)));

  return top
    .map((item, index) => {
      const preview = previews[index];
      if (!preview) return null;
      return {
        ...preview,
        reasonText: item.reasonText,
        reasonType: item.reasonType,
      };
    })
    .filter(Boolean);
}
