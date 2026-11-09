import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { formatUniversityDisplay, parseUniversityFromEmail } from './authUtils';
import { isPersistablePhotoUrl, normalizePhotos } from './photoUtils';
import { getOwnUserData, getPrivateUserData } from './userDocUtils';

export const REPORT_REASON_LIMIT = 500;

export const REPORT_TYPES = {
  POST: 'post',
  USER: 'user',
};

export const REPORT_STATUS = {
  PENDING: 'pending',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
};

export function buildPostReportSnapshot(post) {
  const userSnapshot = post.userSnapshot
    ? {
        name: post.userSnapshot.name || 'User',
        university: post.userSnapshot.university || null,
        photoURL: post.userSnapshot.photoURL || null,
      }
    : null;

  return {
    text: typeof post.text === 'string' ? post.text : '',
    photoURL: post.photoURL || null,
    selfiePhotoURL: post.selfiePhotoURL || null,
    venueTag: post.venueTag || null,
    visibility: post.visibility || 'public',
    userSnapshot,
  };
}

export function buildUserReportSnapshot(userProfile) {
  if (!userProfile) {
    return { name: 'User', instagram: null, university: null, photoURL: null, photos: [], bio: '' };
  }

  const photos = normalizePhotos(userProfile.photos).filter(isPersistablePhotoUrl);
  const photoURL = photos[0] || null;

  return {
    name: userProfile.name || userProfile.nickname || userProfile.instagram || 'User',
    email: typeof userProfile.email === 'string' ? userProfile.email.trim().toLowerCase() : null,
    instagram: userProfile.instagram || null,
    university: formatUniversityDisplay(
      userProfile.university || parseUniversityFromEmail(userProfile.email)
    ),
    photoURL,
    photos,
    bio: typeof userProfile.bio === 'string' ? userProfile.bio : '',
  };
}

async function getUserEmail(uid) {
  if (!uid) return null;
  try {
    const data =
      auth.currentUser?.uid === uid
        ? await getOwnUserData(uid)
        : await getPrivateUserData(uid);
    if (!data) return null;
    const email = data.email;
    return typeof email === 'string' ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function submitPostReport({ post, reporterUserId, reporterEmail, reason }) {
  if (!post?.id || !reporterUserId || !reason?.trim()) throw new Error('Invalid report');

  const reportedUserEmail = await getUserEmail(post.userId);

  await addDoc(collection(db, 'reports'), {
    type: REPORT_TYPES.POST,
    postId: post.id,
    reportedUserId: post.userId,
    reportedUserEmail,
    reporterUserId,
    reporterEmail: reporterEmail?.trim().toLowerCase() || null,
    reason: reason.trim(),
    postSnapshot: buildPostReportSnapshot(post),
    createdAt: serverTimestamp(),
    status: REPORT_STATUS.PENDING,
  });
}

export async function submitUserReport({
  uid,
  userProfile,
  reporterUserId,
  reporterEmail,
  reason,
}) {
  if (!uid || !reporterUserId || !reason?.trim()) throw new Error('Invalid report');

  const reportedUserEmail =
    userProfile?.email?.trim().toLowerCase() || (await getUserEmail(uid));

  await addDoc(collection(db, 'reports'), {
    type: REPORT_TYPES.USER,
    reportedUserId: uid,
    reportedUserEmail,
    reporterUserId,
    reporterEmail: reporterEmail?.trim().toLowerCase() || null,
    reason: reason.trim(),
    userSnapshot: buildUserReportSnapshot(userProfile),
    createdAt: serverTimestamp(),
    status: REPORT_STATUS.PENDING,
  });
}
