import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getFriendshipDocId } from './friendUtils';
import { getPrivateUserData, getUserPrivateRef } from './userDocUtils';

const BLOCKS = 'blocks';

export function getBlockDocId(blockerId, blockedId) {
  return `${blockerId}___${blockedId}`;
}

export async function blockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId || blockerId === blockedId) {
    throw new Error('Invalid users');
  }

  const blockDocId = getBlockDocId(blockerId, blockedId);
  await Promise.all([
    setDoc(doc(db, BLOCKS, blockDocId), {
      blockerId,
      blockedId,
      createdAt: serverTimestamp(),
    }),
    setDoc(
      getUserPrivateRef(blockerId),
      { blockedIds: arrayUnion(blockedId) },
      { merge: true }
    ),
  ]);

  const friendshipDocId = getFriendshipDocId(blockerId, blockedId);
  const friendshipSnap = await getDoc(doc(db, 'friendships', friendshipDocId));
  if (friendshipSnap.exists()) {
    await deleteDoc(doc(db, 'friendships', friendshipDocId));
  }
}

export async function getBlockedUserIds(blockerId) {
  if (!blockerId) return [];

  const data = await getPrivateUserData(blockerId);
  if (!data) return [];

  const blockedIds = data.blockedIds;
  return Array.isArray(blockedIds) ? blockedIds.filter(Boolean) : [];
}

export async function unblockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId) return;

  await Promise.all([
    deleteDoc(doc(db, BLOCKS, getBlockDocId(blockerId, blockedId))).catch(() => {}),
    setDoc(
      getUserPrivateRef(blockerId),
      { blockedIds: arrayRemove(blockedId) },
      { merge: true }
    ),
  ]);
}
