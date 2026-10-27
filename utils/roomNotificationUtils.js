import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export function getRoomApprovedNotificationId(roomId, userId) {
  return `room_approved_${roomId}_${userId}`;
}

export async function notifyJoinRequestApproved({
  roomId,
  hostUid,
  hostName,
  requesterUid,
  roomName,
  title,
  message,
}) {
  if (!roomId || !hostUid || !requesterUid) return;

  await setDoc(
    doc(db, 'notifications', getRoomApprovedNotificationId(roomId, requesterUid)),
    {
      userId: requesterUid,
      type: 'room_approved',
      title,
      message,
      roomId,
      createdAt: serverTimestamp(),
      read: false,
      senderId: hostUid,
    },
    { merge: true }
  );
}

export const HOST_ROOM_NOTIFICATION_TYPES = new Set(['room_request', 'room_full']);
export const ACTIVE_ROOM_NOTIFICATION_TYPES = new Set([
  'message',
  'invite',
  'room_approved',
  'memory_prompt',
]);

export function getRoomNotificationBucket(type) {
  if (HOST_ROOM_NOTIFICATION_TYPES.has(type)) return 'host';
  if (ACTIVE_ROOM_NOTIFICATION_TYPES.has(type)) return 'active';
  return 'active';
}

export function buildRoomNotificationMaps(notifications) {
  const hostByRoom = {};
  const activeByRoom = {};

  notifications.forEach((notification) => {
    if (notification.read === true || !notification.roomId) return;
    const bucket = getRoomNotificationBucket(notification.type);
    if (bucket === 'host') {
      hostByRoom[notification.roomId] = (hostByRoom[notification.roomId] || 0) + 1;
    } else {
      activeByRoom[notification.roomId] = (activeByRoom[notification.roomId] || 0) + 1;
    }
  });

  return { hostByRoom, activeByRoom };
}

export async function markRoomNotificationsRead(userId, roomId, types = null) {
  if (!userId || !roomId) return;

  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', userId))
  );

  const batch = writeBatch(db);
  let pending = 0;

  snap.docs.forEach((notificationDoc) => {
    const data = notificationDoc.data();
    if (data.read === true || data.roomId !== roomId) return;
    if (types && !types.includes(data.type)) return;

    batch.update(doc(db, 'notifications', notificationDoc.id), { read: true });
    pending += 1;
  });

  if (pending > 0) {
    await batch.commit();
  }
}

export async function markRoomMessageNotificationsRead(userId, roomId) {
  return markRoomNotificationsRead(userId, roomId, ['message']);
}

export async function deleteJoinRequestNotifications(hostUserId, roomId, requesterUid) {
  if (!hostUserId || !roomId || !requesterUid) return;

  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', hostUserId))
  );

  const batch = writeBatch(db);
  let pending = 0;

  snap.docs.forEach((notificationDoc) => {
    const data = notificationDoc.data();
    if (
      data.type === 'request' &&
      data.roomId === roomId &&
      data.senderId === requesterUid
    ) {
      batch.delete(notificationDoc.ref);
      pending += 1;
    }
  });

  if (pending > 0) {
    await batch.commit();
  }
}
