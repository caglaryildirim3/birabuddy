const admin = require('firebase-admin');
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const {
  softDeleteUserAccount,
  purgeExpiredDeletedAccounts,
} = require('./accountDeleteUtils');
const {
  syncModerationAuthState,
  releaseExpiredSuspensions,
} = require('./moderationAuthUtils');

admin.initializeApp();
const db = admin.firestore();

const EXPO_PUSH_URL = 'https://exp.host/--/exponent-push-token/v2/push/send';

const DEFAULT_NOTIFICATION_PREFS = {
  friendRequests: true,
  socialActivity: true,
  roomActivity: true,
  messages: true,
};

const SOCIAL_ACTIVITY_NOTIFICATION_TYPES = new Set([
  'post_like',
  'post_comment',
  'comment_like',
  'post_reaction',
]);

function truncatePushBody(text, max = 120) {
  if (!text) return '';
  const trimmed = String(text).trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

async function createRoomNotification({ notificationId, userId, type, title, message, roomId, senderId }) {
  if (!userId || !type) return;

  const ref = notificationId
    ? db.collection('notifications').doc(notificationId)
    : db.collection('notifications').doc();

  await ref.set(
    {
      userId,
      type,
      title,
      message,
      roomId: roomId || null,
      senderId: senderId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    },
    { merge: true }
  );
}

async function sendPush(uid, title, body, data = {}, options = {}) {
  if (!uid) return;

  const privateRef = db.collection('users').doc(uid).collection('private').doc('account');
  const privateSnap = await privateRef.get();
  if (!privateSnap.exists) return;

  const privateData = privateSnap.data();
  const { prefKey } = options;
  if (prefKey) {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(privateData.notificationPrefs || {}) };
    if (prefs[prefKey] === false) return;
  }

  const token = privateData.expoPushToken;
  if (!token) return;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
      }),
    });

    const result = await response.json().catch(() => null);
    const ticket = result?.data?.[0];

    if (!response.ok) {
      logger.warn('Expo push failed', { uid, status: response.status, result });
      return;
    }

    if (ticket?.status === 'error') {
      const errorCode = ticket.details?.error;
      logger.warn('Expo push ticket error', { uid, errorCode, ticket });
      if (errorCode === 'DeviceNotRegistered' || errorCode === 'InvalidCredentials') {
        await privateRef.set(
          { expoPushToken: admin.firestore.FieldValue.delete() },
          { merge: true }
        );
      }
    }
  } catch (error) {
    logger.error('sendPush error', { uid, error: error.message });
  }
}

async function getUserDisplayName(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return 'Someone';
  const data = snap.data();
  return data.name || data.nickname || data.instagram || 'Someone';
}

function buildActivityPush(notification) {
  const name = notification.senderName || 'Someone';

  switch (notification.type) {
    case 'post_like':
      return {
        title: `${name} liked your post`,
        body: 'Check out your feed',
      };
    case 'post_comment':
      return notification.preview
        ? { title: `${name} commented`, body: truncatePushBody(notification.preview) }
        : { title: `${name} commented on your post`, body: 'See what they said' };
    case 'comment_like':
      return {
        title: `${name} liked your comment`,
        body: 'See your post',
      };
    case 'post_reaction':
      return {
        title: `${name} reacted ${notification.emoji || '✨'}`,
        body: 'See your post',
      };
    case 'report_punishment':
      return {
        title: 'Report update',
        body: truncatePushBody(notification.message || 'Your report was reviewed'),
      };
    default:
      return null;
  }
}

function getRoomVenue(room) {
  return room.barName?.trim() || room.neighborhood?.trim() || 'the meetup';
}

const { getRoomStartTime, isRoomExpired, cleanupOrphanRoomTrees } = require('./roomCleanupUtils');

function minutesSinceRoomStart(room, now = new Date()) {
  const start = getRoomStartTime(room);
  if (!start) return null;
  return (now.getTime() - start.getTime()) / 60000;
}

async function deleteRoomTree(roomRef) {
  await db.recursiveDelete(roomRef);
}

