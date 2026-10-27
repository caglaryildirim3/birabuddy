import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  Timestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { handleFirestoreListenerError } from './firestoreListenerUtils';
import { getFriendshipDocId, getFriendshipStatus } from './friendUtils';

const CONVERSATIONS = 'conversations';

function sortedPair(uidA, uidB) {
  const [user1Id, user2Id] = [uidA, uidB].sort();
  return { user1Id, user2Id };
}

export function getConversationId(uidA, uidB) {
  return getFriendshipDocId(uidA, uidB);
}

export async function assertCanChatWith(currentUid, friendUid) {
  if (!currentUid || !friendUid || currentUid === friendUid) {
    throw new Error('Invalid chat participants');
  }

  const status = await getFriendshipStatus(currentUid, friendUid);
  if (status !== 'friends') {
    throw new Error('You can only chat with friends');
  }

  return getConversationId(currentUid, friendUid);
}

export async function sendFriendMessage({ currentUid, friendUid, text, senderName, replyTo = null }) {
  const conversationId = await assertCanChatWith(currentUid, friendUid);
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Message cannot be empty');

  const { user1Id, user2Id } = sortedPair(currentUid, friendUid);
  const conversationRef = doc(db, CONVERSATIONS, conversationId);

  await setDoc(
    conversationRef,
    {
      user1Id,
      user2Id,
      lastMessage: trimmed,
      lastMessageAt: serverTimestamp(),
      lastSenderId: currentUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const msgData = {
    text: trimmed,
    senderId: currentUid,
    senderName: senderName || 'User',
    createdAt: serverTimestamp(),
    likes: [],
  };
  if (replyTo) msgData.replyTo = replyTo;

  await addDoc(collection(db, CONVERSATIONS, conversationId, 'messages'), msgData);
}

export function isNudgeMessage(message) {
  if (!message) return false;
  if (message.type === 'nudge') return true;
  if (message.text?.trim()) return false;
  return message.isNudgeBack === true || message.isNudgeBack === false;
}

export async function getUnreadFriendMessageCount(conversationId, conversation, currentUid) {
  if (!conversationId || !conversation || !currentUid) return 0;

  const readField = conversation.user1Id === currentUid ? 'lastReadAtUser1' : 'lastReadAtUser2';
  const readAt = conversation[readField]?.toMillis?.() || 0;

  const snap = await getDocs(
    query(
      collection(db, CONVERSATIONS, conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
  );

  return snap.docs.filter((messageDoc) => {
    const data = messageDoc.data();
    if (isNudgeMessage(data)) return false;
    if (data.senderId === currentUid) return false;
    if (data.deletedFor?.includes(currentUid)) return false;
    return (data.createdAt?.toMillis?.() || 0) > readAt;
  }).length;
}

export function getNudgeMessageText(message, currentUid, friendName, t) {
  if (!isNudgeMessage(message)) return '';

  const isMe = message.senderId === currentUid;
  const name = isMe ? friendName : message.senderName || friendName;

  if (message.isNudgeBack) {
    return isMe ? t('chatYouNudgedBack', { name }) : t('chatNudgedYouBack', { name });
  }
  return isMe ? t('chatYouNudged', { name }) : t('chatNudgedYou', { name });
}

export function findMatchingFriendMessageId(messages, { message, createdAtSeconds } = {}) {
  const text = message?.trim();
  if (!text) return null;

  const matches = (messages || []).filter((m) => !isNudgeMessage(m) && m.text?.trim() === text);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;
  if (!createdAtSeconds) return matches[matches.length - 1].id;

  let bestId = matches[matches.length - 1].id;
  let bestDiff = Infinity;
  matches.forEach((m) => {
    const sec = m.createdAt?.seconds || 0;
    const diff = Math.abs(sec - createdAtSeconds);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestId = m.id;
    }
  });
  return bestId;
}

export function findMatchingNudgeMessageId(messages, { senderId, createdAtSeconds } = {}) {
  const candidates = (messages || []).filter(
    (m) => isNudgeMessage(m) && (!senderId || m.senderId === senderId)
  );
  if (candidates.length === 0) return null;
  if (!createdAtSeconds) return candidates[candidates.length - 1].id;

  let bestId = candidates[candidates.length - 1].id;
  let bestDiff = Infinity;
  candidates.forEach((m) => {
    const sec = m.createdAt?.seconds || 0;
    const diff = Math.abs(sec - createdAtSeconds);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestId = m.id;
    }
  });
  return bestDiff <= 300 ? bestId : candidates[candidates.length - 1].id;
}

export function resolveFriendChatScrollTargetId(messages, {
  chatMessageId,
  scrollToNudge,
  messagePreview,
  senderId,
  createdAtSeconds,
} = {}) {
  if (chatMessageId && messages.some((m) => m.id === chatMessageId)) {
    return chatMessageId;
  }
  if (scrollToNudge) {
    return findMatchingNudgeMessageId(messages, { senderId, createdAtSeconds });
  }
  if (messagePreview) {
    return findMatchingFriendMessageId(messages, { message: messagePreview, createdAtSeconds });
  }
  return null;
}

export function subscribeToFriendMessages(conversationId, onMessages, onError) {
  const messagesQuery = query(
    collection(db, CONVERSATIONS, conversationId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data(),
      }));
      onMessages(messages);
    },
    onError
  );
}

