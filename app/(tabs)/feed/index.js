import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import LiveMapFab from '../../../components/LiveMapFab';
import LiveStatusSwitch from '../../../components/LiveStatusSwitch';
import PostCard from '../../../components/PostCard';
import WhosOutStrip from '../../../components/WhosOutStrip';
import { useNotificationIndicators } from '../../../contexts/NotificationContext';
import { usePostModal } from '../../../contexts/PostModalContext';
import { useOutTonight } from '../../../contexts/OutTonightContext';
import { auth, db } from '../../../firebase/firebaseConfig';
import { getFriendIds } from '../../../utils/friendUtils';
import {
  formatUniversityDisplay,
  getTopUniversityCity,
  getUniversitySlug,
} from '../../../utils/authUtils';
import { handleFirestoreListenerError } from '../../../utils/firestoreListenerUtils';
import {
  chunkArray,
  isPublicFeedPost,
  isVisiblePost,
  POST_VISIBILITY,
} from '../../../utils/postUtils';

const PAGE_SIZE = 15;
const UNIVERSITY_TAB_LABEL_MAX = 14;

function truncateUniversityLabel(name, max = UNIVERSITY_TAB_LABEL_MAX) {
  if (!name) return '';
  if (name.length <= max) return name;
  return `${name.slice(0, max)}...`;
}

function sortPostsByDate(posts) {
  return [...posts].sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
}

function getPostUniversity(post) {
  return post.university || post.userSnapshot?.university || '';
}

/** Top-university posts from the viewer's city; any top university if the viewer's city is unknown. */
function isForYouCityPost(post, viewerCity) {
  const postCity = getTopUniversityCity(getPostUniversity(post));
  if (!postCity) return false;
  return !viewerCity || postCity === viewerCity;
}

/** Merge public + friends posts, dropping duplicates (a friend's public post is in both). */
function mergeFeedPosts(publicPosts, friendsPosts) {
  const byId = new Map();
  [...publicPosts, ...friendsPosts].forEach((post) => byId.set(post.id, post));
  return sortPostsByDate([...byId.values()]);
}

/**
 * Public posts only. The visibility filter must stay in the query: Firestore rules
 * are not filters, so an unfiltered query would return friends-only posts of strangers.
 */
function usePublicPosts(enabled) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setPosts([]);
      setLoading(false);
      return undefined;
    }

    const q = query(
      collection(db, 'posts'),
      where('visibility', '==', POST_VISIBILITY.PUBLIC),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isVisiblePost);
        setPosts(fetched);
        setLoading(false);
      },
      (error) => {
        handleFirestoreListenerError('public-posts')(error);
        setPosts([]);
        setLoading(false);
      }
    );

    return unsub;
  }, [enabled]);

  return { posts, loading };
}

