import { useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { auth, db } from '../../firebase/firebaseConfig';
import { useButtonDelay } from '../../hooks/useButtonDelay';
import { onAuthStateChanged } from 'firebase/auth';

export default function ChatRoom() {
  const { roomId } = useLocalSearchParams();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const flatListRef = useRef(null);
  const { isDisabled, executeWithDelay } = useButtonDelay(2000); // 👈 INCREASED to 2 seconds

useEffect(() => {
  let unsubscribe = null;

  const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
    // Clean up existing listener
    if (unsubscribe) unsubscribe();

    if (!currentUser || !currentUser.emailVerified) {
      // User not authenticated, clear messages
      setMessages([]);
      return;
    }

    // User is authenticated, start listening to messages
    if (roomId && isParticipant && showChat) {
      const q = query(
        collection(db, 'rooms', roomId, 'messages'),
        orderBy('createdAt', 'asc')
      );

      unsubscribe = onSnapshot(q, snapshot => {
        const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMessages(msgs);
      });
    }
  });

  return () => {
    authUnsubscribe();
    if (unsubscribe) unsubscribe();
  };
}, [roomId, isParticipant, showChat]); // Keep your existing dependencies

  const handleSend = async () => {
    console.log('handleSend called, isDisabled:', isDisabled); // 👈 DEBUG LOG
    
    // 👈 CRITICAL: Return early if disabled OR if message is empty
    if (isDisabled) {
      console.log('Button is disabled, not sending');
      return;
    }
    
    if (message.trim() === '') {
      console.log('Message is empty, not sending');
      return;
    }

    console.log('Sending message:', message); // 👈 DEBUG LOG

    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const nickname = userDoc.exists() ? userDoc.data().nickname : 'unknown';

      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      await addDoc(messagesRef, {
        text: message,
        sender: nickname,
        uid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setMessage(''); // Clear input
      flatListRef.current?.scrollToEnd({ animated: true });
      console.log('Message sent successfully'); // 👈 DEBUG LOG
    } catch (error) {
      console.error('Error sending message:', error);
    }
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
          <Text style={styles.sender}>{item.sender}</Text>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.timestamp}>
            {item.createdAt?.toDate?.().toLocaleTimeString() || ''}
          </Text>
        </View>
      </View>
    );
  };

  // 👈 SIMPLIFIED: Direct call to executeWithDelay
  const handleSendPress = () => {
    console.log('Send button pressed, isDisabled:', isDisabled); // 👈 DEBUG LOG
    executeWithDelay(() => {
      console.log('executeWithDelay callback called'); // 👈 DEBUG LOG
      handleSend();
    });
  };

  return (
    <View style={styles.container}> {/* 👈 CHANGED: Removed SafeAreaView from here */}
      <SafeAreaView style={styles.safeArea}> {/* 👈 ADDED: SafeAreaView just for top */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              style={styles.messagesFlatList}
            />
          </View>
        </TouchableWithoutFeedback>
      </SafeAreaView>
      
      {/* 👈 MOVED: Input container OUTSIDE SafeAreaView */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              isDisabled && styles.inputDisabled
            ]}
            placeholder="type your message..."
            placeholderTextColor="#aaa"
            value={message}
            onChangeText={setMessage}
            editable={!isDisabled}
            multiline={false} // 👈 CHANGED: Single line for better keyboard handling
            maxLength={500}
          />
          <Pressable 
            style={[
              styles.sendButton,
              isDisabled && styles.sendButtonDisabled
            ]} 
            onPress={handleSendPress} // 👈 CHANGED: New function name
            disabled={isDisabled}
          >
            <Text style={[
              styles.sendButtonText,
              isDisabled && styles.sendButtonTextDisabled
            ]}>
              {isDisabled ? '⏳' : '📤'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C6F75',
  },
  safeArea: { // 👈 NEW: SafeAreaView style
    flex: 1,
  },
  content: { // 👈 NEW: Content wrapper
    flex: 1,
  },
  messagesFlatList: { // 👈 NEW: FlatList specific styles
    flex: 1,
  },
  messagesList: {
    padding: 20,
    paddingBottom: 10,
    flexGrow: 1, // 👈 ADDED: Ensures proper scrolling
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16, // 👈 INCREASED: More padding
    paddingBottom: Platform.OS === 'ios' ? 34 : 16, // 👈 ADDED: Bottom safe area for iOS
    backgroundColor: '#1C6F75',
    borderTopWidth: 2, // 👈 INCREASED: More visible border
    borderTopColor: '#2A7A81',
    shadowColor: '#000', // 👈 ADDED: Shadow for separation
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  input: {
    flex: 1,
    backgroundColor: '#2A7A81',
    color: '#fff',
    padding: 16, // 👈 INCREASED: More padding
    borderRadius: 25, // 👈 INCREASED: More rounded
    marginRight: 12, // 👈 INCREASED: More space
    minHeight: 50, // 👈 INCREASED: Taller input
    fontSize: 16,
    textAlignVertical: 'center',
    borderWidth: 1,
    borderColor: '#3A8A91',
  },
  inputDisabled: {
    opacity: 0.5, // 👈 INCREASED: More obvious when disabled
    backgroundColor: '#444',
  },
  sendButton: {
    backgroundColor: '#E1B604',
    width: 50, // 👈 INCREASED: Bigger button
    height: 50, // 👈 INCREASED: Bigger button
    borderRadius: 25, // 👈 UPDATED: Match new size
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonText: {
    fontSize: 20, // 👈 INCREASED: Bigger emoji
  },
  sendButtonDisabled: {
    backgroundColor: '#666',
    opacity: 0.5,
  },
  sendButtonTextDisabled: {
    opacity: 0.7,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 4,
  },
  messageLeft: {
    justifyContent: 'flex-start',
  },
  messageRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 2,
  },
  bubbleMe: {
    backgroundColor: '#E1B604',
  },
  bubbleOther: {
    backgroundColor: '#2A7A81',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  sender: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1C6F75',
  },
  timestamp: {
    fontSize: 10,
    color: '#444',
    marginTop: 4,
    textAlign: 'right',
  },
});