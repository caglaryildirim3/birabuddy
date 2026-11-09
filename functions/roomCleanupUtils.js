const ROOM_EXPIRY_MS = 5 * 60 * 60 * 1000;

function getRoomStartTime(room) {
  if (!room?.date) return null;

  if (typeof room.date === 'string') {
    const time = room.time && typeof room.time === 'string' ? room.time : '00:00';
    const start = new Date(`${room.date}T${time}`);
    return Number.isNaN(start.getTime()) ? null : start;
  }

  if (typeof room.date.toDate === 'function') {
    const start = room.date.toDate();
    if (room.time && typeof room.time === 'string') {
      const [hours, minutes] = room.time.split(':').map((v) => parseInt(v, 10));
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        start.setHours(hours, minutes, 0, 0);
      }
    }
    return start;
  }

  return null;
}

function isRoomExpired(room, now = new Date()) {
  const start = getRoomStartTime(room);
  if (!start) return false;
  return now.getTime() - start.getTime() > ROOM_EXPIRY_MS;
}

async function getRoomIdsWithSubcollections(db) {
  const roomIds = new Set();
  for (const subcollection of ['participants', 'messages']) {
    const snap = await db.collectionGroup(subcollection).get();
    snap.docs.forEach((docSnap) => {
      roomIds.add(docSnap.ref.parent.parent.id);
    });
  }
  return roomIds;
}

async function cleanupOrphanRoomTrees(db) {
  const roomIds = await getRoomIdsWithSubcollections(db);
  let deleted = 0;

  for (const roomId of roomIds) {
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await roomRef.get();
    if (roomSnap.exists) continue;

    await db.recursiveDelete(roomRef);
    deleted += 1;
  }

  return deleted;
}

module.exports = {
  ROOM_EXPIRY_MS,
  getRoomStartTime,
  isRoomExpired,
  getRoomIdsWithSubcollections,
  cleanupOrphanRoomTrees,
};
