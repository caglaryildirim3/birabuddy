import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '../components/PostCard';
import PostCommentsModal from '../components/PostCommentsModal';
import PressableUserAvatar from '../components/PressableUserAvatar';
import UserProfile from '../components/UserProfile';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import {
  getConversationId,
  isConversationUnread,
  getUnreadFriendMessageCount,
  markConversationRead,
  subscribeToConversations,
} from '../utils/chatUtils';
import { buildChatBanner } from '../utils/inAppNotificationUtils';
import { getFriendIds } from '../utils/friendUtils';
import { getFriendNudgeErrorMessage, isNudgeNotificationType, markNudgeNotificationsReadFromSender, sendFriendNudge } from '../utils/friendNudgeUtils';
import {
  isActivityAllowedByPrefs,
  isChatAllowedByPrefs,
  isRoomNotificationAllowedByPrefs,
} from '../utils/notificationPrefFilters';
import { buildFriendChatHref, buildRoomDetailsHref } from '../utils/notificationNavigationUtils';
import {
  DEFAULT_NOTIFICATION_PREFS,
} from '../utils/settingsUtils';
import { getUserPrivateRef } from '../utils/userDocUtils';

function getConversationPartnerId(conversation, currentUid) {
  return conversation.user1Id === currentUid ? conversation.user2Id : conversation.user1Id;
}

function getRoomIconName(type) {
  if (!type) return 'notifications-outline';
  if (type.includes('invite')) return 'mail-outline';
  if (type.includes('request')) return 'person-add-outline';
  if (type.includes('message')) return 'chatbubble-outline';
  if (type.includes('delete') || type.includes('kick')) return 'alert-circle-outline';
  return 'notifications-outline';
}

function getActivityIconName(type) {
  if (type === 'post_like') return 'heart-outline';
  if (type === 'post_comment') return 'chatbubble-outline';
  if (type === 'comment_like') return 'heart-outline';
  if (type === 'post_reaction') return 'happy-outline';
  if (type === 'friend_request') return 'person-add-outline';
  if (type === 'friend_accepted') return 'people-outline';
  if (type === 'friend_nudge' || type === 'friend_nudge_back') return 'hand-left-outline';
  if (type === 'report_punishment') return 'alert-circle-outline';
  return 'notifications-outline';
}

function isRoomMessageNotification(n) {
  return n.type === 'message' && n.roomId;
}

function groupRoomMessageNotifications(notifications) {
  const groups = new Map();
  const rest = [];

  notifications.forEach((n) => {
    if (!isRoomMessageNotification(n)) {
      rest.push(n);
      return;
    }

    const existing = groups.get(n.roomId);
    if (!existing) {
      groups.set(n.roomId, { items: [n], latest: n });
      return;
    }

    existing.items.push(n);
    if ((n.createdAt?.seconds || 0) > (existing.latest.createdAt?.seconds || 0)) {
      existing.latest = n;
    }
  });

  const grouped = Array.from(groups.values()).map(({ items, latest }) => {
    const unreadCount = items.filter((item) => !item.read).length;
    return {
      ...latest,
      id: `grouped-room-messages-${latest.roomId}`,
      groupedIds: items.map((item) => item.id),
      unreadMessageCount: unreadCount,
      read: unreadCount === 0,
      isGroupedRoomMessages: true,
    };
  });

  return [...rest, ...grouped];
}

