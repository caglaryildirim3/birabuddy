import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import moment from 'moment';
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Platform,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { useButtonDelay } from '../../hooks/useButtonDelay';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  deleteDoc,
  setDoc,
  addDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { auth, db } from '../../firebase/firebaseConfig';
import UserProfile from '../../components/UserProfile';

export default function RoomDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // Room details state
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const { isDisabled, executeWithDelay } = useButtonDelay(2000);
  const [isParticipant, setIsParticipant] = useState(false);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);
const [reportedUser, setReportedUser] = useState(null);
const [reportReason, setReportReason] = useState('');

  // Chat state
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const flatListRef = useRef(null);

  // Date/Time formatting functions (keeping your existing ones)
  const formatDateString = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return 'Not specified';
    
    try {
      const [year, month, day] = dateString.split('-');
      const date = new Date(year, month - 1, day);
      
      return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date string:', error);
      return dateString;
    }
  };

  const formatTimeString = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return 'Not specified';
    return timeString;
  };

  // NEW: Get display location based on participant status
  const getDisplayLocation = () => {
    if (!room) return 'Not specified';
    
    if (isParticipant) {
      // Show full location for participants
      if (room.barName && room.neighborhood) {
        return `${room.barName}, ${room.neighborhood}`;
      } else if (room.fullLocation) {
        return room.fullLocation;
      } else if (room.location) {
        // Fallback for old rooms that still use 'location' field
        return room.location;
      }
      return 'Location details will be shared';
    } else {
      // Show only neighborhood for non-participants
      if (room.neighborhood) {
        return `${room.neighborhood} (exact location shared after joining)`;
      } else if (room.location) {
        // Extract neighborhood from old location format if possible
        return `${room.location} area (exact location shared after joining)`;
      }
      return 'Location shared after joining';
    }
  };

  // Chat functionality
  useEffect(() => {
    if (!id || !isParticipant || !showChat) return;

    const messagesRef = collection(db, 'rooms', id, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));

    const unsubscribe = onSnapshot(q, snapshot => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [id, isParticipant, showChat]);

  const handleSend = async () => {
  if (message.trim() === '') return;

  try {
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const nickname = userDoc.exists() ? userDoc.data().nickname : 'unknown';

    const messagesRef = collection(db, 'rooms', id, 'messages');
    await addDoc(messagesRef, {
      text: message,
      sender: nickname,
      uid: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });

    setMessage('');
    flatListRef.current?.scrollToEnd({ animated: true });
  } catch (error) {
    console.error('Error sending message:', error);
    Alert.alert('Error', 'Failed to send message');
  }
};
const handleSendPress = () => {
  executeWithDelay(() => {
    handleSend();
  });
};

  const renderChatMessage = ({ item }) => {
    const isMe = item.uid === auth.currentUser.uid;
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessage : styles.otherMessage
      ]}>
        <View style={[
          styles.messageBubble,
          isMe ? styles.myMessageBubble : styles.otherMessageBubble
        ]}>
          {!isMe && (
            <Text style={styles.senderName}>{item.sender}</Text>
          )}
          <Text style={[
            styles.messageText,
            isMe ? styles.myMessageText : styles.otherMessageText
          ]}>
            {item.text}
          </Text>
          <Text style={styles.timestamp}>
            {item.createdAt?.toDate?.().toLocaleTimeString() || ''}
          </Text>
        </View>
      </View>
    );
  };

  // Check if current user is a participant (keeping your existing logic)
  const checkParticipationStatus = (participantsList, requestsList) => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      setIsParticipant(false);
      setHasRequestedJoin(false);
      return;
    }

    const isUserParticipant = participantsList.some(p => p.uid === currentUserId);
    setIsParticipant(isUserParticipant);

    const hasUserRequested = requestsList.some(r => r.uid === currentUserId);
    setHasRequestedJoin(hasUserRequested);
  };

  // Memoize expensive calculations
  const isCreator = useMemo(() => 
    auth.currentUser?.uid === room?.createdBy, 
    [auth.currentUser?.uid, room?.createdBy]
  );

  const formattedDate = useMemo(() => 
    formatDateString(room?.date), 
    [room?.date]
  );

  const formattedTime = useMemo(() => 
    formatTimeString(room?.time), 
    [room?.time]
  );

  // Memoize participant click handler
  const handleUserProfileClick = useCallback((uid) => {
    if (uid === auth.currentUser?.uid) return;
    setSelectedUserProfile(uid);
    setShowUserProfile(true);
  }, [auth.currentUser?.uid]);

  const closeUserProfile = useCallback(() => {
    setShowUserProfile(false);
    setSelectedUserProfile(null);
  }, []);

