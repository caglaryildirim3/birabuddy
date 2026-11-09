import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export async function syncLivePresence(uid, { liveLocation, outTonightExpiresAt } = {}) {
  if (!uid) return;

  const hasLocation =
    liveLocation?.latitude != null && liveLocation?.longitude != null;

  if (!hasLocation) {
    await clearLivePresence(uid);
    return;
  }

  await setDoc(
    doc(db, 'livePresence', uid),
    {
      uid,
      liveLocation,
      liveLocationShared: true,
      outTonightExpiresAt: outTonightExpiresAt || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearLivePresence(uid) {
  if (!uid) return;
  try {
    await deleteDoc(doc(db, 'livePresence', uid));
  } catch {
    // doc may not exist
  }
}

export function mergeLivePresenceIntoUser(userData, presenceData) {
  if (!userData) return userData;
  if (!presenceData) {
    return {
      ...userData,
      liveLocation: null,
      liveLocationShared: false,
    };
  }
  return {
    ...userData,
    liveLocation: presenceData.liveLocation || null,
    liveLocationShared: presenceData.liveLocationShared === true,
  };
}
