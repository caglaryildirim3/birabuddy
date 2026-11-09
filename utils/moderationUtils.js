import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { REPORT_STATUS } from './reportUtils';
import { getPrivateUserData, getUserPrivateRef } from './userDocUtils';

export const PUNISHMENT = {
  BAN: 'ban',
  SUSPEND_7: 'suspend_7',
  SUSPEND_30: 'suspend_30',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

/** Returns 'banned' | 'suspended' | null */
export function getModerationBlockReason(userData) {
  const info = getModerationBlockInfo(userData);
  return info?.reason ?? null;
}

/** Returns { reason, punishment?, until? } when the account cannot use the app */
export function getModerationBlockInfo(userData) {
  if (!userData) return null;
  if (userData.banned === true) {
    return { reason: 'banned', punishment: PUNISHMENT.BAN };
  }

  const untilMs = toMillis(userData.suspendedUntil);
  if (untilMs > Date.now()) {
    const history = Array.isArray(userData.punishmentHistory) ? userData.punishmentHistory : [];
    const latest = history.length > 0 ? history[history.length - 1] : null;
    return {
      reason: 'suspended',
      until: new Date(untilMs),
      punishment: latest?.punishment || null,
    };
  }

  return null;
}

export function formatModerationBlockAlert(blockInfo, t) {
  if (!blockInfo) {
    return { title: t('loginFailed'), message: t('loginFailed') };
  }

  if (blockInfo.reason === 'banned') {
    return {
      title: t('accountBannedTitle'),
      message: t('accountBannedMessage'),
    };
  }

  const untilStr =
    blockInfo.until?.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) || '';

  if (blockInfo.punishment === PUNISHMENT.SUSPEND_7) {
    return {
      title: t('accountSuspendedTitle'),
      message: t('accountSuspended7Message', { date: untilStr }),
    };
  }

  if (blockInfo.punishment === PUNISHMENT.SUSPEND_30) {
    return {
      title: t('accountSuspendedTitle'),
      message: t('accountSuspended30Message', { date: untilStr }),
    };
  }

  return {
    title: t('accountSuspendedTitle'),
    message: t('accountSuspendedMessage', { date: untilStr }),
  };
}

export function normalizeModerationEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function getEmailModerationBlockInfo(blockData) {
  if (!blockData) return null;
  if (blockData.punishment === PUNISHMENT.BAN) {
    return { reason: 'banned', punishment: PUNISHMENT.BAN };
  }

  const untilMs = toMillis(blockData.suspendedUntil);
  if (untilMs > Date.now()) {
    return {
      reason: 'suspended',
      until: new Date(untilMs),
      punishment: blockData.punishment || null,
    };
  }

  return null;
}

export async function fetchEmailModerationBlock(email) {
  const normalized = normalizeModerationEmail(email);
  if (!normalized) return null;

  const snap = await getDoc(doc(db, 'emailBlocks', normalized));
  if (!snap.exists()) return null;

  return getEmailModerationBlockInfo(snap.data());
}

export async function setEmailModerationBlock({
  email,
  punishment,
  reportId,
  originalUid,
}) {
  const normalized = normalizeModerationEmail(email);
  if (!normalized || !punishment) return;

  const payload = {
    punishment,
    appliedAt: Timestamp.now(),
    reportId: reportId || null,
    originalUid: originalUid || null,
    suspendedUntil: null,
  };

  if (punishment === PUNISHMENT.SUSPEND_7) {
    payload.suspendedUntil = Timestamp.fromDate(getSuspensionEndDate(7));
  } else if (punishment === PUNISHMENT.SUSPEND_30) {
    payload.suspendedUntil = Timestamp.fromDate(getSuspensionEndDate(30));
  }

  await setDoc(doc(db, 'emailBlocks', normalized), payload, { merge: true });
}

export function getSuspensionEndDate(days) {
  return new Date(Date.now() + days * DAY_MS);
}

export function formatModerationDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Summarize prior punishments for admin report cards */
export function summarizePunishmentHistory(history = []) {
  const counts = { ban: 0, suspend_7: 0, suspend_30: 0 };
  history.forEach((entry) => {
    if (entry?.punishment in counts) counts[entry.punishment] += 1;
  });
  return counts;
}

export function hasPriorPunishments(history = []) {
  const counts = summarizePunishmentHistory(history);
  return counts.ban + counts.suspend_7 + counts.suspend_30 > 0;
}

export function getReportedUserModerationInfo(userData) {
  if (!userData) {
    return {
      banned: false,
      suspendedUntil: null,
      punishmentHistory: [],
      activeBlock: null,
    };
  }

  const punishmentHistory = Array.isArray(userData.punishmentHistory)
    ? userData.punishmentHistory
    : [];
  const activeBlock = getModerationBlockInfo(userData);

  return {
    banned: userData.banned === true,
    suspendedUntil: userData.suspendedUntil || null,
    punishmentHistory,
    activeBlock,
  };
}

async function notifyReporter({ reporterUserId, adminUid, punishment, reportedUserEmail }) {
  if (!reporterUserId || reporterUserId === adminUid) return;

  await addDoc(collection(db, 'friendNotifications'), {
    userId: reporterUserId,
    type: 'report_punishment',
    senderId: adminUid,
    senderName: 'BiraBuddy',
    punishment,
    reportedUserEmail: reportedUserEmail || null,
    createdAt: serverTimestamp(),
    read: false,
  });
}

export async function applyReportPunishment({
  reportId,
  reportedUserId,
  reporterUserId,
  reportedUserEmail,
  punishment,
  adminUid,
}) {
  if (!reportId || !reportedUserId || !adminUid || !punishment) {
    throw new Error('Invalid punishment');
  }

  const userRef = getUserPrivateRef(reportedUserId);
  const reportRef = doc(db, 'reports', reportId);
  const historyEntry = {
    punishment,
    appliedAt: Timestamp.now(),
    reportId,
  };

  if (punishment === PUNISHMENT.BAN) {
    await updateDoc(userRef, {
      banned: true,
      suspendedUntil: null,
      punishmentHistory: arrayUnion(historyEntry),
    });
  } else if (punishment === PUNISHMENT.SUSPEND_7) {
    await updateDoc(userRef, {
      banned: false,
      suspendedUntil: Timestamp.fromDate(getSuspensionEndDate(7)),
      punishmentHistory: arrayUnion(historyEntry),
    });
  } else if (punishment === PUNISHMENT.SUSPEND_30) {
    await updateDoc(userRef, {
      banned: false,
      suspendedUntil: Timestamp.fromDate(getSuspensionEndDate(30)),
      punishmentHistory: arrayUnion(historyEntry),
    });
  } else {
    throw new Error('Unknown punishment');
  }

  await updateDoc(reportRef, {
    status: REPORT_STATUS.RESOLVED,
    punishment,
    resolvedAt: serverTimestamp(),
  });

  let resolvedEmail = reportedUserEmail;
  if (!resolvedEmail) {
    const privateData = await getPrivateUserData(reportedUserId);
    resolvedEmail = privateData?.email || null;
  }

  if (resolvedEmail) {
    await setEmailModerationBlock({
      email: resolvedEmail,
      punishment,
      reportId,
      originalUid: reportedUserId,
    });
  }

  await notifyReporter({
    reporterUserId,
    adminUid,
    punishment,
    reportedUserEmail: resolvedEmail || reportedUserEmail,
  });
}