// Optimized useEffect for room data with debouncing
useEffect(() => {
  if (!id) return;
  setIsLoading(true);

  const roomRef = doc(db, 'rooms', id);
  let debounceTimer;

  const unsubscribeRoom = onSnapshot(roomRef, async (docSnap) => {
    if (docSnap.exists()) {
      const roomData = docSnap.data();
      setRoom(roomData);
      setIsLoading(false);
      
      // Process requests immediately without debouncing
    const uids = roomData?.requests || [];
    const timestamps = roomData?.requestTimestamps || {};

    console.log('🔍 Requests found:', uids); // DEBUG
    console.log('🔍 Timestamps:', timestamps); // DEBUG


if (uids.length > 0) {
  const requests = await Promise.all(
    uids.map(async (uid) => {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      const nickname = userData.nickname || `User-${uid.substring(0, 6)}`;
      const major = userData.major || '';

      const requestedAt = timestamps[uid]?.toDate() || new Date();

      return {
        uid,
        nickname,
        major,
        requestedAt,  // Use the adjusted local time here
      };
    })
  );

 requests.sort((a, b) => {
  const timeA = a.requestedAt instanceof Date ? a.requestedAt.getTime() : 0;
  const timeB = b.requestedAt instanceof Date ? b.requestedAt.getTime() : 0;
  return timeA - timeB;
});

  console.log('✅ Setting join requests:', requests); // DEBUG
  setJoinRequests(requests);
} else {
  console.log('ℹ️ No requests found'); // DEBUG
  setJoinRequests([]);
}

    } else {
      Alert.alert('Room Not Found', 'This room no longer exists.', [
        { text: 'OK', onPress: () => router.replace('/my-rooms') }
      ]);
    }
  });

  let unsubscribeParticipants;
  if (auth.currentUser?.uid) {
    const participantsCollectionRef = collection(db, 'rooms', id, 'participants');
    unsubscribeParticipants = onSnapshot(
      participantsCollectionRef,
      async (snapshot) => {
        const currentParticipantUids = participants.map(p => p.uid).sort().join(',');
        const newParticipantUids = snapshot.docs.map(doc => doc.data().uid).sort().join(',');
        
        if (currentParticipantUids !== newParticipantUids) {
          const list = await Promise.all(
            snapshot.docs.map(async (docSnap) => {
              const data = docSnap.data();
              const userDoc = await getDoc(doc(db, 'users', data.uid));
              const userData = userDoc.exists() ? userDoc.data() : {};
              
              const nickname = userData.nickname || `User-${data.uid.substring(0, 6)}`;
              const major = userData.major || '';

              return { uid: data.uid, nickname, major };
            })
          );
          setParticipants(list);
        }
      }
    );
  } else {
    setParticipants([]);
  }

  return () => {
    clearTimeout(debounceTimer);
    unsubscribeRoom();
    if (unsubscribeParticipants) unsubscribeParticipants();
  };
}, [id]);

  useEffect(() => {
    checkParticipationStatus(participants, joinRequests);
  }, [participants, joinRequests]);

  // Your existing handler functions (keeping all of them)
  const handleKickParticipant = async (participant) => {
    Alert.alert(
      'Kick Participant',
      `Are you sure you want to remove ${participant.nickname} from this room?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'rooms', id, 'participants', participant.uid));
              Alert.alert('Success', `${participant.nickname} has been removed from the room.`);
            } catch (error) {
              console.error('Error kicking participant:', error);
              Alert.alert('Error', `Failed to remove participant: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handleRequestJoin = async () => {
    if (!auth.currentUser) {
      Alert.alert('Authentication Required', 'You must be logged in to join rooms.');
      return;
    }

    try {
      const roomRef = doc(db, 'rooms', id);
      await updateDoc(roomRef, {
        requests: arrayUnion(auth.currentUser.uid),
        [`requestTimestamps.${auth.currentUser.uid}`]: serverTimestamp(),
      });
      Alert.alert('Request Sent', 'Your join request has been sent to the room creator.');
    } catch (error) {
      console.error('Error requesting to join:', error);
      Alert.alert('Error', 'Failed to send join request.');
    }
  };

  // NEW: Cancel request function
  const handleCancelRequest = async () => {
    if (!auth.currentUser) {
      Alert.alert('Authentication Required', 'You must be logged in to cancel requests.');
      return;
    }

    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel your join request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const roomRef = doc(db, 'rooms', id);
              await updateDoc(roomRef, {
                requests: arrayRemove(auth.currentUser.uid),
                [`requestTimestamps.${auth.currentUser.uid}`]: null,
              });
              Alert.alert('Request Cancelled', 'Your join request has been cancelled.');
            } catch (error) {
              console.error('Error cancelling request:', error);
              Alert.alert('Error', 'Failed to cancel request.');
            }
          },
        },
      ]
    );
  };
