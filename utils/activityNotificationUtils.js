import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';

async function getUserDisplayName(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 'Someone';
  const data = snap.data();
  return data.name || data.nickname || data.instagram || 'Someone';
}

export async function notifyPostActivity({
  recipientId,
  type,
  postId,
  commentId = null,
  emoji = null,
  preview = null,
}) {
  const senderId = auth.currentUser?.uid;
  if (!senderId || !recipientId || recipientId === senderId || !postId) return;

  try {
    const senderName = await getUserDisplayName(senderId);
    await addDoc(collection(db, 'friendNotifications'), {
      userId: recipientId,
      senderId,
      senderName,
      type,
      postId,
      commentId,
      emoji,
      preview,
      createdAt: serverTimestamp(),
      read: false,
    });
  } catch (error) {
    console.warn('Failed to create activity notification:', error);
  }
}
