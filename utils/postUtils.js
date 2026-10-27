import {
  addDoc,
  arrayRemove,
  arrayUnion,
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
import { formatUniversityDisplay, parseUniversityFromEmail } from './authUtils';
import {
  DELETED_USER_SNAPSHOT,
  isDeletedUser,
  isVisiblePost,
} from './deletedUserUtils';
import { resolveFirstProfilePhotoUrl } from './photoUtils';
import { uploadImageFromUri } from './storageUtils';

const TEXT_LIMIT = 200;
const VENUE_LIMIT = 50;
const COMMENT_LIMIT = 300;

export const POST_VISIBILITY = {
  PUBLIC: 'public',
  FRIENDS: 'friends',
};

/** Legacy posts without visibility count as public. */
export function isPublicFeedPost(post) {
  return isVisiblePost(post) && post?.visibility !== POST_VISIBILITY.FRIENDS;
}

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

export function getReactionUserIds(reactions, emoji) {
  if (!reactions || typeof reactions !== 'object' || !emoji) return [];

  return Object.entries(reactions)
    .filter(([, value]) => value === emoji)
    .map(([uid]) => uid);
}

export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function buildUserSnapshot(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { name: 'User', university: '', photoURL: null };
  }
  const data = snap.data();
  if (isDeletedUser(data)) {
    return { ...DELETED_USER_SNAPSHOT };
  }
  const photoURL = await resolveFirstProfilePhotoUrl(uid, data.photos);
  return {
    name: data.name || data.nickname || data.instagram || 'User',
    university: formatUniversityDisplay(
      data.university || parseUniversityFromEmail(data.email)
    ),
    photoURL,
  };
}

export { isVisiblePost };

export async function uploadPostPhoto(uid, uri, mimeType = 'image/jpeg') {
  const timestamp = Date.now();
  return uploadImageFromUri(storage, `posts/${uid}/${timestamp}`, uri, mimeType);
}

export async function createPost({
  uid,
  text,
  photoURL,
  selfiePhotoURL,
  venueTag,
  drinks = [],
  visibility = POST_VISIBILITY.PUBLIC,
}) {
  const trimmedText = text.trim();
  if (!trimmedText && !photoURL) throw new Error('Post must include text or a photo');
  if (trimmedText.length > TEXT_LIMIT) throw new Error(`Text must be ${TEXT_LIMIT} characters or less`);
  if (venueTag && venueTag.length > VENUE_LIMIT) {
    throw new Error(`Venue tag must be ${VENUE_LIMIT} characters or less`);
  }

  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const userSnapshot = await buildUserSnapshot(uid);
  const city = userData.city || '';
  const university = formatUniversityDisplay(
    userData.university || parseUniversityFromEmail(userData.email) || ''
  );

  const resolvedVisibility =
    visibility === POST_VISIBILITY.FRIENDS ? POST_VISIBILITY.FRIENDS : POST_VISIBILITY.PUBLIC;

  await addDoc(collection(db, 'posts'), {
    userId: uid,
    userSnapshot,
    text: trimmedText,
    photoURL: photoURL || null,
    selfiePhotoURL: selfiePhotoURL || null,
    venueTag: venueTag?.trim() || null,
    city,
    university,
    visibility: resolvedVisibility,
    drinks: Array.isArray(drinks) ? drinks : [],
    likes: [],
    reactions: {},
    commentsCount: 0,
    createdAt: serverTimestamp(),
  });
}

export async function addComment(postId, uid, text, parentId = null) {
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
    parentId: parentId || null,
    likes: [],
    createdAt: serverTimestamp(),
  });

  if (!parentId) {
    await updateDoc(doc(db, 'posts', postId), {
      commentsCount: increment(1),
    });
  }
}

export async function toggleCommentLike(postId, commentId, uid, currentlyLiked) {
  await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
    likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function deleteComment(postId, commentId) {
  const commentRef = doc(db, 'posts', postId, 'comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) return;

  const isTopLevel = !snap.data().parentId;

  if (isTopLevel) {
    const allSnap = await getDocs(collection(db, 'posts', postId, 'comments'));
    const batch = writeBatch(db);
    allSnap.docs.forEach((d) => {
      if (d.id === commentId || d.data().parentId === commentId) {
        batch.delete(d.ref);
      }
    });
    await batch.commit();
    await updateDoc(doc(db, 'posts', postId), {
      commentsCount: increment(-1),
    });
    return;
  }

  await deleteDoc(commentRef);
}

/** Flatten top-level comments + nested replies for list rendering. */
export function buildCommentThreads(comments) {
  const tops = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const topIds = new Set(tops.map((c) => c.id));
  const repliesByParent = {};
  comments
    .filter((c) => c.parentId && topIds.has(c.parentId))
    .forEach((c) => {
      if (!repliesByParent[c.parentId]) repliesByParent[c.parentId] = [];
      repliesByParent[c.parentId].push(c);
    });

  Object.values(repliesByParent).forEach((replies) => {
    replies.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  });

  const flattened = [];
  tops.forEach((top) => {
    flattened.push({ ...top, isReply: false });
    (repliesByParent[top.id] || []).forEach((reply) => {
      flattened.push({ ...reply, isReply: true });
    });
  });
  return flattened;
}

export async function deletePost(postId) {
  const commentsSnap = await getDocs(collection(db, 'posts', postId, 'comments'));
  const batch = writeBatch(db);
  commentsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'posts', postId));
  await batch.commit();
}

export { TEXT_LIMIT, VENUE_LIMIT, COMMENT_LIMIT };
