import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';
import { formatRelativeTime } from '../utils/dateUtils';
import { useUserProfileModal } from '../hooks/useUserProfileModal';
import { addComment, COMMENT_LIMIT, deleteComment } from '../utils/postUtils';
import PressableUserAvatar from './PressableUserAvatar';

export default function PostCommentsModal({ visible, postId, onClose }) {
  const { openProfile, ProfileModal } = useUserProfileModal();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentUid = auth.currentUser?.uid;

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
        setComments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [visible, postId]);

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!currentUid || !text.trim() || submitting) return;

    setSubmitting(true);
    try {
      await addComment(postId, currentUid, text);
      setText('');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (comment) => {
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(postId, comment.id);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete comment');
          }
        },
      },
    ]);
  };

  const renderComment = ({ item }) => {
    const isOwn = item.userId === currentUid;

    return (
      <View style={styles.commentRow}>
        <PressableUserAvatar
          uid={item.userId}
          snapshot={item.userSnapshot}
          size={36}
          onPress={openProfile}
        />
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Pressable onPress={() => openProfile(item.userId)}>
              <Text style={styles.commentName}>{item.userSnapshot?.name || 'User'}</Text>
            </Pressable>
            <Text style={styles.commentTime}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
        {isOwn ? (
          <Pressable onPress={() => handleDeleteComment(item)} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={BeerColors.textMuted} />
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={BeerColors.textPrimary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BeerColors.accent} />
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
            }
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor={BeerColors.textMuted}
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
              <ActivityIndicator size="small" color={BeerColors.onAccent} />
            ) : (
              <Ionicons name="send" size={18} color={BeerColors.onAccent} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ProfileModal />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BeerColors.borderSoft,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 20,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: BeerColors.textSecondary,
    fontSize: 15,
    marginTop: 40,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 10,
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
    color: BeerColors.textPrimary,
  },
  commentTime: {
    fontSize: 12,
    color: BeerColors.textMuted,
  },
  commentText: {
    fontSize: 15,
    color: BeerColors.textPrimary,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1,
    borderTopColor: BeerColors.borderSoft,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: BeerColors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BeerColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
