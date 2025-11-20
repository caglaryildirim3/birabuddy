import { Ionicons } from '@expo/vector-icons'; // Added for better icons
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { auth, db } from '../../firebase/firebaseConfig';
import { useButtonDelay } from '../../hooks/useButtonDelay';

export default function ChatRoom() {
  const { roomId } = useLocalSearchParams();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef(null);
  const { isDisabled, executeWithDelay } = useButtonDelay(2000);
  const router = useRouter();

  // We need to check if user is participant to allow viewing
  // For this standalone page, we assume if they can access it, they are allowed,
  // or the Firestore rules will block them.
  
  useEffect(() => {
    let unsubscribe = null;

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribe) unsubscribe();

      if (!currentUser || !currentUser.emailVerified) {
        setMessages([]);
        setLoading(false);
        return;
      }

      if (roomId) {
        setLoading(true);
        const q = query(
          collection(db, 'rooms', roomId, 'messages'),
          orderBy('createdAt', 'asc')
        );

        unsubscribe = onSnapshot(q, snapshot => {
          const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setMessages(msgs);
          setLoading(false);
        }, (error) => {
          console.log("Error fetching messages:", error);
          setLoading(false);
        });
      }
    });

    return () => {
      authUnsubscribe();
      if (unsubscribe) unsubscribe();
    };
  }, [roomId]);

  const handleSend = async () => {
    if (isDisabled || message.trim() === '') return;

    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const nickname = userData.instagram || userData.nickname || 'unknown';

      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      await addDoc(messagesRef, {
        text: message,
        sender: nickname,
        uid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setMessage('');
      // Slight delay to allow keyboard to stay up or animations to finish
      setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleSendPress = () => {
    executeWithDelay(() => {
      handleSend();
    });
  };

  const renderItem = ({ item }) => {
    const isMe = item.uid === auth.currentUser.uid;
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.messageRight : styles.messageLeft
      ]}>
        <View style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleOther
        ]}>
          {!isMe && <Text style={styles.sender}>{item.sender}</Text>}
          <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>
            {item.text}
          </Text>
          <Text style={[styles.timestamp, isMe ? styles.timestampMe : styles.timestampOther]}>
            {item.createdAt?.toDate?.().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header - Optional if you want a custom header, otherwise Expo Router handles it */}
      <View style={styles.header}>
         <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
         </Pressable>
         <Text style={styles.headerTitle}>Chat Room</Text>
         <View style={{width: 24}} /> 
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#E8A4C7" />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyIcon}>👻</Text>
              <Text style={styles.emptyText}>No messages yet.</Text>
              <Text style={styles.emptySubText}>Be the first to say hi!</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              style={styles.messagesFlatList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />
          )}
        </View>
      </TouchableWithoutFeedback>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              isDisabled && styles.inputDisabled
            ]}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            value={message}
            onChangeText={setMessage}
            editable={!isDisabled}
            multiline={false}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSendPress}
          />
          <Pressable 
            style={[
              styles.sendButton,
              (isDisabled || !message.trim()) && styles.sendButtonDisabled
            ]} 
            onPress={handleSendPress}
            disabled={isDisabled || !message.trim()}
          >
             {isDisabled ? (
                <Text style={{fontSize: 18}}>⏳</Text>
             ) : (
                <Ionicons name="send" size={20} color="#1C6F75" />
             )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47', // Dark Pink/Purple Theme
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#5A4B5C',
    backgroundColor: '#4A3B47',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#E8A4C7',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  messagesFlatList: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  
  // Input Styles
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 12,
    backgroundColor: '#5A4B5C', // Darker bar background
    borderTopWidth: 1,
    borderTopColor: '#7A6B7D',
  },
  input: {
    flex: 1,
    backgroundColor: '#4A3B47', // Input background
    color: '#E8D5DA', // Input text color
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#7A6B7D',
    maxHeight: 100,
  },
  inputDisabled: {
    opacity: 0.5,
    backgroundColor: '#333',
  },
  sendButton: {
    backgroundColor: '#E1B604', // Mustard button
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#7A6B7D', // Grayed out
    elevation: 0,
  },

  // Message Bubbles
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  messageLeft: {
    justifyContent: 'flex-start',
  },
  messageRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleMe: {
    backgroundColor: '#E8D5DA', // Light beige for me
    borderBottomRightRadius: 4, // Unique shape for me
  },
  bubbleOther: {
    backgroundColor: '#5A4B5C', // Purple/Grey for others
    borderBottomLeftRadius: 4, // Unique shape for others
    borderWidth: 1,
    borderColor: '#7A6B7D',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  textMe: {
    color: '#4d4c41', // Dark text on light bubble
  },
  textOther: {
    color: '#E8D5DA', // Light text on dark bubble
  },
  sender: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#E8A4C7', // Pink sender name
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timestampMe: {
    color: '#888',
  },
  timestampOther: {
    color: '#aaa',
  },

  // Empty State
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    color: '#E8A4C7',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
});