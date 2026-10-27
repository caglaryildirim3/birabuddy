import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatAutoScroll } from '../hooks/useChatAutoScroll';
import { useScrollToChatMessage } from '../hooks/useScrollToChatMessage';
import PressableUserAvatar from './PressableUserAvatar';
import ReactionListModal from './ReactionListModal';
import UserProfile from './UserProfile';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import { getUserDisplayName } from '../utils/authUtils';
import { blockUser } from '../utils/blockUtils';
import {
  deleteMessageForEveryone,
  deleteMessageForMe,
  getConversationId,
  markConversationRead,
  sendFriendMessage,
  getNudgeMessageText,
  isNudgeMessage,
  resolveFriendChatScrollTargetId,
  subscribeToFriendMessages,
  toggleMessageLike,
} from '../utils/chatUtils';
import { getFriendshipDocId, getFriendshipStatus, unfriend } from '../utils/friendUtils';
import { submitUserReport } from '../utils/reportUtils';
import { REPORT_REASON_LIMIT } from '../utils/reportUtils';
import { getPublicUserData } from '../utils/userDocUtils';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { resolveFirstProfilePhotoUrl } from '../utils/photoUtils';
import { isFirestorePermissionDenied } from '../utils/firestoreListenerUtils';
import { markNudgeNotificationsReadFromSender } from '../utils/friendNudgeUtils';

const DOUBLE_TAP_MS = 300;
const CHAT_BUBBLE_MAX_WIDTH = Math.floor(Dimensions.get('window').width * 0.75) - 72;

