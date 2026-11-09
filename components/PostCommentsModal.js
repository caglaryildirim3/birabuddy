import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import { formatRelativeTime } from '../utils/dateUtils';
import { getDeletedAwareSnapshot, isDeletedComment } from '../utils/deletedUserUtils';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { notifyPostActivity } from '../utils/activityNotificationUtils';
import {
  addComment,
  buildCommentThreads,
  COMMENT_LIMIT,
  deleteComment,
  toggleCommentLike,
} from '../utils/postUtils';
import PressableUserAvatar from './PressableUserAvatar';
import UserProfile from './UserProfile';

export default function PostCommentsModal({ visible, postId, postOwnerId, onClose }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [profileUid, setProfileUid] = useState(null);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [likingId, setLikingId] = useState(null);

  const currentUid = auth.currentUser?.uid;
  const inputBottomPadding =
    keyboardHeight > 0 ? keyboardHeight + 8 : Math.max(insets.bottom, 12) + 8;

  const threadedComments = useMemo(() => buildCommentThreads(comments), [comments]);

  useEffect(() => {
    if (!visible || !postId) return;

    setLoading(true);
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((comment) => !isDeletedComment(comment));
        setComments(fetched);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [visible, postId]);

  useEffect(() => {
    if (!visible) {
      setText('');
      setReplyingTo(null);
      setProfileUid(null);
      Keyboard.dismiss();
    }
  }, [visible]);

  const handleClose = () => {
    setText('');
    setReplyingTo(null);
    Keyboard.dismiss();
    onClose();
  };

  const handleSubmit = async () => {
    if (!currentUid || !text.trim() || submitting) return;

    setSubmitting(true);
    const trimmed = text.trim();
    try {
      await addComment(postId, currentUid, text, replyingTo?.id || null);
      notifyPostActivity({
        recipientId: postOwnerId,
        type: 'post_comment',
        postId,
        preview: trimmed.slice(0, 80),
      });
      if (replyingTo?.authorId && replyingTo.authorId !== postOwnerId) {
        notifyPostActivity({
          recipientId: replyingTo.authorId,
          type: 'post_comment',
          postId,
          preview: trimmed.slice(0, 80),
        });
      }
      setText('');
      setReplyingTo(null);
    } catch (error) {
      Alert.alert(t('error'), error.message || t('failedToPostComment'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (comment) => {
    Alert.alert(t('deleteComment'), t('deleteCommentConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(postId, comment.id);
          } catch (error) {
            Alert.alert(t('error'), t('failedToDeleteComment'));
          }
        },
      },
    ]);
  };

  const handleLike = async (comment) => {
    if (!currentUid || likingId) return;

    const likes = Array.isArray(comment.likes) ? comment.likes : [];
    const isLiked = likes.includes(currentUid);

    setLikingId(comment.id);
    try {
      await toggleCommentLike(postId, comment.id, currentUid, isLiked);
      if (!isLiked) {
        notifyPostActivity({
          recipientId: comment.userId,
          type: 'comment_like',
          postId,
          commentId: comment.id,
        });
      }
    } catch (error) {
      Alert.alert(t('error'), t('failedToUpdateLike'));
    } finally {
      setLikingId(null);
    }
  };

  const handleReply = (comment) => {
    const rootId = comment.parentId || comment.id;
    const rootComment = comments.find((c) => c.id === rootId) || comment;
    setReplyingTo({
      id: rootId,
      name: rootComment.userSnapshot?.name || 'User',
      authorId: comment.userId,
    });
  };

  const renderComment = ({ item }) => {
    const isOwn = item.userId === currentUid;
    const likes = Array.isArray(item.likes) ? item.likes : [];
    const isLiked = currentUid ? likes.includes(currentUid) : false;
    const likeCount = likes.length;

    const commentSnapshot = getDeletedAwareSnapshot(item.userSnapshot, t);

    return (
      <View style={[styles.commentRow, item.isReply && styles.replyRow]}>
        <PressableUserAvatar
          uid={item.userId}
          snapshot={commentSnapshot}
          size={item.isReply ? 28 : 36}
          onPress={item.isDeleted ? undefined : setProfileUid}
        />
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Pressable
              onPress={item.isDeleted ? undefined : () => setProfileUid(item.userId)}
              disabled={item.isDeleted}
            >
              <Text style={styles.commentName}>{commentSnapshot.name}</Text>
            </Pressable>
            <Text style={styles.commentTime}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>

          <View style={styles.commentActions}>
            <Pressable
              style={styles.commentAction}
              onPress={() => handleLike(item)}
              disabled={!currentUid || likingId === item.id}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={16}
                color={isLiked ? colors.danger : colors.textMuted}
              />
              {likeCount > 0 ? (
                <Text style={[styles.actionCount, isLiked && styles.actionCountLiked]}>
                  {likeCount}
                </Text>
              ) : null}
            </Pressable>

            {!item.isReply ? (
              <Pressable style={styles.commentAction} onPress={() => handleReply(item)}>
                <Text style={styles.replyLabel}>{t('reply')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {isOwn ? (
          <Pressable onPress={() => handleDeleteComment(item)} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('comments')}</Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={threadedComments}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t('noCommentsYet')}</Text>
            }
          />
        )}

        <View style={[styles.inputArea, { paddingBottom: inputBottomPadding }]}>
          {replyingTo ? (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText}>
                {t('replyingTo', { name: replyingTo.name })}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={
                replyingTo
                  ? t('replyPlaceholder', { name: replyingTo.name })
                  : t('addCommentPlaceholder')
              }
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              maxLength={COMMENT_LIMIT}
              multiline
            />
            <Pressable
              style={[styles.sendButton, (!text.trim() || submitting) && styles.sendButtonDisabled]}
              onPress={handleSubmit}
              disabled={!text.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Ionicons name="send" size={18} color={colors.onAccent} />
              )}
            </Pressable>
          </View>
        </View>

      </View>

      <Modal
        visible={!!profileUid}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProfileUid(null)}
      >
        {profileUid ? (
          <UserProfile uid={profileUid} onClose={() => setProfileUid(null)} />
        ) : null}
      </Modal>
    </Modal>
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    closeButton: {
      padding: 4,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    list: {
      flex: 1,
    },
    listContent: {
      padding: 20,
      paddingBottom: 8,
      flexGrow: 1,
    },
    emptyText: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 15,
      marginTop: 40,
    },
    commentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
      gap: 10,
    },
    replyRow: {
      marginLeft: 28,
      marginBottom: 12,
    },
    commentBody: {
      flex: 1,
    },
    commentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    commentName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    commentTime: {
      fontSize: 12,
      color: colors.textMuted,
    },
    commentText: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    commentActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 8,
    },
    commentAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    actionCount: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    actionCountLiked: {
      color: colors.danger,
    },
    replyLabel: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600',
    },
    inputArea: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.background,
    },
    replyingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    replyingText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 10,
    },
    input: {
      flex: 1,
      backgroundColor: colors.panelElevated,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
  });
