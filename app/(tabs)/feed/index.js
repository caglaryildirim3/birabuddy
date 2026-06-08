import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '../../../components/PostCard';
import WhosOutStrip from '../../../components/WhosOutStrip';
import { useOutTonight } from '../../../contexts/OutTonightContext';
import BeerColors from '../../../constants/BeerColors';
import { auth, db } from '../../../firebase/firebaseConfig';
import { getFriendIds } from '../../../utils/friendUtils';
import { chunkArray } from '../../../utils/postUtils';

const PAGE_SIZE = 15;

function sortPostsByDate(posts) {
  return [...posts].sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
}

function useForYouPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: when user base grows, filter by mutual connections first,
    // then fall back to all posts
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPosts(fetched);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, []);

  return { posts, loading };
}

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
          chunkResults[index] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          chunkReady[index] = true;
          merge();
        },
        () => {
          chunkReady[index] = true;
          merge();
        }
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [friendKey]);

  return { posts, loading };
}

function FeedList({ posts, loading, emptyState, ListHeaderComponent }) {
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
        <ActivityIndicator size="large" color={BeerColors.accent} />
      </View>
    );
  }

  if (posts.length === 0 && !ListHeaderComponent) {
    return emptyState;
  }

  if (posts.length === 0 && ListHeaderComponent) {
    return (
      <FlatList
        data={[]}
        keyExtractor={() => 'empty'}
        renderItem={null}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
            <Text style={styles.loadMoreText}>Load more</Text>
          </Pressable>
        ) : (
          <View style={styles.listFooter} />
        )
      }
    />
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const [tab, setTab] = useState('forYou');
  const [friendIds, setFriendIds] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  const { isOut } = useOutTonight();
  const { posts: forYouPosts, loading: forYouLoading } = useForYouPosts();
  const { posts: friendsPosts, loading: friendsPostsLoading } = useFriendsPosts(friendIds);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFriendIds([]);
        setFriendsLoading(false);
        return;
      }
      setFriendsLoading(true);
      try {
        const ids = await getFriendIds(user.uid);
        setFriendIds(ids);
      } catch (error) {
        setFriendIds([]);
      } finally {
        setFriendsLoading(false);
      }
    });
    return unsub;
  }, []);

  const friendsEmptyState = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Add friends to see their posts</Text>
      <Text style={styles.emptySubtext}>
        Find people by Instagram username and send friend requests
      </Text>
      <Pressable style={styles.emptyButton} onPress={() => router.push('/friends-list')}>
        <Text style={styles.emptyButtonText}>Go to Friends</Text>
      </Pressable>
    </View>
  );

  const forYouEmptyState = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No posts yet</Text>
      <Text style={styles.emptySubtext}>Tap + to share your first memory</Text>
    </View>
  );

  const showFriendsGate = !friendsLoading && friendIds.length === 0 && !isOut;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, tab === 'forYou' && styles.segmentActive]}
          onPress={() => setTab('forYou')}
        >
          <Text style={[styles.segmentText, tab === 'forYou' && styles.segmentTextActive]}>
            For You
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, tab === 'friends' && styles.segmentActive]}
          onPress={() => setTab('friends')}
        >
          <Text style={[styles.segmentText, tab === 'friends' && styles.segmentTextActive]}>
            Friends
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tab === 'forYou' ? (
          <FeedList
            posts={forYouPosts}
            loading={forYouLoading}
            emptyState={forYouEmptyState}
          />
        ) : showFriendsGate ? (
          friendsEmptyState
        ) : (
          <FeedList
            posts={friendsPosts}
            loading={friendsLoading || friendsPostsLoading}
            ListHeaderComponent={<WhosOutStrip friendIds={friendIds} />}
            emptyState={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No posts from friends yet</Text>
                <Pressable style={styles.emptyButton} onPress={() => router.push('/friends-list')}>
                  <Text style={styles.emptyButtonText}>Find Friends</Text>
                </Pressable>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: BeerColors.panel,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: BeerColors.accent,
    borderWidth: 1,
    borderColor: BeerColors.accent,
  },
  segmentText: {
    color: BeerColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: BeerColors.onAccent,
    fontWeight: '700',
  },
  content: {
    flex: 1,
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
    color: BeerColors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: BeerColors.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: BeerColors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
