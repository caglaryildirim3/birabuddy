import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { parseRoomDateTime } from './dateUtils';

export async function recordMeetupAttendance({ roomId, room, coParticipantUids }) {
  const uid = auth.currentUser?.uid;
  if (!uid || !roomId || !room) return;

  const uniqueCoParticipants = Array.from(
    new Set((coParticipantUids || []).filter((participantUid) => typeof participantUid === 'string'))
  );
  if (!uniqueCoParticipants.includes(uid)) {
    uniqueCoParticipants.push(uid);
  }

  const eventTimeMs = parseRoomDateTime(room.date, room.time)?.getTime() || 0;

  await setDoc(
    doc(db, 'users', uid, 'meetupAttendance', roomId),
    {
      roomId,
      eventTimeMs,
      roomDate: room.date ?? null,
      roomTime: room.time || null,
      barName: room.barName || null,
      coParticipantUids: uniqueCoParticipants,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function pickMeetupCandidate(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.eventTimeMs > current.eventTimeMs ? candidate : current;
}

export async function getSharedMeetupFromAttendance(currentUid, targetUid) {
  if (!currentUid || !targetUid || currentUid === targetUid) return null;

  let mineSnap = { docs: [] };
  let theirsSnap = { docs: [] };

  try {
    [mineSnap, theirsSnap] = await Promise.all([
      getDocs(collection(db, 'users', currentUid, 'meetupAttendance')),
      getDocs(collection(db, 'users', targetUid, 'meetupAttendance')),
    ]);
  } catch {
    return null;
  }

  const theirsByRoomId = new Map(
    theirsSnap.docs.map((attendanceDoc) => [attendanceDoc.id, attendanceDoc.data()])
  );

  let best = null;

  mineSnap.docs.forEach((attendanceDoc) => {
    const data = attendanceDoc.data();
    const theirData = theirsByRoomId.get(attendanceDoc.id);
    const coParticipantUids = Array.isArray(data.coParticipantUids) ? data.coParticipantUids : [];
    const sharedByRoomId = Boolean(theirData);
    const sharedByParticipants = coParticipantUids.includes(targetUid);

    if (!sharedByRoomId && !sharedByParticipants) return;

    const eventTimeMs = Math.max(data.eventTimeMs || 0, theirData?.eventTimeMs || 0);
    best = pickMeetupCandidate(best, {
      eventTimeMs,
      roomDate: data.roomDate || theirData?.roomDate,
      roomTime: data.roomTime || theirData?.roomTime,
    });
  });

  return best;
}