function getRoomCardTitle(n) {
  const fromTitle = n.title?.replace(/^New message in /i, '').trim();
  return fromTitle || n.title || 'Chat';
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [roomNotifications, setRoomNotifications] = useState([]);
  const [activityNotifications, setActivityNotifications] = useState([]);
  const [chatNotifications, setChatNotifications] = useState([]);
  const [rawConversations, setRawConversations] = useState([]);
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [selectedFriendUid, setSelectedFriendUid] = useState(null);
  const [commentsPostId, setCommentsPostId] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [postLoading, setPostLoading] = useState(false);
  const [nudgeBackLoadingId, setNudgeBackLoadingId] = useState(null);
  const [nudgedBackIds, setNudgedBackIds] = useState(() => new Set());
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [friendIdSet, setFriendIdSet] = useState(() => new Set());

  const formatTime = useCallback(
    (timestamp) => {
      if (!timestamp) return t('justNow');

      const now = new Date();
      const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const diffInMs = now - notificationTime;
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      if (diffInMinutes < 1) return t('justNow');
      if (diffInMinutes < 60) return t('minutesAgo', { minutes: diffInMinutes });
      if (diffInHours < 24) return t('hoursAgo', { hours: diffInHours });
      return t('daysAgo', { days: diffInDays });
    },
    [t]
  );

  useEffect(() => {
    let roomUnsub = null;
    let activityUnsub = null;
    let chatUnsub = null;
    let prefsUnsub = null;
    let roomLoaded = false;
    let activityLoaded = false;
    let chatLoaded = false;

    const checkLoading = () => {
      if (roomLoaded && activityLoaded && chatLoaded) setLoading(false);
    };

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (roomUnsub) roomUnsub();
      if (activityUnsub) activityUnsub();
      if (chatUnsub) chatUnsub();
      if (prefsUnsub) prefsUnsub();
      roomUnsub = null;
      activityUnsub = null;
      chatUnsub = null;
      prefsUnsub = null;
      roomLoaded = false;
      activityLoaded = false;
      chatLoaded = false;

      if (!currentUser) {
        setRoomNotifications([]);
        setActivityNotifications([]);
        setChatNotifications([]);
        setRawConversations([]);
        setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
        setFriendIdSet(new Set());
        setLoading(false);
        return;
      }

      setLoading(true);

      getFriendIds(currentUser.uid)
        .then((ids) => setFriendIdSet(new Set(ids)))
        .catch(() => setFriendIdSet(new Set()));

      prefsUnsub = onSnapshot(
        getUserPrivateRef(currentUser.uid),
        (snapshot) => {
          const data = snapshot.data() || {};
          setNotificationPrefs({
            ...DEFAULT_NOTIFICATION_PREFS,
            ...(data.notificationPrefs || {}),
          });
        },
        () => setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS)
      );

      roomUnsub = onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', currentUser.uid)),
        (snapshot) => {
          const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          fetched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setRoomNotifications(fetched);
          roomLoaded = true;
          checkLoading();
        },
        () => {
          setRoomNotifications([]);
          roomLoaded = true;
          checkLoading();
        }
      );

      activityUnsub = onSnapshot(
        query(collection(db, 'friendNotifications'), where('userId', '==', currentUser.uid)),
        (snapshot) => {
          const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          fetched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setActivityNotifications(fetched);
          activityLoaded = true;
          checkLoading();
        },
        () => {
          setActivityNotifications([]);
          activityLoaded = true;
          checkLoading();
        }
      );

      chatUnsub = subscribeToConversations(
        currentUser.uid,
        (conversations) => {
          setRawConversations(conversations);
          chatLoaded = true;
          checkLoading();
        },
        () => {
          setRawConversations([]);
          setChatNotifications([]);
          chatLoaded = true;
          checkLoading();
        }
      );
    });

    return () => {
      authUnsubscribe();
      if (roomUnsub) roomUnsub();
      if (activityUnsub) activityUnsub();
      if (chatUnsub) chatUnsub();
      if (prefsUnsub) prefsUnsub();
    };
  }, [t]);

  useEffect(() => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !isChatAllowedByPrefs(notificationPrefs)) {
      setChatNotifications([]);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      const incoming = rawConversations.filter(
        (c) =>
          c.lastMessage &&
          c.lastSenderId &&
          c.lastSenderId !== currentUid &&
          isConversationUnread(c, currentUid) &&
          friendIdSet.has(getConversationPartnerId(c, currentUid))
      );

      setDismissedKeys((prev) => {
        const next = new Set(prev);
        incoming.forEach((conversation) => {
          if (isConversationUnread(conversation, currentUid)) {
            next.delete(`chat-${conversation.id}`);
          }
        });
        return next;
      });

      const items = await Promise.all(
        incoming.map(async (conversation) => {
          const banner = await buildChatBanner(conversation, currentUid, t);
          const unreadMessageCount = await getUnreadFriendMessageCount(
            conversation.id,
            conversation,
            currentUid
          );
          return {
            id: conversation.id,
            source: 'chat',
            type: 'chat_message',
            read: !isConversationUnread(conversation, currentUid),
            createdAt: banner.createdAt || conversation.lastMessageAt,
            title: banner.title,
            message: banner.message,
            senderPhotoUrl: banner.senderPhotoUrl,
            friendUid: banner.friendUid,
            conversationId: conversation.id,
            unreadMessageCount,
          };
        })
      );

      if (!cancelled) {
        setChatNotifications(items.filter((item) => item.unreadMessageCount > 0));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawConversations, friendIdSet, notificationPrefs, t]);

  const markRoomAsRead = async (notificationId) => {
    try {
      setRoomNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
      console.warn('Failed to mark room notification read:', error);
    }
  };

  const markRoomNotificationsAsRead = async (notificationIds) => {
    const ids = [...new Set((notificationIds || []).filter(Boolean))];
    if (ids.length === 0) return;

    setRoomNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );

    try {
      const CHUNK_SIZE = 450;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        ids.slice(i, i + CHUNK_SIZE).forEach((notificationId) => {
          batch.update(doc(db, 'notifications', notificationId), { read: true });
        });
        await batch.commit();
      }
    } catch (error) {
      console.warn('Failed to mark room notifications read:', error);
    }
  };

  const markActivityAsRead = async (notificationId) => {
    try {
      setActivityNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      await updateDoc(doc(db, 'friendNotifications', notificationId), { read: true });
    } catch (error) {
      console.warn('Failed to mark activity notification read:', error);
    }
  };

  const clearAll = () => {
    Alert.alert(t('clearAll'), t('deleteAllNotifications'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const currentUid = auth.currentUser?.uid;
          const roomsSnapshot = roomNotifications;
          const activitiesSnapshot = activityNotifications;
          const chatsSnapshot = chatNotifications;
          const keysToDismiss = [
            ...roomsSnapshot.map((n) => `room-${n.id}`),
            ...activitiesSnapshot.map((n) => `activity-${n.id}`),
            ...chatsSnapshot.map((n) => `chat-${n.id}`),
          ];

          setDismissedKeys((prev) => {
            const next = new Set(prev);
            keysToDismiss.forEach((key) => next.add(key));
            return next;
          });
          setRoomNotifications([]);
          setActivityNotifications([]);
          setChatNotifications([]);

          try {
            const deleteRefs = [
              ...roomsSnapshot.map((n) => doc(db, 'notifications', n.id)),
              ...activitiesSnapshot.map((n) => doc(db, 'friendNotifications', n.id)),
            ];
            const CHUNK_SIZE = 450;
            for (let i = 0; i < deleteRefs.length; i += CHUNK_SIZE) {
              const batch = writeBatch(db);
              deleteRefs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
              await batch.commit();
            }

            await Promise.all(
              chatsSnapshot.map((n) => markConversationRead(n.conversationId, currentUid))
            );
          } catch (error) {
            console.warn('Failed to clear notifications:', error);
            Alert.alert(t('error'), t('failedToClearNotifications'));
          }
        },
      },
    ]);
  };

  const openPostCard = useCallback(async (postId) => {
    if (!postId) {
      router.push('/(tabs)/feed');
      return;
    }
    setPostLoading(true);
    try {
      const snap = await getDoc(doc(db, 'posts', postId));
      if (snap.exists()) {
        setSelectedPost({ id: snap.id, ...snap.data() });
      } else {
        router.push('/(tabs)/feed');
      }
    } catch (error) {
      console.warn('Failed to load post for notification:', error);
      router.push('/(tabs)/feed');
    } finally {
      setPostLoading(false);
    }
  }, [router]);

  const getMessageCountLabel = (count) => {
    if (count <= 1) return null;
    return t('notificationNewMessagesCount', { count });
  };

  const getActivityCardTitle = (n) => {
    if (n.type === 'report_punishment') {
      return t('notificationReportPunishment');
    }
    return n.senderName || t('aFriend');
  };

  const getActivityMessage = (n) => {
    const name = n.senderName || t('aFriend');
    switch (n.type) {
      case 'friend_request':
        return t('notificationFriendRequestMessage', { name });
      case 'friend_accepted':
        return t('notificationFriendAcceptedMessage', { name });
      case 'post_like':
        return t('notificationPostLikeMessage', { name });
      case 'post_comment':
        return n.preview
          ? t('notificationPostCommentPreviewMessage', { name, preview: n.preview })
          : t('notificationPostCommentMessage', { name });
      case 'comment_like':
        return t('notificationCommentLikeMessage', { name });
      case 'post_reaction':
        return t('notificationPostReactionMessage', { name, emoji: n.emoji || '✨' });
      case 'friend_nudge':
        return t('notificationFriendNudgeMessage', { name });
      case 'friend_nudge_back':
        return t('notificationFriendNudgeBackMessage', { name });
      case 'report_punishment':
        return n.message || t('notificationReportPunishmentMessage');
      default:
        return n.message || t('notifications');
    }
  };

  const handleRoomPress = (n) => {
    if (n.groupedIds?.length) {
      markRoomNotificationsAsRead(n.groupedIds);
    } else {
      markRoomAsRead(n.id);
    }
    if (n.roomId) {
      router.push(buildRoomDetailsHref(n) || `/room-details/${n.roomId}`);
    }
  };

  const handleChatPress = async (n) => {
    setChatNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
    );
    await markConversationRead(n.conversationId, auth.currentUser?.uid);
    if (n.friendUid) {
      router.push(buildFriendChatHref(n.friendUid, n));
    }
  };

  const markNudgeNotificationsFromSenderAsRead = async (senderId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !senderId) return;

    setActivityNotifications((prev) =>
      prev.map((n) =>
        n.senderId === senderId && isNudgeNotificationType(n.type) ? { ...n, read: true } : n
      )
    );

    try {
      await markNudgeNotificationsReadFromSender(uid, senderId);
    } catch (error) {
      console.warn('Failed to mark nudge notifications read:', error);
    }
  };

  const handleNudgeBack = async (n) => {
    if (!n.senderId || nudgeBackLoadingId || n.nudgedBack || nudgedBackIds.has(n.id)) return;
    markActivityAsRead(n.id);
    setNudgeBackLoadingId(n.id);
    try {
      await sendFriendNudge(n.senderId, { isNudgeBack: true });
      setNudgedBackIds((prev) => new Set(prev).add(n.id));
      setActivityNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, nudgedBack: true } : item))
      );
      await updateDoc(doc(db, 'friendNotifications', n.id), { nudgedBack: true });
    } catch (error) {
      Alert.alert(t('error'), getFriendNudgeErrorMessage(error, t));
    } finally {
      setNudgeBackLoadingId(null);
    }
  };

  const handleActivityPress = (n) => {
    if (isNudgeNotificationType(n.type)) {
      if (n.senderId) {
        const uid = auth.currentUser?.uid;
        markNudgeNotificationsFromSenderAsRead(n.senderId);
        if (uid) {
          const conversationId = n.conversationId || getConversationId(uid, n.senderId);
          markConversationRead(conversationId, uid).catch(() => {});
        }
        router.push(buildFriendChatHref(n.senderId, n));
      } else {
        markActivityAsRead(n.id);
        router.push('/friends-list');
      }
      return;
    }

    markActivityAsRead(n.id);

    if (n.type === 'friend_request' || n.type === 'friend_accepted') {
      if (n.senderId) {
        setSelectedFriendUid(n.senderId);
      } else {
        router.push('/friends-list');
      }
      return;
    }

    if (n.type === 'friend_live') {
      if (n.senderId) {
        router.push(buildFriendChatHref(n.senderId, n));
      } else {
        router.push('/friends-list');
      }
      return;
    }

    if (n.type === 'post_like' || n.type === 'post_reaction') {
      if (n.postId) {
        openPostCard(n.postId);
      } else {
        router.push('/(tabs)/feed');
      }
      return;
    }

    if (n.type === 'post_comment' || n.type === 'comment_like') {
      if (n.postId) {
        setCommentsPostId(n.postId);
      } else {
        router.push('/(tabs)/feed');
      }
      return;
    }

    if (n.senderId) {
      setSelectedFriendUid(n.senderId);
    }
  };

  const allNotifications = useMemo(() => {
    const merged = [
      ...(isRoomNotificationAllowedByPrefs(notificationPrefs)
        ? groupRoomMessageNotifications(roomNotifications.map((n) => ({ ...n, source: 'room' })))
        : []),
      ...activityNotifications
        .filter((n) => isActivityAllowedByPrefs(n, notificationPrefs))
        .map((n) => ({ ...n, source: 'activity' })),
      ...(isChatAllowedByPrefs(notificationPrefs) ? chatNotifications : []),
    ]
      .filter((n) => !dismissedKeys.has(`${n.source}-${n.id}`))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return merged;
  }, [roomNotifications, activityNotifications, chatNotifications, dismissedKeys, notificationPrefs]);

  const hasAnyNotifications = allNotifications.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('notifications')}</Text>
        {hasAnyNotifications ? (
          <Pressable onPress={clearAll} style={styles.headerButton} hitSlop={8}>
            <Ionicons name="trash-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : !hasAnyNotifications ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>{t('noNotificationsYet')}</Text>
          <Text style={styles.emptySubText}>{t('allCaughtUp')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {allNotifications.map((n) => {
            const isRoom = n.source === 'room';
            const isChat = n.source === 'chat';
            const isActivity = n.source === 'activity';
            const showSenderAvatar =
              (isChat && n.friendUid) || (isActivity && n.senderId);
            const iconName = isRoom ? getRoomIconName(n.type) : getActivityIconName(n.type);
            const title = isRoom
              ? isRoomMessageNotification(n)
                ? getRoomCardTitle(n)
                : n.title || t('notifications')
              : isChat
                ? n.title
                : getActivityCardTitle(n);
            const message = isRoom
              ? getMessageCountLabel(n.unreadMessageCount) || n.message
              : isChat
                ? getMessageCountLabel(n.unreadMessageCount) || n.message
                : getActivityMessage(n);
            const hasNudgedBack =
              isActivity &&
              isNudgeNotificationType(n.type) &&
              (n.nudgedBack || nudgedBackIds.has(n.id));

            return (
              <Pressable
                key={`${n.source}-${n.id}`}
                style={[styles.card, !n.read && styles.unreadCard]}
                onPress={() =>
                  isRoom ? handleRoomPress(n) : isChat ? handleChatPress(n) : handleActivityPress(n)
                }
              >
                {showSenderAvatar ? (
                  <PressableUserAvatar
                    uid={isChat ? n.friendUid : n.senderId}
                    snapshot={{
                      name: isChat ? n.title : n.senderName || t('aFriend'),
                      photoURL: isChat ? n.senderPhotoUrl || null : null,
                    }}
                    size={40}
                    onPress={(uid) => setSelectedFriendUid(uid)}
                    style={styles.cardAvatarWrap}
                  />
                ) : (
                  <View style={styles.cardIcon}>
                    <Ionicons name={iconName} size={24} color={colors.iconPrimary} />
                  </View>
                )}
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  {isActivity && isNudgeNotificationType(n.type) && n.senderId ? (
                    <View style={styles.cardMessageRow}>
                      <Text style={[styles.cardMessage, styles.cardMessageFlex]}>{message}</Text>
                      {hasNudgedBack ? (
                        <View style={styles.nudgeBackDone}>
                          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                        </View>
                      ) : (
                        <Pressable
                          style={styles.nudgeBackButton}
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            handleNudgeBack(n);
                          }}
                          disabled={nudgeBackLoadingId === n.id}
                        >
                          {nudgeBackLoadingId === n.id ? (
                            <ActivityIndicator size="small" color={colors.onAccent} />
                          ) : (
                            <Text style={styles.nudgeBackButtonText}>{t('nudgeBack')}</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.cardMessage}>{message}</Text>
                  )}
                  <Text style={styles.cardTime}>{formatTime(n.createdAt)}</Text>
                </View>
                {!n.read ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!selectedFriendUid} animationType="slide" presentationStyle="pageSheet">
        {selectedFriendUid ? (
          <UserProfile uid={selectedFriendUid} onClose={() => setSelectedFriendUid(null)} />
        ) : null}
      </Modal>

      {postLoading ? (
        <View style={styles.postLoadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}

      <Modal
        visible={!!selectedPost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPost(null)}
      >
        <SafeAreaView style={styles.postModalContainer}>
          <View style={styles.postModalHeader}>
            <Pressable onPress={() => setSelectedPost(null)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          {selectedPost ? (
            <ScrollView
              contentContainerStyle={styles.postModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <PostCard post={selectedPost} onDeleted={() => setSelectedPost(null)} />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <PostCommentsModal
        visible={!!commentsPostId}
        postId={commentsPostId}
        postOwnerId={auth.currentUser?.uid}
        onClose={() => setCommentsPostId(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    headerButton: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: colors.panel,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    unreadCard: {
      backgroundColor: colors.panelElevated,
      borderColor: colors.accent,
      borderWidth: 2,
    },
    cardIcon: {
      marginRight: 12,
      marginTop: 2,
    },
    cardAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    cardAvatarFallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
      backgroundColor: colors.panelElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardAvatarInitial: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: '700',
    },
    cardContent: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    cardMessage: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    cardMessageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardMessageFlex: {
      flex: 1,
    },
    cardTime: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
    },
    nudgeBackButton: {
      flexShrink: 0,
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nudgeBackButtonText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: '600',
    },
    nudgeBackDone: {
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardAvatarWrap: {
      marginRight: 12,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.notificationDot,
      marginTop: 6,
      marginLeft: 6,
    },
    emptyIcon: {
      fontSize: 50,
      marginBottom: 10,
    },
    emptyText: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
    },
    emptySubText: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 5,
    },
    postLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    postModalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    postModalHeader: {
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    postModalScroll: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
  });
