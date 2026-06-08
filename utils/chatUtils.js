import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
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

export async function sendFriendMessage({ currentUid, friendUid, text, senderName }) {
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

  await addDoc(collection(db, CONVERSATIONS, conversationId, 'messages'), {
    text: trimmed,
    senderId: currentUid,
    senderName: senderName || 'User',
    createdAt: serverTimestamp(),
  });
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

export function subscribeToConversations(currentUid, onConversations, onError) {
  if (!currentUid) return () => {};

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
    onError
  );

  const unsub2 = onSnapshot(
    query(collection(db, CONVERSATIONS), where('user2Id', '==', currentUid)),
    (snap) => {
      docs2 = snap.docs;
      emit();
    },
    onError
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