async function getFriendIds(uid) {
  const [snap1, snap2] = await Promise.all([
    db.collection('friendships').where('user1Id', '==', uid).where('status', '==', 'accepted').get(),
    db.collection('friendships').where('user2Id', '==', uid).where('status', '==', 'accepted').get(),
  ]);

  const ids = new Set();
  snap1.forEach((docSnap) => {
    const data = docSnap.data();
    ids.add(data.user2Id);
  });
  snap2.forEach((docSnap) => {
    const data = docSnap.data();
    ids.add(data.user1Id);
  });
  return [...ids];
}

async function getPendingOrFriendUids(uid) {
  const related = new Set(await getFriendIds(uid));
  const [snap1, snap2] = await Promise.all([
    db.collection('friendships').where('user1Id', '==', uid).get(),
    db.collection('friendships').where('user2Id', '==', uid).get(),
  ]);

  snap1.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.status === 'accepted' || data.status === 'pending') {
      related.add(data.user2Id);
    }
  });
  snap2.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.status === 'accepted' || data.status === 'pending') {
      related.add(data.user1Id);
    }
  });

  return related;
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

exports.onFriendRequestSent = onDocumentCreated('friendships/{friendshipId}', async (event) => {
  const data = event.data?.data();
  if (!data || data.status !== 'pending') return;

  const targetUid = data.requestedBy === data.user1Id ? data.user2Id : data.user1Id;
  const senderName = await getUserDisplayName(data.requestedBy);

  await sendPush(
    targetUid,
    `${senderName} wants to be friends 🍺`,
    'You met at birabuddy — add them back?',
    { type: 'friend_request', senderId: data.requestedBy },
    { prefKey: 'friendRequests' }
  );
});

exports.onFriendRequestAccepted = onDocumentUpdated('friendships/{friendshipId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;
  if (before.status === 'accepted' || after.status !== 'accepted') return;

  const acceptorUid = after.requestedBy === after.user1Id ? after.user2Id : after.user1Id;
  const acceptorName = await getUserDisplayName(acceptorUid);

  await sendPush(
    after.requestedBy,
    `${acceptorName} accepted your friend request 🎉`,
    "You're now friends on birabuddy",
    { type: 'friend_accepted' },
    { prefKey: 'friendRequests' }
  );
});

exports.onRoomJoinRequest = onDocumentUpdated('rooms/{roomId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;

  const beforeRequests = Array.isArray(before.requests) ? before.requests : [];
  const afterRequests = Array.isArray(after.requests) ? after.requests : [];
  if (afterRequests.length <= beforeRequests.length) return;

  const newRequesterUid = afterRequests.find((uid) => !beforeRequests.includes(uid));
  if (!newRequesterUid || !after.createdBy) return;

  const requesterName = await getUserDisplayName(newRequesterUid);
  const roomName = after.name || 'your meetup';

  await sendPush(
    after.createdBy,
    `New join request for ${roomName}`,
    `${requesterName} wants to join your meetup`,
    { type: 'room_request', roomId: event.params.roomId },
    { prefKey: 'roomActivity' }
  );
});

exports.onJoinRequestApproved = onDocumentCreated(
  'rooms/{roomId}/participants/{participantId}',
  async (event) => {
    const participantId = event.params.participantId;
    const roomId = event.params.roomId;

    const roomSnap = await db.collection('rooms').doc(roomId).get();
    if (!roomSnap.exists) return;

    const room = roomSnap.data();
    if (!participantId || participantId === room.createdBy) return;

    const hostName = await getUserDisplayName(room.createdBy);
    const roomName = room.name || 'the meetup';

    const title = "You're in! 🎉";
    const message = `${hostName} approved your request to join ${roomName}`;

    await createRoomNotification({
      notificationId: `room_approved_${roomId}_${participantId}`,
      userId: participantId,
      type: 'room_approved',
      title,
      message,
      roomId,
      senderId: room.createdBy,
    });

    await sendPush(
      participantId,
      title,
      message,
      { type: 'room_approved', roomId },
      { prefKey: 'roomActivity' }
    );
  }
);

exports.onRoomFull = onDocumentUpdated('rooms/{roomId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;

  const max = after.maxParticipants || 0;
  if (!max) return;

  const beforeCount = Array.isArray(before.participants) ? before.participants.length : 0;
  const afterCount = Array.isArray(after.participants) ? after.participants.length : 0;

  if (beforeCount >= max || afterCount !== max) return;

  const roomName = after.name || 'Your meetup';
  await sendPush(
    after.createdBy,
    `${roomName} is full 🎊`,
    `All ${max} spots are taken`,
    { type: 'room_full', roomId: event.params.roomId },
    { prefKey: 'roomActivity' }
  );
});