export function subscribeToConversation(conversationId, onConversation, onError) {
  if (!conversationId) return () => {};

  return onSnapshot(
    doc(db, CONVERSATIONS, conversationId),
    (snapshot) => {
      onConversation(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError || handleFirestoreListenerError('conversation')
  );
}

export function isConversationUnread(conversation, currentUid) {
  if (!currentUid || !conversation?.lastMessage || !conversation?.lastSenderId) return false;
  if (conversation.lastSenderId === currentUid) return false;

  const lastMessageAt = conversation.lastMessageAt?.toMillis?.() || 0;
  if (!lastMessageAt) return true;

  const readField = conversation.user1Id === currentUid ? 'lastReadAtUser1' : 'lastReadAtUser2';
  const lastReadAt = conversation[readField]?.toMillis?.() || 0;
  return lastMessageAt > lastReadAt;
}

export async function markConversationRead(conversationId, currentUid) {
  if (!conversationId || !currentUid) return;

  const conversationRef = doc(db, CONVERSATIONS, conversationId);
  const snap = await getDoc(conversationRef);
  if (!snap.exists()) return;

  const data = snap.data();
  const readField = data.user1Id === currentUid ? 'lastReadAtUser1' : 'lastReadAtUser2';
  await updateDoc(conversationRef, {
    [readField]: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToConversations(currentUid, onConversations, onError) {
  if (!currentUid) return () => {};

  const handleError = onError || handleFirestoreListenerError('conversations');

  let docs1 = [];
  let docs2 = [];

  const emit = () => {
    const unique = new Map();
    [...docs1, ...docs2].forEach((d) => unique.set(d.id, d));
    const conversations = Array.from(unique.values())
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aTime = a.lastMessageAt?.toMillis?.() || 0;
        const bTime = b.lastMessageAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
    onConversations(conversations);
  };

  const unsub1 = onSnapshot(
    query(collection(db, CONVERSATIONS), where('user1Id', '==', currentUid)),
    (snap) => {
      docs1 = snap.docs;
      emit();
    },
    handleError
  );

  const unsub2 = onSnapshot(
    query(collection(db, CONVERSATIONS), where('user2Id', '==', currentUid)),
    (snap) => {
      docs2 = snap.docs;
      emit();
    },
    handleError
  );

  return () => {
    unsub1();
    unsub2();
  };
}

export async function getConversationPartnerUid(conversation, currentUid) {
  if (!conversation) return null;
  return conversation.user1Id === currentUid ? conversation.user2Id : conversation.user1Id;
}

export async function toggleMessageLike(conversationId, messageId, uid) {
  const ref = doc(db, CONVERSATIONS, conversationId, 'messages', messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const likes = snap.data().likes || [];
  const alreadyLiked = likes.includes(uid);
  await updateDoc(ref, {
    likes: alreadyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function deleteMessageForEveryone(conversationId, messageId) {
  await deleteDoc(doc(db, CONVERSATIONS, conversationId, 'messages', messageId));
}

export async function deleteMessageForMe(conversationId, messageId, uid) {
  await updateDoc(doc(db, CONVERSATIONS, conversationId, 'messages', messageId), {
    deletedFor: arrayUnion(uid),
  });
}

export async function getUserChatPreview(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { uid, name: 'Unknown', photoUrl: null };
  }
  const data = snap.data();
  return {
    uid,
    name: data.name || data.nickname || data.instagram || 'User',
    photoUrl: Array.isArray(data.photos) && data.photos[0] ? data.photos[0] : null,
  };
}
