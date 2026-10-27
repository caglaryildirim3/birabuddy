import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import LiveMapFab from '../components/LiveMapFab';
import LiveStatusDot from '../components/LiveStatusDot';
import UserProfile from '../components/UserProfile';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import {
  acceptFriendRequest,
  declineFriendRequest,
  getOtherUserId,
  markAllFriendRequestNotificationsRead,
  sendFriendRequest,
  unfriend,
} from '../utils/friendUtils';
import { blockUser } from '../utils/blockUtils';
import { isConversationUnread, subscribeToConversations } from '../utils/chatUtils';
import { submitUserReport } from '../utils/reportUtils';
import { getPublicUserData } from '../utils/userDocUtils';
import { isOutTonight } from '../utils/outTonightUtils';
import { formatUniversityDisplay, parseUniversityFromEmail } from '../utils/authUtils';
import { isDeletedUser } from '../utils/deletedUserUtils';
import { resolveFirstProfilePhotoUrl } from '../utils/photoUtils';
import { loadFriendSuggestions } from '../utils/friendSuggestionUtils';
import { getFriendNudgeErrorMessage, sendFriendNudge } from '../utils/friendNudgeUtils';
import TabBarIconWithDot from '../components/TabBarIconWithDot';
import { useNotificationIndicators } from '../contexts/NotificationContext';

async function fetchUserPreview(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { uid, name: 'Unknown', university: '', photoUrl: null };
  }
  const data = snap.data();
  if (isDeletedUser(data)) {
    return { uid, name: 'Deleted User', university: '', photoUrl: null, isOut: false, outNote: null };
  }
  const university = formatUniversityDisplay(
    data.university || parseUniversityFromEmail(data.email)
  );
  const photoUrl = await resolveFirstProfilePhotoUrl(uid, data.photos);
  return {
    uid,
    name: data.name || data.nickname || data.instagram || 'User',
    university,
    photoUrl,
    isOut: isOutTonight(data),
    outNote: data.outTonightNote || null,
  };
}

