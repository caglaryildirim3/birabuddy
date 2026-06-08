import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const FRIENDSHIPS = 'friendships';
const FRIEND_NOTIFICATIONS = 'friendNotifications';
const DOC_SEPARATOR = '___';

export function getFriendshipDocId(uidA, uidB) {
  const [user1Id, user2Id] = [uidA, uidB].sort();
  return `${user1Id}${DOC_SEPARATOR}${user2Id}`;
}

function sortedPair(uidA, uidB) {
  const [user1Id, user2Id] = [uidA, uidB].sort();
  return { user1Id, user2Id };
}

async function getUserDisplayName(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 'Someone';
  const data = snap.data();
  return data.name || data.nickname || data.instagram || 'Someone';
}

async function createFriendNotification({ userId, type, senderId, senderName }) {
  await addDoc(collection(db, FRIEND_NOTIFICATIONS), {
    userId,
    type,
    senderId,
    senderName,
    createdAt: serverTimestamp(),
    read: false,
  });
}

export async function getFriendshipStatus(currentUid, targetUid) {
  if (!currentUid || !targetUid || currentUid === targetUid) return 'none';

  const docId = getFriendshipDocId(currentUid, targetUid);
  const snap = await getDoc(doc(db, FRIENDSHIPS, docId));
  if (!snap.exists()) return 'none';

  const data = snap.data();
  if (data.status === 'accepted') return 'friends';
  if (data.status === 'pending') {
    return data.requestedBy === currentUid ? 'pending_sent' : 'pending_received';
  }
  return 'none';
}

export async function getFriendIds(currentUid) {
  if (!currentUid) return [];

  const [snap1, snap2] = await Promise.all([
    getDocs(
      query(
        collection(db, FRIENDSHIPS),
        where('user1Id', '==', currentUid),
        where('status', '==', 'accepted')
      )
    ),
    getDocs(
      query(
        collection(db, FRIENDSHIPS),
        where('user2Id', '==', currentUid),
        where('status', '==', 'accepted')
      )
    ),
  ]);

  const ids = new Set();
  snap1.docs.forEach((d) => ids.add(d.data().user2Id));
  snap2.docs.forEach((d) => ids.add(d.data().user1Id));
  return Array.from(ids);
}

export async function sendFriendRequest(currentUid, targetUid) {
  if (!currentUid || !targetUid) throw new Error('Invalid users');
  if (currentUid === targetUid) throw new Error('Cannot friend yourself');

  const docId = getFriendshipDocId(currentUid, targetUid);
  const existing = await getDoc(doc(db, FRIENDSHIPS, docId));
  if (existing.exists()) {
    const data = existing.data();
    if (data.status === 'accepted') throw new Error('Already friends');
    if (data.status === 'pending') throw new Error('Request already pending');
  }

  const { user1Id, user2Id } = sortedPair(currentUid, targetUid);
  const senderName = await getUserDisplayName(currentUid);

  await setDoc(doc(db, FRIENDSHIPS, docId), {
    user1Id,
    user2Id,
    status: 'pending',
    requestedBy: currentUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createFriendNotification({
    userId: targetUid,
    type: 'friend_request',
    senderId: currentUid,
    senderName,
  });

  return docId;
}

export async function acceptFriendRequest(docId) {
  const ref = doc(db, FRIENDSHIPS, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Friendship not found');

  const data = snap.data();
  if (data.status !== 'pending') throw new Error('Not a pending request');

  const accepterUid = data.requestedBy === data.user1Id ? data.user2Id : data.user1Id;
  const senderName = await getUserDisplayName(accepterUid);

  await updateDoc(ref, {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });

  await createFriendNotification({
    userId: data.requestedBy,
    type: 'friend_accepted',
    senderId: accepterUid,
    senderName,
  });
}

export async function declineFriendRequest(docId) {
  await deleteDoc(doc(db, FRIENDSHIPS, docId));
}

export async function unfriend(docId) {
  await deleteDoc(doc(db, FRIENDSHIPS, docId));
}

export function getOtherUserId(friendshipData, currentUid) {
  return friendshipData.user1Id === currentUid
    ? friendshipData.user2Id
    : friendshipData.user1Id;
}
