import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  IconCalendar,
  IconClock,
  IconMapPin,
  IconMessageCircle,
  IconSchool,
} from '@tabler/icons-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableUserAvatar from '../../components/PressableUserAvatar';
import ReactionListModal from '../../components/ReactionListModal';
import UserProfile from '../../components/UserProfile';
import { isOutTonight } from '../../utils/outTonightUtils';
import { auth, db } from '../../firebase/firebaseConfig';
import { recordMeetupAttendance } from '../../utils/meetupAttendanceUtils';
import { useButtonDelay } from '../../hooks/useButtonDelay';
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll';
import { useScrollToChatMessage } from '../../hooks/useScrollToChatMessage';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserDisplayName } from '../../utils/authUtils';
import { getFriendIds } from '../../utils/friendUtils';
import { parseRoomDateTime } from '../../utils/dateUtils';
import {
  getRoomChatReadTimestamp,
  loadRoomChatLastReadAt,
  saveRoomChatLastReadAt,
} from '../../utils/roomChatReadUtils';
import { toggleRoomMessageLike, findMatchingRoomMessageId } from '../../utils/roomChatUtils';
import { buildInviteFriendEntry, markRoomInviteSeen } from '../../utils/roomInviteUtils';
import { deleteRoomTree } from '../../utils/roomDeleteUtils';
import {
  deleteJoinRequestNotifications,
  markRoomMessageNotificationsRead,
  markRoomNotificationsRead,
  notifyJoinRequestApproved,
} from '../../utils/roomNotificationUtils';
import {
  canRequestJoinRoom,
  canViewRoom,
  getRoomDisplayLocation,
  isRoomExpired,
} from '../../utils/roomUtils';

const INVALID_PARTICIPANT_UIDS = new Set(['undefined', 'anonymous', 'null']);
const DOUBLE_TAP_MS = 300;

function isValidParticipantUid(uid) {
  return (
    typeof uid === 'string' &&
    uid.length >= 10 &&
    !INVALID_PARTICIPANT_UIDS.has(uid)
  );
}

function resolveParticipantNickname(userData, participantData, t) {
  let nickname = getUserDisplayName(userData, userData?.email);
  if (!nickname || nickname === 'User') {
    nickname = participantData?.nickname?.trim() || '';
  }
  if (!nickname || nickname === 'anonymous') {
    nickname = userData?.instagram?.trim() || t('unknownUser');
  }
  return nickname;
}