export default function FriendChat({
  friendUid,
  friendName,
  friendPhotoUrl,
  onClose,
  initialScrollToMessageId = null,
  scrollToNudge = false,
  nudgeAtSeconds = null,
  messagePreview = null,
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid ?? null);
  const inputBottomPadding =
    keyboardHeight > 0 ? keyboardHeight + 8 : Math.max(insets.bottom, 12);

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [profileUid, setProfileUid] = useState(null);
  const [myDisplayName, setMyDisplayName] = useState(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState(null);
  const [resolvedFriendPhotoUrl, setResolvedFriendPhotoUrl] = useState(friendPhotoUrl || null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [likesModalUserIds, setLikesModalUserIds] = useState(null);

  const conversationIdRef = useRef(null);
  const flatListRef = useRef(null);
  const [pendingScrollTargetId, setPendingScrollTargetId] = useState(initialScrollToMessageId);
  const friendDisplayName = friendName || 'Friend';
  const wantsTargetScroll = Boolean(initialScrollToMessageId || scrollToNudge || messagePreview);
  const swipeableRefs = useRef({});
  const lastTapRef = useRef({});
  const hasScrolledToTargetRef = useRef(false);
  const messagesUnsubRef = useRef(null);
  const handleTargetScrolled = useCallback(() => {
    hasScrolledToTargetRef.current = true;
    setPendingScrollTargetId(null);
  }, []);
  const { scrollToEnd, onContentSizeChange: onAutoScrollContentSizeChange, onScrollToIndexFailed: onAutoScrollToIndexFailed } = useChatAutoScroll(
    flatListRef,
    messages,
    {
      enabled: !loading && !wantsTargetScroll,
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
      if (!user) onClose?.();
    });
    return unsub;
  }, [onClose]);

  useEffect(() => {
    if (!currentUid) return undefined;
    let cancelled = false;
    const loadMyProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', currentUid));
        if (!snap.exists() || cancelled) return;
        const data = snap.data();
        setMyDisplayName(getUserDisplayName(data, auth.currentUser?.email));
        setMyPhotoUrl(await resolveFirstProfilePhotoUrl(currentUid, data.photos));
      } catch {}
    };
    loadMyProfile();
    return () => { cancelled = true; };
  }, [currentUid]);

  useEffect(() => {
    if (!friendUid) return undefined;
    let cancelled = false;

    const loadFriendPhoto = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', friendUid));
        if (!snap.exists() || cancelled) return;
        const photoUrl = await resolveFirstProfilePhotoUrl(friendUid, snap.data().photos);
        if (!cancelled) setResolvedFriendPhotoUrl(photoUrl);
      } catch {
        if (!cancelled) setResolvedFriendPhotoUrl(friendPhotoUrl || null);
      }
    };

    loadFriendPhoto();
    return () => { cancelled = true; };
  }, [friendUid, friendPhotoUrl]);

  useEffect(() => {
    if (!currentUid || !friendUid) return undefined;
    markNudgeNotificationsReadFromSender(currentUid, friendUid).catch(() => {});
    return undefined;
  }, [currentUid, friendUid]);

  useEffect(() => {
    setPendingScrollTargetId(initialScrollToMessageId);
    hasScrolledToTargetRef.current = false;
  }, [initialScrollToMessageId, friendUid]);

  useEffect(() => {
    if (!currentUid || !friendUid) return undefined;
    let cancelled = false;

    const init = async () => {
      try {
        const conversationId = getConversationId(currentUid, friendUid);
        conversationIdRef.current = conversationId;
        const status = await getFriendshipStatus(currentUid, friendUid);
        if (cancelled) return;
        const isFriend = status === 'friends';
        setCanSend(isFriend);
        if (isFriend) {
          await markConversationRead(conversationId, currentUid);
        }
        if (cancelled) return;
        messagesUnsubRef.current = subscribeToFriendMessages(
          conversationId,
          (nextMessages) => {
            if (cancelled) return;
            setMessages(nextMessages.filter((m) => !m.deletedFor?.includes(currentUid)));
            setLoading(false);
          },
          (error) => {
            if (cancelled || isFirestorePermissionDenied(error)) return;
            console.error('Friend chat listener error:', error);
            setLoading(false);
          }
        );
      } catch (error) {
        if (cancelled || isFirestorePermissionDenied(error)) return;
        console.error('Friend chat init error:', error);
        setCanSend(false);
        setLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
      messagesUnsubRef.current?.();
      messagesUnsubRef.current = null;
    };
  }, [currentUid, friendUid]);

  useEffect(() => {
    if (!wantsTargetScroll || loading || messages.length === 0 || hasScrolledToTargetRef.current) {
      return;
    }

    const targetId = resolveFriendChatScrollTargetId(messages, {
      chatMessageId: pendingScrollTargetId || initialScrollToMessageId,
      scrollToNudge,
      messagePreview,
      senderId: friendUid,
      createdAtSeconds: nudgeAtSeconds,
    });

    if (!targetId) return;

    requestAnimationFrame(() => {
      scrollToMessage(targetId);
    });
  }, [
    wantsTargetScroll,
    loading,
    messages,
    pendingScrollTargetId,
    initialScrollToMessageId,
    scrollToNudge,
    messagePreview,
    friendUid,
    nudgeAtSeconds,
    scrollToMessage,
  ]);

  useEffect(() => {
    if (keyboardHeight > 0 && messages.length > 0 && !wantsTargetScroll) {
      scrollToEnd(true);
    }
  }, [keyboardHeight, messages.length, scrollToEnd, wantsTargetScroll]);

  useEffect(() => {
    if (!currentUid || !canSend || !conversationIdRef.current) return undefined;
    markConversationRead(conversationIdRef.current, currentUid).catch(() => {});
    return undefined;
  }, [currentUid, canSend, messages.length]);

  const chatUserSnapshots = useMemo(() => {
    const snapshots = {};
    if (friendUid) snapshots[friendUid] = { name: friendDisplayName, photoURL: resolvedFriendPhotoUrl || null };
    if (currentUid) snapshots[currentUid] = { name: myDisplayName || 'You', photoURL: myPhotoUrl || null };
    return snapshots;
  }, [friendUid, friendDisplayName, resolvedFriendPhotoUrl, currentUid, myDisplayName, myPhotoUrl]);

  const getSenderLabel = (item) => {
    if (item.senderId === friendUid) return friendDisplayName;
    if (item.senderId === currentUid) return myDisplayName || 'You';
    return item.senderName || 'User';
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || !currentUid || !canSend || sending) return;
    setSending(true);

    const senderName = myDisplayName || 'You';
    const optimisticId = `local-${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      text: trimmed,
      senderId: currentUid,
      senderName,
      createdAt: { toDate: () => new Date() },
      replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderLabel: replyingTo.senderLabel } : null,
      likes: [],
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setMessage('');
    setReplyingTo(null);
    scrollToEnd(true);

    try {
      await sendFriendMessage({
        currentUid,
        friendUid,
        text: trimmed,
        senderName,
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderLabel: replyingTo.senderLabel } : null,
      });
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      Alert.alert(t('error'), error.message || t('failedToSendMessage'));
    } finally {
      setSending(false);
    }
  };

  const handleDoubleTap = (item) => {
    const now = Date.now();
    const last = lastTapRef.current[item.id] || 0;
    if (now - last < DOUBLE_TAP_MS) {
      handleToggleLike(item);
    }
    lastTapRef.current[item.id] = now;
  };

  const handleToggleLike = async (item) => {
    if (!currentUid || !conversationIdRef.current || item.id.startsWith('local-')) return;
    if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await toggleMessageLike(conversationIdRef.current, item.id, currentUid);
    } catch {}
  };

  const handleLongPress = (item) => {
    if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isMe = item.senderId === currentUid;
    const options = [];

    if (isMe) {
      options.push({
        text: t('deleteForEveryone'),
        style: 'destructive',
        onPress: () => confirmDelete(item, true),
      });
    }
    options.push({
      text: t('deleteForMe'),
      style: 'destructive',
      onPress: () => confirmDelete(item, false),
    });
    options.push({ text: t('cancel'), style: 'cancel' });

    Alert.alert(t('messageOptions'), undefined, options);
  };

  const confirmDelete = (item, forEveryone) => {
    if (!conversationIdRef.current || item.id.startsWith('local-')) return;
    if (forEveryone) {
      deleteMessageForEveryone(conversationIdRef.current, item.id).catch(() => {});
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== item.id));
      deleteMessageForMe(conversationIdRef.current, item.id, currentUid).catch(() => {});
    }
  };

  const handleSwipeReply = (item) => {
    if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplyingTo({
      id: item.id,
      text: item.text,
      senderLabel: getSenderLabel(item),
    });
    swipeableRefs.current[item.id]?.close();
  };

  const handleUnfriend = () => {
    setMenuVisible(false);
    const docId = getFriendshipDocId(currentUid, friendUid);
    Alert.alert(t('unfriend'), t('unfriendConfirmNamed', { name: friendDisplayName }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unfriendAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            await unfriend(docId);
            onClose?.();
          } catch {
            Alert.alert(t('error'), t('failedToUnfriend'));
          }
        },
      },
    ]);
  };

  const handleBlock = () => {
    setMenuVisible(false);
    Alert.alert(t('blockUser'), t('blockUserConfirm', { name: friendDisplayName }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('blockAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(currentUid, friendUid);
            onClose?.();
          } catch {
            Alert.alert(t('error'), t('failedToBlockUser'));
          }
        },
      },
    ]);
  };

  const handleReport = () => {
    setMenuVisible(false);
    setReportReason('');
    setReportVisible(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim()) return;
    setReportLoading(true);
    try {
      const userProfile = await getPublicUserData(friendUid);
      const reporterEmail = auth.currentUser?.email || null;
      await submitUserReport({
        uid: friendUid,
        userProfile,
        reporterUserId: currentUid,
        reporterEmail,
        reason: reportReason.trim(),
      });
      setReportVisible(false);
      Alert.alert(t('reportSent'), t('reportSentMessage'));
    } catch {
      Alert.alert(t('error'), t('failedToReport'));
    } finally {
      setReportLoading(false);
    }
  };

  const renderSwipeAction = (item) => (
    <View style={styles.swipeReplyContainer}>
      <Ionicons name="return-up-forward-outline" size={22} color={colors.accent} />
    </View>
  );

  const renderMessage = ({ item }) => {
    if (isNudgeMessage(item)) {
      return (
        <View
          style={[
            styles.nudgeMessageRow,
            item.id === highlightedMessageId ? styles.messageRowOuterHighlighted : null,
          ]}
        >
          <Text style={styles.nudgeMessageText}>
            {getNudgeMessageText(item, currentUid, friendDisplayName, t)}
          </Text>
        </View>
      );
    }

    const isMe = item.senderId === currentUid;
    const snapshot = chatUserSnapshots[item.senderId] || { name: getSenderLabel(item), photoURL: null };
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
        <Pressable
          onPress={() => handleDoubleTap(item)}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={400}
        >
          <View
            style={[
              styles.bubble,
              isMe ? styles.myBubble : styles.otherBubble,
              isMe ? styles.bubbleAlignEnd : styles.bubbleAlignStart,
            ]}
          >
            {!isMe ? <Text style={styles.senderName}>{getSenderLabel(item)}</Text> : null}

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
        uid={item.senderId}
        snapshot={snapshot}
        size={32}
        onPress={() => setProfileUid(item.senderId)}
        style={styles.messageAvatar}
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
          renderLeftActions={() => renderSwipeAction(item)}
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

  return (
    <>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Pressable style={styles.headerMain} onPress={() => setProfileUid(friendUid)}>
            <PressableUserAvatar
              uid={friendUid}
              snapshot={{ name: friendDisplayName, photoURL: resolvedFriendPhotoUrl || null }}
              size={40}
            />
            <Text style={styles.headerName}>{friendDisplayName}</Text>
          </Pressable>
          <Pressable style={styles.menuButton} onPress={() => setMenuVisible(true)} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Messages */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <View style={styles.chatBody}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              style={styles.messagesFlatList}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              onContentSizeChange={onContentSizeChange}
              onScrollToIndexFailed={onScrollToIndexFailed}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <Text style={styles.emptyText}>{t('chatSayHi', { name: friendDisplayName })}</Text>
                </View>
              }
            />

            {/* Reply preview bar */}
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

            {/* Input */}
            <View style={[styles.inputRow, { paddingBottom: inputBottomPadding }]}>
              <TextInput
                style={[styles.input, !canSend && styles.inputDisabled]}
                placeholder={canSend ? t('chatPlaceholder') : t('chatFriendsOnly')}
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
                editable={canSend}
              />
              <Pressable
                style={[styles.sendButton, (!canSend || !message.trim() || sending) && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!canSend || !message.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Ionicons name="send" size={18} color={colors.onAccent} />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* 3-dot menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Pressable style={styles.sheetOption} onPress={handleUnfriend}>
              <Ionicons name="person-remove-outline" size={22} color={colors.danger} />
              <Text style={[styles.sheetOptionText, { color: colors.danger }]}>{t('unfriendAction')}</Text>
            </Pressable>
            <Pressable style={styles.sheetOption} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={22} color={colors.danger} />
              <Text style={[styles.sheetOptionText, { color: colors.danger }]}>{t('blockAction')}</Text>
            </Pressable>
            <Pressable style={styles.sheetOption} onPress={handleReport}>
              <Ionicons name="flag-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.sheetOptionText}>{t('reportUser')}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setMenuVisible(false)}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report modal */}
      <Modal
        visible={reportVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReportVisible(false)}
      >
        <SafeAreaView style={styles.reportContainer} edges={['top', 'bottom']}>
          <View style={styles.reportHeader}>
            <Pressable onPress={() => setReportVisible(false)}>
              <Text style={styles.reportCancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.reportTitle}>{t('reportUser')}</Text>
            <Pressable onPress={submitReport} disabled={!reportReason.trim() || reportLoading}>
              {reportLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.reportSubmit, !reportReason.trim() && styles.reportSubmitDisabled]}>
                  {t('send')}
                </Text>
              )}
            </Pressable>
          </View>
          <TextInput
            style={styles.reportInput}
            placeholder={t('reportReasonPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={reportReason}
            onChangeText={setReportReason}
            multiline
            maxLength={REPORT_REASON_LIMIT}
            autoFocus
          />
          <Text style={styles.reportCounter}>{reportReason.length}/{REPORT_REASON_LIMIT}</Text>
        </SafeAreaView>
      </Modal>

      {/* Profile modal */}
      <Modal visible={!!profileUid} animationType="slide" presentationStyle="pageSheet">
        {profileUid ? <UserProfile uid={profileUid} onClose={() => setProfileUid(null)} /> : null}
      </Modal>

      <ReactionListModal
        visible={!!likesModalUserIds?.length}
        emoji="❤️"
        userIds={likesModalUserIds || []}
        onClose={() => setLikesModalUserIds(null)}
      />
    </>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: { marginRight: 8, padding: 4 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', flex: 1 },
  menuButton: { padding: 4, marginLeft: 8 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatBody: { flex: 1 },
  messagesFlatList: { flex: 1 },
  messagesList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 15 },

  nudgeMessageRow: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  nudgeMessageText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textMuted,
    textAlign: 'center',
  },

  swipeableContainer: { width: '100%', overflow: 'visible' },
  swipeableChildContainer: { width: '100%', overflow: 'visible' },
  messageRowOuter: { marginBottom: 8, width: '100%', alignSelf: 'stretch', overflow: 'visible' },
  messageRowOuterMe: {},
  messageRowOuterHighlighted: {
    borderRadius: 12,
    backgroundColor: colors.panelElevated,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: 4,
    backgroundColor: colors.background,
    width: '100%',
    alignSelf: 'stretch',
  },
  messageRowMe: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  messageAvatar: { marginBottom: 18, flexShrink: 0 },

  bubblePressable: {
    maxWidth: CHAT_BUBBLE_MAX_WIDTH,
    flexShrink: 0,
    position: 'relative',
    overflow: 'visible',
  },
  bubblePressableMe: { alignSelf: 'flex-end' },
  bubblePressableOther: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleAlignEnd: { alignSelf: 'flex-end' },
  bubbleAlignStart: { alignSelf: 'flex-start' },
  myBubble: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  otherBubble: {
    backgroundColor: colors.panelElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  senderName: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: colors.onAccent },
  otherMessageText: { color: colors.textPrimary },
  timestamp: { fontSize: 10, marginTop: 5 },
  myTimestamp: { color: 'rgba(0,0,0,0.4)', textAlign: 'right' },
  otherTimestamp: { color: colors.textMuted },

  replyQuote: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    borderLeftWidth: 3,
  },
  replyQuoteMe: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderLeftColor: 'rgba(0,0,0,0.35)',
  },
  replyQuoteOther: {
    backgroundColor: colors.borderSoft,
    borderLeftColor: colors.accent,
  },
  replyQuoteName: { fontSize: 11, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  replyQuoteText: { fontSize: 12, color: colors.textSecondary },

  bubblePressableWithLike: { paddingBottom: 12 },
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
  replyBarContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 8 },
  replyBarName: { fontSize: 12, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  replyBarText: { fontSize: 13, color: colors.textSecondary },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: colors.panelElevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  inputDisabled: {
    opacity: 0.65,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.45 },

  overlay: { flex: 1, backgroundColor: colors.overlayHeavy, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.panelElevated,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18,
    marginBottom: 10, borderWidth: 1, borderColor: colors.borderSoft,
  },
  sheetOptionText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  cancelButton: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },

  reportContainer: { flex: 1, backgroundColor: colors.background },
  reportHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  reportTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  reportCancel: { fontSize: 16, color: colors.textSecondary },
  reportSubmit: { fontSize: 16, fontWeight: '700', color: colors.accent },
  reportSubmitDisabled: { opacity: 0.4 },
  reportInput: {
    flex: 1, margin: 16, padding: 14, fontSize: 15,
    color: colors.textPrimary, textAlignVertical: 'top',
    backgroundColor: colors.panelElevated, borderRadius: 12,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  reportCounter: {
    textAlign: 'right', marginRight: 16, marginBottom: 8,
    fontSize: 12, color: colors.textMuted,
  },
});
