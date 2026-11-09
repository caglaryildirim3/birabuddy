import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  updateEmail,
  updatePassword,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { UNIVERSITY_CITY_BY_SLUG } from '../constants/universities';
import { auth, db } from '../firebase/firebaseConfig';
import { setPrivateUser, setPublicUser } from './userDocUtils';

export function cleanInstagramHandle(handle) {
  return handle.replace(/[@\s]/g, '').toLowerCase();
}

export function getUserDisplayName(data = {}, email) {
  if (data?.name?.trim()) return data.name.trim();
  if (data?.nickname?.trim()) return data.nickname.trim();

  const resolvedEmail = email || data?.email;
  if (resolvedEmail) {
    const localPart = resolvedEmail.split('@')[0] || '';
    const firstSegment = localPart.split('.')[0]?.trim();
    if (firstSegment) return firstSegment;
  }

  if (data?.instagram) return data.instagram;
  return 'User';
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

  const ref = doc(db, 'loginHandles', cleaned);
  const existing = await getDoc(ref);
  if (existing.exists() && existing.data().uid !== uid) {
    throw Object.assign(new Error('Handle taken'), { code: 'handle-taken' });
  }

  await setDoc(ref, {
    email: email.toLowerCase(),
    uid,
  });
}

export async function isLoginHandleAvailable(handle, currentUid) {
  const cleaned = cleanInstagramHandle(handle);
  if (!cleaned) return false;

  const snap = await getDoc(doc(db, 'loginHandles', cleaned));
  if (!snap.exists()) return true;
  if (!currentUid) return false;
  return snap.data().uid === currentUid;
}

export async function updateLoginHandle({ oldHandle, newHandle, email, uid }) {
  const oldCleaned = oldHandle ? cleanInstagramHandle(oldHandle) : '';
  const newCleaned = cleanInstagramHandle(newHandle);

  if (!newCleaned || !email || !uid) {
    throw Object.assign(new Error('Invalid login handle'), { code: 'invalid-handle' });
  }

  if (oldCleaned !== newCleaned) {
    const available = await isLoginHandleAvailable(newCleaned, uid);
    if (!available) {
      throw Object.assign(new Error('Handle taken'), { code: 'handle-taken' });
    }
  }

  await setLoginHandle({ handle: newCleaned, email, uid });

  if (oldCleaned && oldCleaned !== newCleaned) {
    try {
      const oldSnap = await getDoc(doc(db, 'loginHandles', oldCleaned));
      if (oldSnap.exists() && oldSnap.data().uid === uid) {
        await deleteDoc(doc(db, 'loginHandles', oldCleaned));
      }
    } catch (error) {
      console.warn('Failed to remove old login handle:', error);
    }
  }

  await setPrivateUser(uid, { loginHandle: newCleaned });
}

export async function ensureLoginHandleForUser(uid, userData) {
  if (!uid || !userData?.instagram || !userData?.email) return;

  const desired = cleanInstagramHandle(userData.instagram);
  const stored = userData.loginHandle ? cleanInstagramHandle(userData.loginHandle) : '';

  try {
    if (stored && stored !== desired) {
      const storedSnap = await getDoc(doc(db, 'loginHandles', stored));
      if (storedSnap.exists() && storedSnap.data().uid === uid) {
        await deleteDoc(doc(db, 'loginHandles', stored));
      }
    }

    const existing = await getDoc(doc(db, 'loginHandles', desired));
    if (!existing.exists()) {
      await setLoginHandle({
        handle: desired,
        email: userData.email,
        uid,
      });
      await setPrivateUser(uid, { loginHandle: desired });
      return;
    }

    if (existing.data().uid !== uid) return;

    const email = userData.email.toLowerCase();
    if (existing.data().email?.toLowerCase() !== email) {
      await setLoginHandle({ handle: desired, email, uid });
    }

    if (stored !== desired) {
      await setPrivateUser(uid, { loginHandle: desired });
    }
  } catch (error) {
    console.warn('Failed to ensure login handle:', error);
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

export function formatUniversityDisplay(university) {
  if (!university || typeof university !== 'string') return university || '';
  const trimmed = university.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .replace(/\s+univ\.?$/i, ' uni.')
    .replace(/\s+university$/i, ' uni.');
}

/** Student mailbox subdomains. `ogrenci.` must come before `ogr.` so OGÜ is not mangled. */
const STUDENT_DOMAIN_PREFIXES = ['std.', 'mail.', 'ogrenci.', 'ogr.'];

function stripStudentDomainPrefixes(domain) {
  let next = domain.toLowerCase();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of STUDENT_DOMAIN_PREFIXES) {
      if (next.startsWith(prefix)) {
        next = next.slice(prefix.length);
        changed = true;
        break;
      }
    }
  }
  return next;
}

export function parseUniversityFromEmail(email) {
  if (!email) return 'university student';
  try {
    const domainPart = email.split('@')[1];
    if (!domainPart) return 'university student';
    const cleanDomain = stripStudentDomainPrefixes(domainPart);
    const uniName = cleanDomain.replace('.edu.tr', '').replace('.edu', '');
    return `${uniName.toLowerCase()} uni.`;
  } catch {
    return 'university student';
  }
}

function normalizeUniversityToken(value) {
  return formatUniversityDisplay(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+uni\.?$/, '')
    .trim();
}

const UNIVERSITY_SLUG_ALIASES = {
  boun: 'bogazici',
  koc: 'ku',
  sabanci: 'sabanciuniv',
  bau: 'bahcesehir',
};

function canonicalizeUniversitySlug(slug) {
  return UNIVERSITY_SLUG_ALIASES[slug] || slug;
}