export default function RoomDetails() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const openChatParam = Array.isArray(params.openChat) ? params.openChat[0] : params.openChat;
  const initialScrollToMessageId = Array.isArray(params.messageId) ? params.messageId[0] : params.messageId;
  const router = useRouter();

  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const { isDisabled, executeWithDelay } = useButtonDelay(2000);
  const [isParticipant, setIsParticipant] = useState(false);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [friendIds, setFriendIds] = useState([]);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [invitingId, setInvitingId] = useState(null);

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [likesModalUserIds, setLikesModalUserIds] = useState(null);
  const [lastReadAt, setLastReadAt] = useState(0);
  const [pendingScrollTargetId, setPendingScrollTargetId] = useState(initialScrollToMessageId || null);
  const flatListRef = useRef(null);
  const swipeableRefs = useRef({});
  const lastTapRef = useRef({});
  const hasScrolledToTargetRef = useRef(false);
  const expiredAlertShownRef = useRef(false);
  const handleTargetScrolled = useCallback(() => {
    hasScrolledToTargetRef.current = true;
    setPendingScrollTargetId(null);
  }, []);
  const messagePreviewParam = Array.isArray(params.messagePreview)
    ? params.messagePreview[0]
    : params.messagePreview;
  const messageAtSeconds = Number(Array.isArray(params.at) ? params.at[0] : params.at) || null;
  const wantsTargetScroll = Boolean(initialScrollToMessageId || messagePreviewParam);
  const { scrollToEnd, onContentSizeChange: onAutoScrollContentSizeChange, onScrollToIndexFailed: onAutoScrollToIndexFailed } = useChatAutoScroll(
    flatListRef,
    messages,
    {
      enabled: showChat && !wantsTargetScroll && !pendingScrollTargetId,
    }
  );
  const { scrollToMessage, highlightedMessageId, onScrollToIndexFailed: onTargetScrollToIndexFailed, onTargetContentSizeChange } =
    useScrollToChatMessage(flatListRef, messages, { onScrolled: handleTargetScrolled });

  const onContentSizeChange = useCallback(() => {
    onAutoScrollContentSizeChange();
    onTargetContentSizeChange();
  }, [onAutoScrollContentSizeChange, onTargetContentSizeChange]);

  const onScrollToIndexFailed = useCallback(
    (info) => {
      onTargetScrollToIndexFailed(info);
      onAutoScrollToIndexFailed(info);
    },
    [onAutoScrollToIndexFailed, onTargetScrollToIndexFailed]
  );
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const chatInputBottomPadding =
    keyboardHeight > 0 ? keyboardHeight + 8 : Math.max(insets.bottom, 12) + 8;

  // Helper: Check if room is full
  const isRoomFull = useMemo(() => {
    if (!room) return false;
    return participants.length >= (room.maxParticipants || 0);
  }, [participants, room]);

  const formatDateString = (dateVal) => {
    if (!dateVal) return t('notSpecified');
    if (dateVal.toDate) {
      return dateVal.toDate().toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    if (typeof dateVal === 'string') {
      try {
        const [year, month, day] = dateVal.split('-');
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      } catch (error) {
        return dateVal;
      }
    }
    return t('notSpecified');
  };

  const formatTimeString = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return t('notSpecified');
    return timeString;
  };

  const getDisplayLocation = () =>
    getRoomDisplayLocation(room, {
      isParticipant: isParticipant || isCreator,
      viewerUid: auth.currentUser?.uid,
      t,
    });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !id) return undefined;

    loadRoomChatLastReadAt(uid, id).then(setLastReadAt).catch(() => setLastReadAt(0));
    return undefined;
  }, [id]);

  useEffect(() => {
    if (!id || !isParticipant) return;
    const messagesRef = collection(db, 'rooms', id, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [id, isParticipant]);

  const markChatAsRead = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !id) return;

    const readAt = getRoomChatReadTimestamp(messages, uid);
    setLastReadAt(readAt);
    await saveRoomChatLastReadAt(uid, id, readAt);
    await markRoomMessageNotificationsRead(uid, id).catch(() => {});
  }, [id, messages]);

  useEffect(() => {
    if (!showChat) return undefined;
    markChatAsRead().catch(() => {});
    return undefined;
  }, [showChat, markChatAsRead]);

  const closeChat = useCallback(() => {
    setReplyingTo(null);
    setLikesModalUserIds(null);
    markChatAsRead()
      .catch(() => {})
      .finally(() => setShowChat(false));
  }, [markChatAsRead]);

  const prevShowChatRef = useRef(false);
  useEffect(() => {
    if (openChatParam === '1' && isParticipant) {
      setShowChat(true);
    }
  }, [openChatParam, isParticipant]);

  useEffect(() => {
    setPendingScrollTargetId(initialScrollToMessageId || null);
    hasScrolledToTargetRef.current = false;
  }, [initialScrollToMessageId, id]);

  useEffect(() => {
    if (!showChat || !wantsTargetScroll || messages.length === 0 || hasScrolledToTargetRef.current) {
      return;
    }

    const targetId = findMatchingRoomMessageId(messages, {
      chatMessageId: pendingScrollTargetId || initialScrollToMessageId,
      message: messagePreviewParam,
      createdAt: messageAtSeconds ? { seconds: messageAtSeconds } : null,
    });

    if (!targetId) return;

    requestAnimationFrame(() => {
      scrollToMessage(targetId);
    });
  }, [
    showChat,
    wantsTargetScroll,
    messages,
    pendingScrollTargetId,
    initialScrollToMessageId,
    messagePreviewParam,
    messageAtSeconds,
    scrollToMessage,
  ]);

  useEffect(() => {
    if (showChat && !prevShowChatRef.current && messages.length > 0 && !wantsTargetScroll) {
      scrollToEnd(false);
    }
    prevShowChatRef.current = showChat;
  }, [showChat, messages.length, scrollToEnd, wantsTargetScroll]);

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (!uid || !id) return undefined;
      markRoomNotificationsRead(uid, id).catch(() => {});
      return undefined;
    }, [id])
  );

  const handleSend = async () => {
    if (message.trim() === '') return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const nickname = userData.instagram || userData.nickname || 'unknown';
      const trimmed = message.trim();
      
      const messagesRef = collection(db, 'rooms', id, 'messages');
      const msgData = {
        text: trimmed,
        sender: nickname,
        uid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        likes: [],
      };
      if (replyingTo) {
        msgData.replyTo = {
          id: replyingTo.id,
          text: replyingTo.text,
          senderLabel: replyingTo.senderLabel,
        };
      }
      const messageRef = await addDoc(messagesRef, msgData);

      // Send Notification to others
      const recipients = participants.filter((p) => p.uid !== auth.currentUser.uid);
      await Promise.all(
        recipients.map((p) =>
          addDoc(collection(db, 'notifications'), {
            userId: p.uid,
            type: 'message',
            title: `New message in ${room?.name || 'Chat'}`,
            message: trimmed,
            roomId: id,
            chatMessageId: messageRef.id,
            createdAt: serverTimestamp(),
            read: false,
            senderId: auth.currentUser.uid,
          })
        )
      );

      setMessage('');
      setReplyingTo(null);
      scrollToEnd(true);
    } catch (error) {
      Alert.alert(t('error'), t('failedToSendMessage'));
    }
  };

  const handleSendPress = () => {
    executeWithDelay(() => handleSend());
  };

  const checkParticipationStatus = (participantsList, requestsList) => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      setIsParticipant(false);
      setHasRequestedJoin(false);
      return;
    }
    const isUserParticipant = participantsList.some(p => p.uid === currentUserId);
    setIsParticipant(isUserParticipant);
    const hasUserRequested = requestsList.some(r => r.uid === currentUserId);
    setHasRequestedJoin(hasUserRequested);
  };

  const isCreator = useMemo(() => {
    if (!auth.currentUser?.uid || !room?.createdBy) return false;
    return auth.currentUser.uid === room.createdBy;
  }, [auth.currentUser?.uid, room?.createdBy]);

  const canAccessRoom = useMemo(() => {
    if (!room || !auth.currentUser?.uid) return false;
    return canViewRoom(room, auth.currentUser.uid, friendIds);
  }, [room, friendIds, auth.currentUser?.uid]);

  const canJoinRoom = useMemo(() => {
    if (!room || !auth.currentUser?.uid) return false;
    return canRequestJoinRoom(room, auth.currentUser.uid, friendIds);
  }, [room, friendIds, auth.currentUser?.uid]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setFriendIds([]);
      return;
    }
    getFriendIds(uid).then(setFriendIds).catch(() => setFriendIds([]));
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!isParticipant || !uid || friendIds.length === 0) {
      setInviteFriends([]);
      return undefined;
    }

    let cancelled = false;

    const loadInviteFriends = async () => {
      const eligibleIds = friendIds.filter(
        (friendUid) =>
          friendUid !== uid &&
          !participantIdSet.has(friendUid) &&
          !requestIdSet.has(friendUid)
      );

      const friends = [];
      for (const friendUid of eligibleIds) {
        try {
          const userSnap = await getDoc(doc(db, 'users', friendUid));
          if (!userSnap.exists()) continue;
          friends.push(
            buildInviteFriendEntry(userSnap.data(), friendUid, {
              invited: invitedIdSet.has(friendUid),
              fallbackName: t('friendTagLabel'),
            })
          );
        } catch (e) {
          // skip failed profile fetch
        }
      }

      if (!cancelled) {
        friends.sort((a, b) => a.nickname.localeCompare(b.nickname));
        setInviteFriends(friends);
      }
    };

    loadInviteFriends();

    return () => {
      cancelled = true;
    };
  }, [
    isParticipant,
    friendIds,
    participantIdSet,
    requestIdSet,
    invitedIdSet,
    auth.currentUser?.uid,
  ]);

  const formattedDate = useMemo(() => formatDateString(room?.date), [room?.date]);
  const formattedTime = useMemo(() => formatTimeString(room?.time), [room?.time]);

  const capacityFill = useMemo(() => {
    const max = room?.maxParticipants || 0;
    if (!max) return 0;
    return Math.min(participants.length / max, 1);
  }, [participants.length, room?.maxParticipants]);

  const hasUnreadMessages = useMemo(() => {
    if (!isParticipant || showChat) return false;
    const currentUid = auth.currentUser?.uid;
    return messages.some((msg) => {
      if (msg.uid === currentUid) return false;
      const msgTime = msg.createdAt?.toDate?.()?.getTime?.() || 0;
      return msgTime > lastReadAt;
    });
  }, [messages, lastReadAt, isParticipant, showChat]);

  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const participantIdSet = useMemo(
    () => new Set(participants.map((p) => p.uid)),
    [participants]
  );
  const requestIdSet = useMemo(
    () => new Set(joinRequests.map((r) => r.uid)),
    [joinRequests]
  );
  const invitedIdSet = useMemo(() => new Set(room?.invites || []), [room?.invites]);

  const handleUserProfileClick = useCallback((uid) => {
    if (!uid) return;
    setSelectedUserProfile(uid);
    setShowUserProfile(true);
  }, []);

  const closeUserProfile = useCallback(() => {
    setShowUserProfile(false);
    setSelectedUserProfile(null);
  }, []);

  const chatUserSnapshots = useMemo(() => {
    const snapshots = {};
    participants.forEach((participant) => {
      snapshots[participant.uid] = {
        name: participant.nickname,
        photoURL: participant.photoURL || null,
      };
    });
    return snapshots;
  }, [participants]);

  const participantUidBySender = useMemo(() => {
    const map = {};
    participants.forEach((participant) => {
      if (participant.nickname) {
        map[participant.nickname] = participant.uid;
      }
    });
    return map;
  }, [participants]);

  const resolveMessageUid = useCallback(
    (item) => item.uid || participantUidBySender[item.sender] || null,
    [participantUidBySender]
  );

  const getMessageSenderLabel = useCallback(
    (item) => {
      const messageUid = resolveMessageUid(item);
      if (messageUid && chatUserSnapshots[messageUid]) {
        return chatUserSnapshots[messageUid].name;
      }
      return item.sender || t('unknownUser');
    },
    [resolveMessageUid, chatUserSnapshots, t]
  );

  const handleToggleMessageLike = async (item) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !id || !item.id) return;
    if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await toggleRoomMessageLike(id, item.id, currentUid);
    } catch {}
  };

  const handleDoubleTapMessage = (item) => {
    const now = Date.now();
    const last = lastTapRef.current[item.id] || 0;
    if (now - last < DOUBLE_TAP_MS) {
      handleToggleMessageLike(item);
    }
    lastTapRef.current[item.id] = now;
  };

  const handleSwipeReply = (item) => {
    if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplyingTo({
      id: item.id,
      text: item.text,
      senderLabel: getMessageSenderLabel(item),
    });
    swipeableRefs.current[item.id]?.close();
  };

  const renderSwipeAction = () => (
    <View style={styles.swipeReplyContainer}>
      <Ionicons name="return-up-forward-outline" size={22} color={colors.accent} />
    </View>
  );

  const renderChatMessage = ({ item }) => {
    const messageUid = resolveMessageUid(item);
    const isMe = messageUid === auth.currentUser?.uid;
    const snapshot = (messageUid && chatUserSnapshots[messageUid]) || {
      name: item.sender || 'User',
      photoURL: null,
    };
    const likes = Array.isArray(item.likes) ? item.likes : [];
    const likeCount = likes.length;

    const bubble = (
      <View
        style={[
          styles.bubblePressable,
          likeCount > 0 && styles.bubblePressableWithLike,
          isMe ? styles.bubblePressableMe : styles.bubblePressableOther,
        ]}
      >
        <Pressable onPress={() => handleDoubleTapMessage(item)}>
          <View
            style={[
              styles.messageBubble,
              isMe ? styles.myMessageBubble : styles.otherMessageBubble,
              isMe ? styles.bubbleAlignEnd : styles.bubbleAlignStart,
            ]}
          >
            {!isMe ? <Text style={styles.senderName}>{getMessageSenderLabel(item)}</Text> : null}

            {item.replyTo ? (
              <Pressable
                style={[styles.replyQuote, isMe ? styles.replyQuoteMe : styles.replyQuoteOther]}
                onPress={() => scrollToMessage(item.replyTo.id)}
              >
                <Text style={styles.replyQuoteName} numberOfLines={1}>{item.replyTo.senderLabel}</Text>
                <Text style={styles.replyQuoteText} numberOfLines={2}>{item.replyTo.text}</Text>
              </Pressable>
            ) : null}

            <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
              {item.text}
            </Text>
            <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.otherTimestamp]}>
              {item.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
            </Text>
          </View>
        </Pressable>

        {likeCount > 0 ? (
          <Pressable
            style={[styles.likeBadge, isMe ? styles.likeBadgeMe : styles.likeBadgeOther]}
            onPress={() => setLikesModalUserIds(likes)}
          >
            <Text style={styles.likeBadgeEmoji}>❤️</Text>
            {likeCount > 1 ? (
              <Text style={styles.likeBadgeCount}>x{likeCount}</Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    );

    const avatar = (
      <PressableUserAvatar
        uid={messageUid}
        snapshot={snapshot}
        size={32}
        onPress={messageUid ? handleUserProfileClick : undefined}
        style={styles.chatMessageAvatar}
      />
    );

    return (
      <View
        style={[
          styles.messageRowOuter,
          isMe ? styles.messageRowOuterMe : null,
          item.id === highlightedMessageId ? styles.messageRowOuterHighlighted : null,
        ]}
      >
        <Swipeable
          ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
          containerStyle={styles.swipeableContainer}
          childrenContainerStyle={styles.swipeableChildContainer}
          friction={2}
          overshootLeft={false}
          overshootRight={false}
          renderLeftActions={renderSwipeAction}
          onSwipeableOpen={() => handleSwipeReply(item)}
          leftThreshold={60}
          rightThreshold={9999}
        >
          <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
            {!isMe ? avatar : null}
            {bubble}
            {isMe ? avatar : null}
          </View>
        </Swipeable>
      </View>
    );
  };

  useEffect(() => {
    if (!id) return;
    expiredAlertShownRef.current = false;
    const roomRef = doc(db, 'rooms', id);
    const unsubscribeRoom = onSnapshot(roomRef, async (docSnap) => {
      if (!docSnap.exists()) {
        if (!expiredAlertShownRef.current) {
          expiredAlertShownRef.current = true;
          Alert.alert(t('roomNotFound'), t('roomNotFoundMessage'), [
            { text: t('ok'), onPress: () => router.replace('/(tabs)/feed') },
          ]);
        }
        return;
      }

      const roomData = docSnap.data();

      const now = new Date();
      const { date, time } = roomData;
      if (date) {
        const startDateTime = parseRoomDateTime(date, time);

        if (startDateTime && isRoomExpired(date, time, now)) {
          if (!expiredAlertShownRef.current) {
            expiredAlertShownRef.current = true;
            Alert.alert(t('roomExpired'), t('roomExpiredMessage'), [
              { text: t('ok'), onPress: () => router.replace('/(tabs)/feed') },
            ]);
          }
          if (roomData.createdBy === auth.currentUser?.uid) {
            deleteRoomTree(id).catch((err) => console.log('Auto-delete failed', err));
          }
          return;
        }
      }

      setRoom(roomData);
      
      const uids = roomData?.requests || [];
      if (uids.length > 0) {
        try {
          const requests = [];
          for (let i = 0; i < uids.length; i++) {
             const uid = uids[i];
             if (!uid) continue;
             try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                const userData = userSnap.exists() ? userSnap.data() : {};
                const nickname = userSnap.exists()
                  ? getUserDisplayName(userData)
                  : `User-${uid.substr(0, 5)}`;
                const major = userSnap.exists() ? userData.major : t('unknown');
                const photoURL =
                  Array.isArray(userData.photos) && userData.photos[0] ? userData.photos[0] : null;
                requests.push({ uid, nickname, major, photoURL });
             } catch (e) {}
          }
          setJoinRequests(requests);
        } catch (error) { setJoinRequests([]); }
      } else {
        setJoinRequests([]);
      }
    });

    return () => {
      unsubscribeRoom();
    };
  }, [id]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!id || !uid || !room) return undefined;
    if (!canViewRoom(room, uid, friendIds)) return undefined;

    const participantsCollectionRef = collection(db, 'rooms', id, 'participants');
    const unsubscribeParticipants = onSnapshot(
      participantsCollectionRef,
      async (snapshot) => {
        try {
          const seenUids = new Set();
          const list = [];

          for (const docSnap of snapshot.docs) {
            const participantUid = docSnap.id;
            if (!isValidParticipantUid(participantUid) || seenUids.has(participantUid)) {
              continue;
            }
            seenUids.add(participantUid);

            const data = docSnap.data();
            try {
              const userDoc = await getDoc(doc(db, 'users', participantUid));
              const userData = userDoc.exists() ? userDoc.data() : {};
              list.push({
                uid: participantUid,
                nickname: resolveParticipantNickname(userData, data, t),
                major: userData.major || t('notSpecified'),
                photoURL:
                  Array.isArray(userData.photos) && userData.photos[0] ? userData.photos[0] : null,
                isOutTonight: isOutTonight(userData),
              });
            } catch {
              list.push({
                uid: participantUid,
                nickname: resolveParticipantNickname({}, data, t),
                major: '',
                photoURL: null,
                isOutTonight: false,
              });
            }
          }

          const hostUid = room?.createdBy;
          if (isValidParticipantUid(hostUid) && !seenUids.has(hostUid)) {
            try {
              const hostDoc = await getDoc(doc(db, 'users', hostUid));
              const hostData = hostDoc.exists() ? hostDoc.data() : {};
              list.unshift({
                uid: hostUid,
                nickname: resolveParticipantNickname(hostData, {}, t),
                major: hostData.major || t('notSpecified'),
                photoURL:
                  Array.isArray(hostData.photos) && hostData.photos[0] ? hostData.photos[0] : null,
                isOutTonight: isOutTonight(hostData),
              });
            } catch {
              // host profile unavailable — skip synthetic entry
            }
          }

          setParticipants(list);
        } catch (e) {
          console.error('Error processing participants:', e);
        }
      },
      (error) => {
        console.error('Error loading participants:', error);
      }
    );

    return () => unsubscribeParticipants();
  }, [id, room, friendIds, t]);

  useEffect(() => {
    checkParticipationStatus(participants, joinRequests);
  }, [participants, joinRequests]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!id || !uid || !room || participants.length === 0) return undefined;

    const isParticipant = participants.some((participant) => participant.uid === uid);
    if (!isParticipant) return undefined;

    recordMeetupAttendance({
      roomId: id,
      room,
      coParticipantUids: participants.map((participant) => participant.uid),
    }).catch(() => {});

    return undefined;
  }, [id, room, participants]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!id || !uid || !room?.invites?.includes(uid)) return;
    markRoomInviteSeen(uid, id).catch(() => {});
  }, [id, room?.invites]);

  const handleLeaveRoom = () => {
    Alert.alert(
      t('leaveRoom'),
      t('leaveRoomConfirm', { roomName: room?.name || t('roomFallback') }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('leave'),
          style: 'destructive',
          onPress: async () => {
            try {
              const uid = auth.currentUser?.uid;
              if (!uid || !id) return;

              await deleteDoc(doc(db, 'rooms', id, 'participants', uid));
              await updateDoc(doc(db, 'rooms', id), {
                participants: arrayRemove(uid),
              });
              router.back();
            } catch (e) {
              Alert.alert(t('error'), t('failedToLeaveRoom'));
            }
          },
        },
      ]
    );
  };

  const handleKickParticipant = async (participant) => {
    Alert.alert(t('kickParticipant'), t('kickParticipantConfirm', { name: participant.nickname }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('removeParticipant'), style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'rooms', id, 'participants', participant.uid));
            const roomRef = doc(db, 'rooms', id);
            await updateDoc(roomRef, {
                participants: arrayRemove(participant.uid)
            });
          } catch (e) { Alert.alert(t('error'), t('failedToRemoveParticipant')); }
        }
      }
    ]);
  };

  const handleRequestJoin = async () => {
    if (!auth.currentUser) return Alert.alert(t('error'), t('loginRequired'));
    if (!canJoinRoom) return;
    try {
      const roomRef = doc(db, 'rooms', id);
      await updateDoc(roomRef, {
        requests: arrayUnion(auth.currentUser.uid),
        [`requestTimestamps.${auth.currentUser.uid}`]: serverTimestamp(),
      });
      
      if (room?.createdBy) {
          await addDoc(collection(db, 'notifications'), {
            userId: room.createdBy,
            type: 'request',
            title: 'New Join Request',
            message: `Someone wants to join your room: ${room.name || 'Room'}`,
            roomId: id,
            createdAt: serverTimestamp(),
            read: false,
            senderId: auth.currentUser.uid
          });
      }

    } catch (e) { Alert.alert(t('error'), t('failedToSendJoinRequest')); }
  };

  const handleCancelRequest = async () => {
    if (!auth.currentUser) return;
    Alert.alert(t('cancelJoinRequest'), t('cancelJoinRequestConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('yes'), style: 'destructive', onPress: async () => {
          try {
            const roomRef = doc(db, 'rooms', id);
            await updateDoc(roomRef, {
              requests: arrayRemove(auth.currentUser.uid),
              [`requestTimestamps.${auth.currentUser.uid}`]: null,
            });
          } catch (e) { Alert.alert(t('error'), t('failedToCancelRequest')); }
        }
      }
    ]);
  };

  const handleDeleteRoom = async () => {
    Alert.alert(t('deleteRoom'), t('deleteRoomConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
          try {
            await deleteRoomTree(id);
            router.replace('/(tabs)/feed');
          } catch (e) { Alert.alert(t('error'), t('failedToDeleteRoom')); }
        }
      }
    ]);
  };

  const handleApprove = async (requestUser) => {
    if (requestUser.uid === auth.currentUser?.uid) return;
    if (participants.length >= (room.maxParticipants || 0)) {
        Alert.alert(t('roomFullTitle'), t('roomFullMessage'));
        return;
    }

    const roomRef = doc(db, 'rooms', id);
    const participantDocRef = doc(db, 'rooms', id, 'participants', requestUser.uid);
    
    try {
      const batch = writeBatch(db);
      batch.set(participantDocRef, {
        uid: requestUser.uid,
        nickname: requestUser.nickname,
        joinedAt: serverTimestamp(),
      });
      batch.update(roomRef, {
        requests: arrayRemove(requestUser.uid),
        participants: arrayUnion(requestUser.uid),
      });
      await batch.commit();

      const hostSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const hostName = hostSnap.exists()
        ? getUserDisplayName(hostSnap.data()) || t('aFriend')
        : t('aFriend');
      await notifyJoinRequestApproved({
        roomId: id,
        hostUid: auth.currentUser.uid,
        hostName,
        requesterUid: requestUser.uid,
        roomName: room?.name || t('aRoom'),
        title: t('notificationRoomApproved'),
        message: t('notificationRoomApprovedMessage', {
          hostName,
          roomName: room?.name || t('aRoom'),
        }),
      }).catch(() => {});

      await deleteJoinRequestNotifications(auth.currentUser?.uid, id, requestUser.uid).catch(() => {});
    } catch (e) { Alert.alert(t('error'), t('failedToApproveRequest')); }
  };

  const handleDecline = async (requestUser) => {
    const roomRef = doc(db, 'rooms', id);
    try {
      if (room && room.requests) {
        await updateDoc(roomRef, { requests: arrayRemove(requestUser.uid) });
      }
      await deleteJoinRequestNotifications(auth.currentUser?.uid, id, requestUser.uid).catch(() => {});
    } catch (e) { Alert.alert(t('error'), t('failedToDeclineRequest')); }
  };

  const handleInviteFriend = async (friend) => {
    if (!auth.currentUser || friend.invited || invitingId || isRoomFull) return;

    setInvitingId(friend.uid);
    try {
      const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const inviterName = userSnap.exists()
        ? getUserDisplayName(userSnap.data()) || t('aFriend')
        : t('aFriend');

      const roomRef = doc(db, 'rooms', id);
      await updateDoc(roomRef, {
        invites: arrayUnion(friend.uid),
        [`inviteMeta.${friend.uid}`]: {
          senderId: auth.currentUser.uid,
          senderName: inviterName,
          invitedAt: serverTimestamp(),
        },
      });

      await addDoc(collection(db, 'notifications'), {
        userId: friend.uid,
        type: 'invite',
        title: 'Room Invite',
        message: `${inviterName} invited you to join "${room?.name || 'a room'}"`,
        roomId: id,
        createdAt: serverTimestamp(),
        read: false,
        senderId: auth.currentUser.uid,
      });

      setInviteFriends((prev) =>
        prev.map((f) => (f.uid === friend.uid ? { ...f, invited: true } : f))
      );
    } catch (e) {
      Alert.alert(t('error'), t('failedToSendInvite'));
    } finally {
      setInvitingId(null);
    }
  };

  if (!room) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
          <Text style={styles.loadingText}>{t('roomLoading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canAccessRoom) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <Text style={styles.privateRoomIcon}>🔒</Text>
          <Text style={styles.loadingText}>{t('privateRoom')}</Text>
          <Text style={styles.privateRoomSubtext}>{t('privateRoomSubtext')}</Text>
          <Pressable style={styles.privateRoomBackButton} onPress={() => router.back()}>
            <Text style={styles.privateRoomBackText}>{t('goBack')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentUid = auth.currentUser?.uid;

  const renderPersonCard = ({
    person,
    isHost = false,
    isSelf = false,
    onPress,
    rightAction,
  }) => {
    const isFriend = friendIdSet.has(person.uid);

    return (
      <View
        key={person.uid}
        style={[styles.personCard, isHost && styles.personCardHost]}
      >
        <Pressable
          style={styles.personCardMain}
          onPress={onPress}
          disabled={!onPress}
        >
          <PressableUserAvatar
            snapshot={{
              name: person.nickname || t('anonymous'),
              photoURL: person.photoURL || null,
            }}
            size={44}
            style={styles.personAvatar}
          />
          <View style={styles.personInfo}>
            <View style={styles.personNameRow}>
              <Text style={styles.personName}>{person.nickname || t('anonymous')}</Text>
              {isHost ? (
                <View style={styles.inlineTag}>
                  <Text style={styles.inlineTagText}>{t('hostTag')}</Text>
                </View>
              ) : null}
              {isSelf ? (
                <View style={[styles.inlineTag, styles.inlineTagYou]}>
                  <Text style={styles.inlineTagText}>{t('youTag')}</Text>
                </View>
              ) : null}
              {person.isOutTonight ? <View style={styles.liveDot} /> : null}
            </View>
            <View style={styles.personSubtitleRow}>
              {person.major ? (
                <>
                  <IconSchool size={14} color={colors.textMuted} />
                  <Text style={styles.personMajor}>{person.major}</Text>
                </>
              ) : null}
              {isFriend ? (
                <View style={styles.friendTag}>
                  <Text style={styles.friendTagText}>{t('friendTagLabel')}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        {rightAction}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButtonCircle} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>

          <View style={styles.topBarRight}>
            {isCreator ? (
              <Pressable style={styles.deleteIconButton} onPress={handleDeleteRoom}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            ) : null}
            {isParticipant ? (
              <Pressable style={styles.chatPill} onPress={() => setShowChat(true)}>
                {hasUnreadMessages ? <View style={styles.chatUnreadDot} /> : null}
                <IconMessageCircle size={18} color={colors.textPrimary} />
                <Text style={styles.chatPillText}>{t('chat')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Modal
          visible={showChat}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeChat}
        >
          <SafeAreaView style={styles.chatContainer} edges={['top']}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatRoomName} numberOfLines={1}>
                {room?.name || t('roomFallback')}
              </Text>
              <Pressable style={styles.closeChatButton} onPress={closeChat} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderChatMessage}
              contentContainerStyle={styles.flatListContent}
              style={styles.messagesFlatList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              onContentSizeChange={onContentSizeChange}
              onScrollToIndexFailed={onScrollToIndexFailed}
            />

            {replyingTo ? (
              <View style={styles.replyBar}>
                <View style={styles.replyBarContent}>
                  <Text style={styles.replyBarName}>{replyingTo.senderLabel}</Text>
                  <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.text}</Text>
                </View>
                <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.inputContainer, { paddingBottom: chatInputBottomPadding }]}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, isDisabled && styles.inputDisabled]}
                  placeholder={t('typeMessage')}
                  placeholderTextColor={colors.textMuted}
                  value={message}
                  onChangeText={setMessage}
                  multiline={false}
                  maxLength={500}
                  editable={!isDisabled}
                />
                <Pressable
                  style={[styles.sendButton, (message.trim() === '' || isDisabled) && styles.sendButtonDisabled]}
                  onPress={handleSendPress}
                  disabled={message.trim() === '' || isDisabled}
                >
                  <Ionicons name="send" size={20} color={isDisabled ? colors.textMuted : colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Modal>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>{room?.name || t('untitledRoom')}</Text>

            <View style={styles.metaPillRow}>
              <View style={styles.metaPill}>
                <IconCalendar size={15} color={colors.textSecondary} />
                <Text style={styles.metaPillText}>{formattedDate}</Text>
              </View>
              <View style={styles.metaPill}>
                <IconClock size={15} color={colors.textSecondary} />
                <Text style={styles.metaPillText}>{formattedTime}</Text>
              </View>
            </View>

            <View style={styles.locationRow}>
              <IconMapPin size={16} color={colors.accent} />
              <Text style={styles.locationText}>{getDisplayLocation()}</Text>
            </View>

            {room?.description ? (
              <View style={styles.descriptionBox}>
                <Text style={styles.descriptionText}>{room.description}</Text>
              </View>
            ) : null}
          </View>

          {/* Capacity */}
          <View style={styles.capacitySection}>
            <View style={styles.capacityHeader}>
              <Text style={styles.capacityLabel}>{t('participantsLabel')}</Text>
              <View style={styles.capacityBadge}>
                <Text style={styles.capacityBadgeText}>
                  {participants.length} / {room?.maxParticipants || 0}
                </Text>
              </View>
            </View>
            <View style={styles.capacityTrack}>
              <View
                style={[styles.capacityFill, { width: `${capacityFill * 100}%` }]}
              />
            </View>
          </View>

          {/* Participants */}
          <Text style={styles.sectionLabel}>{t('inTheRoom')}</Text>
          <View style={styles.cardsList}>
            {participants.length > 0 ? (
              participants.map((p) =>
                renderPersonCard({
                  person: p,
                  isHost: p.uid === room.createdBy,
                  isSelf: p.uid === currentUid,
                  onPress: () => handleUserProfileClick(p.uid),
                  rightAction:
                    isCreator && p.uid !== currentUid ? (
                      <Pressable
                        style={styles.kickButton}
                        onPress={() => handleKickParticipant(p)}
                      >
                        <Text style={styles.kickButtonText}>{t('removeParticipant')}</Text>
                      </Pressable>
                    ) : null,
                })
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{t('noParticipantsYet')}</Text>
              </View>
            )}
          </View>

          {/* Invite friends (participants only) */}
          {isParticipant && !isRoomFull ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{t('inviteFriendsSection')}</Text>
              <Text style={styles.inviteSubtext}>
                {t('inviteFriendsSubtext')}
              </Text>
              <View style={styles.cardsList}>
                {inviteFriends.length > 0 ? (
                  inviteFriends.map((friend) =>
                    renderPersonCard({
                      person: { ...friend, isOutTonight: false },
                      onPress: () => handleUserProfileClick(friend.uid),
                      rightAction: (
                        <Pressable
                          style={[
                            styles.inviteButton,
                            friend.invited && styles.inviteButtonDisabled,
                          ]}
                          disabled={friend.invited || invitingId === friend.uid}
                          onPress={() => handleInviteFriend(friend)}
                        >
                          {invitingId === friend.uid ? (
                            <ActivityIndicator size="small" color={colors.onAccent} />
                          ) : (
                            <Text
                              style={[
                                styles.inviteButtonText,
                                friend.invited && styles.inviteButtonTextDisabled,
                              ]}
                            >
                              {friend.invited ? t('invited') : t('invite')}
                            </Text>
                          )}
                        </Pressable>
                      ),
                    })
                  )
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t('noFriendsToInvite')}</Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {/* Join requests (host only) */}
          {isCreator ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{t('joinRequestsSection')}</Text>
              {joinRequests.length > 0 ? (
                <Pressable
                  style={styles.approveAllButton}
                  onPress={async () => {
                    for (const r of joinRequests) await handleApprove(r);
                  }}
                >
                  <Text style={styles.approveAllText}>{t('approveAll', { count: joinRequests.length })}</Text>
                </Pressable>
              ) : null}
              <View style={styles.cardsList}>
                {joinRequests.length > 0 ? (
                  joinRequests.map((r) =>
                    renderPersonCard({
                      person: { ...r, isOutTonight: false },
                      onPress: () => handleUserProfileClick(r.uid),
                      rightAction: (
                        <View style={styles.requestActions}>
                          <Pressable
                            style={[
                              styles.approveButton,
                              isRoomFull && styles.approveButtonDisabled,
                            ]}
                            disabled={isRoomFull}
                            onPress={() => handleApprove(r)}
                          >
                            <Ionicons name="checkmark" size={18} color={colors.white} />
                          </Pressable>
                          <Pressable
                            style={styles.declineButton}
                            onPress={() => handleDecline(r)}
                          >
                            <Ionicons name="close" size={18} color={colors.white} />
                          </Pressable>
                        </View>
                      ),
                    })
                  )
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t('noPendingRequests')}</Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {isParticipant && !isCreator ? (
            <View style={styles.section}>
              <Pressable style={styles.leaveRoomButton} onPress={handleLeaveRoom}>
                <Ionicons name="exit-outline" size={18} color={colors.white} />
                <Text style={styles.leaveRoomButtonText}>{t('leaveRoom')}</Text>
              </Pressable>
            </View>
          ) : null}

          {!isParticipant && !isCreator && canJoinRoom && (
            <View style={styles.section}>
              <View style={styles.joinPrompt}>
                <Text style={styles.joinPromptIcon}>🍻</Text>
                <Text style={styles.joinPromptText}>{t('wantToJoinRoom')}</Text>
                {room?.invites?.includes(currentUid) ? (
                  <Text style={styles.invitedHint}>{t('invitedToRoom')}</Text>
                ) : null}
                {hasRequestedJoin ? (
                  <View style={styles.pendingContainer}>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingText}>{t('pendingStatus')}</Text>
                    </View>
                    <Pressable style={styles.cancelRequestButton} onPress={handleCancelRequest}>
                      <Text style={styles.cancelRequestButtonText}>{t('cancelRequest')}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.joinButton} onPress={handleRequestJoin}>
                    <Text style={styles.joinButtonText}>{t('requestToJoin')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </ScrollView>

        <Modal
          visible={showUserProfile}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeUserProfile}
        >
          {selectedUserProfile ? (
            <UserProfile uid={selectedUserProfile} onClose={closeUserProfile} />
          ) : null}
        </Modal>

        <ReactionListModal
          visible={!!likesModalUserIds?.length}
          emoji="❤️"
          userIds={likesModalUserIds || []}
          onClose={() => setLikesModalUserIds(null)}
        />

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  loadingCard: { backgroundColor: colors.panel, padding: 32, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  loadingText: { color: colors.textPrimary, fontSize: 16, fontWeight: '500', marginTop: 16 },
  privateRoomIcon: { fontSize: 40 },
  privateRoomSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  privateRoomBackButton: {
    marginTop: 20,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  privateRoomBackText: {
    color: colors.onAccent,
    fontWeight: 'bold',
    fontSize: 15,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panelElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 57, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.25)',
  },
  chatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.panelElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    position: 'relative',
  },
  chatUnreadDot: {
    position: 'absolute',
    top: 6,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: colors.panelElevated,
  },
  chatPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 100 },

  // Hero
  heroSection: {
    marginTop: 4,
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  metaPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.panelElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  metaPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  descriptionBox: {
    backgroundColor: colors.panelElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  descriptionText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // Capacity
  capacitySection: {
    marginBottom: 28,
  },
  capacityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  capacityLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  capacityBadge: {
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  capacityBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  capacityTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.panelElevated,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },

  // Sections
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 8,
  },
  cardsList: {
    gap: 10,
    marginBottom: 24,
  },

  // Person cards
  personCard: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  personCardHost: {
    borderColor: colors.accent,
    backgroundColor: colors.panelSoft,
  },
  personCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  personAvatar: {
    marginRight: 12,
  },
  personInfo: {
    flex: 1,
  },
  personNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  inlineTag: {
    backgroundColor: colors.panelElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  inlineTagYou: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.accent,
  },
  inlineTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'lowercase',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  personSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  personMajor: {
    fontSize: 13,
    color: colors.textMuted,
  },
  friendTag: {
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  friendTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accentDark,
    textTransform: 'lowercase',
  },

  inviteSubtext: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  inviteButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  inviteButtonDisabled: {
    backgroundColor: colors.panelElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  inviteButtonText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  inviteButtonTextDisabled: {
    color: colors.textMuted,
  },
  invitedHint: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  kickButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 8,
  },
  kickButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  approveAllButton: {
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  approveAllText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: 'bold',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  approveButton: {
    backgroundColor: colors.accent,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButtonDisabled: {
    backgroundColor: colors.disabled,
    opacity: 0.6,
  },
  declineButton: {
    backgroundColor: colors.danger,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContainer: { flex: 1, backgroundColor: colors.background },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  chatRoomName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginRight: 12,
  },
  closeChatButton: { padding: 4 },
  messagesFlatList: { flex: 1, backgroundColor: colors.background },
  flatListContent: { paddingVertical: 12, paddingHorizontal: 16 },
  messageRowOuter: { marginBottom: 8, overflow: 'visible' },
  messageRowOuterMe: { alignItems: 'flex-end' },
  messageRowOuterHighlighted: {
    borderRadius: 12,
    backgroundColor: colors.panelElevated,
  },
  swipeableContainer: { overflow: 'visible' },
  swipeableChildContainer: { overflow: 'visible' },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
    maxWidth: '88%',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  chatMessageAvatar: {
    marginBottom: 2,
    width: 32,
    height: 32,
  },
  bubblePressable: { position: 'relative', overflow: 'visible', maxWidth: '75%' },
  bubblePressableWithLike: { paddingBottom: 12 },
  bubblePressableMe: { alignSelf: 'flex-end' },
  bubblePressableOther: { alignSelf: 'flex-start' },
  bubbleAlignEnd: { alignSelf: 'flex-end' },
  bubbleAlignStart: { alignSelf: 'flex-start' },
  messageBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  myMessageBubble: { backgroundColor: colors.panelElevated, borderBottomRightRadius: 4, borderWidth: 1, borderColor: colors.borderSoft },
  otherMessageBubble: { backgroundColor: colors.panel, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.borderSoft },
  senderName: { color: colors.iconPrimary, fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: colors.textPrimary },
  otherMessageText: { color: colors.textPrimary },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  myTimestamp: { color: colors.textMuted },
  otherTimestamp: { color: colors.textMuted },
  replyQuote: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  replyQuoteMe: {
    backgroundColor: colors.borderSoft,
    borderLeftColor: colors.accent,
  },
  replyQuoteOther: {
    backgroundColor: colors.panelElevated,
    borderLeftColor: colors.accent,
  },
  replyQuoteName: { fontSize: 11, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  replyQuoteText: { fontSize: 12, color: colors.textSecondary },
  likeBadge: {
    position: 'absolute',
    bottom: -6,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  likeBadgeMe: { right: 6 },
  likeBadgeOther: { left: 6 },
  likeBadgeEmoji: { fontSize: 13, lineHeight: 16 },
  likeBadgeCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginLeft: 3,
    lineHeight: 14,
  },
  swipeReplyContainer: {
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panelElevated,
    gap: 12,
  },
  replyBarContent: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 8,
  },
  replyBarName: { fontSize: 12, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  replyBarText: { fontSize: 13, color: colors.textSecondary },
  inputContainer: { backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  input: { flex: 1, backgroundColor: colors.panelElevated, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, color: colors.textPrimary, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: colors.borderSoft },
  inputDisabled: { opacity: 0.6 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: colors.panelSoft },
  section: { marginTop: 8 },
  leaveRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  leaveRoomButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  joinPrompt: { backgroundColor: colors.panelElevated, padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  joinPromptIcon: { fontSize: 32, marginBottom: 12 },
  joinPromptText: { color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  joinButton: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, minWidth: 180, alignItems: 'center' },
  joinButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: 'bold' },
  pendingContainer: { alignItems: 'center', gap: 12 },
  pendingBadge: { backgroundColor: colors.panelSoft, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.accent },
  pendingText: { color: colors.accentDark, fontSize: 14, fontWeight: 'bold' },
  cancelRequestButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelRequestButtonText: { color: colors.danger, fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  emptyState: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: colors.panelElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  emptyText: { color: colors.textMuted, fontSize: 14 },
});