const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

const BATCH_SIZE = 400;
const DELETED_USER_RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const DELETED_USER_NAME = 'Deleted User';

const ANONYMIZED_USER_SNAPSHOT = {
  name: DELETED_USER_NAME,
  university: '',
  photoURL: null,
};

function getDb() {
  return admin.firestore();
}

function snapshotExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'boolean' ? snap.exists : snap.exists();
}

function getBucket() {
  return admin.storage().bucket();
}

function cleanInstagramHandle(handle) {
  return (handle || '').replace(/[@\s]/g, '').toLowerCase();
}

async function commitDeletes(refs) {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = getDb().batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteByQuery(query) {
  let deleted = 0;
  let snap = await query.limit(BATCH_SIZE).get();

  while (!snap.empty) {
    await commitDeletes(snap.docs.map((docSnap) => docSnap.ref));
    deleted += snap.size;
    if (snap.size < BATCH_SIZE) break;
    snap = await query.limit(BATCH_SIZE).get();
  }

  return deleted;
}

async function deleteLoginHandles(uid, userData) {
  const handles = new Set();

  if (userData?.instagram) {
    handles.add(cleanInstagramHandle(userData.instagram));
  }

  const snap = await getDb().collection('loginHandles').where('uid', '==', uid).get();
  snap.docs.forEach((docSnap) => handles.add(docSnap.id));

  await Promise.all(
    [...handles].map((handle) =>
      getDb().collection('loginHandles').doc(handle).delete().catch(() => {})
    )
  );

  return handles.size;
}

async function deleteUserStorage(uid) {
  try {
    const bucket = getBucket();
    const [userFiles] = await bucket.getFiles({ prefix: `users/${uid}/` });
    const [postFiles] = await bucket.getFiles({ prefix: `posts/${uid}/` });
    const files = [...userFiles, ...postFiles];

    await Promise.all(files.map((file) => file.delete().catch(() => {})));
    return files.length;
  } catch (error) {
    logger.warn('Failed to delete user storage', { uid, error: error.message });
    return 0;
  }
}

async function hideUserPosts(uid, deletedAt) {
  const postsSnap = await getDb().collection('posts').where('userId', '==', uid).get();

  for (const postDoc of postsSnap.docs) {
    await postDoc.ref.update({
      isDeleted: true,
      deletedAt,
      text: '',
      userSnapshot: ANONYMIZED_USER_SNAPSHOT,
    });
  }

  return postsSnap.size;
}

async function hideUserComments(uid, deletedAt) {
  try {
    const snap = await getDb().collectionGroup('comments').where('userId', '==', uid).get();

    for (const commentDoc of snap.docs) {
      await commentDoc.ref.update({
        isDeleted: true,
        deletedAt,
        text: '',
        userSnapshot: ANONYMIZED_USER_SNAPSHOT,
      });
    }

    return snap.size;
  } catch (error) {
    logger.warn('Failed to hide comments', { uid, error: error.message });
    return 0;
  }
}

async function hideCreatedRooms(uid) {
  const snap = await getDb().collection('rooms').where('createdBy', '==', uid).get();

  for (const roomDoc of snap.docs) {
    await roomDoc.ref.update({
      creatorAccountDeleted: true,
      isActive: false,
    });
  }

  return snap.size;
}

async function softDeleteUserAccount(uid) {
  const userRef = getDb().collection('users').doc(uid);
  const privateRef = userRef.collection('private').doc('account');
  const [userSnap, privateSnap] = await Promise.all([userRef.get(), privateRef.get()]);

  if (!snapshotExists(userSnap) && !snapshotExists(privateSnap)) {
    throw new Error('User profile not found');
  }

  const publicData = snapshotExists(userSnap) ? userSnap.data() : {};
  const privateData = snapshotExists(privateSnap) ? privateSnap.data() : {};
  const userData = { ...publicData, ...privateData };

  if (privateData.isDeleted === true || publicData.isDeleted === true) {
    await admin.auth().deleteUser(uid).catch(() => {});
    return { alreadyDeleted: true };
  }

  const deletedAt = admin.firestore.FieldValue.serverTimestamp();

  const summary = {
    loginHandles: await deleteLoginHandles(uid, userData),
    friendships: await deleteByQuery(getDb().collection('friendships').where('user1Id', '==', uid))
      + await deleteByQuery(getDb().collection('friendships').where('user2Id', '==', uid)),
    friendNotifications:
      (await deleteByQuery(getDb().collection('friendNotifications').where('userId', '==', uid))) +
      (await deleteByQuery(getDb().collection('friendNotifications').where('senderId', '==', uid))),
    notifications:
      (await deleteByQuery(getDb().collection('notifications').where('userId', '==', uid))) +
      (await deleteByQuery(getDb().collection('notifications').where('senderId', '==', uid))),
    postsHidden: await hideUserPosts(uid, deletedAt),
    commentsHidden: await hideUserComments(uid, deletedAt),
    roomsHidden: await hideCreatedRooms(uid),
    storageFiles: await deleteUserStorage(uid),
  };

  await getDb().collection('livePresence').doc(uid).delete().catch(() => {});

  await privateRef.set(
    {
      isDeleted: true,
      deletedAt,
      expoPushToken: admin.firestore.FieldValue.delete(),
      onboardingComplete: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  await userRef.update({
    name: DELETED_USER_NAME,
    nickname: admin.firestore.FieldValue.delete(),
    instagram: admin.firestore.FieldValue.delete(),
    photos: [],
    bio: admin.firestore.FieldValue.delete(),
    major: admin.firestore.FieldValue.delete(),
    favDrink: admin.firestore.FieldValue.delete(),
    goToBar: admin.firestore.FieldValue.delete(),
    vibes: admin.firestore.FieldValue.delete(),
    outTonight: false,
    outTonightNote: admin.firestore.FieldValue.delete(),
    outTonightUpdatedAt: admin.firestore.FieldValue.delete(),
    age: admin.firestore.FieldValue.delete(),
    city: admin.firestore.FieldValue.delete(),
    isDeleted: admin.firestore.FieldValue.delete(),
    deletedAt: admin.firestore.FieldValue.delete(),
    email: admin.firestore.FieldValue.delete(),
    blockedIds: admin.firestore.FieldValue.delete(),
    punishmentHistory: admin.firestore.FieldValue.delete(),
    kvkkConsent: admin.firestore.FieldValue.delete(),
    kvkkConsentDate: admin.firestore.FieldValue.delete(),
    kvkkConsentVersion: admin.firestore.FieldValue.delete(),
    ageConfirmed: admin.firestore.FieldValue.delete(),
    ageConfirmationDate: admin.firestore.FieldValue.delete(),
    termsAccepted: admin.firestore.FieldValue.delete(),
    termsAcceptanceDate: admin.firestore.FieldValue.delete(),
    termsVersion: admin.firestore.FieldValue.delete(),
    banned: admin.firestore.FieldValue.delete(),
    suspendedUntil: admin.firestore.FieldValue.delete(),
    createdAt: admin.firestore.FieldValue.delete(),
    lastLogin: admin.firestore.FieldValue.delete(),
    emailVerified: admin.firestore.FieldValue.delete(),
    notificationPrefs: admin.firestore.FieldValue.delete(),
  });

  await admin.auth().deleteUser(uid);

  logger.info('Account soft-deleted', { uid, summary });
  return summary;
}

async function purgeUserPosts(uid) {
  const postsSnap = await getDb().collection('posts').where('userId', '==', uid).get();

  for (const postDoc of postsSnap.docs) {
    await getDb().recursiveDelete(postDoc.ref);
  }

  return postsSnap.size;
}

async function purgeUserComments(uid) {
  try {
    const snap = await getDb().collectionGroup('comments').where('userId', '==', uid).get();
    const byPost = new Map();

    snap.docs.forEach((commentDoc) => {
      const postId = commentDoc.ref.parent.parent.id;
      if (!byPost.has(postId)) byPost.set(postId, { refs: [], topLevelRemoved: 0 });
      const entry = byPost.get(postId);
      entry.refs.push(commentDoc.ref);
      if (!commentDoc.data().parentId) entry.topLevelRemoved += 1;
    });

    for (const [postId, { refs, topLevelRemoved }] of byPost.entries()) {
      await commitDeletes(refs);
      const postRef = getDb().collection('posts').doc(postId);
      const postSnap = await postRef.get();
      if (!snapshotExists(postSnap)) continue;
      const currentCount = postSnap.data().commentsCount || 0;
      await postRef.update({
        commentsCount: Math.max(0, currentCount - topLevelRemoved),
      });
    }

    return snap.size;
  } catch (error) {
    logger.warn('Failed to purge comments', { uid, error: error.message });
    return 0;
  }
}

async function purgeConversations(uid) {
  const [snap1, snap2] = await Promise.all([
    getDb().collection('conversations').where('user1Id', '==', uid).get(),
    getDb().collection('conversations').where('user2Id', '==', uid).get(),
  ]);

  const unique = new Map();
  [...snap1.docs, ...snap2.docs].forEach((docSnap) => unique.set(docSnap.id, docSnap.ref));

  for (const ref of unique.values()) {
    await getDb().recursiveDelete(ref);
  }

  return unique.size;
}

async function purgeRoomMessages(uid) {
  const joinedSnap = await getDb().collection('rooms').where('participants', 'array-contains', uid).get();
  let deleted = 0;

  for (const roomDoc of joinedSnap.docs) {
    const messagesSnap = await roomDoc.ref.collection('messages').where('uid', '==', uid).get();
    if (!messagesSnap.empty) {
      await commitDeletes(messagesSnap.docs.map((docSnap) => docSnap.ref));
      deleted += messagesSnap.size;
    }
  }

  return deleted;
}

async function purgeReporterReports(uid) {
  return deleteByQuery(getDb().collection('reports').where('reporterUserId', '==', uid));
}

async function purgeCreatedRooms(uid) {
  const snap = await getDb().collection('rooms').where('createdBy', '==', uid).get();

  for (const roomDoc of snap.docs) {
    await getDb().recursiveDelete(roomDoc.ref);
  }

  return snap.size;
}

async function purgeJoinedRoomParticipation(uid) {
  const snap = await getDb().collection('rooms').where('participants', 'array-contains', uid).get();
  let updated = 0;

  for (const roomDoc of snap.docs) {
    await roomDoc.ref.update({
      participants: admin.firestore.FieldValue.arrayRemove(uid),
      requests: admin.firestore.FieldValue.arrayRemove(uid),
      invites: admin.firestore.FieldValue.arrayRemove(uid),
    });
    await roomDoc.ref.collection('participants').doc(uid).delete().catch(() => {});
    updated += 1;
  }

  return updated;
}

async function hardPurgeUser(uid) {
  const summary = {
    posts: await purgeUserPosts(uid),
    comments: await purgeUserComments(uid),
    conversations: await purgeConversations(uid),
    roomMessages: await purgeRoomMessages(uid),
    createdRooms: await purgeCreatedRooms(uid),
    joinedRooms: await purgeJoinedRoomParticipation(uid),
    reporterReports: await purgeReporterReports(uid),
    storageFiles: await deleteUserStorage(uid),
  };

  await getDb().recursiveDelete(getDb().collection('users').doc(uid));
  logger.info('Purged soft-deleted account after retention', { uid, summary });
  return summary;
}

async function purgeExpiredDeletedAccounts() {
  const cutoffDate = new Date(Date.now() - DELETED_USER_RETENTION_MS);
  const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);
  const [privateSnap, legacyPublicSnap] = await Promise.all([
    getDb().collectionGroup('account').where('isDeleted', '==', true).get(),
    getDb().collection('users').where('isDeleted', '==', true).get(),
  ]);

  const uidsToCheck = new Map();

  privateSnap.docs.forEach((privateDoc) => {
    const uid = privateDoc.ref.parent.parent.id;
    uidsToCheck.set(uid, privateDoc.data().deletedAt || null);
  });

  legacyPublicSnap.docs.forEach((userDoc) => {
    if (!uidsToCheck.has(userDoc.id)) {
      uidsToCheck.set(userDoc.id, userDoc.data().deletedAt || null);
    }
  });

  let purged = 0;

  for (const [uid, deletedAt] of uidsToCheck.entries()) {
    if (!deletedAt || deletedAt.toMillis() > cutoff.toMillis()) continue;

    try {
      await hardPurgeUser(uid);
      purged += 1;
    } catch (error) {
      logger.error('Failed to purge expired deleted account', {
        uid,
        error: error.message,
      });
    }
  }

  logger.info('Expired deleted-account purge finished', {
    checked: uidsToCheck.size,
    purged,
    retentionMs: DELETED_USER_RETENTION_MS,
  });

  return { checked: uidsToCheck.size, purged };
}

module.exports = {
  DELETED_USER_RETENTION_MS,
  DELETED_USER_NAME,
  softDeleteUserAccount,
  purgeExpiredDeletedAccounts,
};
