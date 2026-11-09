import {
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export const PRIVATE_USER_FIELDS = [
  'email',
  'blockedIds',
  'punishmentHistory',
  'kvkkConsent',
  'kvkkConsentDate',
  'kvkkConsentVersion',
  'ageConfirmed',
  'ageConfirmationDate',
  'termsAccepted',
  'termsAcceptanceDate',
  'termsVersion',
  'expoPushToken',
  'banned',
  'suspendedUntil',
  'isDeleted',
  'deletedAt',
  'createdAt',
  'lastLogin',
  'emailVerified',
  'onboardingComplete',
  'notificationPrefs',
  'loginHandle',
];

export function getUserPublicRef(uid) {
  return doc(db, 'users', uid);
}

export function getUserPrivateRef(uid) {
  return doc(db, 'users', uid, 'private', 'account');
}

export function isPrivateUserField(field) {
  return PRIVATE_USER_FIELDS.includes(field);
}

export function pickPrivateFields(data = {}) {
  const result = {};
  PRIVATE_USER_FIELDS.forEach((key) => {
    if (data[key] !== undefined) result[key] = data[key];
  });
  return result;
}

export function omitPrivateFields(data = {}) {
  const result = { ...data };
  PRIVATE_USER_FIELDS.forEach((key) => {
    delete result[key];
  });
  return result;
}

export async function getPublicUserData(uid) {
  const snap = await getDoc(getUserPublicRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function getPrivateUserData(uid) {
  const snap = await getDoc(getUserPrivateRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function getOwnUserData(uid) {
  const [publicSnap, privateSnap] = await Promise.all([
    getDoc(getUserPublicRef(uid)),
    getDoc(getUserPrivateRef(uid)),
  ]);

  if (!publicSnap.exists() && !privateSnap.exists()) return null;

  return {
    ...(publicSnap.exists() ? publicSnap.data() : {}),
    ...(privateSnap.exists() ? privateSnap.data() : {}),
  };
}

export async function migrateLegacyUserDocs(uid) {
  const pubRef = getUserPublicRef(uid);
  const privRef = getUserPrivateRef(uid);
  const [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);

  if (!pubSnap.exists()) return;

  const legacyPrivate = pickPrivateFields(pubSnap.data());
  if (Object.keys(legacyPrivate).length === 0) return;

  const batch = writeBatch(db);
  batch.set(privRef, { ...privSnap.data(), ...legacyPrivate }, { merge: true });

  const publicOnly = omitPrivateFields(pubSnap.data());
  PRIVATE_USER_FIELDS.forEach((key) => {
    if (pubSnap.data()[key] !== undefined) {
      publicOnly[key] = deleteField();
    }
  });
  batch.set(pubRef, publicOnly, { merge: true });

  await batch.commit();
}

export async function setPublicUser(uid, data, merge = true) {
  await setDoc(getUserPublicRef(uid), omitPrivateFields(data), { merge });
}

export async function setPrivateUser(uid, data, merge = true) {
  await setDoc(getUserPrivateRef(uid), pickPrivateFields(data), { merge });
}

export async function updatePublicUser(uid, updates) {
  await updateDoc(getUserPublicRef(uid), omitPrivateFields(updates));
}

export async function updatePrivateUser(uid, updates) {
  await setDoc(getUserPrivateRef(uid), pickPrivateFields(updates), { merge: true });
}

export async function persistUserField(uid, field, value) {
  const ref = isPrivateUserField(field) ? getUserPrivateRef(uid) : getUserPublicRef(uid);
  await setDoc(ref, { [field]: value }, { merge: true });
}
