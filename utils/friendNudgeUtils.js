import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const NUDGE_NOTIFICATION_TYPES = new Set(['friend_nudge', 'friend_nudge_back']);

export function isNudgeNotificationType(type) {
  return NUDGE_NOTIFICATION_TYPES.has(type);
}

export async function markNudgeNotificationsReadFromSender(userId, senderId) {
  if (!userId || !senderId) return;

  const snap = await getDocs(
    query(collection(db, 'friendNotifications'), where('userId', '==', userId))
  );

  const unreadNudgeRefs = snap.docs.filter((d) => {
    const data = d.data();
    return (
      data.senderId === senderId &&
      isNudgeNotificationType(data.type) &&
      data.read !== true
    );
  });

  if (unreadNudgeRefs.length === 0) return;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < unreadNudgeRefs.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    unreadNudgeRefs.slice(i, i + CHUNK_SIZE).forEach((d) => {
      batch.update(d.ref, { read: true });
    });
    await batch.commit();
  }
}

export async function sendFriendNudge(targetUid, { isNudgeBack = false } = {}) {
  const functions = getFunctions(getApp());
  const nudgeFn = httpsCallable(functions, 'sendFriendNudge');
  const result = await nudgeFn({ targetUid, isNudgeBack });
  return result.data;
}

export function getFriendNudgeErrorMessage(error, t) {
  const code = error?.code || '';
  const message = error?.message || '';

  if (code === 'functions/unauthenticated') {
    return t('loginRequired');
  }
  if (code === 'functions/permission-denied') {
    return t('nudgeNotFriends');
  }
  if (code === 'functions/resource-exhausted') {
    return t('nudgeTooSoon');
  }
  if (code === 'functions/unavailable' || message.includes('network')) {
    return t('nudgeNetworkError');
  }

  return t('failedToNudge');
}
