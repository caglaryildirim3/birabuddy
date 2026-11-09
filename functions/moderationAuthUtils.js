const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

/**
 * Admin-only bookkeeping of Auth accounts we disabled for moderation
 * (no client rule matches this collection, so clients cannot read or write it).
 * Only accounts listed here are ever re-enabled, so accounts disabled by hand
 * in the Firebase console stay disabled.
 */
const MODERATION_AUTH_COLLECTION = 'moderationAuthState';

function getDb() {
  return admin.firestore();
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Mirrors getModerationBlockInfo in utils/moderationUtils.js. */
function getModerationBlock(accountData, now = Date.now()) {
  if (!accountData) return null;
  if (accountData.banned === true) return { reason: 'banned', untilMs: null };
  const untilMs = toMillis(accountData.suspendedUntil);
  if (untilMs > now) return { reason: 'suspended', untilMs };
  return null;
}

function isUserNotFound(error) {
  return error?.code === 'auth/user-not-found';
}

async function disableAuthForModeration(uid, block) {
  try {
    await admin.auth().updateUser(uid, { disabled: true });
    // Forces sign-out once the current ID token expires (max 1 hour); rules block writes meanwhile.
    await admin.auth().revokeRefreshTokens(uid);
  } catch (error) {
    if (isUserNotFound(error)) return;
    throw error;
  }

  await getDb()
    .collection(MODERATION_AUTH_COLLECTION)
    .doc(uid)
    .set({
      disabled: true,
      reason: block.reason,
      suspendedUntil: block.untilMs ? Timestamp.fromMillis(block.untilMs) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  logger.info('Auth disabled for moderation', { uid, reason: block.reason });
}

async function enableAuthAfterModeration(uid) {
  try {
    await admin.auth().updateUser(uid, { disabled: false });
  } catch (error) {
    if (!isUserNotFound(error)) throw error;
  }
  await getDb().collection(MODERATION_AUTH_COLLECTION).doc(uid).delete();
  logger.info('Auth re-enabled after moderation', { uid });
}

/** Bring the Auth account in line with users/{uid}/private/account. */
async function syncModerationAuthState(uid, accountData) {
  const block = getModerationBlock(accountData);
  const stateRef = getDb().collection(MODERATION_AUTH_COLLECTION).doc(uid);
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : null;

  if (block) {
    const untilMs = toMillis(state?.suspendedUntil) || null;
    if (state?.disabled && state.reason === block.reason && untilMs === block.untilMs) return;
    await disableAuthForModeration(uid, block);
    return;
  }

  if (state?.disabled) {
    await enableAuthAfterModeration(uid);
  }
}

/** Re-enable accounts whose suspension has ended (nothing writes the doc when time runs out). */
async function releaseExpiredSuspensions() {
  const now = Timestamp.now();
  // Bans store suspendedUntil: null, which a timestamp range filter never matches.
  const expiredSnap = await getDb()
    .collection(MODERATION_AUTH_COLLECTION)
    .where('suspendedUntil', '<=', now)
    .get();

  let synced = 0;
  for (const stateDoc of expiredSnap.docs) {
    const uid = stateDoc.id;
    try {
      const accountSnap = await getDb()
        .collection('users')
        .doc(uid)
        .collection('private')
        .doc('account')
        .get();
      // Re-check the source of truth: the suspension may have been extended or turned into a ban.
      await syncModerationAuthState(uid, accountSnap.exists ? accountSnap.data() : null);
      synced += 1;
    } catch (error) {
      logger.error('Failed to release suspension', { uid, error: error.message });
    }
  }

  logger.info('Expired suspension check finished', { checked: expiredSnap.size, synced });
}

module.exports = {
  syncModerationAuthState,
  releaseExpiredSuspensions,
};