exports.onFriendNotificationCreated = onDocumentCreated(
  'friendNotifications/{notificationId}',
  async (event) => {
    const notification = event.data?.data();
    if (!notification?.userId || !notification.type) return;

    // friend_request / friend_accepted / friend_nudge / friend_nudge_back already push from sendFriendNudge
    if (
      notification.type === 'friend_request' ||
      notification.type === 'friend_accepted' ||
      notification.type === 'friend_nudge' ||
      notification.type === 'friend_nudge_back'
    ) {
      return;
    }

    const push = buildActivityPush(notification);
    if (!push) return;

    const prefKey = SOCIAL_ACTIVITY_NOTIFICATION_TYPES.has(notification.type)
      ? 'socialActivity'
      : null;

    await sendPush(
      notification.userId,
      push.title,
      push.body,
      {
        type: notification.type,
        senderId: notification.senderId || null,
        postId: notification.postId || null,
        commentId: notification.commentId || null,
      },
      prefKey ? { prefKey } : undefined
    );
  }
);

exports.onRoomNotificationCreated = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const notification = event.data?.data();
  if (!notification?.userId || !notification.type) return;

  // join requests already push from rooms/{roomId} update trigger
  if (notification.type === 'request') return;

  const prefKey = 'roomActivity';
  const title = notification.title || 'birabuddy';
  const body = truncatePushBody(notification.message || '');

  await sendPush(
    notification.userId,
    title,
    body,
    {
      type: notification.type,
      roomId: notification.roomId || null,
      senderId: notification.senderId || null,
    },
    { prefKey }
  );
});

exports.onFriendChatMessageCreated = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message?.senderId || message.type === 'nudge') return;

    const conversationSnap = await event.data.ref.parent.parent.get();
    if (!conversationSnap.exists) return;

    const conversation = conversationSnap.data();
    const { user1Id, user2Id } = conversation;
    if (!user1Id || !user2Id) return;

    const recipientUid = message.senderId === user1Id ? user2Id : user1Id;
    if (!recipientUid || recipientUid === message.senderId) return;

    const senderName = message.senderName || (await getUserDisplayName(message.senderId));

    await sendPush(
      recipientUid,
      `${senderName} sent you a message`,
      truncatePushBody(message.text || ''),
      {
        type: 'chat_message',
        senderId: message.senderId,
        conversationId: event.params.conversationId,
      },
      { prefKey: 'messages' }
    );
  }
);

exports.scheduledExpiredRoomCleanup = onSchedule(
  { schedule: 'every 6 hours', timeZone: 'Europe/Istanbul' },
  async () => {
    const now = new Date();
    const roomsSnap = await db.collection('rooms').get();
    let deleted = 0;

    for (const roomDoc of roomsSnap.docs) {
      const room = roomDoc.data();
      if (!isRoomExpired(room, now)) continue;

      try {
        await deleteRoomTree(roomDoc.ref);
        deleted += 1;
        logger.info('Deleted expired room', { roomId: roomDoc.id, name: room.name });
      } catch (error) {
        logger.error('Failed to delete expired room', {
          roomId: roomDoc.id,
          error: error.message,
        });
      }
    }

    const orphansDeleted = await cleanupOrphanRoomTrees(db);

    logger.info('Expired room cleanup finished', {
      checked: roomsSnap.size,
      deleted,
      orphansDeleted,
    });
  }
);