function Avatar({ user, size = 44, onPress, styles }) {
  const initial = (user.name || '?').charAt(0).toUpperCase();
  const radius = size / 2;

  const avatar = user.photoUrl ? (
    <Image
      source={{ uri: user.photoUrl }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
    />
  ) : (
    <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );

  if (!onPress) return avatar;

  return (
    <Pressable onPress={() => onPress(user.uid)} hitSlop={6}>
      {avatar}
    </Pressable>
  );
}

function FriendName({ name, isOut, showStatus = false, styles }) {
  return (
    <View style={styles.nameRow}>
      {showStatus ? <LiveStatusDot isLive={isOut} size={9} /> : null}
      <Text style={styles.listItemName}>{name}</Text>
    </View>
  );
}

const cleanInstagramHandle = (handle) => handle.replace(/[@\s]/g, '').toLowerCase();

export default function FriendsList() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { showChatsDot, showRequestsDot, markRequestsTabSeen } = useNotificationIndicators();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [segment, setSegment] = useState('friends');
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState(null);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [igSearch, setIgSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [chatPartners, setChatPartners] = useState({});
  const [chatsLoading, setChatsLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [menuFriend, setMenuFriend] = useState(null);
  const [reportFriend, setReportFriend] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [nudgeLoadingId, setNudgeLoadingId] = useState(null);
  const [suggestionRefreshSeed, setSuggestionRefreshSeed] = useState(0);
  const [suggestionsRefreshing, setSuggestionsRefreshing] = useState(false);

  useEffect(() => {
    if (!currentUid || segment !== 'requests') return;
    markRequestsTabSeen();
    markAllFriendRequestNotificationsRead(currentUid);
  }, [currentUid, segment, markRequestsTabSeen]);

  useEffect(() => {
    if (!currentUid || segment !== 'add') return undefined;

    let cancelled = false;
    setSuggestionsLoading(true);
    setSuggestionRefreshSeed(0);

    loadFriendSuggestions(currentUid, { locale: i18n.language, t })
      .then((rows) => {
        if (!cancelled) {
          setSuggestions(rows);
          setSuggestionsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUid, segment, i18n.language, t, friends.length, incoming.length, outgoing.length]);

  const handleRefreshSuggestions = async () => {
    if (!currentUid || suggestionsLoading || suggestionsRefreshing) return;

    const nextSeed = suggestionRefreshSeed + 1;
    setSuggestionRefreshSeed(nextSeed);
    setSuggestionsRefreshing(true);

    try {
      const rows = await loadFriendSuggestions(currentUid, {
        locale: i18n.language,
        t,
        refreshSeed: nextSeed,
        excludeUids: suggestions.map((user) => user.uid),
      });
      setSuggestions(rows);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsRefreshing(false);
    }
  };

  const handleSendFriendRequest = async (targetUid) => {
    if (!currentUid || actionLoadingId) return;

    setActionLoadingId(targetUid);
    try {
      await sendFriendRequest(currentUid, targetUid);
      setSuggestions((prev) => prev.filter((user) => user.uid !== targetUid));
      setSearchResults((prev) => prev.filter((user) => user.uid !== targetUid));
    } catch (error) {
      Alert.alert(t('error'), error.message || t('failedToSendFriendRequest'));
    } finally {
      setActionLoadingId(null);
    }
  };

  useEffect(() => {
    let unsub1 = null;
    let unsub2 = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (unsub1) unsub1();
      if (unsub2) unsub2();
      unsub1 = null;
      unsub2 = null;

      if (!user) {
        setCurrentUid(null);
        setFriends([]);
        setIncoming([]);
        setOutgoing([]);
        setLoading(false);
        return;
      }

      setCurrentUid(user.uid);
      setLoading(true);

      const processFriendships = async (docs, uid) => {
        const accepted = [];
        const incomingList = [];
        const outgoingList = [];

        for (const d of docs) {
          const data = { id: d.id, ...d.data() };
          const otherUid = getOtherUserId(data, uid);

          if (data.status === 'accepted') {
            const preview = await fetchUserPreview(otherUid);
            accepted.push({ ...preview, docId: data.id });
          } else if (data.status === 'pending') {
            const preview = await fetchUserPreview(otherUid);
            if (data.requestedBy === uid) {
              outgoingList.push({ ...preview, docId: data.id });
            } else {
              incomingList.push({ ...preview, docId: data.id });
            }
          }
        }

        return { accepted, incomingList, outgoingList };
      };

      let docs1 = [];
      let docs2 = [];

      const mergeAndUpdate = async () => {
        const allDocs = [...docs1, ...docs2];
        const unique = new Map();
        allDocs.forEach((d) => unique.set(d.id, d));

        const { accepted, incomingList, outgoingList } = await processFriendships(
          Array.from(unique.values()),
          user.uid
        );

        setFriends(accepted);
        setIncoming(incomingList);
        setOutgoing(outgoingList);
        setLoading(false);
      };

      unsub1 = onSnapshot(
        query(collection(db, 'friendships'), where('user1Id', '==', user.uid)),
        (snap) => {
          docs1 = snap.docs;
          mergeAndUpdate();
        }
      );

      unsub2 = onSnapshot(
        query(collection(db, 'friendships'), where('user2Id', '==', user.uid)),
        (snap) => {
          docs2 = snap.docs;
          mergeAndUpdate();
        }
      );
    });

    return () => {
      authUnsub();
      if (unsub1) unsub1();
      if (unsub2) unsub2();
    };
  }, []);

  useEffect(() => {
    if (!friends.length) return undefined;

    const unsubs = friends.map((friend) =>
      onSnapshot(doc(db, 'users', friend.uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setFriends((prev) =>
          prev.map((f) =>
            f.uid === friend.uid
              ? {
                  ...f,
                  isOut: isOutTonight(data),
                  outNote: data.outTonightNote || null,
                }
              : f
          )
        );
      })
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [friends.map((f) => f.uid).join(',')]);

  useEffect(() => {
    if (!currentUid) {
      setConversations([]);
      setChatsLoading(false);
      return undefined;
    }

    setChatsLoading(true);
    const unsub = subscribeToConversations(
      currentUid,
      (nextConversations) => {
        setConversations(nextConversations);
        setChatsLoading(false);
      },
      () => setChatsLoading(false)
    );

    return unsub;
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid || conversations.length === 0) {
      setChatPartners({});
      return undefined;
    }

    let cancelled = false;

    const loadPartners = async () => {
      const partners = {};
      await Promise.all(
        conversations.map(async (conv) => {
          const partnerUid = conv.user1Id === currentUid ? conv.user2Id : conv.user1Id;
          partners[conv.id] = await fetchUserPreview(partnerUid);
        })
      );
      if (!cancelled) setChatPartners(partners);
    };

    loadPartners();

    return () => {
      cancelled = true;
    };
  }, [conversations, currentUid]);

  const openChatWithFriend = (friend) => {
    router.push(`/friend-chat/${friend.uid}`);
  };

  const handleUnfriend = (item) => {
    setMenuFriend(null);
    Alert.alert(t('unfriend'), t('unfriendConfirmNamed', { name: item.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unfriendAction'),
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(item.docId);
          try {
            await unfriend(item.docId);
          } catch (error) {
            Alert.alert(t('error'), t('failedToUnfriend'));
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleBlockFriend = (item) => {
    setMenuFriend(null);
    Alert.alert(t('blockUser'), t('blockUserConfirm', { name: item.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('blockAction'),
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(item.docId);
          try {
            await blockUser(currentUid, item.uid);
          } catch (error) {
            Alert.alert(t('error'), t('failedToBlockUser'));
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleReportFriend = (item) => {
    setMenuFriend(null);
    setReportFriend(item);
    setReportReason('');
  };

  const submitFriendReport = async () => {
    if (!reportFriend || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      const userProfile = await getPublicUserData(reportFriend.uid);
      await submitUserReport({
        uid: reportFriend.uid,
        userProfile,
        reporterUserId: currentUid,
        reporterEmail: auth.currentUser?.email || null,
        reason: reportReason.trim(),
      });
      setReportFriend(null);
      setReportReason('');
      Alert.alert(t('reportSent'), t('reportSentMessage'));
    } catch (error) {
      Alert.alert(t('error'), t('failedToReport'));
    } finally {
      setReportLoading(false);
    }
  };

  const handleAccept = async (item) => {
    setActionLoadingId(item.docId);
    try {
      await acceptFriendRequest(item.docId);
    } catch (error) {
      Alert.alert(t('error'), t('failedToAcceptRequest'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (item) => {
    setActionLoadingId(item.docId);
    try {
      await declineFriendRequest(item.docId);
    } catch (error) {
      Alert.alert(t('error'), t('failedToDeclineFriendRequest'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelOutgoing = (item) => {
    Alert.alert(t('cancelFriendRequest'), t('cancelFriendRequestTo', { name: item.name }), [
      { text: t('keep'), style: 'cancel' },
      {
        text: t('cancel'),
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(item.docId);
          try {
            await declineFriendRequest(item.docId);
          } catch (error) {
            Alert.alert(t('error'), t('failedToCancelFriendRequest'));
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleNudgeFriend = async (friend) => {
    if (!currentUid || nudgeLoadingId) return;
    setNudgeLoadingId(friend.uid);
    try {
      await sendFriendNudge(friend.uid);
    } catch (error) {
      Alert.alert(t('error'), getFriendNudgeErrorMessage(error, t));
    } finally {
      setNudgeLoadingId(null);
    }
  };

  const renderFriend = ({ item }) => (
    <View style={styles.listItem}>
      <Pressable
        style={styles.listItemMain}
        onPress={() => setSelectedUid(item.uid)}
        onLongPress={() => handleUnfriend(item)}
      >
        <Avatar user={item} onPress={setSelectedUid} styles={styles} />
        <View style={styles.listItemContent}>
          <FriendName name={item.name} isOut={item.isOut} showStatus styles={styles} />
          {item.isOut && item.outNote ? (
            <Text style={styles.outNoteSub}>{item.outNote}</Text>
          ) : item.university ? (
            <Text style={styles.listItemSub}>{item.university}</Text>
          ) : null}
        </View>
      </Pressable>
      {actionLoadingId === item.docId ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <View style={styles.friendActions}>
          <Pressable
            style={styles.chatIconButton}
            onPress={() => handleNudgeFriend(item)}
            disabled={nudgeLoadingId === item.uid}
            hitSlop={8}
            accessibilityLabel={t('nudgeFriend')}
          >
            {nudgeLoadingId === item.uid ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.nudgeEmoji}>👉</Text>
            )}
          </Pressable>
          <Pressable style={styles.chatIconButton} onPress={() => openChatWithFriend(item)} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
          </Pressable>
          <Pressable style={styles.chatIconButton} onPress={() => setMenuFriend(item)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderChat = ({ item }) => {
    const partner = chatPartners[item.id];
    if (!partner) {
      return (
        <View style={styles.listItem}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      );
    }

    const isMe = item.lastSenderId === currentUid;
    const hasUnread = isConversationUnread(item, currentUid);
    const preview = item.lastMessage
      ? `${isMe ? 'You: ' : ''}${item.lastMessage}`
      : 'No messages yet';

    return (
      <Pressable style={styles.listItem} onPress={() => openChatWithFriend(partner)}>
        <Avatar user={partner} styles={styles} />
        <View style={styles.listItemContent}>
          <Text style={[styles.listItemName, hasUnread && styles.listItemNameUnread]}>
            {partner.name}
          </Text>
          <Text style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        {hasUnread ? (
          <View style={styles.chatUnreadDot} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        )}
      </Pressable>
    );
  };

  const renderIncoming = ({ item }) => (
    <View style={styles.listItem}>
      <Pressable style={styles.listItemMain} onPress={() => setSelectedUid(item.uid)}>
        <Avatar user={item} onPress={setSelectedUid} styles={styles} />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemName}>{item.name}</Text>
          {item.university ? (
            <Text style={styles.listItemSub}>{item.university}</Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.requestActions}>
        <Pressable
          style={styles.smallAcceptButton}
          onPress={() => handleAccept(item)}
          disabled={actionLoadingId === item.docId}
        >
          <Text style={styles.smallAcceptText}>{t('accept')}</Text>
        </Pressable>
        <Pressable
          style={styles.smallDeclineButton}
          onPress={() => handleDecline(item)}
          disabled={actionLoadingId === item.docId}
        >
          <Text style={styles.smallDeclineText}>{t('decline')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderOutgoing = ({ item }) => (
    <View style={styles.listItem}>
      <Pressable style={styles.listItemMain} onPress={() => setSelectedUid(item.uid)}>
        <Avatar user={item} onPress={setSelectedUid} styles={styles} />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemName}>{item.name}</Text>
          {item.university ? (
            <Text style={styles.listItemSub}>{item.university}</Text>
          ) : null}
          <Text style={styles.outgoingLabel}>{t('requestSent')}</Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.cancelButton}
        onPress={() => handleCancelOutgoing(item)}
        disabled={actionLoadingId === item.docId}
      >
        <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
      </Pressable>
    </View>
  );

  const handleIgSearch = async () => {
    const handle = cleanInstagramHandle(igSearch);
    if (!handle) {
      Alert.alert(t('error'), t('enterInstagramUsername'));
      return;
    }

    setSearching(true);
    setSearchResults([]);
    try {
      const q = query(collection(db, 'users'), where('instagram', '==', handle));
      const snap = await getDocs(q);
      const results = [];
      for (const d of snap.docs) {
        if (d.id === currentUid) continue;
        const preview = await fetchUserPreview(d.id);
        results.push(preview);
      }
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert(t('notFound'), t('userNotFoundInstagram', { handle }));
      }
    } catch (error) {
      Alert.alert(t('error'), t('searchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const renderAddFriend = () => (
    <ScrollView
      style={styles.addScroll}
      contentContainerStyle={styles.addSection}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.suggestionsTitleRow}>
        <Text style={styles.suggestionsTitle}>{t('suggestionPeopleToAdd')}</Text>
        <Pressable
          onPress={handleRefreshSuggestions}
          disabled={suggestionsLoading || suggestionsRefreshing}
          hitSlop={8}
          style={styles.suggestionsRefreshButton}
        >
          {suggestionsRefreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={20} color={colors.accent} />
          )}
        </Pressable>
      </View>
      {suggestionsLoading && suggestions.length === 0 ? (
        <View style={styles.suggestionsLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : suggestions.length > 0 ? (
        suggestions.map((user) => (
          <Pressable
            key={user.uid}
            style={styles.listItem}
            onPress={() => setSelectedUid(user.uid)}
          >
            <Avatar user={user} onPress={setSelectedUid} styles={styles} />
            <View style={styles.listItemContent}>
              <Text style={styles.listItemName}>{user.name}</Text>
              <Text style={styles.suggestionReason}>{user.reasonText}</Text>
            </View>
            <Pressable
              onPress={() => handleSendFriendRequest(user.uid)}
              disabled={actionLoadingId === user.uid}
              hitSlop={8}
              style={styles.addFriendButton}
            >
              {actionLoadingId === user.uid ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="person-add-outline" size={20} color={colors.accent} />
              )}
            </Pressable>
          </Pressable>
        ))
      ) : (
        <Text style={styles.suggestionsEmpty}>{t('suggestionPeopleEmpty')}</Text>
      )}

      <Text style={[styles.addTitle, styles.addTitleSpaced]}>{t('addByInstagram')}</Text>
      <Text style={styles.addSubtext}>{t('addByInstagramSub')}</Text>
      <View style={styles.searchRow}>
        <Text style={styles.atSign}>@</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="username"
          placeholderTextColor={colors.textMuted}
          value={igSearch}
          onChangeText={setIgSearch}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleIgSearch}
        />
        <Pressable
          style={[styles.searchButton, searching && styles.searchButtonDisabled]}
          onPress={handleIgSearch}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Text style={styles.searchButtonText}>{t('search')}</Text>
          )}
        </Pressable>
      </View>

      {searchResults.map((user) => (
        <Pressable
          key={user.uid}
          style={styles.listItem}
          onPress={() => setSelectedUid(user.uid)}
        >
          <Avatar user={user} onPress={setSelectedUid} styles={styles} />
          <View style={styles.listItemContent}>
            <Text style={styles.listItemName}>{user.name}</Text>
            <Text style={styles.listItemSub}>@{igSearch.replace(/[@\s]/g, '').toLowerCase()}</Text>
            {user.university ? (
              <Text style={styles.listItemSub}>{user.university}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => handleSendFriendRequest(user.uid)}
            disabled={actionLoadingId === user.uid}
            hitSlop={8}
            style={styles.addFriendButton}
          >
            {actionLoadingId === user.uid ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="person-add-outline" size={20} color={colors.accent} />
            )}
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderRequests = () => {
    if (incoming.length === 0 && outgoing.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('noPendingRequests')}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={[...incoming, ...outgoing]}
        keyExtractor={(item) => item.docId}
        renderItem={({ item }) =>
          incoming.some((r) => r.docId === item.docId)
            ? renderIncoming({ item })
            : renderOutgoing({ item })
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('friendsTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, segment === 'friends' && styles.segmentActive]}
          onPress={() => setSegment('friends')}
        >
          <Text style={[styles.segmentText, segment === 'friends' && styles.segmentTextActive]}>
            {t('friendsSegment')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'chats' && styles.segmentActive]}
          onPress={() => setSegment('chats')}
        >
          <View style={styles.segmentLabelRow}>
            <Text style={[styles.segmentText, segment === 'chats' && styles.segmentTextActive]}>
              {t('chatsSegment')}
            </Text>
            {showChatsDot ? (
              <View style={[styles.segmentDot, segment === 'chats' && styles.segmentDotActive]} />
            ) : null}
          </View>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'requests' && styles.segmentActive]}
          onPress={() => setSegment('requests')}
        >
          <View style={styles.segmentLabelRow}>
            <Text style={[styles.segmentText, segment === 'requests' && styles.segmentTextActive]}>
              {t('requestsSegment')}
            </Text>
            {showRequestsDot ? (
              <View style={[styles.segmentDot, segment === 'requests' && styles.segmentDotActive]} />
            ) : null}
          </View>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'add' && styles.segmentActive]}
          onPress={() => setSegment('add')}
        >
          <Text style={[styles.segmentText, segment === 'add' && styles.segmentTextActive]}>
            {t('addSegment')}
          </Text>
        </Pressable>
      </View>

      {loading && (segment === 'friends' || segment === 'requests') ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : chatsLoading && segment === 'chats' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : segment === 'add' ? (
        renderAddFriend()
      ) : segment === 'chats' ? (
        conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('noChatsYet')}</Text>
            <Text style={styles.emptySubText}>{t('messageFriendPrompt')}</Text>
            <Pressable style={styles.goAddButton} onPress={() => setSegment('friends')}>
              <Text style={styles.goAddButtonText}>{t('goToFriends')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={renderChat}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : segment === 'friends' ? (
        friends.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('noFriendsYet')}</Text>
            <Text style={styles.emptySubText}>{t('searchInstagramAdd')}</Text>
            <Pressable style={styles.goAddButton} onPress={() => setSegment('add')}>
              <Text style={styles.goAddButtonText}>{t('addFriends')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.uid}
            renderItem={renderFriend}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        renderRequests()
      )}

      <Modal
        visible={!!selectedUid}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedUid(null)}
      >
        {selectedUid ? (
          <UserProfile uid={selectedUid} onClose={() => setSelectedUid(null)} />
        ) : null}
      </Modal>

      <Modal
        visible={!!menuFriend}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setMenuFriend(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuFriend(null)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHandle} />
            <Pressable style={styles.menuOption} onPress={() => handleUnfriend(menuFriend)}>
              <Ionicons name="person-remove-outline" size={22} color={colors.danger} />
              <Text style={[styles.menuOptionText, { color: colors.danger }]}>{t('unfriendAction')}</Text>
            </Pressable>
            <Pressable style={styles.menuOption} onPress={() => handleBlockFriend(menuFriend)}>
              <Ionicons name="ban-outline" size={22} color={colors.danger} />
              <Text style={[styles.menuOptionText, { color: colors.danger }]}>{t('blockAction')}</Text>
            </Pressable>
            <Pressable style={styles.menuOption} onPress={() => handleReportFriend(menuFriend)}>
              <Ionicons name="flag-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.menuOptionText}>{t('reportUser')}</Text>
            </Pressable>
            <Pressable style={styles.menuCancel} onPress={() => setMenuFriend(null)}>
              <Text style={styles.menuCancelText}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!reportFriend}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReportFriend(null)}
      >
        <SafeAreaView style={styles.reportContainer} edges={['top', 'bottom']}>
          <View style={styles.reportHeader}>
            <Pressable onPress={() => setReportFriend(null)} hitSlop={8}>
              <Text style={styles.reportCancelLink}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.reportTitle}>{t('reportUser')}</Text>
            <Pressable
              onPress={submitFriendReport}
              disabled={!reportReason.trim() || reportLoading}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.reportSendLink,
                  (!reportReason.trim() || reportLoading) && styles.reportSendLinkDisabled,
                ]}
              >
                {t('send')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.reportSubtitle}>
            {reportFriend?.name}
          </Text>
          <TextInput
            style={styles.reportInput}
            placeholder={t('reportReasonPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={reportReason}
            onChangeText={setReportReason}
            multiline
            maxLength={500}
            autoFocus
          />
        </SafeAreaView>
      </Modal>

      <LiveMapFab />
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButton: {
    padding: 4,
  },
  headerSpacer: {
    width: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  listItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  listItemSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chatPreview: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  chatPreviewUnread: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  listItemNameUnread: {
    color: colors.textPrimary,
  },
  chatUnreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.notificationDot,
    marginLeft: 8,
  },
  segmentLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segmentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.notificationDot,
  },
  segmentDotActive: {
    backgroundColor: colors.onAccent,
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatIconButton: {
    padding: 8,
    marginLeft: 4,
  },
  nudgeEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: colors.overlayHeavy,
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  menuHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 20,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.panelElevated,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  menuOptionText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  menuCancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  menuCancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  reportContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  reportCancelLink: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  reportSendLink: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  reportSendLinkDisabled: {
    opacity: 0.4,
  },
  reportSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  reportInput: {
    flex: 1,
    margin: 16,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: colors.panelElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  outgoingLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  avatarPlaceholder: {
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.onAccent,
    fontWeight: 'bold',
  },
  outNoteSub: {
    fontSize: 13,
    color: '#2E7D32',
    marginTop: 2,
    fontWeight: '500',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallAcceptButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallAcceptText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  smallDeclineButton: {
    backgroundColor: colors.panelElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  smallDeclineText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: colors.panelElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  emptySubText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  addScroll: {
    flex: 1,
  },
  addSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  suggestionsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  suggestionsTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  suggestionsRefreshButton: {
    padding: 4,
    marginLeft: 8,
  },
  addFriendButton: {
    padding: 4,
  },
  suggestionsLoading: {
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionsEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  suggestionReason: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
    fontStyle: 'italic',
  },
  addTitleSpaced: {
    marginTop: 8,
  },
  addTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  addSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panelElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  atSign: {
    fontSize: 16,
    color: colors.textMuted,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
  },
  searchButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  searchButtonDisabled: {
    opacity: 0.7,
  },
  searchButtonText: {
    color: colors.onAccent,
    fontWeight: 'bold',
    fontSize: 14,
  },
  goAddButton: {
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  goAddButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
