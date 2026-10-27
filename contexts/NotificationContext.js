import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase/firebaseConfig';
import {
  buildActivityBanner,
  buildChatBanner,
  buildRoomBanner,
} from '../utils/inAppNotificationUtils';
import { isConversationUnread, subscribeToConversations } from '../utils/chatUtils';
import { buildRoomNotificationMaps } from '../utils/roomNotificationUtils';
import {
  DEFAULT_NOTIFICATION_PREFS,
} from '../utils/settingsUtils';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import { getFriendIds } from '../utils/friendUtils';
import {
  isActivityAllowedByPrefs,
  isChatAllowedByPrefs,
  isRoomNotificationAllowedByPrefs,
} from '../utils/notificationPrefFilters';
import { getUserPrivateRef } from '../utils/userDocUtils';
import { syncAppBadgeCount } from '../utils/notificationUtils';

function getConversationPartnerId(conversation, currentUid) {
  return conversation.user1Id === currentUid ? conversation.user2Id : conversation.user1Id;
}

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { t } = useTranslation();
  const [currentUid, setCurrentUid] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [pendingRoomRequests, setPendingRoomRequests] = useState({});
  const [unreadFriendNotifications, setUnreadFriendNotifications] = useState(0);
  const [unreadActivityNotifications, setUnreadActivityNotifications] = useState(0);
  const [unreadRoomNotifications, setUnreadRoomNotifications] = useState(0);
  const [hostRoomAlerts, setHostRoomAlerts] = useState({});
  const [activeRoomAlerts, setActiveRoomAlerts] = useState({});
  const [unreadChats, setUnreadChats] = useState(0);
  const [activeBanner, setActiveBanner] = useState(null);
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [friendIdSet, setFriendIdSet] = useState(() => new Set());
  const [requestsTabSeen, setRequestsTabSeen] = useState(true);

  const initializedRef = useRef(false);
  const prevPendingRequestsRef = useRef(0);
  const initFlagsRef = useRef({ activity: false, room: false, chat: false });
  const seenActivityIdsRef = useRef(new Set());
  const seenRoomIdsRef = useRef(new Set());
  const seenChatStateRef = useRef(new Map());
  const listenerUnsubsRef = useRef(new Set());

  const trackListener = useCallback((unsub) => {
    listenerUnsubsRef.current.add(unsub);
    return () => {
      listenerUnsubsRef.current.delete(unsub);
      unsub();
    };
  }, []);

  const stopAllListeners = useCallback(() => {
    listenerUnsubsRef.current.forEach((unsub) => unsub());
    listenerUnsubsRef.current.clear();
  }, []);

  const markSourceReady = useCallback((source) => {
    initFlagsRef.current[source] = true;
    if (
      initFlagsRef.current.activity &&
      initFlagsRef.current.room &&
      initFlagsRef.current.chat
    ) {
      initializedRef.current = true;
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setActiveBanner(null);
  }, []);

  const pushBanner = useCallback((banner) => {
    if (!banner) return;
    setActiveBanner(banner);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
      setEmailVerified(user?.emailVerified === true);
      if (!user) {
        stopAllListeners();
        initializedRef.current = false;
        initFlagsRef.current = { activity: false, room: false, chat: false };
        seenActivityIdsRef.current = new Set();
        seenRoomIdsRef.current = new Set();
        seenChatStateRef.current = new Map();
        setActiveBanner(null);
        setPendingFriendRequests(0);
        setPendingRoomRequests({});
        setUnreadFriendNotifications(0);
        setUnreadActivityNotifications(0);
        setUnreadRoomNotifications(0);
        setHostRoomAlerts({});
        setActiveRoomAlerts({});
        setUnreadChats(0);
        setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
        setFriendIdSet(new Set());
        setRequestsTabSeen(true);
        prevPendingRequestsRef.current = 0;
      }
    });
    return unsub;
  }, [stopAllListeners]);

  const canAccessFirestore = currentUid && emailVerified;

  useEffect(() => {
    if (!canAccessFirestore) {
      setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
      return undefined;
    }

    const unsub = onSnapshot(
      getUserPrivateRef(currentUid),
      (snapshot) => {
        const data = snapshot.data() || {};
        setNotificationPrefs({
          ...DEFAULT_NOTIFICATION_PREFS,
          ...(data.notificationPrefs || {}),
        });
      },
      handleFirestoreListenerError('notification-prefs')
    );

    return trackListener(unsub);
  }, [canAccessFirestore, currentUid, trackListener]);

  const shouldShowActivityAlert = useCallback(
    (notification) => {
      if (notification.type === 'report_punishment') return false;
      if (notification.type === 'friend_request' || notification.type === 'friend_accepted') {
        return false;
      }
      return isActivityAllowedByPrefs(notification, notificationPrefs);
    },
    [notificationPrefs]
  );

  const shouldShowRoomAlert = useCallback(
    () => isRoomNotificationAllowedByPrefs(notificationPrefs),
    [notificationPrefs]
  );

  const shouldShowChatAlert = useCallback(
    () => isChatAllowedByPrefs(notificationPrefs),
    [notificationPrefs]
  );

  const markRequestsTabSeen = useCallback(() => {
    setRequestsTabSeen(true);
  }, []);

  useEffect(() => {
    if (pendingFriendRequests > prevPendingRequestsRef.current) {
      setRequestsTabSeen(false);
    }
    prevPendingRequestsRef.current = pendingFriendRequests;
  }, [pendingFriendRequests]);

  useEffect(() => {
    if (!canAccessFirestore) {
      setFriendIdSet(new Set());
      return undefined;
    }

    let cancelled = false;
    const refreshFriends = () => {
      getFriendIds(currentUid)
        .then((ids) => {
          if (!cancelled) setFriendIdSet(new Set(ids));
        })
        .catch(() => {
          if (!cancelled) setFriendIdSet(new Set());
        });
    };

    refreshFriends();

    const unsub1 = onSnapshot(
      query(
        collection(db, 'friendships'),
        where('user1Id', '==', currentUid),
        where('status', '==', 'accepted')
      ),
      refreshFriends,
      handleFirestoreListenerError('notification-friends-user1')
    );

    const unsub2 = onSnapshot(
      query(
        collection(db, 'friendships'),
        where('user2Id', '==', currentUid),
        where('status', '==', 'accepted')
      ),
      refreshFriends,
      handleFirestoreListenerError('notification-friends-user2')
    );

    return trackListener(() => {
      cancelled = true;
      unsub1();
      unsub2();
    });
  }, [canAccessFirestore, currentUid, trackListener]);

  useEffect(() => {
    if (!canAccessFirestore) {
      setPendingFriendRequests(0);
      return undefined;
    }

    let incoming1 = 0;
    let incoming2 = 0;

    const updateCount = () => setPendingFriendRequests(incoming1 + incoming2);

    const unsub1 = onSnapshot(
      query(
        collection(db, 'friendships'),
        where('user1Id', '==', currentUid),
        where('status', '==', 'pending')
      ),
      (snapshot) => {
        incoming1 = snapshot.docs.filter((d) => d.data().requestedBy !== currentUid).length;
        updateCount();
      },
      handleFirestoreListenerError('friendships-user1')
    );

    const unsub2 = onSnapshot(
      query(
        collection(db, 'friendships'),
        where('user2Id', '==', currentUid),
        where('status', '==', 'pending')
      ),
      (snapshot) => {
        incoming2 = snapshot.docs.filter((d) => d.data().requestedBy !== currentUid).length;
        updateCount();
      },
      handleFirestoreListenerError('friendships-user2')
    );

    return trackListener(() => {
      unsub1();
      unsub2();
    });
  }, [canAccessFirestore, currentUid, trackListener]);

  useEffect(() => {
    if (!canAccessFirestore) {
      setPendingRoomRequests({});
      return undefined;
    }

    const unsub = onSnapshot(
      query(collection(db, 'rooms'), where('createdBy', '==', currentUid)),
      (snapshot) => {
        const next = {};
        snapshot.docs.forEach((roomDoc) => {
          const requests = roomDoc.data().requests;
          const count = Array.isArray(requests) ? requests.length : 0;
          if (count > 0) {
            next[roomDoc.id] = count;
          }
        });
        setPendingRoomRequests(next);
      },
      (error) => {
        handleFirestoreListenerError('my-room-requests')(error);
        setPendingRoomRequests({});
      }
    );

    return trackListener(unsub);
  }, [canAccessFirestore, currentUid, trackListener]);

  useEffect(() => {
    if (!canAccessFirestore) {
      setUnreadFriendNotifications(0);
      setUnreadActivityNotifications(0);
      return undefined;
    }

    let activitySnapshotReady = false;

    const unsub = onSnapshot(
      query(collection(db, 'friendNotifications'), where('userId', '==', currentUid)),
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        const unreadFriendRequests = docs.filter(
          (d) => d.read !== true && d.type === 'friend_request'
        ).length;
        const unreadActivity = docs.filter(
          (d) =>
            d.read !== true &&
            isActivityAllowedByPrefs(d, notificationPrefs) &&
            shouldShowActivityAlert(d)
        ).length;
        // friend_request badges come from friendships listener only
        setUnreadFriendNotifications(unreadFriendRequests);
        setUnreadActivityNotifications(unreadActivity);

        if (!activitySnapshotReady) {
          docs.forEach((notification) => seenActivityIdsRef.current.add(notification.id));
          activitySnapshotReady = true;
          if (!initFlagsRef.current.activity) {
            markSourceReady('activity');
          }
          return;
        }

        docs.forEach((notification) => {
          if (notification.read === true) {
            seenActivityIdsRef.current.add(notification.id);
            return;
          }

          if (!initializedRef.current) {
            seenActivityIdsRef.current.add(notification.id);
            return;
          }

          if (seenActivityIdsRef.current.has(notification.id)) return;
          seenActivityIdsRef.current.add(notification.id);
          if (!shouldShowActivityAlert(notification)) return;
          if (notification.type === 'report_punishment') return;
          pushBanner(buildActivityBanner(notification, t));
        });
      },
      (error) => {
        handleFirestoreListenerError('friend-notifications')(error);
        setUnreadFriendNotifications(0);
        setUnreadActivityNotifications(0);
      }
    );

    return trackListener(unsub);
  }, [
    canAccessFirestore,
    currentUid,
    markSourceReady,
    notificationPrefs,
    pushBanner,
    shouldShowActivityAlert,
    t,
    trackListener,
  ]);

  useEffect(() => {
    if (!canAccessFirestore) {
      setUnreadRoomNotifications(0);
      setHostRoomAlerts({});
      setActiveRoomAlerts({});
      return undefined;
    }

    let roomSnapshotReady = false;

    const unsub = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', currentUid)),
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const roomAllowed = isRoomNotificationAllowedByPrefs(notificationPrefs);
        const unread = roomAllowed
          ? docs.filter((d) => d.read !== true).length
          : 0;
        setUnreadRoomNotifications(unread);
        const { hostByRoom, activeByRoom } = roomAllowed
          ? buildRoomNotificationMaps(docs)
          : { hostByRoom: {}, activeByRoom: {} };
        setHostRoomAlerts(hostByRoom);
        setActiveRoomAlerts(activeByRoom);

        if (!roomSnapshotReady) {
          docs.forEach((notification) => seenRoomIdsRef.current.add(notification.id));
          roomSnapshotReady = true;
          if (!initFlagsRef.current.room) {
            markSourceReady('room');
          }
          return;
        }

        docs.forEach((notification) => {
          if (notification.read === true) {
            seenRoomIdsRef.current.add(notification.id);
            return;
          }

          if (!initializedRef.current) {
            seenRoomIdsRef.current.add(notification.id);
            return;
          }

          if (seenRoomIdsRef.current.has(notification.id)) return;
          seenRoomIdsRef.current.add(notification.id);
          if (!shouldShowRoomAlert()) return;
          pushBanner(buildRoomBanner(notification, t));
        });
      },
      (error) => {
        handleFirestoreListenerError('room-notifications')(error);
        setUnreadRoomNotifications(0);
        setHostRoomAlerts({});
        setActiveRoomAlerts({});
      }
    );

    return trackListener(unsub);
  }, [
    canAccessFirestore,
    currentUid,
    markSourceReady,
    notificationPrefs,
    pushBanner,
    shouldShowRoomAlert,
    t,
    trackListener,
  ]);

  useEffect(() => {
    if (!canAccessFirestore) {
      setUnreadChats(0);
      return undefined;
    }

    let chatSnapshotReady = false;

    const unsub = subscribeToConversations(
      currentUid,
      (conversations) => {
        const friendConversations = conversations.filter((c) =>
          friendIdSet.has(getConversationPartnerId(c, currentUid))
        );
        const count =
          shouldShowChatAlert()
            ? friendConversations.filter((c) => isConversationUnread(c, currentUid)).length
            : 0;
        setUnreadChats(count);

        if (!chatSnapshotReady) {
          conversations.forEach((conversation) => {
            const messageAt = conversation.lastMessageAt?.toMillis?.() || 0;
            seenChatStateRef.current.set(conversation.id, messageAt);
          });
          chatSnapshotReady = true;
          if (!initFlagsRef.current.chat) {
            markSourceReady('chat');
          }
          return;
        }

        friendConversations.forEach((conversation) => {
          const messageAt = conversation.lastMessageAt?.toMillis?.() || 0;
          const prevMessageAt = seenChatStateRef.current.get(conversation.id);

          if (prevMessageAt === undefined) {
            seenChatStateRef.current.set(conversation.id, messageAt);
            return;
          }

          if (
            initializedRef.current &&
            messageAt > prevMessageAt &&
            isConversationUnread(conversation, currentUid) &&
            shouldShowChatAlert()
          ) {
            buildChatBanner(conversation, currentUid, t)
              .then(pushBanner)
              .catch(() => {});
          }

          seenChatStateRef.current.set(conversation.id, messageAt);
        });
      },
      (error) => {
        handleFirestoreListenerError('notification-conversations')(error);
        setUnreadChats(0);
      }
    );

    return trackListener(unsub);
  }, [
    canAccessFirestore,
    currentUid,
    friendIdSet,
    markSourceReady,
    pushBanner,
    shouldShowChatAlert,
    t,
    trackListener,
  ]);

  const pendingRequestsForDot =
    notificationPrefs.friendRequests !== false && !requestsTabSeen ? pendingFriendRequests : 0;

  const showFriendsDot = unreadChats > 0 || pendingRequestsForDot > 0;
  const showDiscoverDot = showFriendsDot;
  const showNotificationsDot =
    unreadChats > 0 ||
    pendingRequestsForDot > 0 ||
    unreadActivityNotifications > 0 ||
    unreadRoomNotifications > 0;
  const showChatsDot = unreadChats > 0;
  const showRequestsDot = pendingRequestsForDot > 0;
  // Friend/chat alerts live on the discover tab only.
  const showProfileDot = false;

  useEffect(() => {
    if (!currentUid) {
      syncAppBadgeCount(0).catch(() => {});
      return;
    }
    syncAppBadgeCount(
      unreadChats +
        pendingRequestsForDot +
        unreadActivityNotifications +
        unreadRoomNotifications
    ).catch(() => {});
  }, [
    currentUid,
    unreadChats,
    pendingRequestsForDot,
    unreadActivityNotifications,
    unreadRoomNotifications,
  ]);

  const hasRoomRequest = useCallback(
    (roomId) => (pendingRoomRequests[roomId] || 0) > 0,
    [pendingRoomRequests]
  );

  const hasHostRoomAlert = useCallback(
    (roomId) => hasRoomRequest(roomId) || (hostRoomAlerts[roomId] || 0) > 0,
    [hasRoomRequest, hostRoomAlerts]
  );

  const hasActiveRoomAlert = useCallback(
    (roomId) => (activeRoomAlerts[roomId] || 0) > 0,
    [activeRoomAlerts]
  );

  const showMyRoomsSegmentDot =
    Object.keys(pendingRoomRequests).length > 0 || Object.keys(hostRoomAlerts).length > 0;
  const showActiveRoomsSegmentDot = Object.keys(activeRoomAlerts).length > 0;
  const showMyRoomsDot = showMyRoomsSegmentDot || showActiveRoomsSegmentDot;

  const value = useMemo(
    () => ({
      pendingFriendRequests,
      pendingRoomRequests,
      hostRoomAlerts,
      activeRoomAlerts,
      unreadFriendNotifications,
      unreadActivityNotifications,
      unreadRoomNotifications,
      unreadChats,
      showProfileDot,
      showFriendsDot,
      showNotificationsDot,
      showDiscoverDot,
      showChatsDot,
      showRequestsDot,
      showMyRoomsDot,
      showMyRoomsSegmentDot,
      showActiveRoomsSegmentDot,
      activeBanner,
      dismissBanner,
      hasRoomRequest,
      hasHostRoomAlert,
      hasActiveRoomAlert,
      markRequestsTabSeen,
    }),
    [
      pendingFriendRequests,
      pendingRoomRequests,
      hostRoomAlerts,
      activeRoomAlerts,
      unreadFriendNotifications,
      unreadActivityNotifications,
      unreadRoomNotifications,
      unreadChats,
      showProfileDot,
      showFriendsDot,
      showNotificationsDot,
      showDiscoverDot,
      showChatsDot,
      showRequestsDot,
      showMyRoomsDot,
      showMyRoomsSegmentDot,
      showActiveRoomsSegmentDot,
      activeBanner,
      dismissBanner,
      hasRoomRequest,
      hasHostRoomAlert,
      hasActiveRoomAlert,
      markRequestsTabSeen,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotificationIndicators() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotificationIndicators must be used within NotificationProvider');
  }
  return ctx;
}
