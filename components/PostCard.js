import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Dimensions,
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
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import { formatUniversityDisplay } from '../utils/authUtils';
import { getDeletedAwareSnapshot } from '../utils/deletedUserUtils';
import { formatRelativeTime } from '../utils/dateUtils';
import { selfieFlipStyle } from '../constants/selfieDisplay';
import { notifyPostActivity } from '../utils/activityNotificationUtils';
import { aggregateReactions, deletePost } from '../utils/postUtils';
import { REPORT_REASON_LIMIT, submitPostReport } from '../utils/reportUtils';
import { shareToInstagramStories } from '../utils/shareUtils';
import { useUserProfileModal } from '../hooks/useUserProfileModal';
import PostCommentsModal from './PostCommentsModal';
import PressableUserAvatar from './PressableUserAvatar';
import ReactionPicker from './ReactionPicker';
import StoryCard from './StoryCard';

const DEFAULT_PHOTO_ASPECT = 3 / 4;
const CARD_PHOTO_WIDTH = Dimensions.get('window').width - 72;
const MAX_PHOTO_HEIGHT = Math.round(Dimensions.get('window').height * 0.52);

function getPhotoHeight(aspectRatio) {
  const naturalHeight = CARD_PHOTO_WIDTH / aspectRatio;
  return Math.min(Math.round(naturalHeight), MAX_PHOTO_HEIGHT);
}

