import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export const OUT_TONIGHT_NOTE_LIMIT = 60;

export function calculateExpiresAt(now = new Date()) {
  const expires = new Date(now);
  const hour = now.getHours();

  if (hour < 6) {
    expires.setHours(6, 0, 0, 0);
  } else {
    expires.setDate(expires.getDate() + 1);
    expires.setHours(6, 0, 0, 0);
  }

  return expires;
}

export function toMillis(timestamp) {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().getTime();
  return new Date(timestamp).getTime();
}

export function isOutTonight(userData) {
  if (!userData?.outTonight) return false;
  const expiresMs = toMillis(userData.outTonightExpiresAt);
  if (!expiresMs) return false;
  return Date.now() < expiresMs;
}

export function getOutTonightSinceLabel(since) {
  if (!since) return null;
  const sinceMs = toMillis(since);
  if (!sinceMs) return null;

  const hours = Math.floor((Date.now() - sinceMs) / 3600000);
  if (hours < 1) return 'less than 1 hour ago';
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

export async function setOutTonightStatus(uid, note = null, fuzzedLocation = null) {
  const trimmedNote = note?.trim() || null;
  if (trimmedNote && trimmedNote.length > OUT_TONIGHT_NOTE_LIMIT) {
    throw new Error(`Note must be ${OUT_TONIGHT_NOTE_LIMIT} characters or less`);
  }

  const now = new Date();
  const expires = calculateExpiresAt(now);

  await setDoc(
    doc(db, 'users', uid),
    {
      outTonight: true,
      outTonightNote: trimmedNote,
      outTonightSince: Timestamp.fromDate(now),
      outTonightExpiresAt: Timestamp.fromDate(expires),
      liveLocation: fuzzedLocation ?? null,
      liveLocationShared: fuzzedLocation != null,
    },
    { merge: true }
  );
}

export async function updateOutTonightNote(uid, note) {
  const trimmedNote = note?.trim() || null;
  if (trimmedNote && trimmedNote.length > OUT_TONIGHT_NOTE_LIMIT) {
    throw new Error(`Note must be ${OUT_TONIGHT_NOTE_LIMIT} characters or less`);
  }

  await setDoc(
    doc(db, 'users', uid),
    { outTonightNote: trimmedNote },
    { merge: true }
  );
}

export async function clearOutTonightStatus(uid) {
  await setDoc(
    doc(db, 'users', uid),
    {
      outTonight: false,
      outTonightNote: null,
      outTonightSince: null,
      outTonightExpiresAt: null,
      liveLocation: null,
      liveLocationShared: false,
    },
    { merge: true }
  );
}

export function truncateName(name, max = 8) {
  if (!name) return '';
  return name.length > max ? `${name.slice(0, max)}…` : name;
}
