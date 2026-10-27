import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const MAX_POSTS = 25;
const MAX_MESSAGES_PER_CHAT = 25;
const MAX_MESSAGES_PER_ROOM = 25;
const MAX_CREATED_ROOMS = 25;
const MAX_POST_COMMENTS = 10;

function sortByCreatedAtDesc(items) {
  return [...items].sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
}

export async function fetchReportedUserPosts(uid) {
  const snap = await getDocs(query(collection(db, 'posts'), where('userId', '==', uid)));
  return sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() }))).slice(
    0,
    MAX_POSTS
  );
}

/** Total reports per user across post + profile types and all statuses. */
export async function fetchAllReportCountsByReportedUser() {
  const snap = await getDocs(collection(db, 'reports'));
  const counts = {};

  snap.docs.forEach((reportDoc) => {
    const uid = reportDoc.data().reportedUserId;
    if (!uid) return;
    counts[uid] = (counts[uid] || 0) + 1;
  });

  return counts;
}

export async function fetchReportedPostComments(postId) {
  if (!postId) return [];

  const snap = await getDocs(collection(db, 'posts', postId, 'comments'));
  return sortByCreatedAtDesc(snap.docs.map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() })))
    .slice(0, MAX_POST_COMMENTS)
    .reverse();
}

export async function fetchReportedUserCreatedRooms(uid) {
  const snap = await getDocs(query(collection(db, 'rooms'), where('createdBy', '==', uid)));
  return sortByCreatedAtDesc(
    snap.docs.map((roomDoc) => {
      const data = roomDoc.data();
      return {
        id: roomDoc.id,
        name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : roomDoc.id,
        isActive: data.isActive !== false,
        creatorAccountDeleted: data.creatorAccountDeleted === true,
        createdAt: data.createdAt || null,
      };
    })
  ).slice(0, MAX_CREATED_ROOMS);
}

function getPartnerUid(conversation, reportedUid) {
  return conversation.user1Id === reportedUid ? conversation.user2Id : conversation.user1Id;
}

async function fetchFriendChats(reportedUid) {
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, 'conversations'), where('user1Id', '==', reportedUid))),
    getDocs(query(collection(db, 'conversations'), where('user2Id', '==', reportedUid))),
  ]);

  const unique = new Map();
  [...snap1.docs, ...snap2.docs].forEach((d) => unique.set(d.id, { id: d.id, ...d.data() }));

  const conversations = await Promise.all(
    Array.from(unique.values()).map(async (conversation) => {
      const partnerUid = getPartnerUid(conversation, reportedUid);
      const messagesSnap = await getDocs(
        collection(db, 'conversations', conversation.id, 'messages')
      );
      const messages = sortByCreatedAtDesc(
        messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      )
        .slice(0, MAX_MESSAGES_PER_CHAT)
        .reverse();

      let partnerLabel = partnerUid;
      try {
        const [publicSnap, privateSnap] = await Promise.all([
          getDoc(doc(db, 'users', partnerUid)),
          getDoc(doc(db, 'users', partnerUid, 'private', 'account')),
        ]);
        const publicData = publicSnap.exists() ? publicSnap.data() : {};
        const privateData = privateSnap.exists() ? privateSnap.data() : {};
        partnerLabel =
          privateData.email ||
          publicData.name ||
          publicData.instagram ||
          partnerUid;
      } catch {
        // keep uid fallback
      }

      return {
        ...conversation,
        partnerUid,
        partnerLabel,
        messages,
      };
    })
  );

  return conversations.sort(
    (a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0)
  );
}

async function fetchRoomChats(reportedUid) {
  const [createdSnap, joinedSnap] = await Promise.all([
    getDocs(query(collection(db, 'rooms'), where('createdBy', '==', reportedUid))),
    getDocs(query(collection(db, 'rooms'), where('participants', 'array-contains', reportedUid))),
  ]);

  const roomIds = new Set();
  createdSnap.docs.forEach((roomDoc) => roomIds.add(roomDoc.id));
  joinedSnap.docs.forEach((roomDoc) => roomIds.add(roomDoc.id));

  const rooms = await Promise.all(
    [...roomIds].map(async (roomId) => {
      const [roomSnap, messagesSnap] = await Promise.all([
        getDoc(doc(db, 'rooms', roomId)),
        getDocs(collection(db, 'rooms', roomId, 'messages')),
      ]);

      const roomName = roomSnap.exists() ? roomSnap.data().name || roomId : roomId;
      const messages = sortByCreatedAtDesc(
        messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      )
        .slice(0, MAX_MESSAGES_PER_ROOM)
        .reverse();

      if (!messages.some((message) => message.uid === reportedUid)) return null;
      const latestAt = messages[messages.length - 1]?.createdAt;

      return {
        id: roomId,
        roomId,
        roomName,
        messages,
        latestAt,
      };
    })
  );

  return rooms
    .filter(Boolean)
    .sort((a, b) => (b.latestAt?.seconds || 0) - (a.latestAt?.seconds || 0));
}

export async function fetchReportedUserChats(reportedUid) {
  const [friendResult, roomResult] = await Promise.allSettled([
    fetchFriendChats(reportedUid),
    fetchRoomChats(reportedUid),
  ]);

  const friendChats = friendResult.status === 'fulfilled' ? friendResult.value : [];
  const roomChats = roomResult.status === 'fulfilled' ? roomResult.value : [];

  if (friendResult.status === 'rejected') {
    console.warn('Friend chats load failed:', friendResult.reason);
  }
  if (roomResult.status === 'rejected') {
    console.warn('Room chats load failed:', roomResult.reason);
  }

  if (friendResult.status === 'rejected' && roomResult.status === 'rejected') {
    throw friendResult.reason || roomResult.reason;
  }

  return { friendChats, roomChats };
}