export function getUniversitySlug(university, email) {
  const raw = (university || '').trim() || parseUniversityFromEmail(email || '');
  const values = getUniversityQueryValues(raw);
  const combined = values.map((value) => normalizeUniversityToken(value)).join(' ');

  if (combined.includes('boun') || combined.includes('bogazici')) {
    return 'bogazici';
  }

  const slug = normalizeUniversityToken(values[0] || raw);
  if (!slug || slug === 'university student') return '';
  // Student subdomains like ug.bilkent / stu.yasar → match on the last segment.
  return canonicalizeUniversitySlug(slug.split('.').pop());
}

/** City of a top university (see UNIVERSITY_CITY_BY_SLUG), or '' if not listed. */
export function getTopUniversityCity(university, email) {
  return UNIVERSITY_CITY_BY_SLUG[getUniversitySlug(university, email)] || '';
}

function getUniversityDisplayValue(university, email) {
  const raw = (university || '').trim() || parseUniversityFromEmail(email || '');
  return formatUniversityDisplay(raw);
}

export function isSameUniversityIdentity(universityA, emailA, universityB, emailB) {
  const slugA = getUniversitySlug(universityA, emailA);
  const slugB = getUniversitySlug(universityB, emailB);
  if (slugA && slugB && slugA === slugB) return true;

  const displayA = getUniversityDisplayValue(universityA, emailA);
  const displayB = getUniversityDisplayValue(universityB, emailB);
  if (!displayA || !displayB) return false;
  if (displayA === 'university student' || displayB === 'university student') return false;
  return displayA === displayB;
}

/** Raw + formatted variants for Firestore queries (handles legacy ALL CAPS storage). */
export function getUniversityQueryValues(university) {
  const raw = (university || '').trim();
  if (!raw) return [];
  const formatted = formatUniversityDisplay(raw);
  if (!formatted || formatted === raw) return [raw];
  return [...new Set([raw, formatted])];
}

/** Recreate Firestore profile when Auth user exists but users/{uid} was deleted. */
export async function recreateOrphanedUserProfile(firebaseUser) {
  const email = firebaseUser.email?.toLowerCase() || '';
  const uid = firebaseUser.uid;

  await setPublicUser(uid, {
    name: getUserDisplayName({}, email),
    university: parseUniversityFromEmail(email),
  });
  await setPrivateUser(uid, {
    email,
    emailVerified: firebaseUser.emailVerified === true,
    createdAt: new Date(),
    lastLogin: new Date(),
    onboardingComplete: false,
  });

  return { onboardingComplete: false };
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

export function isValidPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

export async function reauthenticateWithPassword(currentPassword) {
  const user = auth.currentUser;
  if (!user?.email) {
    throw Object.assign(new Error('No signed-in user'), { code: 'auth/no-current-user' });
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
}

export function getCredentialChangeErrorMessage(error, t) {
  const code = error?.code || '';

  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return t('incorrectPassword');
  }
  if (code === 'auth/email-already-in-use') return t('emailAlreadyInUse');
  if (code === 'auth/invalid-email') return t('invalidEmailFormat');
  if (code === 'auth/weak-password') return t('weakPassword');
  if (code === 'auth/requires-recent-login') return t('requiresRecentLogin');
  if (code === 'auth/too-many-requests') return t('tooManyAttempts');

  if (error?.message === 'INVALID_EMAIL') return t('validUniversityEmail');
  if (error?.message === 'WEAK_PASSWORD') return t('weakPassword');
  if (error?.message === 'SAME_PASSWORD') return t('passwordSameAsCurrent');
  if (error?.message === 'PASSWORD_MISMATCH') return t('passwordsDoNotMatch');
  if (error?.message === 'EMAIL_UNCHANGED') return t('emailUnchanged');

  return t('failedToUpdateCredentials');
}

export async function changeUserEmail({ newEmail, currentPassword, uid, instagram }) {
  const trimmed = newEmail.toLowerCase().trim();
  const user = auth.currentUser;

  if (!user?.email || !uid) {
    throw Object.assign(new Error('No signed-in user'), { code: 'auth/no-current-user' });
  }
  if (trimmed === user.email.toLowerCase()) {
    throw Object.assign(new Error('Email unchanged'), { message: 'EMAIL_UNCHANGED' });
  }
  if (!isUniversityEmail(trimmed)) {
    throw Object.assign(new Error('Invalid email'), { message: 'INVALID_EMAIL' });
  }
  if (!currentPassword?.trim()) {
    throw Object.assign(new Error('Invalid password'), { message: 'INVALID_PASSWORD' });
  }

  await reauthenticateWithPassword(currentPassword);
  await updateEmail(user, trimmed);
  await sendEmailVerification(user);

  await setPrivateUser(uid, {
    email: trimmed,
    emailVerified: false,
  });
  await setPublicUser(uid, {
    university: parseUniversityFromEmail(trimmed),
  });

  if (instagram) {
    await updateLoginHandle({
      oldHandle: instagram,
      newHandle: instagram,
      email: trimmed,
      uid,
    });
  }

  await user.reload();
  return trimmed;
}

export async function changeUserPassword({ currentPassword, newPassword }) {
  if (!isValidPassword(newPassword)) {
    throw Object.assign(new Error('Weak password'), { message: 'WEAK_PASSWORD' });
  }
  if (currentPassword === newPassword) {
    throw Object.assign(new Error('Same password'), { message: 'SAME_PASSWORD' });
  }

  await reauthenticateWithPassword(currentPassword);
  await updatePassword(auth.currentUser, newPassword);
}
