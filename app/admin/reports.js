import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { auth, db } from '../../firebase/firebaseConfig';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { formatRelativeTime } from '../../utils/dateUtils';
import {
  applyReportPunishment,
  formatModerationDate,
  getReportedUserModerationInfo,
  hasPriorPunishments,
  PUNISHMENT,
  summarizePunishmentHistory,
} from '../../utils/moderationUtils';
import {
  fetchReportedPostComments,
  fetchReportedUserChats,
  fetchReportedUserCreatedRooms,
  fetchReportedUserPosts,
  fetchAllReportCountsByReportedUser,
} from '../../utils/adminReportReviewUtils';
import { isPersistablePhotoUrl, normalizePhotos } from '../../utils/photoUtils';
import { REPORT_STATUS, REPORT_TYPES } from '../../utils/reportUtils';

function collectProfilePhotoUrls(report, userInfo) {
  const urls = [];
  const seen = new Set();
  const add = (url) => {
    if (isPersistablePhotoUrl(url) && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };
  const addArr = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(add);
  };

  addArr(report.userSnapshot?.photos);
  add(report.userSnapshot?.photoURL);
  add(report.postSnapshot?.userSnapshot?.photoURL);
  addArr(userInfo?.photos);
  return urls;
}

export default function AdminReportsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isAdmin, checking } = useIsAdmin();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPostsUid, setExpandedPostsUid] = useState(null);
  const [expandedChatsUid, setExpandedChatsUid] = useState(null);
  const [userPostsByUid, setUserPostsByUid] = useState({});
  const [userChatsByUid, setUserChatsByUid] = useState({});
  const [loadingPostsUid, setLoadingPostsUid] = useState(null);
  const [loadingChatsUid, setLoadingChatsUid] = useState(null);
  const [userInfoByUid, setUserInfoByUid] = useState({});
  const [userRoomsByUid, setUserRoomsByUid] = useState({});
  const [reportCountByUid, setReportCountByUid] = useState({});
  const [postCommentsByPostId, setPostCommentsByPostId] = useState({});
  const [punishingId, setPunishingId] = useState(null);

  const postSnapshotByPostId = useMemo(() => {
    const map = {};
    reports.forEach((report) => {
      if (report.type === REPORT_TYPES.POST && report.postId && report.postSnapshot) {
        map[report.postId] = report.postSnapshot;
      }
    });
    return map;
  }, [reports]);

  useEffect(() => {
    if (checking) return;
    if (!isAdmin) {
      setLoading(false);
      return undefined;
    }

    const q = query(collection(db, 'reports'), where('status', '==', REPORT_STATUS.PENDING));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setReports(items);
        setLoading(false);
      },
      (error) => {
        console.error('Admin reports listener failed:', error);
        setLoading(false);
        Alert.alert(t('error'), t('adminReportsLoadFailed'));
      }
    );

    return unsub;
  }, [checking, isAdmin]);

  useEffect(() => {
    if (!isAdmin || reports.length === 0) return undefined;

    const uids = new Set();
    const reportedUids = new Set();
    const postIds = new Set();
    reports.forEach((report) => {
      if (report.reportedUserId) {
        uids.add(report.reportedUserId);
        reportedUids.add(report.reportedUserId);
      }
      if (report.reporterUserId) uids.add(report.reporterUserId);
      if (report.type === REPORT_TYPES.POST && report.postId) {
        postIds.add(report.postId);
      }
    });

    let cancelled = false;

    Promise.all([
      Promise.all(
        [...uids].map(async (uid) => {
          try {
            const [pubSnap, privSnap] = await Promise.all([
              getDoc(doc(db, 'users', uid)),
              getDoc(doc(db, 'users', uid, 'private', 'account')),
            ]);
            const pubData = pubSnap.exists() ? pubSnap.data() : null;
            const privData = privSnap.exists() ? privSnap.data() : null;
            return {
              uid,
              email: typeof privData?.email === 'string' ? privData.email : null,
              moderation: getReportedUserModerationInfo(privData),
              photos: normalizePhotos(pubData?.photos).filter(isPersistablePhotoUrl),
              bio: typeof pubData?.bio === 'string' ? pubData.bio.trim() : '',
            };
          } catch {
            return { uid, email: null, moderation: null, photos: [], bio: '' };
          }
        })
      ),
      Promise.all(
        [...reportedUids].map(async (uid) => {
          try {
            const rooms = await fetchReportedUserCreatedRooms(uid);
            return { uid, rooms };
          } catch {
            return { uid, rooms: [] };
          }
        })
      ),
      fetchAllReportCountsByReportedUser().catch(() => ({})),
      Promise.all(
        [...postIds].map(async (postId) => {
          try {
            const comments = await fetchReportedPostComments(postId);
            return { postId, comments };
          } catch {
            return { postId, comments: [] };
          }
        })
      ),
    ]).then(([userRows, roomRows, firestoreReportCounts, commentRows]) => {
      if (cancelled) return;
      const nextUserInfo = {};
      userRows.forEach((row) => {
        nextUserInfo[row.uid] = {
          email: row.email,
          moderation: row.moderation,
          photos: row.photos,
          bio: row.bio,
        };
      });
      const nextRooms = {};
      roomRows.forEach((row) => {
        nextRooms[row.uid] = row.rooms;
      });
      const nextReportCounts = { ...firestoreReportCounts };
      const pendingCounts = {};
      reports.forEach((report) => {
        if (!report.reportedUserId) return;
        pendingCounts[report.reportedUserId] = (pendingCounts[report.reportedUserId] || 0) + 1;
      });
      Object.entries(pendingCounts).forEach(([uid, pendingCount]) => {
        nextReportCounts[uid] = Math.max(nextReportCounts[uid] || 0, pendingCount);
      });
      const nextComments = {};
      commentRows.forEach((row) => {
        nextComments[row.postId] = row.comments;
      });
      setUserInfoByUid(nextUserInfo);
      setUserRoomsByUid(nextRooms);
      setReportCountByUid(nextReportCounts);
      setPostCommentsByPostId(nextComments);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, reports]);

  const displayEmail = (storedEmail, uid) => {
    if (storedEmail) return storedEmail;
    if (uid && userInfoByUid[uid]?.email) return userInfoByUid[uid].email;
    return uid || '—';
  };

  const renderModerationHistory = (uid) => {
    const moderation = userInfoByUid[uid]?.moderation;
    if (!moderation) return null;

    const { activeBlock, punishmentHistory } = moderation;
    const prior = hasPriorPunishments(punishmentHistory);
    if (!activeBlock && !prior) return null;

    const counts = summarizePunishmentHistory(punishmentHistory);
    const historyParts = [];
    if (counts.ban > 0) {
      historyParts.push(t('adminModHistoryBan', { count: counts.ban }));
    }
    if (counts.suspend_7 > 0) {
      historyParts.push(t('adminModHistorySuspend7', { count: counts.suspend_7 }));
    }
    if (counts.suspend_30 > 0) {
      historyParts.push(t('adminModHistorySuspend30', { count: counts.suspend_30 }));
    }

    return (
      <View style={styles.modWarningBox}>
        {activeBlock?.reason === 'banned' ? (
          <Text style={styles.modWarningActive}>{t('adminModCurrentlyBanned')}</Text>
        ) : null}
        {activeBlock?.reason === 'suspended' ? (
          <Text style={styles.modWarningActive}>
            {t('adminModCurrentlySuspended', {
              date: formatModerationDate(moderation.suspendedUntil),
            })}
          </Text>
        ) : null}
        {prior ? (
          <Text style={styles.modWarningHistory}>
            {t('adminModPriorPunishments', { summary: historyParts.join(' · ') })}
          </Text>
        ) : null}
      </View>
    );
  };

  const toggleUserPosts = async (uid) => {
    if (!uid) return;
    if (expandedPostsUid === uid) {
      setExpandedPostsUid(null);
      return;
    }

    setExpandedPostsUid(uid);
    setLoadingPostsUid(uid);
    try {
      const posts = await fetchReportedUserPosts(uid);
      setUserPostsByUid((prev) => ({ ...prev, [uid]: posts }));
    } catch (error) {
      console.error('Admin posts load failed:', error);
      setUserPostsByUid((prev) => ({ ...prev, [uid]: [] }));
      Alert.alert(t('error'), t('adminLoadPostsFailed'));
    } finally {
      setLoadingPostsUid(null);
    }
  };

  const toggleUserChats = async (uid) => {
    if (!uid) return;
    if (expandedChatsUid === uid) {
      setExpandedChatsUid(null);
      return;
    }

    setExpandedChatsUid(uid);
    setLoadingChatsUid(uid);
    try {
      const chats = await fetchReportedUserChats(uid);
      setUserChatsByUid((prev) => ({ ...prev, [uid]: chats }));
    } catch (error) {
      console.error('Admin chats load failed:', error);
      setUserChatsByUid((prev) => ({ ...prev, [uid]: [] }));
      Alert.alert(t('error'), t('adminLoadChatsFailed'));
    } finally {
      setLoadingChatsUid(null);
    }
  };

  const renderDualPostPhotos = (photoURL, selfiePhotoURL) => {
    if (!photoURL && !selfiePhotoURL) return null;
    return (
      <View style={styles.snapshotPhotos}>
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={styles.snapshotImage} contentFit="cover" />
        ) : null}
        {selfiePhotoURL ? (
          <View style={styles.snapshotSelfieWrap}>
            <Image source={{ uri: selfiePhotoURL }} style={styles.snapshotSelfie} contentFit="cover" />
          </View>
        ) : null}
      </View>
    );
  };

  const renderProfilePhotoGrid = (urls) => {
    if (!urls.length) return null;
    return (
      <View style={styles.profilePhotoGrid}>
        {urls.map((uri, index) => (
          <Image
            key={`${uri}-${index}`}
            source={{ uri }}
            style={styles.profilePhotoThumb}
            contentFit="cover"
          />
        ))}
      </View>
    );
  };

  const renderUserPosts = (uid) => {
    if (expandedPostsUid !== uid) return null;
    const posts = userPostsByUid[uid];

    if (loadingPostsUid === uid) {
      return <ActivityIndicator color={colors.accent} style={styles.postsLoader} />;
    }

    return (
      <View style={styles.postsList}>
        {!posts || posts.length === 0 ? (
          <Text style={styles.snapshotMeta}>{t('adminNoPosts')}</Text>
        ) : (
          posts.map((post) => {
            const fallback = postSnapshotByPostId[post.id];
            const photoURL = post.photoURL || fallback?.photoURL || null;
            const selfiePhotoURL = post.selfiePhotoURL || fallback?.selfiePhotoURL || null;
            const postText = (post.text || fallback?.text || '').trim();

            return (
              <View
                key={post.id}
                style={[styles.postItem, post.isDeleted && styles.postItemDeleted]}
              >
                {post.isDeleted ? (
                  <Text style={styles.deletedBadge}>{t('adminPostDeleted')}</Text>
                ) : null}
                <Text style={styles.photoSectionLabel}>{t('adminPostText')}</Text>
                <Text style={styles.snapshotText}>
                  {postText || t('adminNoPostText')}
                </Text>
                {renderDualPostPhotos(photoURL, selfiePhotoURL)}
                {post.venueTag ? (
                  <Text style={styles.snapshotMeta}>📍 {post.venueTag}</Text>
                ) : null}
                <Text style={styles.snapshotMeta}>
                  {formatRelativeTime(post.createdAt)}
                  {post.isDeleted && post.deletedAt
                    ? ` · ${t('adminPostDeletedAt', { time: formatRelativeTime(post.deletedAt) })}`
                    : ''}
                </Text>
              </View>
            );
          })
        )}
      </View>
    );
  };

  const renderUserChats = (uid) => {
    if (expandedChatsUid !== uid) return null;
    const chatLogs = userChatsByUid[uid];

    if (loadingChatsUid === uid) {
      return <ActivityIndicator color={colors.accent} style={styles.postsLoader} />;
    }

    const friendChats = chatLogs?.friendChats || [];
    const roomChats = chatLogs?.roomChats || [];
    const hasAnyChats = friendChats.length > 0 || roomChats.length > 0;

    return (
      <View style={styles.chatsList}>
        {!hasAnyChats ? (
          <Text style={styles.snapshotMeta}>{t('adminNoChats')}</Text>
        ) : (
          <>
            <Text style={styles.chatSectionTitle}>{t('adminFriendChatsSection')}</Text>
            {friendChats.length === 0 ? (
              <Text style={styles.snapshotMeta}>{t('adminNoFriendChats')}</Text>
            ) : (
              friendChats.map((chat) => (
                <View key={chat.id} style={styles.chatItem}>
                  <Text style={styles.chatPartner}>
                    {t('adminChatWith', { name: chat.partnerLabel || chat.partnerUid })}
                  </Text>
                  {chat.messages.length === 0 ? (
                    <Text style={styles.snapshotMeta}>{t('adminNoChatMessages')}</Text>
                  ) : (
                    chat.messages.map((message) => (
                      <View
                        key={message.id}
                        style={[
                          styles.chatMessageRow,
                          message.senderId === uid && styles.chatMessageRowReported,
                        ]}
                      >
                        <Text style={styles.chatMessageSender}>
                          {message.senderId === uid
                            ? t('adminChatReportedUser')
                            : message.senderName || t('adminChatOtherUser')}
                        </Text>
                        <Text style={styles.chatMessageText}>{message.text}</Text>
                        <Text style={styles.snapshotMeta}>
                          {formatRelativeTime(message.createdAt)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}

            <Text style={styles.chatSectionTitle}>{t('adminRoomChatsSection')}</Text>
            {roomChats.length === 0 ? (
              <Text style={styles.snapshotMeta}>{t('adminNoRoomChats')}</Text>
            ) : (
              roomChats.map((room) => (
                <View key={room.id} style={styles.chatItem}>
                  <Text style={styles.chatPartner}>
                    {t('adminRoomChatIn', { room: room.roomName || room.roomId })}
                  </Text>
                  {room.messages.length === 0 ? (
                    <Text style={styles.snapshotMeta}>{t('adminNoChatMessages')}</Text>
                  ) : (
                    room.messages.map((message) => (
                      <View
                        key={message.id}
                        style={[
                          styles.chatMessageRow,
                          message.uid === uid && styles.chatMessageRowReported,
                        ]}
                      >
                        <Text style={styles.chatMessageSender}>
                          {message.uid === uid
                            ? message.sender || t('adminChatReportedUser')
                            : message.sender || t('adminChatOtherUser')}
                        </Text>
                        <Text style={styles.chatMessageText}>{message.text}</Text>
                        <Text style={styles.snapshotMeta}>
                          {formatRelativeTime(message.createdAt)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}
          </>
        )}
      </View>
    );
  };

  const handleDismiss = async (reportId) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: REPORT_STATUS.DISMISSED });
    } catch {
      Alert.alert(t('error'), t('adminReportUpdateFailed'));
    }
  };

  const confirmPunishment = (item, punishment) => {
    const email = displayEmail(item.reportedUserEmail, item.reportedUserId);
    let title;
    let message;
    if (punishment === PUNISHMENT.BAN) {
      title = t('adminPunishBanTitle');
      message = t('adminPunishBanConfirm', { email });
    } else if (punishment === PUNISHMENT.SUSPEND_7) {
      title = t('adminPunishSuspend7Title');
      message = t('adminPunishSuspend7Confirm', { email });
    } else {
      title = t('adminPunishSuspend30Title');
      message = t('adminPunishSuspend30Confirm', { email });
    }

    Alert.alert(title, message, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: () => handlePunishment(item, punishment),
      },
    ]);
  };

  const handlePunishment = async (item, punishment) => {
    const adminUid = auth.currentUser?.uid;
    if (!adminUid || !item.reportedUserId) return;

    setPunishingId(item.id);
    try {
      await applyReportPunishment({
        reportId: item.id,
        reportedUserId: item.reportedUserId,
        reporterUserId: item.reporterUserId,
        reportedUserEmail: displayEmail(item.reportedUserEmail, item.reportedUserId),
        punishment,
        adminUid,
      });
    } catch {
      Alert.alert(t('error'), t('adminPunishFailed'));
    } finally {
      setPunishingId(null);
    }
  };

  const getReportedUserBio = (report) => {
    const uid = report.reportedUserId;
    const snapshotBio =
      report.type === REPORT_TYPES.USER && typeof report.userSnapshot?.bio === 'string'
        ? report.userSnapshot.bio.trim()
        : '';
    const liveBio = uid ? userInfoByUid[uid]?.bio || '' : '';
    return liveBio || snapshotBio;
  };

  const renderReportCount = (reportedUid) => {
    if (!reportedUid) return null;
    const total = reportCountByUid[reportedUid];
    if (!total || total <= 1) return null;

    return (
      <Text style={styles.priorReportText}>
        {t('adminReportCountTotal', { count: total })}
      </Text>
    );
  };

  const renderPostComments = (postId, reportedUid) => {
    if (!postId) return null;
    const comments = postCommentsByPostId[postId];
    if (comments === undefined) {
      return <ActivityIndicator color={colors.accent} style={styles.postsLoader} />;
    }

    return (
      <View style={styles.contextSection}>
        <Text style={styles.photoSectionLabel}>{t('adminPostComments')}</Text>
        {comments.length === 0 ? (
          <Text style={styles.snapshotMeta}>{t('adminNoPostComments')}</Text>
        ) : (
          comments.map((comment) => (
            <View
              key={comment.id}
              style={[
                styles.chatMessageRow,
                comment.userId === reportedUid && styles.chatMessageRowReported,
              ]}
            >
              <Text style={styles.chatMessageSender}>
                {comment.userId === reportedUid
                  ? comment.userSnapshot?.name || t('adminChatReportedUser')
                  : comment.userSnapshot?.name || t('adminChatOtherUser')}
              </Text>
              <Text style={styles.chatMessageText}>{comment.text}</Text>
              <Text style={styles.snapshotMeta}>{formatRelativeTime(comment.createdAt)}</Text>
            </View>
          ))
        )}
      </View>
    );
  };

  const renderReportedUserBio = (report) => {
    const bio = getReportedUserBio(report);
    if (!bio) return null;

    return (
      <View style={styles.contextSection}>
        <Text style={styles.photoSectionLabel}>{t('adminReportedUserBio')}</Text>
        <Text style={styles.snapshotText}>{bio}</Text>
      </View>
    );
  };

  const renderReportedUserCreatedRooms = (uid) => {
    if (!uid) return null;
    const rooms = userRoomsByUid[uid];
    if (!rooms) {
      return <ActivityIndicator color={colors.accent} style={styles.postsLoader} />;
    }
    if (!rooms.length) return null;

    return (
      <View style={styles.contextSection}>
        <Text style={styles.photoSectionLabel}>{t('adminCreatedRooms')}</Text>
        {rooms.map((room) => (
          <View key={room.id} style={styles.roomNameRow}>
            <Text style={styles.snapshotText}>{room.name}</Text>
            {room.creatorAccountDeleted || room.isActive === false ? (
              <Text style={styles.roomInactiveBadge}>{t('adminRoomInactive')}</Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  const renderPostSnapshot = (snapshot) => {
    if (!snapshot) return null;
    const postText = (snapshot.text || '').trim();

    return (
      <View style={styles.snapshotBox}>
        {snapshot.userSnapshot?.name ? (
          <Text style={styles.snapshotMeta}>
            {snapshot.userSnapshot.name}
            {snapshot.userSnapshot.university ? ` · ${snapshot.userSnapshot.university}` : ''}
          </Text>
        ) : null}
        <Text style={styles.photoSectionLabel}>{t('adminPostText')}</Text>
        <Text style={styles.snapshotText}>{postText || t('adminNoPostText')}</Text>
        {snapshot.photoURL || snapshot.selfiePhotoURL ? (
          <>
            <Text style={styles.photoSectionLabel}>{t('adminReportedPostPhotos')}</Text>
            {renderDualPostPhotos(snapshot.photoURL, snapshot.selfiePhotoURL)}
          </>
        ) : null}
        {snapshot.venueTag ? (
          <Text style={styles.snapshotMeta}>📍 {snapshot.venueTag}</Text>
        ) : null}
      </View>
    );
  };

  const renderUserSnapshot = (snapshot) => {
    if (!snapshot) return null;
    const snapshotPhotos = [
      ...(Array.isArray(snapshot.photos) ? snapshot.photos : []),
      snapshot.photoURL,
    ].filter(isPersistablePhotoUrl);
    const uniqueSnapshotPhotos = [...new Set(snapshotPhotos)];

    return (
      <View style={styles.snapshotBox}>
        <Text style={styles.snapshotText}>{snapshot.name}</Text>
        {snapshot.email ? <Text style={styles.snapshotMeta}>{snapshot.email}</Text> : null}
        {snapshot.instagram ? (
          <Text style={styles.snapshotMeta}>@{snapshot.instagram}</Text>
        ) : null}
        {snapshot.university ? <Text style={styles.snapshotMeta}>{snapshot.university}</Text> : null}
        {uniqueSnapshotPhotos.length > 0 ? (
          <>
            <Text style={styles.photoSectionLabel}>{t('adminReportedUserPhotos')}</Text>
            {renderProfilePhotoGrid(uniqueSnapshotPhotos)}
          </>
        ) : null}
      </View>
    );
  };

  const renderReportedUserProfilePhotos = (report) => {
    if (!report.reportedUserId) return null;
    const profilePhotos = collectProfilePhotoUrls(report, userInfoByUid[report.reportedUserId]);
    if (!profilePhotos.length) return null;

    return (
      <View style={styles.photoSection}>
        <Text style={styles.photoSectionLabel}>{t('adminReportedUserPhotos')}</Text>
        {renderProfilePhotoGrid(profilePhotos)}
      </View>
    );
  };

  const renderLiveProfilePhotos = (report) => {
    if (!report.reportedUserId || report.type !== REPORT_TYPES.USER) return null;
    const livePhotos = userInfoByUid[report.reportedUserId]?.photos || [];
    const snapshotPhotos = collectProfilePhotoUrls(report, null);
    const liveOnly = livePhotos.filter((url) => !snapshotPhotos.includes(url));
    if (!liveOnly.length) return null;

    return (
      <View style={styles.photoSection}>
        <Text style={styles.photoSectionLabel}>{t('adminLiveUserPhotos')}</Text>
        {renderProfilePhotoGrid(liveOnly)}
      </View>
    );
  };

  if (checking || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('adminNotAuthorized')}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>{t('goBack')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('adminReportsTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('adminNoPendingReports')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.typeBadge}>
                {item.type === REPORT_TYPES.POST ? t('adminReportTypePost') : t('adminReportTypeUser')}
              </Text>
              <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
            </View>
            <Text style={styles.reasonLabel}>{t('adminReportReason')}</Text>
            <Text style={styles.reasonText}>{item.reason}</Text>
            <Text style={styles.metaText}>
              {t('adminReportedUser')}: {displayEmail(item.reportedUserEmail, item.reportedUserId)}
            </Text>
            {renderReportCount(item.reportedUserId)}
            <Text style={styles.metaText}>
              {t('adminReporter')}: {displayEmail(item.reporterEmail, item.reporterUserId)}
            </Text>

            {renderModerationHistory(item.reportedUserId)}

            {item.type === REPORT_TYPES.POST
              ? renderPostSnapshot(item.postSnapshot)
              : renderUserSnapshot(item.userSnapshot)}

            {item.type === REPORT_TYPES.POST
              ? renderPostComments(item.postId, item.reportedUserId)
              : null}

            {item.type === REPORT_TYPES.POST ? renderReportedUserProfilePhotos(item) : null}

            {renderLiveProfilePhotos(item)}

            {renderReportedUserBio(item)}
            {renderReportedUserCreatedRooms(item.reportedUserId)}

            {item.reportedUserId ? (
              <View style={styles.reviewButtons}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => toggleUserPosts(item.reportedUserId)}
                >
                  <Text style={styles.secondaryButtonText}>
                    {expandedPostsUid === item.reportedUserId
                      ? t('adminHidePosts')
                      : t('adminViewPosts')}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => toggleUserChats(item.reportedUserId)}
                >
                  <Text style={styles.secondaryButtonText}>
                    {expandedChatsUid === item.reportedUserId
                      ? t('adminHideChats')
                      : t('adminViewChats')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {renderUserPosts(item.reportedUserId)}
            {renderUserChats(item.reportedUserId)}

            <View style={styles.actions}>
              <Pressable
                style={styles.dismissButton}
                onPress={() => handleDismiss(item.id)}
                disabled={punishingId === item.id}
              >
                <Text style={styles.dismissButtonText}>{t('adminDismiss')}</Text>
              </Pressable>
            </View>
            <View style={styles.punishRow}>
              <Pressable
                style={[styles.banButton, punishingId === item.id && styles.buttonDisabled]}
                onPress={() => confirmPunishment(item, PUNISHMENT.BAN)}
                disabled={punishingId === item.id}
              >
                {punishingId === item.id ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <Text style={styles.banButtonText}>{t('adminPunishBan')}</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.timeoutButton, punishingId === item.id && styles.buttonDisabled]}
                onPress={() => confirmPunishment(item, PUNISHMENT.SUSPEND_7)}
                disabled={punishingId === item.id}
              >
                <Text style={styles.timeoutButtonText}>{t('adminPunishSuspend7')}</Text>
              </Pressable>
              <Pressable
                style={[styles.timeoutButton, punishingId === item.id && styles.buttonDisabled]}
                onPress={() => confirmPunishment(item, PUNISHMENT.SUSPEND_30)}
                disabled={punishingId === item.id}
              >
                <Text style={styles.timeoutButtonText}>{t('adminPunishSuspend30')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: 24,
    },
    listContent: {
      padding: 16,
      paddingBottom: 40,
      gap: 12,
    },
    emptyText: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 15,
      marginTop: 40,
    },
    link: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: '600',
      marginTop: 12,
    },
    card: {
      backgroundColor: colors.panel,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: 14,
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    typeBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
      textTransform: 'uppercase',
    },
    time: {
      fontSize: 12,
      color: colors.textMuted,
    },
    reasonLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 4,
    },
    reasonText: {
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    metaText: {
      fontSize: 11,
      color: colors.textMuted,
      marginBottom: 2,
    },
    priorReportText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.danger ?? '#c0392b',
      marginBottom: 6,
    },
    modWarningBox: {
      marginTop: 8,
      marginBottom: 4,
      padding: 10,
      borderRadius: 8,
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.danger ?? '#E53935',
      gap: 4,
    },
    modWarningActive: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.danger ?? '#E53935',
    },
    modWarningHistory: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    snapshotBox: {
      marginTop: 8,
      marginBottom: 8,
      padding: 10,
      backgroundColor: colors.panelElevated,
      borderRadius: 10,
      gap: 6,
    },
    snapshotText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    snapshotMeta: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    snapshotPhotos: {
      position: 'relative',
      borderRadius: 8,
      overflow: 'hidden',
    },
    snapshotImage: {
      width: '100%',
      height: 180,
      borderRadius: 8,
    },
    snapshotSelfieWrap: {
      position: 'absolute',
      top: 10,
      left: 10,
      width: 64,
      height: 86,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.white,
      overflow: 'hidden',
      backgroundColor: colors.panelElevated,
    },
    snapshotSelfie: {
      width: '100%',
      height: '100%',
    },
    photoSection: {
      marginTop: 8,
      marginBottom: 8,
      gap: 6,
    },
    contextSection: {
      marginTop: 8,
      marginBottom: 8,
      padding: 10,
      backgroundColor: colors.panelElevated,
      borderRadius: 10,
      gap: 6,
    },
    roomNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    roomInactiveBadge: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    photoSectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    profilePhotoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    profilePhotoThumb: {
      width: 88,
      height: 110,
      borderRadius: 8,
      backgroundColor: colors.panelElevated,
    },
    reviewButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    secondaryButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    secondaryButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    postsLoader: {
      marginVertical: 8,
    },
    postsList: {
      gap: 8,
      marginBottom: 8,
    },
    postItem: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: colors.panelElevated,
      gap: 6,
    },
    postItemDeleted: {
      borderWidth: 1,
      borderColor: colors.danger ?? '#E53935',
      opacity: 0.92,
    },
    deletedBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.danger ?? '#E53935',
    },
    postThumb: {
      width: '100%',
      height: 100,
      borderRadius: 6,
    },
    chatsList: {
      gap: 8,
      marginBottom: 8,
    },
    chatItem: {
      padding: 10,
      borderRadius: 8,
      backgroundColor: colors.panelElevated,
      gap: 6,
    },
    chatSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 4,
      marginBottom: 4,
    },
    chatPartner: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    chatMessageRow: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: colors.panel,
      gap: 2,
    },
    chatMessageRowReported: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
    },
    chatMessageSender: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    chatMessageText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    dismissButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
    },
    dismissButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    punishRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    banButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.danger ?? '#c0392b',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    banButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onAccent,
    },
    timeoutButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    timeoutButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });
}