export default function PostCard({ post, onDeleted }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { openProfile, ProfileModal } = useUserProfileModal();
  const currentUid = auth.currentUser?.uid;
  const isOwn = currentUid === post.userId;
  const authorSnapshot = getDeletedAwareSnapshot(post.userSnapshot, t);
  const canOpenAuthorProfile = !post.isDeleted;
  const initialLikes = Array.isArray(post.likes) ? post.likes : [];
  const initiallyLiked = currentUid ? initialLikes.includes(currentUid) : false;
  const reactions = post.reactions && typeof post.reactions === 'object' ? post.reactions : {};

  const storyCardRef = useRef(null);

  const [liked, setLiked] = useState(initiallyLiked);
  const [likeCount, setLikeCount] = useState(initialLikes.length);
  const [localReactions, setLocalReactions] = useState(reactions);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [sharingStory, setSharingStory] = useState(false);
  const [mainShowsPrimary, setMainShowsPrimary] = useState(true);
  const [photoHeight, setPhotoHeight] = useState(() => getPhotoHeight(DEFAULT_PHOTO_ASPECT));

  const hasDualPhoto = Boolean(post.photoURL && post.selfiePhotoURL);
  const mainPhotoUri = mainShowsPrimary ? post.photoURL : post.selfiePhotoURL;
  const pipPhotoUri = mainShowsPrimary ? post.selfiePhotoURL : post.photoURL;
  const mainIsSelfie = !mainShowsPrimary;
  const pipIsSelfie = mainShowsPrimary;

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

  useEffect(() => {
    setMainShowsPrimary(true);
    setPhotoHeight(getPhotoHeight(DEFAULT_PHOTO_ASPECT));
  }, [post.id, post.photoURL, post.selfiePhotoURL]);

  useEffect(() => {
    setPhotoHeight(getPhotoHeight(DEFAULT_PHOTO_ASPECT));
  }, [mainPhotoUri]);

  const swapPhotos = () => {
    if (hasDualPhoto) setMainShowsPrimary((prev) => !prev);
  };

  const toggleLike = async () => {
    if (!currentUid) return;

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => (nextLiked ? c + 1 : c - 1));

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: nextLiked ? arrayUnion(currentUid) : arrayRemove(currentUid),
      });
      if (nextLiked) {
        notifyPostActivity({
          recipientId: post.userId,
          type: 'post_like',
          postId: post.id,
        });
      }
    } catch (error) {
      setLiked(!nextLiked);
      setLikeCount((c) => (nextLiked ? c - 1 : c + 1));
      Alert.alert(t('error'), t('failedToUpdateLike'));
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
      // Only touch our own key; rules reject edits to other users' reactions.
      await updateDoc(doc(db, 'posts', post.id), {
        [`reactions.${currentUid}`]: nextReactions[currentUid] ?? deleteField(),
      });
      if (myReaction !== emoji && nextReactions[currentUid]) {
        notifyPostActivity({
          recipientId: post.userId,
          type: 'post_reaction',
          postId: post.id,
          emoji: nextReactions[currentUid],
        });
      }
    } catch (error) {
      setLocalReactions(previousReactions);
      Alert.alert(t('error'), t('failedToAddReaction'));
    }
  };

  const handleLongPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setReactionPickerVisible(true);
  };

  const handleDelete = () => {
    Alert.alert(t('deletePost'), t('deletePostConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            onDeleted?.(post.id);
          } catch (error) {
            Alert.alert(t('error'), t('failedToDeletePost'));
          }
        },
      },
    ]);
  };

  const handleOpenReport = () => {
    setReportReason('');
    setReportModalVisible(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim() || !currentUid) {
      Alert.alert(t('error'), t('reportReasonRequired'));
      return;
    }

    setReportSubmitting(true);
    try {
      await submitPostReport({
        post,
        reporterUserId: currentUid,
        reporterEmail: auth.currentUser?.email,
        reason: reportReason,
      });
      setReportModalVisible(false);
      setReportReason('');
      Alert.alert(t('reportSubmittedTitle'), t('reportSubmittedMessage'));
    } catch (error) {
      Alert.alert(t('error'), t('failedToSubmitReport'));
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleShareStory = async () => {
    if (!isOwn) return;

    setSharingStory(true);
    try {
      if (mainPhotoUri) {
        await Image.prefetch(mainPhotoUri);
      }
      if (pipPhotoUri) {
        await Image.prefetch(pipPhotoUri);
      }
      await shareToInstagramStories(storyCardRef);
    } finally {
      setSharingStory(false);
    }
  };

  const openMenu = () => {
    if (isOwn) {
      Alert.alert(t('postOptions'), undefined, [
        { text: t('deletePostMenu'), style: 'destructive', onPress: handleDelete },
        { text: t('cancel'), style: 'cancel' },
      ]);
    } else {
      Alert.alert(t('postOptions'), undefined, [
        { text: t('reportPostMenu'), style: 'destructive', onPress: handleOpenReport },
        { text: t('cancel'), style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={styles.card}>
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        <View style={styles.cardHeader}>
          <PressableUserAvatar
            uid={post.userId}
            snapshot={authorSnapshot}
            size={32}
            onPress={canOpenAuthorProfile ? openProfile : undefined}
          />
          <View style={styles.headerInfo}>
            <Pressable
              onPress={canOpenAuthorProfile ? () => openProfile(post.userId) : undefined}
              disabled={!canOpenAuthorProfile}
            >
              <Text style={styles.name} numberOfLines={1}>
                {authorSnapshot.name}
              </Text>
            </Pressable>
            <View style={styles.headerMeta}>
              {authorSnapshot.university ? (
                <Text style={styles.university} numberOfLines={1}>
                  {formatUniversityDisplay(authorSnapshot.university)}
                </Text>
              ) : null}
              {authorSnapshot.university ? (
                <Text style={styles.metaDot}>·</Text>
              ) : null}
              <Text style={styles.time}>{formatRelativeTime(post.createdAt)}</Text>
            </View>
          </View>
          <Pressable style={styles.menuButton} onPress={openMenu} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
      </Pressable>

      {Array.isArray(post.drinks) && post.drinks.length > 0 ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
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

      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        {post.photoURL ? (
          <View style={styles.postPhotoWrap}>
            <Pressable onPress={swapPhotos} disabled={!hasDualPhoto}>
              <Image
                key={mainPhotoUri || post.photoURL}
                source={{ uri: mainPhotoUri || post.photoURL }}
                style={[styles.postPhoto, { height: photoHeight }, mainIsSelfie && selfieFlipStyle]}
                contentFit="cover"
                onLoad={({ source }) => {
                  if (source.width && source.height) {
                    setPhotoHeight(getPhotoHeight(source.width / source.height));
                  }
                }}
              />
            </Pressable>
            {post.selfiePhotoURL ? (
              <Pressable style={styles.postSelfieWrap} onPress={swapPhotos}>
                <Image
                  source={{ uri: pipPhotoUri }}
                  style={[styles.postSelfie, pipIsSelfie && selfieFlipStyle]}
                  contentFit="cover"
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {post.venueTag ? (
          <View style={styles.venueRow}>
            <Ionicons name="location-outline" size={16} color={colors.accent} />
            <Text style={styles.venueText}>{post.venueTag}</Text>
          </View>
        ) : null}
      </Pressable>

      {reactionSummary.length > 0 ? (
        <View style={styles.reactionSummary}>
          {reactionSummary.map(({ emoji, count }) => (
            <Pressable
              key={emoji}
              style={[styles.reactionPill, myReaction === emoji && styles.reactionPillMine]}
              onPress={() => {
                if (myReaction === emoji) {
                  handleReactionSelect(emoji);
                }
              }}
            >
              <Text style={styles.reactionPillText}>
                {emoji}
                {count}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={toggleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? colors.danger : colors.textMuted}
          />
          {likeCount > 0 ? (
            <Text style={[styles.actionCount, liked && styles.actionCountActive]}>{likeCount}</Text>
          ) : null}
        </Pressable>

        <Pressable style={styles.actionButton} onPress={() => setCommentsVisible(true)}>
          <Ionicons name="chatbubble-outline" size={21} color={colors.textMuted} />
          {commentCount > 0 ? (
            <Text style={styles.actionCount}>{commentCount}</Text>
          ) : null}
        </Pressable>

        <Pressable style={styles.actionButton} onPress={() => setReactionPickerVisible(true)}>
          {myReaction ? (
            <Text style={styles.myReactionEmoji}>{myReaction}</Text>
          ) : (
            <Ionicons name="happy-outline" size={22} color={colors.textMuted} />
          )}
        </Pressable>

        {isOwn ? (
          <Pressable
            style={styles.actionButton}
            onPress={handleShareStory}
            disabled={sharingStory}
          >
            <Ionicons
              name={sharingStory ? 'hourglass-outline' : 'logo-instagram'}
              size={21}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
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
        postOwnerId={post.userId}
        onClose={() => setCommentsVisible(false)}
      />

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.reportModalOverlay}
          >
            <TouchableWithoutFeedback>
              <View style={styles.reportModalContainer}>
                <Text style={styles.reportModalTitle}>{t('reportPost')}</Text>
                <TextInput
                  style={styles.reportReasonInput}
                  placeholder={t('reportReasonPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={reportReason}
                  onChangeText={setReportReason}
                  multiline
                  maxLength={REPORT_REASON_LIMIT}
                  blurOnSubmit
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                <View style={styles.reportModalButtons}>
                  <Pressable
                    style={styles.reportCancelButton}
                    onPress={() => {
                      setReportModalVisible(false);
                      setReportReason('');
                    }}
                  >
                    <Text style={styles.reportCancelButtonText}>{t('cancel')}</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.reportSubmitButton,
                      (!reportReason.trim() || reportSubmitting) && styles.reportSubmitButtonDisabled,
                    ]}
                    onPress={submitReport}
                    disabled={!reportReason.trim() || reportSubmitting}
                  >
                    <Text style={styles.reportSubmitButtonText}>{t('reportAction')}</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      <ProfileModal />

      {isOwn ? (
        <StoryCard ref={storyCardRef} post={post} mainShowsPrimary={mainShowsPrimary} />
      ) : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 8,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
    gap: 4,
    minWidth: 0,
  },
  university: {
    fontSize: 11,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 11,
    color: colors.textMuted,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    flexShrink: 0,
  },
  menuButton: {
    padding: 4,
  },
  postText: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: 12,
  },
  drinksScroll: {
    marginBottom: 10,
    flexGrow: 0,
    marginHorizontal: -2,
  },
  drinksScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  drinkMetaPill: {
    flexShrink: 0,
    backgroundColor: colors.panelSoft,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  drinkMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  postPhotoWrap: {
    position: 'relative',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  postPhoto: {
    width: '100%',
    borderRadius: 12,
  },
  postSelfieWrap: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 88,
    height: 118,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000',
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  postSelfie: {
    width: '100%',
    height: '100%',
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  venueText: {
    fontSize: 14,
    color: colors.textSecondary,
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
    backgroundColor: colors.panelSoft,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  reactionPillMine: {
    borderColor: colors.accent,
  },
  reactionPillText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
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
    color: colors.textMuted,
    fontWeight: '600',
  },
  actionCountActive: {
    color: colors.danger,
  },
  myReactionEmoji: {
    fontSize: 20,
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayHeavy,
    justifyContent: 'center',
    padding: 24,
  },
  reportModalContainer: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  reportReasonInput: {
    minHeight: 100,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: colors.panelElevated,
    marginBottom: 16,
  },
  reportModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  reportCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
  },
  reportCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  reportSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  reportSubmitButtonDisabled: {
    opacity: 0.5,
  },
  reportSubmitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  });
}
