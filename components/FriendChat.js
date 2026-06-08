import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BeerColors from '../constants/BeerColors';
import { auth } from '../firebase/firebaseConfig';
import {
  assertCanChatWith,
  sendFriendMessage,
  subscribeToFriendMessages,
} from '../utils/chatUtils';

export default function FriendChat({ friendUid, friendName, friendPhotoUrl, onClose }) {
  const insets = useSafeAreaInsets();
  const currentUid = auth.currentUser?.uid;
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [canChat, setCanChat] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (!currentUid || !friendUid) return undefined;

    let unsubMessages = () => {};

    const init = async () => {
      try {
        const conversationId = await assertCanChatWith(currentUid, friendUid);
        setCanChat(true);
        unsubMessages = subscribeToFriendMessages(
          conversationId,
          (nextMessages) => {
            setMessages(nextMessages);
            setLoading(false);
          },
          (error) => {
            console.error('Friend chat listener error:', error);
            Alert.alert('Error', error?.message || 'Failed to load messages');
            setLoading(false);
          }
        );
      } catch (error) {
        Alert.alert('Error', error.message || 'Unable to open chat');
        setCanChat(false);
        setLoading(false);
      }
    };

    init();

    return () => unsubMessages();
  }, [currentUid, friendUid]);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || !currentUid || !canChat || sending) return;

    setSending(true);
    try {
      const user = auth.currentUser;
      const senderName =
        user?.displayName || user?.email?.split('@')[0] || 'You';

      const optimisticId = `local-${Date.now()}`;
      const optimisticMessage = {
        id: optimisticId,
        text: trimmed,
        senderId: currentUid,
        senderName,
        createdAt: { toDate: () => new Date() },
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      setMessage('');

      try {
        await sendFriendMessage({
          currentUid,
          friendUid,
          text: trimmed,
          senderName,
        });
      } catch (sendError) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        throw sendError;
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderId === currentUid;
    return (
      <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.otherMessageRow]}>
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          {!isMe ? <Text style={styles.senderName}>{item.senderName || friendName}</Text> : null}
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
            {item.text}
          </Text>
          <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.otherTimestamp]}>
            {item.createdAt?.toDate?.().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }) || ''}
          </Text>
        </View>
      </View>
    );
  };

  const initial = (friendName || '?').charAt(0).toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={BeerColors.textPrimary} />
          </Pressable>
          {friendPhotoUrl ? (
            <Image source={{ uri: friendPhotoUrl }} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{friendName}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BeerColors.accent} />
          </View>
        ) : !canChat ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.emptyText}>You can only chat with friends</Text>
          </View>
        ) : (
          <>
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
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <Text style={styles.emptyText}>Say hi to {friendName}</Text>
                </View>
              }
            />

            <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TextInput
                style={styles.input}
                placeholder="Message..."
                placeholderTextColor={BeerColors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
              />
              <Pressable
                style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!message.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={BeerColors.onAccent} />
                ) : (
                  <Ionicons name="send" size={18} color={BeerColors.onAccent} />
                )}
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BeerColors.borderSoft,
  },
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: BeerColors.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: BeerColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    color: BeerColors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesFlatList: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: BeerColors.textMuted,
    fontSize: 15,
  },
  messageRow: {
    marginBottom: 10,
    maxWidth: '82%',
  },
  myMessageRow: {
    alignSelf: 'flex-end',
  },
  otherMessageRow: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: BeerColors.accent,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: BeerColors.panelElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  senderName: {
    color: BeerColors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: BeerColors.onAccent,
  },
  otherMessageText: {
    color: BeerColors.textPrimary,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 6,
  },
  myTimestamp: {
    color: 'rgba(0,0,0,0.45)',
    textAlign: 'right',
  },
  otherTimestamp: {
    color: BeerColors.textMuted,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BeerColors.borderSoft,
    backgroundColor: BeerColors.panel,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: BeerColors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BeerColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
