import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  arrayRemove,
  arrayUnion,
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';
import { formatRelativeTime } from '../utils/dateUtils';
import { aggregateReactions, deletePost } from '../utils/postUtils';
import { useUserProfileModal } from '../hooks/useUserProfileModal';
import PostCommentsModal from './PostCommentsModal';
import PressableUserAvatar from './PressableUserAvatar';
import ReactionPicker from './ReactionPicker';

export default function PostCard({ post, onDeleted }) {
  const { openProfile, ProfileModal } = useUserProfileModal();
  const currentUid = auth.currentUser?.uid;
  const isOwn = currentUid === post.userId;
  const initialLikes = Array.isArray(post.likes) ? post.likes : [];
  const initiallyLiked = currentUid ? initialLikes.includes(currentUid) : false;
  const reactions = post.reactions && typeof post.reactions === 'object' ? post.reactions : {};

  const [liked, setLiked] = useState(initiallyLiked);
  const [likeCount, setLikeCount] = useState(initialLikes.length);
  const [localReactions, setLocalReactions] = useState(reactions);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);

  const myReaction = currentUid ? localReactions[currentUid] : null;
  const reactionSummary = useMemo(() => aggregateReactions(localReactions), [localReactions]);
  const commentCount = post.commentsCount || 0;

  useEffect(() => {
    const likes = Array.isArray(post.likes) ? post.likes : [];
    setLiked(currentUid ? likes.includes(currentUid) : false);
    setLikeCount(likes.length);
  }, [post.likes, currentUid]);

  useEffect(() => {
    const next = post.reactions && typeof post.reactions === 'object' ? post.reactions : {};
    setLocalReactions(next);
  }, [post.reactions]);

  const toggleLike = async () => {
    if (!currentUid) return;

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => (nextLiked ? c + 1 : c - 1));

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: nextLiked ? arrayUnion(currentUid) : arrayRemove(currentUid),
      });
    } catch (error) {
      setLiked(!nextLiked);
      setLikeCount((c) => (nextLiked ? c - 1 : c + 1));
      Alert.alert('Error', 'Failed to update like');
    }
  };

  const handleReactionSelect = async (emoji) => {
    if (!currentUid) return;

    const nextReactions = { ...localReactions };
    if (myReaction === emoji) {
      delete nextReactions[currentUid];
    } else {
      nextReactions[currentUid] = emoji;
    }

    const previousReactions = { ...localReactions };
    setLocalReactions(nextReactions);
    setReactionPickerVisible(false);

    try {
      await updateDoc(doc(db, 'posts', post.id), { reactions: nextReactions });
    } catch (error) {
      setLocalReactions(previousReactions);
      Alert.alert('Error', 'Failed to add reaction');
    }
  };

  const handleLongPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setReactionPickerVisible(true);
  };

  const handleDelete = () => {
    Alert.alert('Delete post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            onDeleted?.(post.id);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete post');
          }
        },
      },
    ]);
  };

  const handleReport = () => {
    Alert.alert('Report post', 'Report this post as inappropriate?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          try {
            await addDoc(collection(db, 'reports'), {
              type: 'post',
              postId: post.id,
              reportedUserId: post.userId,
              reporterUserId: currentUid,
              reason: 'inappropriate',
              createdAt: serverTimestamp(),
              status: 'pending',
            });
          } catch (error) {
            Alert.alert('Error', 'Failed to submit report');
          }
        },
      },
    ]);
  };

  const openMenu = () => {
    if (isOwn) {
      Alert.alert('Post options', undefined, [
        { text: 'Delete post', style: 'destructive', onPress: handleDelete },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Post options', undefined, [
        { text: 'Report post', style: 'destructive', onPress: handleReport },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={styles.card}>
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        <View style={styles.cardHeader}>
          <PressableUserAvatar
            uid={post.userId}
            snapshot={post.userSnapshot}
            size={40}
            onPress={openProfile}
          />
          <View style={styles.headerInfo}>
            <Pressable onPress={() => openProfile(post.userId)}>
              <Text style={styles.name}>{post.userSnapshot?.name || 'User'}</Text>
            </Pressable>
            {post.userSnapshot?.university ? (
              <Text style={styles.university}>{post.userSnapshot.university}</Text>
            ) : null}
            <Text style={styles.time}>{formatRelativeTime(post.createdAt)}</Text>
          </View>
          <Pressable style={styles.menuButton} onPress={openMenu}>
            <Ionicons name="ellipsis-horizontal" size={20} color={BeerColors.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.postText}>{post.text}</Text>

        {Array.isArray(post.drinks) && post.drinks.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.drinksScroll}
            contentContainerStyle={styles.drinksScrollContent}
          >
            {post.drinks.map((drink, index) => (
              <View key={`${drink.type}-${index}`} style={styles.drinkMetaPill}>
                <Text style={styles.drinkMetaText}>
                  {drink.emoji} {drink.type} ×{drink.quantity}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {post.photoURL ? (
          <Image source={{ uri: post.photoURL }} style={styles.postPhoto} contentFit="cover" />
        ) : null}

        {post.venueTag ? (
          <View style={styles.venueRow}>
            <Ionicons name="location-outline" size={16} color={BeerColors.accent} />
            <Text style={styles.venueText}>{post.venueTag}</Text>
          </View>
        ) : null}
      </Pressable>

      {reactionSummary.length > 0 ? (
        <Pressable style={styles.reactionSummary} onPress={() => setReactionPickerVisible(true)}>
          {reactionSummary.map(({ emoji, count }) => (
            <View
              key={emoji}
              style={[styles.reactionPill, myReaction === emoji && styles.reactionPillMine]}
            >
              <Text style={styles.reactionPillText}>
                {emoji} {count}
              </Text>
            </View>
          ))}
        </Pressable>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={toggleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? BeerColors.danger : BeerColors.textMuted}
          />
          {likeCount > 0 ? (
            <Text style={[styles.actionCount, liked && styles.actionCountActive]}>{likeCount}</Text>
          ) : null}
        </Pressable>

        <Pressable style={styles.actionButton} onPress={() => setCommentsVisible(true)}>
          <Ionicons name="chatbubble-outline" size={21} color={BeerColors.textMuted} />
          {commentCount > 0 ? (
            <Text style={styles.actionCount}>{commentCount}</Text>
          ) : null}
        </Pressable>

        <Pressable style={styles.actionButton} onPress={() => setReactionPickerVisible(true)}>
          {myReaction ? (
            <Text style={styles.myReactionEmoji}>{myReaction}</Text>
          ) : (
            <Ionicons name="happy-outline" size={22} color={BeerColors.textMuted} />
          )}
        </Pressable>
      </View>

      <ReactionPicker
        visible={reactionPickerVisible}
        onClose={() => setReactionPickerVisible(false)}
        onSelect={handleReactionSelect}
        currentReaction={myReaction}
      />

      <PostCommentsModal
        visible={commentsVisible}
        postId={post.id}
        onClose={() => setCommentsVisible(false)}
      />

      <ProfileModal />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BeerColors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  university: {
    fontSize: 12,
    color: BeerColors.textSecondary,
    marginTop: 1,
  },
  time: {
    fontSize: 12,
    color: BeerColors.textMuted,
    marginTop: 2,
  },
  menuButton: {
    padding: 8,
  },
  postText: {
    fontSize: 16,
    color: BeerColors.textPrimary,
    lineHeight: 22,
    marginBottom: 12,
  },
  drinksScroll: {
    marginBottom: 10,
    flexGrow: 0,
  },
  drinksScrollContent: {
    gap: 6,
    paddingRight: 4,
  },
  drinkMetaPill: {
    backgroundColor: BeerColors.panelSoft,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  drinkMetaText: {
    fontSize: 12,
    color: BeerColors.textSecondary,
    fontWeight: '500',
  },
  postPhoto: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    marginBottom: 12,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  venueText: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    fontWeight: '600',
  },
  reactionSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  reactionPill: {
    backgroundColor: BeerColors.panelSoft,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  reactionPillMine: {
    borderColor: BeerColors.accent,
  },
  reactionPillText: {
    fontSize: 13,
    color: BeerColors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BeerColors.borderSoft,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  actionCount: {
    fontSize: 14,
    color: BeerColors.textMuted,
    fontWeight: '600',
  },
  actionCountActive: {
    color: BeerColors.danger,
  },
  myReactionEmoji: {
    fontSize: 20,
  },
});
