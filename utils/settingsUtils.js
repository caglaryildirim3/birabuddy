import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export const DEFAULT_NOTIFICATION_PREFS = {
  friendRequests: true,
  roomActivity: true,
  messages: true,
};

export async function getNotificationPrefs(uid) {
  if (!uid) return DEFAULT_NOTIFICATION_PREFS;

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return DEFAULT_NOTIFICATION_PREFS;

  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(snap.data().notificationPrefs || {}),
  };
}

export async function updateNotificationPrefs(uid, prefs) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), { notificationPrefs: prefs }, { merge: true });
}