exports.scheduledMeetupNotifications = onSchedule('every 15 minutes', async () => {
  const now = new Date();
  const activeRooms = await db.collection('rooms').where('isActive', '==', true).get();

  for (const roomDoc of activeRooms.docs) {
    const room = roomDoc.data();
    const roomId = roomDoc.id;
    const minutes = minutesSinceRoomStart(room, now);
    if (minutes === null) continue;

    const venue = getRoomVenue(room);
    const venueTag = venue;

    if (!room.midNightPromptSent && minutes >= 90 && minutes <= 105) {
      const participantsSnap = await db.collection('rooms').doc(roomId).collection('participants').get();
      await Promise.all(
        participantsSnap.docs.map((participantDoc) =>
          sendPush(
            participantDoc.id,
            "How's it going? 🍺",
            `Share what you're drinking at ${venue}`,
            { type: 'memory_prompt', roomId, venueTag },
            { prefKey: 'roomActivity' }
          )
        )
      );
      await roomDoc.ref.update({ midNightPromptSent: true });
      continue;
    }

    if (!room.postNightPromptSent && minutes >= 330 && minutes <= 345) {
      const start = getRoomStartTime(room);
      const barName = room.barName?.trim() || '';
      const participantsSnap = await db.collection('rooms').doc(roomId).collection('participants').get();

      for (const participantDoc of participantsSnap.docs) {
        const uid = participantDoc.id;
        const postsSnap = await db
          .collection('posts')
          .where('userId', '==', uid)
          .where('createdAt', '>', admin.firestore.Timestamp.fromDate(start))
          .get();

        const hasVenuePost = postsSnap.docs.some((postDoc) => {
          const venueTagValue = postDoc.data().venueTag || '';
          if (!venueTagValue) return false;
          if (barName && venueTagValue.includes(barName)) return true;
          if (room.neighborhood && venueTagValue.includes(room.neighborhood)) return true;
          return venueTagValue.includes(venue);
        });

        if (!hasVenuePost) {
          await sendPush(
            uid,
            'How was it? 🍺',
            `Share a memory from ${venue}`,
            { type: 'memory_prompt', roomId, venueTag },
            { prefKey: 'roomActivity' }
          );
        }
      }

      await roomDoc.ref.update({ postNightPromptSent: true });
    }
  }
});

exports.scheduledFriendSuggestions = onSchedule(
  { schedule: '0 12 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const roomsSnap = await db
      .collection('rooms')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(yesterdayStart))
      .where('date', '<=', admin.firestore.Timestamp.fromDate(yesterdayEnd))
      .get();

    for (const roomDoc of roomsSnap.docs) {
      const room = roomDoc.data();
      if (room.friendSuggestionSent) continue;

      const participantsSnap = await roomDoc.ref.collection('participants').get();
      const participantUids = participantsSnap.docs.map((d) => d.id);

      for (const uid of participantUids) {
        const relatedUids = await getPendingOrFriendUids(uid);
        const suggestions = participantUids.filter(
          (otherUid) => otherUid !== uid && !relatedUids.has(otherUid)
        );

        if (suggestions.length > 0) {
          await sendPush(
            uid,
            'You met some people yesterday 👋',
            'Add your fellow birabuddies before you forget!',
            { type: 'friend_suggestion' }
          );
        }
      }

      await roomDoc.ref.update({ friendSuggestionSent: true });
    }
  }
);

exports.scheduledFriendPostsDigest = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sinceTs = admin.firestore.Timestamp.fromDate(since);

    const usersSnap = await db.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;
      const lastLogin = userData.lastLogin?.toDate?.() || null;

      if (lastLogin && isSameCalendarDay(lastLogin, now)) continue;

      const friendIds = await getFriendIds(uid);
      if (friendIds.length === 0) continue;

      let postCount = 0;
      const chunks = chunkArray(friendIds, 30);

      for (const chunk of chunks) {
        const postsSnap = await db
          .collection('posts')
          .where('userId', 'in', chunk)
          .where('createdAt', '>=', sinceTs)
          .get();
        postCount += postsSnap.size;
      }

      if (postCount > 0) {
        const label = postCount === 1 ? 'friend' : 'friends';
        await sendPush(
          uid,
          `${postCount} ${label} shared memories today 🍺`,
          "See what they've been up to",
          { type: 'friend_posts_digest' }
        );
      }
    }
  }
);

exports.scheduledDeletedAccountPurge = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'Europe/Istanbul' },
  async () => {
    await purgeExpiredDeletedAccounts();
  }
);

/** Ban / suspend → disable the Firebase Auth account; unban → re-enable it. */
exports.onModerationStateChanged = onDocumentWritten(
  'users/{userId}/private/account',
  async (event) => {
    // Doc removed (account deletion deletes the Auth user itself) — leave Auth alone.
    if (!event.data?.after?.exists) return;
    await syncModerationAuthState(event.params.userId, event.data.after.data());
  }
);

exports.scheduledSuspensionRelease = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'Europe/Istanbul' },
  async () => {
    await releaseExpiredSuspensions();
  }
);

