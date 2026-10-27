import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import { PUNISHMENT } from '../utils/moderationUtils';

function punishmentMessage(t, punishment, reportedUserEmail) {
  const who = reportedUserEmail || t('reportPunishmentSomeone');
  switch (punishment) {
    case PUNISHMENT.BAN:
      return t('reportPunishmentBan', { email: who });
    case PUNISHMENT.SUSPEND_7:
      return t('reportPunishmentSuspend7', { email: who });
    case PUNISHMENT.SUSPEND_30:
      return t('reportPunishmentSuspend30', { email: who });
    default:
      return t('reportPunishmentGeneric', { email: who });
  }
}

/** Shows in-app alerts when a report the user filed led to moderation action. */
export function useReporterPunishmentAlerts(enabled) {
  const { t } = useTranslation();
  const shownIds = useRef(new Set());

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!enabled || !uid) return undefined;

    const q = query(collection(db, 'friendNotifications'), where('userId', '==', uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        if (data.type !== 'report_punishment') return;
        if (data.read === true) return;
        if (shownIds.current.has(change.doc.id)) return;

        shownIds.current.add(change.doc.id);
        const message = punishmentMessage(t, data.punishment, data.reportedUserEmail);

        Alert.alert(t('reportPunishmentTitle'), message, [
          {
            text: t('ok'),
            onPress: () => {
              updateDoc(doc(db, 'friendNotifications', change.doc.id), { read: true }).catch(
                () => {}
              );
            },
          },
        ]);
      });
      },
      handleFirestoreListenerError('reporter-punishment')
    );

    return unsub;
  }, [enabled, t]);
}