const handleReportUser = (participant) => {
  setReportedUser(participant);
  setReportModalVisible(true);
};

const submitReport = async () => {
  if (!reportReason.trim()) {
    Alert.alert('Error', 'Please provide a reason for the report');
    return;
  }

  try {
    // Add report to Firestore
    await addDoc(collection(db, 'reports'), {
      reportedUserId: reportedUser.uid,
      reportedUserNickname: reportedUser.nickname,
      reporterUserId: auth.currentUser.uid,
      roomId: id,
      roomName: room.name,
      reason: reportReason,
      createdAt: serverTimestamp(),
      status: 'pending'
    });

    Alert.alert('Report Submitted', 'Thank you for your report. We will review it shortly.');
    setReportModalVisible(false);
    setReportedUser(null);
    setReportReason('');
  } catch (error) {
    console.error('Error submitting report:', error);
    Alert.alert('Error', 'Failed to submit report. Please try again.');
  }
};
  const handleDeleteRoom = async () => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this room? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'rooms', id));
              router.replace('/my-rooms');
            } catch (error) {
              console.error('Error deleting room:', error);
              Alert.alert('Error', `Failed to delete room: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handleApprove = async (requestUser) => {
    const roomRef = doc(db, 'rooms', id);
    const participantDocRef = doc(db, 'rooms', id, 'participants', requestUser.uid);

    try {
      await setDoc(participantDocRef, {
        uid: requestUser.uid,
        nickname: requestUser.nickname,
        joinedAt: serverTimestamp(),
      });

      if (room && room.requests) {
        await updateDoc(roomRef, {
          requests: arrayRemove(requestUser.uid),
        });
      }
    } catch (error) {
      console.error('Error approving request:', error);
      Alert.alert('Error', `Failed to approve request: ${error.message}`);
    }
  };

  const handleDecline = async (requestUser) => {
    const roomRef = doc(db, 'rooms', id);
    try {
      if (room && room.requests) {
        await updateDoc(roomRef, {
          requests: arrayRemove(requestUser.uid),
        });
      }
    } catch (error) {
      console.error('Error declining request:', error);
      Alert.alert('Error', `Failed to decline request: ${error.message}`);
    }
  };

  if (!room) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <View style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Loading room details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                <Pressable 
                  style={styles.backButton} 
                  onPress={() => router.back()}
                >
                  <Text style={styles.backButtonText}>←</Text>
                </Pressable>
                <View style={styles.titleContainer}>
                  <Text style={styles.title} numberOfLines={1}>
                    {room?.name || 'Untitled Room'}
                  </Text>
                  <Text style={styles.subtitle}>
                    {participants.length}/{room?.maxParticipants || '?'} participants
                  </Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                {isParticipant && (
                  <Pressable 
                    style={[styles.chatToggleButton, showChat && styles.chatToggleButtonActive]} 
                    onPress={() => setShowChat(!showChat)}
                  >
                    <Text style={styles.chatToggleButtonText}>
                      {showChat ? '📋' : '💬'}
                    </Text>
                  </Pressable>
                )}
                {isCreator && (
                  <Pressable style={styles.deleteButton} onPress={handleDeleteRoom}>
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

         {/* Chat Modal */}
<Modal
  visible={showChat}
  animationType="slide"
  presentationStyle="pageSheet"
>
  <View style={styles.chatContainer}>
    <SafeAreaView style={styles.chatSafeArea}>
      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <View style={styles.chatHeaderContent}>
          <Text style={styles.chatTitle}>💬 Room Chat</Text>
          <Pressable 
            style={styles.closeChatButton} 
            onPress={() => setShowChat(false)}
          >
            <Text style={styles.closeChatButtonText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderChatMessage}
        contentContainerStyle={styles.flatListContent}
        style={styles.messagesFlatList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      />
     {/* User Profile Modal */}
<Modal
  visible={showUserProfile}
  animationType="slide"
  presentationStyle="pageSheet"
>
  {selectedUserProfile && (
    <UserProfile 
      uid={selectedUserProfile} 
      onClose={closeUserProfile}
    />
  )}
</Modal>
    </SafeAreaView>

    {/* Input - Outside SafeAreaView for keyboard handling */}
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 20}
    >
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[
              styles.input,
              isDisabled && styles.inputDisabled
            ]}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            value={message}
            onChangeText={setMessage}
            multiline={false}
            maxLength={500}
            editable={!isDisabled}
          />
          <Pressable 
            style={[
              styles.sendButton,
              (message.trim() === '' || isDisabled) && styles.sendButtonDisabled
            ]} 
            onPress={handleSendPress}
            disabled={message.trim() === '' || isDisabled}
          >
            <Text style={[
              styles.sendButtonText,
              isDisabled && styles.sendButtonTextDisabled
            ]}>
              {isDisabled ? '⏳' : '➤'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </View>
</Modal>

          {/* Scrollable Content - Your existing room details */}
         <ScrollView 
  style={styles.scrollView}
  contentContainerStyle={styles.scrollContent}
  showsVerticalScrollIndicator={true}
  removeClippedSubviews={true}
  scrollEventThrottle={16}
  keyboardShouldPersistTaps="handled"
  maxToRenderPerBatch={10}
  updateCellsBatchingPeriod={50}
  initialNumToRender={5}
  windowSize={10}
  bounces={true}
>
            {/* Room Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>🍺 Room Details</Text>
                {isCreator && (
                  <View style={styles.creatorBadge}>
                    <Text style={styles.creatorBadgeText}>👑 Host</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📍</Text>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Location</Text>
                    <Text style={styles.infoValue}>{getDisplayLocation()}</Text>
                  </View>
                </View>

                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>📅</Text>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Date</Text>
                    <Text style={styles.infoValue}>{formattedDate}</Text>
                  </View>
                </View>
                
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>⏰</Text>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Time</Text>
                    <Text style={styles.infoValue}>{formattedTime}</Text>
                  </View>
                </View>
                
                <View style={styles.infoItem}>
                  <Text style={styles.infoIcon}>👥</Text>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Capacity</Text>
                    <Text style={styles.infoValue}>
                      {participants.length}/{room?.maxParticipants || 0} people
                    </Text>
                  </View>
                </View>

                {room?.description && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoIcon}>📝</Text>
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Description</Text>
                      <Text style={styles.infoValue}>{room.description}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Participants Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>👥 Participants</Text>
                <View style={styles.participantCount}>
                  <Text style={styles.participantCountText}>{participants.length}</Text>
                </View>
              </View>
              
              <View style={styles.participantsList}>
                {participants.length > 0 ? (
                  participants.map((p, index) => (
                    <View key={p.uid} style={[
                      styles.participantCard,
                      index === 0 && styles.firstParticipantCard
                    ]}>
                      <View style={styles.participantLeft}>
                        <View style={styles.participantAvatar}>
                          <Text style={styles.participantAvatarText}>
                            {(p.nickname || 'A').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.participantInfo}>
                          <Pressable onPress={() => handleUserProfileClick(p.uid)}>
                            <View style={styles.participantNameContainer}>
  <Pressable onPress={() => handleUserProfileClick(p.uid)}>
    <Text style={[styles.participantName, styles.clickableUsername]}>
      {p.nickname || 'Anonymous'}
      {p.uid === room.createdBy && <Text style={styles.hostBadge}> 👑</Text>}
      {p.uid === auth.currentUser?.uid && <Text style={styles.youBadge}> (You)</Text>}
    </Text>
  </Pressable>
  
  {/* Report button - only show to other participants, not to self or when viewing own name */}
  {isParticipant && p.uid !== auth.currentUser?.uid && (
    <Pressable 
      style={styles.reportButton}
      onPress={() => handleReportUser(p)}
    >
      <Text style={styles.reportButtonText}>(!)</Text>
    </Pressable>
  )}
</View>
                            {p.major && (
                              <Text style={styles.participantMajor}>🎓 {p.major}</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                      {isCreator && p.uid !== auth.currentUser?.uid && (
                        <Pressable
                          style={styles.kickButton}
                          onPress={() => handleKickParticipant(p)}
                        >
                          <Text style={styles.kickButtonText}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>👻</Text>
                    <Text style={styles.emptyText}>No participants yet</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Join Requests - Only for creators */}
            {true && (  // Test için her zaman göster
                <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>📋 Join Requests</Text>
                  {joinRequests.length > 0 && (
                    <View style={styles.requestCount}>
                      <Text style={styles.requestCountText}>{joinRequests.length}</Text>
                    </View>
                  )}
                </View>
                
                {joinRequests.length > 0 && (
                  <Pressable
                    style={styles.approveAllButton}
                    onPress={async () => {
                      for (const r of joinRequests) {
                        await handleApprove(r);
                      }
                    }}
                  >
                    <Text style={styles.approveAllText}>✅ Approve All ({joinRequests.length})</Text>
                  </Pressable>
                )}

                <View style={styles.requestsList}>
                  {joinRequests.length > 0 ? (
                    joinRequests.map((r) => (
                      <View key={r.uid} style={styles.requestCard}>
                        <View style={styles.requestLeft}>
                          <View style={styles.requestAvatar}>
                            <Text style={styles.requestAvatarText}>
                              {(r.nickname || 'A').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.requestInfo}>
                            <Pressable onPress={() => handleUserProfileClick(r.uid)}>
                              <Text style={[styles.requestName, styles.clickableUsername]}>
                                {r.nickname || 'Anonymous'}
                              </Text>
                              {r.major && (
                                <Text style={styles.requestMajor}>🎓 {r.major}</Text>
                              )}
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.requestActions}>
                          <Pressable
                            style={styles.approveButton}
                            onPress={() => handleApprove(r)}
                          >
                            <Text style={styles.approveText}>✓</Text>
                          </Pressable>
                          <Pressable
                            style={styles.declineButton}
                            onPress={() => handleDecline(r)}
                          >
                            <Text style={styles.declineText}>✕</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyIcon}>📪</Text>
                      <Text style={styles.emptyText}>No pending requests</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Join Room Section - For non-participants */}
            {!isParticipant && !isCreator && (
              <View style={styles.section}>
                <View style={styles.joinPrompt}>
                  <Text style={styles.joinPromptIcon}>🍻</Text>
                  <Text style={styles.joinPromptText}>
                    Want to join this room?
                  </Text>
                  {hasRequestedJoin ? (
                    <View style={styles.pendingContainer}>
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>⏳ Request pending approval</Text>
                      </View>
                      <Pressable style={styles.cancelRequestButton} onPress={handleCancelRequest}>
                        <Text style={styles.cancelRequestButtonText}>Cancel Request</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.joinButton} onPress={handleRequestJoin}>
                      <Text style={styles.joinButtonText}>🙋‍♂️ Request to Join</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
            
          </ScrollView>

          {/* User Profile Modal */}
          <Modal
            visible={showUserProfile}
            animationType="slide"
            presentationStyle="pageSheet"
          >
            {selectedUserProfile && (
              <UserProfile 
                uid={selectedUserProfile} 
                onClose={closeUserProfile}
              />
            )}
          </Modal>
          {/* Inline Report Modal - appears over the content */}
{reportModalVisible && (
  <View style={{
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1000,
  }}>
    <View style={{
      backgroundColor: '#1a1a1a',
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      borderWidth: 1,
      borderColor: '#333',
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <Text style={{
          color: '#fff',
          fontSize: 20,
          fontWeight: '600',
        }}>Report User</Text>
        <Pressable 
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#2a2a2a',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#333',
          }}
          onPress={() => {
            setReportModalVisible(false);
            setReportedUser(null);
            setReportReason('');
          }}
        >
          <Text style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: '500',
          }}>✕</Text>
        </Pressable>
      </View>
      
      {/* Subtitle */}
      <Text style={{
        color: '#ff0000ff',
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 20,
        textAlign: 'center',
      }}>
        Reporting: {reportedUser?.nickname || 'User'}
      </Text>
      
      {/* Text Input */}
      <TextInput
        style={{
          backgroundColor: '#2a2a2a',
          borderRadius: 12,
          padding: 16,
          color: '#fff',
          fontSize: 15,
          minHeight: 120,
          textAlignVertical: 'top',
          borderWidth: 1,
          borderColor: '#333',
          marginBottom: 24,
        }}
        placeholder="Please describe the issue..."
        placeholderTextColor="#999"
        value={reportReason}
        onChangeText={setReportReason}
        multiline={true}
        maxLength={500}
      />
      
      {/* Buttons */}
      <View style={{
        flexDirection: 'row',
        gap: 12,
      }}>
        <Pressable 
          style={{
            flex: 1,
            backgroundColor: '#2a2a2a',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#333',
          }}
          onPress={() => {
            setReportModalVisible(false);
            setReportedUser(null);
            setReportReason('');
          }}
        >
          <Text style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: '500',
          }}>Cancel</Text>
        </Pressable>
        
        <Pressable 
          style={{
            flex: 1,
            backgroundColor: !reportReason.trim() ? '#333' : '#FF3B30',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
          onPress={submitReport}
          disabled={!reportReason.trim()}
        >
          <Text style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: '600',
          }}>Submit Report</Text>
        </Pressable>
      </View>
    </View>
  </View>
)}
        </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#1a1a1a',
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#333',
    borderTopColor: '#86945f',
    marginBottom: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },

  // Header Styles
  header: {
    backgroundColor: '#000000ff',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingTop: Platform.OS === 'ios' ? 0 : 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    color: '#86945f',
    fontSize: 20,
    fontWeight: '600',
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    color: '#999',
    fontSize: 14,
    fontWeight: '400',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  chatToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  chatToggleButtonActive: {
    backgroundColor: '#86945f',
    borderColor: '#86945f',
  },
  chatToggleButtonText: {
    fontSize: 18,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  deleteButtonText: {
    fontSize: 16,
  },

  // Chat Styles
  chatContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  chatSafeArea: {
    flex: 1,
  },
  chatHeader: {
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingTop: Platform.OS === 'ios' ? 0 : 10,
  },
  chatHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  chatTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  closeChatButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  closeChatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  messagesFlatList: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  flatListContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  messageContainer: {
    marginBottom: 12,
  },
  myMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  myMessageBubble: {
    backgroundColor: '#86945f',
    borderBottomRightRadius: 8,
  },
  otherMessageBubble: {
    backgroundColor: '#2a2a2a',
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  senderName: {
    color: '#999',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#333',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#86945f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  sendButtonTextDisabled: {
    color: '#666',
  },

  // Content Styles
  scrollView: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },

  // Card Styles
  infoCard: {
    backgroundColor: '#292825ff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  creatorBadge: {
    backgroundColor: '#86945f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  creatorBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoGrid: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
  },

  // Section Styles
  section: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  participantCount: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  participantCountText: {
    color: '#86945f',
    fontSize: 14,
    fontWeight: '600',
  },
  requestCount: {
    backgroundColor: '#86945f',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  requestCountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Participant Styles
  participantsList: {
    gap: 12,
  },
  participantCard: {
    backgroundColor: '#292825ff',
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333',
  },
  firstParticipantCard: {
    borderColor: '#86945f',
    borderWidth: 2,
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#86945f',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  clickableUsername: {
    textDecorationLine: 'underline',
    textDecorationColor: '#86945f',
  },
  participantMajor: {
    color: '#999',
    fontSize: 14,
    fontWeight: '400',
  },
  participantNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  reportButton: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#FF3B30',
    minWidth: 32,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: 'bold',
  },
  hostBadge: {
    color: '#86945f',
  },
  youBadge: {
    color: '#86945f',
  },
  kickButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  kickButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },

  // Request Styles
  approveAllButton: {
    backgroundColor: '#16a34a',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  approveAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  requestsList: {
    gap: 12,
  },
  requestCard: {
    backgroundColor: '#292825ff',
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#86945f',
  },
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  requestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#86945f',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  requestAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  requestMajor: {
    color: '#999',
    fontSize: 14,
    fontWeight: '400',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveButton: {
    backgroundColor: '#16a34a',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  declineButton: {
    backgroundColor: '#dc2626',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Join Section Styles
  joinPrompt: {
    backgroundColor: '#1a1a1a',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  joinPromptIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  joinPromptText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 20,
    textAlign: 'center',
  },
  joinButton: {
    backgroundColor: '#86945f',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    minWidth: 180,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pendingContainer: {
    alignItems: 'center',
    gap: 12,
  },
  pendingBadge: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pendingText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelRequestButton: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cancelRequestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // Empty State Styles
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '400',
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10000,
    elevation: 10000,
  },
  reportModalContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#333',
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  reportModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  reportModalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  reportModalSubtitle: {
    color: '#86945f',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 20,
    textAlign: 'center',
  },
  reportReasonInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
  },
  reportModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  reportCancelButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  reportCancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  reportSubmitButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportSubmitButtonDisabled: {
    backgroundColor: '#333',
  },
  reportSubmitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});