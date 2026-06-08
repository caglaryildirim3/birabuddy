import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, storage } from '../firebase/firebaseConfig';
import { uploadImageFromUri } from './storageUtils';

const TEXT_LIMIT = 200;
const VENUE_LIMIT = 50;
const COMMENT_LIMIT = 300;

export function aggregateReactions(reactions) {
  if (!reactions || typeof reactions !== 'object') return [];

  const counts = {};
  Object.values(reactions).forEach((emoji) => {
    if (typeof emoji === 'string') {
      counts[emoji] = (counts[emoji] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({ emoji, count }));
}

export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function getUniversityFromEmail(email) {
  if (!email) return '';
  try {
    const domainPart = email.split('@')[1];
    if (domainPart) {
      let cleanDomain = domainPart.replace('std.', '').replace('mail.', '').replace('ogrenci.', '');
      let uniName = cleanDomain.replace('.edu.tr', '').replace('.edu', '');
      return uniName.toUpperCase() + ' UNIV.';
    }
  } catch (e) {
    return '';
  }
  return '';
}

export async function buildUserSnapshot(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { name: 'User', university: '', photoURL: null };
  }
  const data = snap.data();
  const photoURL = Array.isArray(data.photos) && data.photos[0] ? data.photos[0] : null;
  return {
    name: data.name || data.nickname || data.instagram || 'User',
    university: data.university || getUniversityFromEmail(data.email),
    photoURL,
  };
}

export async function uploadPostPhoto(uid, uri, mimeType = 'image/jpeg') {
  const timestamp = Date.now();
  return uploadImageFromUri(storage, `posts/${uid}/${timestamp}`, uri, mimeType);
}

export async function createPost({ uid, text, photoURL, venueTag, drinks = [] }) {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error('Post text is required');
  if (trimmedText.length > TEXT_LIMIT) throw new Error(`Text must be ${TEXT_LIMIT} characters or less`);
  if (venueTag && venueTag.length > VENUE_LIMIT) {
    throw new Error(`Venue tag must be ${VENUE_LIMIT} characters or less`);
  }

  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const userSnapshot = await buildUserSnapshot(uid);
  const city = userData.city || '';

  await addDoc(collection(db, 'posts'), {
    userId: uid,
    userSnapshot,
    text: trimmedText,
    photoURL: photoURL || null,
    venueTag: venueTag?.trim() || null,
    city,
    drinks: Array.isArray(drinks) ? drinks : [],
    likes: [],
    reactions: {},
    commentsCount: 0,
    createdAt: serverTimestamp(),
  });
}

export async function addComment(postId, uid, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Comment cannot be empty');
  if (trimmed.length > COMMENT_LIMIT) {
    throw new Error(`Comment must be ${COMMENT_LIMIT} characters or less`);
  }

  const userSnapshot = await buildUserSnapshot(uid);

  await addDoc(collection(db, 'posts', postId, 'comments'), {
    userId: uid,
    userSnapshot,
    text: trimmed,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'posts', postId), {
    commentsCount: increment(1),
  });
}

export async function deleteComment(postId, commentId) {
  await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
  await updateDoc(doc(db, 'posts', postId), {
    commentsCount: increment(-1),
  });
}

export async function deletePost(postId) {
  const commentsSnap = await getDocs(collection(db, 'posts', postId, 'comments'));
  const batch = writeBatch(db);
  commentsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'posts', postId));
  await batch.commit();
}

export { TEXT_LIMIT, VENUE_LIMIT, COMMENT_LIMIT };
