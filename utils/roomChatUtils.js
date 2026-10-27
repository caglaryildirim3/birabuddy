import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export function findMatchingRoomMessageId(messages, notification) {
  if (!notification) return null;
  if (notification.chatMessageId && messages.some((m) => m.id === notification.chatMessageId)) {
    return notification.chatMessageId;
  }

  const text = notification.message?.trim();
  if (!text) return null;

  const notifSec = notification.createdAt?.seconds || 0;
  const matches = (messages || []).filter((m) => m.text?.trim() === text);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  let bestId = matches[0].id;
  let bestDiff = Infinity;
  matches.forEach((m) => {
    const sec = m.createdAt?.seconds || 0;
    const diff = Math.abs(sec - notifSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestId = m.id;
    }
  });
  return bestId;
}

export async function toggleRoomMessageLike(roomId, messageId, uid) {
  if (!roomId || !messageId || !uid) return;

  const ref = doc(db, 'rooms', roomId, 'messages', messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const likes = snap.data().likes || [];
  const alreadyLiked = likes.includes(uid);
  await updateDoc(ref, {
    likes: alreadyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}
