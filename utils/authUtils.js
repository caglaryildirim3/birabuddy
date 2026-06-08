import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export function cleanInstagramHandle(handle) {
  return handle.replace(/[@\s]/g, '').toLowerCase();
}

export function isUniversityEmail(value) {
  const emailLower = value.toLowerCase().trim();
  const isEduTr = emailLower.endsWith('.edu.tr');
  const isEdu = emailLower.endsWith('.edu');
  if (!isEduTr && !isEdu) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower);
}

export function isInstagramHandle(value) {
  const handle = cleanInstagramHandle(value);
  if (handle.length < 2 || handle.length > 30) return false;
  return /^[a-z0-9._]+$/.test(handle);
}

function instagramLookupCandidates(value) {
  const trimmed = value.trim();
  const cleaned = cleanInstagramHandle(trimmed);
  const stripped = trimmed.replace(/[@\s]/g, '');
  return [...new Set([cleaned, stripped.toLowerCase(), stripped].filter(Boolean))];
}

export async function setLoginHandle({ handle, email, uid }) {
  const cleaned = cleanInstagramHandle(handle);
  if (!cleaned || !email || !uid) return;

  await setDoc(doc(db, 'loginHandles', cleaned), {
    email: email.toLowerCase(),
    uid,
  });
}

export async function updateLoginHandle({ oldHandle, newHandle, email, uid }) {
  const oldCleaned = oldHandle ? cleanInstagramHandle(oldHandle) : '';
  const newCleaned = cleanInstagramHandle(newHandle);

  if (oldCleaned && oldCleaned !== newCleaned) {
    try {
      await deleteDoc(doc(db, 'loginHandles', oldCleaned));
    } catch (error) {
      console.log('Failed to remove old login handle:', error);
    }
  }

  if (newCleaned) {
    await setLoginHandle({ handle: newCleaned, email, uid });
  }
}

export async function ensureLoginHandleForUser(uid, userData) {
  if (!uid || !userData?.instagram || !userData?.email) return;
  try {
    const existing = await getDoc(doc(db, 'loginHandles', cleanInstagramHandle(userData.instagram)));
    if (!existing.exists()) {
      await setLoginHandle({
        handle: userData.instagram,
        email: userData.email,
        uid,
      });
    }
  } catch (error) {
    console.log('Failed to ensure login handle:', error);
  }
}

async function lookupEmailByInstagram(value) {
  const candidates = instagramLookupCandidates(value);

  for (const handle of candidates) {
    const snap = await getDoc(doc(db, 'loginHandles', handle));
    if (snap.exists()) {
      const email = snap.data().email;
      if (email) return email.toLowerCase();
    }
  }

  return null;
}

export async function resolveLoginEmail(identifier) {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw Object.assign(new Error('Missing identifier'), { code: 'missing-identifier' });
  }

  if (trimmed.includes('@')) {
    if (!isUniversityEmail(trimmed)) {
      throw Object.assign(new Error('Invalid email'), { code: 'invalid-email' });
    }
    return trimmed.toLowerCase();
  }

  if (!isInstagramHandle(trimmed)) {
    throw Object.assign(new Error('Invalid instagram'), { code: 'invalid-instagram' });
  }

  const email = await lookupEmailByInstagram(trimmed);
  if (!email) {
    throw Object.assign(new Error('User not found'), { code: 'user-not-found' });
  }

  return email;
}