async function areFriends(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;
  const docId = [uidA, uidB].sort().join('___');
  const snap = await db.collection('friendships').doc(docId).get();
  return snap.exists && snap.data().status === 'accepted';
}

const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
const NUDGE_BACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function canSendNudge(senderUid, targetUid) {
  const privateRef = db.collection('users').doc(targetUid).collection('private').doc('account');
  const snap = await privateRef.get();
  if (!snap.exists) return true;

  const lastNudges = snap.data().nudgeFrom || {};
  const lastAt = lastNudges[senderUid];
  if (!lastAt?.toMillis) return true;
  return Date.now() - lastAt.toMillis() >= NUDGE_COOLDOWN_MS;
}

async function recordNudge(senderUid, targetUid) {
  const privateRef = db.collection('users').doc(targetUid).collection('private').doc('account');
  await privateRef.set(
    { [`nudgeFrom.${senderUid}`]: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function isRespondingToNudge(senderUid, targetUid) {
  const privateRef = db.collection('users').doc(senderUid).collection('private').doc('account');
  const snap = await privateRef.get();
  if (!snap.exists) return false;

  const lastAt = snap.data()?.nudgeFrom?.[targetUid];
  if (!lastAt?.toMillis) return false;
  return Date.now() - lastAt.toMillis() <= NUDGE_BACK_WINDOW_MS;
}

exports.onFriendWentLive = onDocumentUpdated('users/{userId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;

  const wasLive = before.outTonight === true;
  const isLive = after.outTonight === true;
  if (wasLive || !isLive) return;

  const uid = event.params.userId;
  const name = after.name || after.nickname || after.instagram || (await getUserDisplayName(uid));
  const note = after.outTonightNote?.trim()
    ? truncatePushBody(after.outTonightNote)
    : 'See what they are up to';

  const friendIds = await getFriendIds(uid);
  await Promise.all(
    friendIds.map((friendUid) =>
      sendPush(
        friendUid,
        `${name} is live 🟢`,
        note,
        { type: 'friend_live', senderId: uid },
        { prefKey: 'messages' }
      )
    )
  );
});

exports.sendFriendNudge = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to nudge a friend.');
  }

  const senderUid = request.auth.uid;
  const targetUid = request.data?.targetUid;

  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'A valid target user is required.');
  }
  if (targetUid === senderUid) {
    throw new HttpsError('invalid-argument', 'You cannot nudge yourself.');
  }

  const friends = await areFriends(senderUid, targetUid);
  if (!friends) {
    throw new HttpsError('permission-denied', 'You can only nudge friends.');
  }

  const allowed = await canSendNudge(senderUid, targetUid);
  if (!allowed) {
    throw new HttpsError('resource-exhausted', 'You can nudge this friend again in a few minutes.');
  }

  const senderName = await getUserDisplayName(senderUid);
  const isNudgeBack =
    request.data?.isNudgeBack === true || (await isRespondingToNudge(senderUid, targetUid));
  const notificationType = isNudgeBack ? 'friend_nudge_back' : 'friend_nudge';

  const [user1Id, user2Id] = [senderUid, targetUid].sort();
  const conversationId = `${user1Id}___${user2Id}`;
  await db.collection('conversations').doc(conversationId).set(
    {
      user1Id,
      user2Id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const messageRef = await db.collection('conversations').doc(conversationId).collection('messages').add({
    type: 'nudge',
    senderId: senderUid,
    senderName,
    isNudgeBack,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    likes: [],
  });

  await db.collection('friendNotifications').add({
    userId: targetUid,
    type: notificationType,
    senderId: senderUid,
    senderName,
    conversationId,
    chatMessageId: messageRef.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  });

  await sendPush(
    targetUid,
    isNudgeBack ? `${senderName} nudged you back 👈` : `${senderName} nudged you 👉`,
    isNudgeBack ? '👉' : '👈',
    { type: notificationType, senderId: senderUid },
    { prefKey: 'messages' }
  );
  await recordNudge(senderUid, targetUid);

  return { success: true };
});

exports.deleteMyAccount = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to delete your account.');
  }

  try {
    const summary = await softDeleteUserAccount(request.auth.uid);
    return { success: true, summary };
  } catch (error) {
    logger.error('deleteMyAccount failed', {
      uid: request.auth.uid,
      error: error.message,
    });
    throw new HttpsError('internal', error.message || 'Failed to delete account.');
  }
});