/** All posts (public + friends-only) by the viewer and their friends. */
function useFriendsPosts(friendIds) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const friendKey = friendIds.join(',');

  useEffect(() => {
    if (!friendKey) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const ids = friendKey.split(',').filter(Boolean);
    if (ids.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const chunks = chunkArray(ids, 30);
    const chunkResults = chunks.map(() => []);
    const chunkReady = chunks.map(() => false);

    const merge = () => {
      const merged = sortPostsByDate(chunkResults.flat());
      setPosts(merged);
      if (chunkReady.every(Boolean)) setLoading(false);
    };

    const unsubs = chunks.map((chunk, index) => {
      const q = query(collection(db, 'posts'), where('userId', 'in', chunk));
      return onSnapshot(
        q,
        (snapshot) => {
          chunkResults[index] = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter(isVisiblePost);
          chunkReady[index] = true;
          merge();
        },
        (error) => {
          handleFirestoreListenerError('friends-posts')(error);
          chunkReady[index] = true;
          merge();
        }
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [friendKey]);

  return { posts, loading };
}

function FeedList({ posts, loading, emptyState, ListHeaderComponent, loadMoreLabel, styles, colors }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [posts]);

  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);
  const hasMore = visibleCount < posts.length;

  const loadMore = useCallback(() => {
    if (hasMore) setVisibleCount((c) => c + PAGE_SIZE);
  }, [hasMore]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (posts.length === 0 && !ListHeaderComponent) {
    return emptyState;
  }

  if (posts.length === 0 && ListHeaderComponent) {
    return (
      <View style={styles.emptyWithHeader}>
        <View style={styles.listHeaderWrap}>{ListHeaderComponent}</View>
        <View style={styles.emptyContainerBelowHeader}>{emptyState}</View>
      </View>
    );
  }

  return (
    <FlatList
      data={visiblePosts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PostCard post={item} />}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={
        hasMore ? (
          <Pressable style={styles.loadMoreButton} onPress={loadMore}>
            <Text style={styles.loadMoreText}>{loadMoreLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.listFooter} />
        )
      }
    />
  );
}

export default function FeedScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { openPostModal } = usePostModal();
  const { showNotificationsDot } = useNotificationIndicators();
  const { segment } = useLocalSearchParams();
  const [tab, setTab] = useState('forYou');
  const [friendIds, setFriendIds] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [university, setUniversity] = useState('');
  const [feedReady, setFeedReady] = useState(Boolean(auth.currentUser?.emailVerified));

  const { isOut } = useOutTonight();
  const { posts: publicPosts, loading: publicLoading } = usePublicPosts(feedReady);
  const { posts: friendsPosts, loading: friendsPostsLoading } = useFriendsPosts(friendIds);
  const feedPosts = useMemo(
    () => mergeFeedPosts(publicPosts, friendsPosts),
    [publicPosts, friendsPosts]
  );

  const viewerCity = useMemo(() => getTopUniversityCity(university), [university]);
  const forYouPosts = useMemo(
    () => feedPosts.filter((post) => isForYouCityPost(post, viewerCity)),
    [feedPosts, viewerCity]
  );

  // Match by slug, not label, so ug.bilkent uni. and bilkent uni. land in the same tab.
  const universitySlug = useMemo(() => getUniversitySlug(university), [university]);
  const universityPosts = useMemo(
    () =>
      universitySlug
        ? feedPosts.filter(
            (post) =>
              isPublicFeedPost(post) && getUniversitySlug(getPostUniversity(post)) === universitySlug
          )
        : [],
    [feedPosts, universitySlug]
  );

  const showUniversityTab = Boolean(university);
  const universityTabLabel = truncateUniversityLabel(formatUniversityDisplay(university));

  useEffect(() => {
    if (segment === 'friends') {
      setTab('friends');
    }
  }, [segment]);

  useEffect(() => {
    if (!showUniversityTab && tab === 'university') {
      setTab('forYou');
    }
  }, [showUniversityTab, tab]);

  useEffect(() => {
    let userUnsub = null;
    let friendsUnsub1 = null;
    let friendsUnsub2 = null;

    const refreshFriendIds = async (uid) => {
      setFriendsLoading(true);
      try {
        const ids = await getFriendIds(uid);
        setFriendIds([uid, ...ids.filter((id) => id !== uid)]);
      } catch (error) {
        setFriendIds([uid]);
      } finally {
        setFriendsLoading(false);
      }
    };

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (userUnsub) {
        userUnsub();
        userUnsub = null;
      }
      if (friendsUnsub1) {
        friendsUnsub1();
        friendsUnsub1 = null;
      }
      if (friendsUnsub2) {
        friendsUnsub2();
        friendsUnsub2 = null;
      }

      setFeedReady(Boolean(user?.emailVerified));

      if (!user) {
        setUniversity('');
        setFriendIds([]);
        setFriendsLoading(false);
        return;
      }

      userUnsub = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const uni = snap.exists() ? (snap.data().university || '').trim() : '';
          setUniversity(uni);
        },
        (error) => {
          handleFirestoreListenerError('feed-user')(error);
          setUniversity('');
        }
      );

      refreshFriendIds(user.uid);

      friendsUnsub1 = onSnapshot(
        query(
          collection(db, 'friendships'),
          where('user1Id', '==', user.uid),
          where('status', '==', 'accepted')
        ),
        () => refreshFriendIds(user.uid),
        handleFirestoreListenerError('feed-friends-user1')
      );

      friendsUnsub2 = onSnapshot(
        query(
          collection(db, 'friendships'),
          where('user2Id', '==', user.uid),
          where('status', '==', 'accepted')
        ),
        () => refreshFriendIds(user.uid),
        handleFirestoreListenerError('feed-friends-user2')
      );
    });

    return () => {
      authUnsub();
      if (userUnsub) userUnsub();
      if (friendsUnsub1) friendsUnsub1();
      if (friendsUnsub2) friendsUnsub2();
    };
  }, []);

  const friendsEmptyState = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t('feedNoFriendsTitle')}</Text>
      <Text style={styles.emptySubtext}>{t('feedNoFriendsSub')}</Text>
      <Pressable style={styles.emptyButton} onPress={() => router.push('/friends-list')}>
        <Text style={styles.emptyButtonText}>{t('feedGoToFriends')}</Text>
      </Pressable>
    </View>
  );

  const forYouEmptyState = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t('feedNoPostsTitle')}</Text>
      <Text style={styles.emptySubtext}>{t('feedNoPostsSub')}</Text>
    </View>
  );

  const universityEmptyState = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>
        {t('feedNoUniversityPostsTitle', { university: formatUniversityDisplay(university) })}
      </Text>
      <Text style={styles.emptySubtext}>{t('feedNoUniversityPostsSub')}</Text>
      <Pressable style={styles.emptyButton} onPress={() => openPostModal()}>
        <Text style={styles.emptyButtonText}>{t('feedShareFirstMemory')}</Text>
      </Pressable>
    </View>
  );

  const showFriendsGate = !friendsLoading && friendIds.length === 0 && !isOut;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <LiveStatusSwitch />
        <Pressable
          style={styles.notificationsButton}
          onPress={() => router.push('/notifications')}
          hitSlop={8}
          accessibilityLabel={t('notifications')}
        >
          <Ionicons name="notifications-outline" size={26} color={colors.textPrimary} />
          {showNotificationsDot ? <View style={styles.notificationsBadge} /> : null}
        </Pressable>
      </View>

      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, tab === 'forYou' && styles.segmentActive]}
          onPress={() => setTab('forYou')}
        >
          <Text
            style={[styles.segmentText, tab === 'forYou' && styles.segmentTextActive]}
            numberOfLines={1}
          >
            {t('feedForYou')}
          </Text>
        </Pressable>
        {showUniversityTab ? (
          <Pressable
            style={[styles.segment, tab === 'university' && styles.segmentActive]}
            onPress={() => setTab('university')}
          >
            <Text
              style={[styles.segmentText, tab === 'university' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              {universityTabLabel}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.segment, tab === 'friends' && styles.segmentActive]}
          onPress={() => setTab('friends')}
        >
          <Text
            style={[styles.segmentText, tab === 'friends' && styles.segmentTextActive]}
            numberOfLines={1}
          >
            {t('feedFriends')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tab === 'forYou' ? (
          <FeedList
            posts={forYouPosts}
            loading={publicLoading}
            emptyState={forYouEmptyState}
            loadMoreLabel={t('loadMore')}
            styles={styles}
            colors={colors}
          />
        ) : tab === 'university' && showUniversityTab ? (
          <FeedList
            posts={universityPosts}
            loading={publicLoading}
            emptyState={universityEmptyState}
            loadMoreLabel={t('loadMore')}
            styles={styles}
            colors={colors}
          />
        ) : showFriendsGate ? (
          friendsEmptyState
        ) : (
          <FeedList
            posts={friendsPosts}
            loading={friendsLoading || friendsPostsLoading}
            ListHeaderComponent={<WhosOutStrip friendIds={friendIds} />}
            loadMoreLabel={t('loadMore')}
            styles={styles}
            colors={colors}
            emptyState={
              <>
                <Text style={styles.emptyTitle}>{t('feedNoFriendPostsTitle')}</Text>
                <Pressable style={styles.emptyButton} onPress={() => router.push('/friends-list')}>
                  <Text style={styles.emptyButtonText}>{t('feedFindFriends')}</Text>
                </Pressable>
              </>
            }
          />
        )}
      </View>

      <LiveMapFab />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 4,
    },
    notificationsButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationsBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.notificationDot,
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    segmentBar: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: 4,
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
      paddingHorizontal: 4,
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
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },
    segmentTextActive: {
      color: colors.onAccent,
      fontWeight: '700',
    },
    content: {
      flex: 1,
    },
    emptyWithHeader: {
      flex: 1,
    },
    listHeaderWrap: {
      paddingHorizontal: 20,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 120,
    },
    listFooter: {
      height: 24,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadMoreButton: {
      alignItems: 'center',
      paddingVertical: 16,
      marginBottom: 8,
    },
    loadMoreText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyContainerBelowHeader: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
      paddingBottom: 96,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    emptyButton: {
      backgroundColor: colors.accent,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 12,
    },
    emptyButtonText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
}
