import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import UserProfile from '../../components/UserProfile';
import { auth, db } from '../../firebase/firebaseConfig';
import { useButtonDelay } from '../../hooks/useButtonDelay';

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
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportedUser, setReportedUser] = useState(null);
  const [reportReason, setReportReason] = useState('');

  // Chat state
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const flatListRef = useRef(null);

  // Date/Time formatting
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
      return dateString;
    }
  };

  const formatTimeString = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return 'Not specified';
    return timeString;
  };

  const getDisplayLocation = () => {
    if (!room) return 'Not specified';
    if (isParticipant || isCreator) {
      if (room.barName && room.neighborhood) {
        return `${room.barName}, ${room.neighborhood}`;
      } else if (room.fullLocation) {
        return room.fullLocation;
      } else if (room.location) {
        return room.location;
      }
      return 'Location details will be shared';
    } else {
      if (room.neighborhood) {
        return `${room.neighborhood} (exact location shared after joining)`;
      } else if (room.location) {
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
      const userData = userDoc.exists() ? userDoc.data() : {};
      const nickname = userData.instagram || userData.nickname || 'unknown';
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
          <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.otherTimestamp]}>
            {item.createdAt?.toDate?.().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || ''}
          </Text>
        </View>
      </View>
    );
  };

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

  const isCreator = useMemo(() => {
    if (!auth.currentUser?.uid || !room?.createdBy) return false;
    return auth.currentUser.uid === room.createdBy;
  }, [auth.currentUser?.uid, room?.createdBy]);

  const formattedDate = useMemo(() => formatDateString(room?.date), [room?.date]);
  const formattedTime = useMemo(() => formatTimeString(room?.time), [room?.time]);

  const handleUserProfileClick = useCallback((uid) => {
    if (uid === auth.currentUser?.uid) return;
    setSelectedUserProfile(uid);
    setShowUserProfile(true);
  }, [auth.currentUser?.uid]);

  const closeUserProfile = useCallback(() => {
    setShowUserProfile(false);
    setSelectedUserProfile(null);
  }, []);

  useEffect(() => {
    if (!id) return;
    
    // 1. Listen to Room Document
    const roomRef = doc(db, 'rooms', id);
    const unsubscribeRoom = onSnapshot(roomRef, async (docSnap) => {
      if (!docSnap.exists()) {
        Alert.alert('Room Not Found', 'This room no longer exists.', [
          { text: 'OK', onPress: () => router.replace('/my-rooms') }
        ]);
        return;
      }
      const roomData = docSnap.data();
      setRoom(roomData);
      
      // Process Join Requests
      const uids = roomData?.requests || [];
      const timestamps = roomData?.requestTimestamps || {};

      if (uids.length > 0) {
        try {
          const requests = [];
          for (let i = 0; i < uids.length; i++) {
            const uid = uids[i];
            if (!uid) continue; // Skip invalid UIDs

            try {
              const userSnap = await getDoc(doc(db, 'users', uid));
              const nickname = userSnap.exists() ? (userSnap.data().instagram || userSnap.data().nickname) : `User-${uid.substr(0,5)}`;
              const major = userSnap.exists() ? userSnap.data().major : 'Unknown';
              
              let requestedAt = new Date();
              if (timestamps[uid]) {
                 if (timestamps[uid].toDate) requestedAt = timestamps[uid].toDate();
                 else if (timestamps[uid].seconds) requestedAt = new Date(timestamps[uid].seconds * 1000);
              }
              requests.push({ uid, nickname, major, requestedAt });
            } catch (e) {
              console.log('Error fetching request user', e);
            }
          }
          requests.sort((a, b) => (a.requestedAt?.getTime() || 0) - (b.requestedAt?.getTime() || 0));
          setJoinRequests(requests);
        } catch (error) {
          setJoinRequests([]);
        }
      } else {
        setJoinRequests([]);
      }
    });

    // 2. Listen to Participants Subcollection
    let unsubscribeParticipants;
    if (auth.currentUser?.uid) {
      const participantsCollectionRef = collection(db, 'rooms', id, 'participants');
      unsubscribeParticipants = onSnapshot(participantsCollectionRef, async (snapshot) => {
        try {
          const list = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            
            // --- SAFETY CHECK: PREVENT CRASH ON INVALID UID ---
            if (!data.uid || typeof data.uid !== 'string') {
              return null; 
            }

            try {
              const userDoc = await getDoc(doc(db, 'users', data.uid));
              const userData = userDoc.exists() ? userDoc.data() : {};
              
              const nickname = userData.instagram || userData.nickname || `User-${data.uid.substr(0,5)}`;
              const major = userData.major || 'Not specified';
              
              return { uid: data.uid, nickname, major };
            } catch (e) {
              return { uid: data.uid, nickname: 'Unknown User', major: '' };
            }
          }));
          
          // Filter out any nulls from invalid UIDs
          setParticipants(list.filter(p => p !== null));
          
        } catch (e) {
          console.error("Error processing participants", e);
        }
      });
    }

    return () => {
      unsubscribeRoom();
      if (unsubscribeParticipants) unsubscribeParticipants();
    };
  }, [id]);

  useEffect(() => {
    checkParticipationStatus(participants, joinRequests);
  }, [participants, joinRequests]);

  const handleKickParticipant = async (participant) => {
    Alert.alert('Kick Participant', `Remove ${participant.nickname}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'rooms', id, 'participants', participant.uid));
          } catch (e) { Alert.alert('Error', 'Failed to remove participant'); }
        }
      }
    ]);
  };

  const handleRequestJoin = async () => {
    if (!auth.currentUser) return Alert.alert('Error', 'Login required');
    try {
      const roomRef = doc(db, 'rooms', id);
      await updateDoc(roomRef, {
        requests: arrayUnion(auth.currentUser.uid),
        [`requestTimestamps.${auth.currentUser.uid}`]: serverTimestamp(),
      });
      Alert.alert('Success', 'Request sent!');
    } catch (e) { Alert.alert('Error', 'Failed to send request'); }
  };

  const handleCancelRequest = async () => {
    if (!auth.currentUser) return;
    Alert.alert('Cancel Request', 'Cancel your join request?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
          try {
            const roomRef = doc(db, 'rooms', id);
            await updateDoc(roomRef, {
              requests: arrayRemove(auth.currentUser.uid),
              [`requestTimestamps.${auth.currentUser.uid}`]: null,
            });
          } catch (e) { Alert.alert('Error', 'Failed to cancel'); }
        }
      }
    ]);
  };

  const handleReportUser = (participant) => {
    setReportedUser(participant);
    setReportModalVisible(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim()) return Alert.alert('Error', 'Please provide a reason');
    try {
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
      Alert.alert('Report Submitted', 'Thank you.');
      setReportModalVisible(false);
      setReportedUser(null);
      setReportReason('');
    } catch (e) { Alert.alert('Error', 'Failed to submit report'); }
  };

  const handleDeleteRoom = async () => {
    Alert.alert('Delete Room', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'rooms', id));
            router.replace('/my-rooms');
          } catch (e) { Alert.alert('Error', 'Failed to delete room'); }
        }
      }
    ]);
  };

  const handleApprove = async (requestUser) => {
    if (requestUser.uid === auth.currentUser?.uid) return;
    const roomRef = doc(db, 'rooms', id);
    const participantDocRef = doc(db, 'rooms', id, 'participants', requestUser.uid);
    try {
      await setDoc(participantDocRef, { uid: requestUser.uid, nickname: requestUser.nickname, joinedAt: serverTimestamp() });
      if (room && room.requests) await updateDoc(roomRef, { requests: arrayRemove(requestUser.uid) });
    } catch (e) { Alert.alert('Error', 'Failed to approve'); }
  };

  const handleDecline = async (requestUser) => {
    const roomRef = doc(db, 'rooms', id);
    try {
      if (room && room.requests) await updateDoc(roomRef, { requests: arrayRemove(requestUser.uid) });
    } catch (e) { Alert.alert('Error', 'Failed to decline'); }
  };

  if (!room) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#E8A4C7" />
          <Text style={styles.loadingText}>Loading room details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Pressable style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
              </Pressable>
              <View style={styles.titleContainer}>
                <Text style={styles.title} numberOfLines={1}>{room?.name || 'Untitled Room'}</Text>
                <Text style={styles.subtitle}>{participants.length}/{room?.maxParticipants || '?'} participants</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {isParticipant && (
                <Pressable 
                  style={[styles.chatToggleButton, showChat && styles.chatToggleButtonActive]} 
                  onPress={() => setShowChat(!showChat)}
                >
                  <Ionicons name={showChat ? "list" : "chatbubbles"} size={20} color={showChat ? "#4A3B47" : "#E8A4C7"} />
                </Pressable>
              )}
              {isCreator && (
                <Pressable style={styles.deleteButton} onPress={handleDeleteRoom}>
                   <Ionicons name="trash-outline" size={20} color="#E8A4C7" />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.chatContainer}>
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderContent}>
                <Text style={styles.chatTitle}>💬 Room Chat</Text>
                <Pressable style={styles.closeChatButton} onPress={() => setShowChat(false)}>
                   <Ionicons name="close" size={24} color="#E8A4C7" />
                </Pressable>
              </View>
            </View>

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

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, isDisabled && styles.inputDisabled]}
                    placeholder="Type your message..."
                    placeholderTextColor="#999"
                    value={message}
                    onChangeText={setMessage}
                    multiline={false}
                    maxLength={500}
                    editable={!isDisabled}
                  />
                  <Pressable 
                    style={[styles.sendButton, (message.trim() === '' || isDisabled) && styles.sendButtonDisabled]} 
                    onPress={handleSendPress}
                    disabled={message.trim() === '' || isDisabled}
                  >
                     <Ionicons name="send" size={20} color={isDisabled ? "#999" : "#1C6F75"} />
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
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
                 <Ionicons name="location-outline" size={20} color="#1C6F75" style={{marginRight:10}} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Location</Text>
                  <Text style={styles.infoValue}>{getDisplayLocation()}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                 <Ionicons name="calendar-outline" size={20} color="#1C6F75" style={{marginRight:10}} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Date</Text>
                  <Text style={styles.infoValue}>{formattedDate}</Text>
                </View>
              </View>
              
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={20} color="#1C6F75" style={{marginRight:10}} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Time</Text>
                  <Text style={styles.infoValue}>{formattedTime}</Text>
                </View>
              </View>
              
              <View style={styles.infoItem}>
                <Ionicons name="people-outline" size={20} color="#1C6F75" style={{marginRight:10}} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Capacity</Text>
                  <Text style={styles.infoValue}>{participants.length}/{room?.maxParticipants || 0}</Text>
                </View>
              </View>

              {room?.description && (
                <View style={styles.infoItem}>
                   <Ionicons name="document-text-outline" size={20} color="#1C6F75" style={{marginRight:10}} />
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Description</Text>
                    <Text style={styles.infoValue}>{room.description}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

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
                  <View key={p.uid} style={[styles.participantCard, index === 0 && styles.firstParticipantCard]}>
                    <View style={styles.participantLeft}>
                      <View style={styles.participantAvatar}>
                        <Text style={styles.participantAvatarText}>{(p.nickname || 'A').charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.participantInfo}>
                        <Pressable onPress={() => handleUserProfileClick(p.uid)}>
                          <View style={styles.participantNameContainer}>
                            <Text style={[styles.participantName, styles.clickableUsername]}>
                              {p.nickname || 'Anonymous'}
                              {p.uid === room.createdBy && <Text style={styles.hostBadge}> 👑</Text>}
                              {p.uid === auth.currentUser?.uid && <Text style={styles.youBadge}> (You)</Text>}
                            </Text>
                            {isParticipant && p.uid !== auth.currentUser?.uid && (
                              <Pressable style={styles.reportButton} onPress={() => handleReportUser(p)}>
                                <Ionicons name="alert-circle-outline" size={16} color="#E1B604" />
                              </Pressable>
                            )}
                          </View>
                          {p.major && <Text style={styles.participantMajor}>🎓 {p.major}</Text>}
                        </Pressable>
                      </View>
                    </View>
                    {isCreator && p.uid !== auth.currentUser?.uid && (
                      <Pressable style={styles.kickButton} onPress={() => handleKickParticipant(p)}>
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

          {isCreator && (
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
                <Pressable style={styles.approveAllButton} onPress={async () => { for (const r of joinRequests) await handleApprove(r); }}>
                  <Text style={styles.approveAllText}>✅ Approve All ({joinRequests.length})</Text>
                </Pressable>
              )}

              <View style={styles.requestsList}>
                {joinRequests.length > 0 ? (
                  joinRequests.map((r) => (
                    <View key={r.uid} style={styles.requestCard}>
                      <View style={styles.requestLeft}>
                        <View style={styles.requestAvatar}>
                          <Text style={styles.requestAvatarText}>{(r.nickname || 'A').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.requestInfo}>
                          <Pressable onPress={() => handleUserProfileClick(r.uid)}>
                            <Text style={[styles.requestName, styles.clickableUsername]}>{r.nickname || 'Anonymous'}</Text>
                            {r.major && <Text style={styles.requestMajor}>🎓 {r.major}</Text>}
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.requestActions}>
                        <Pressable style={styles.approveButton} onPress={() => handleApprove(r)}>
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        </Pressable>
                        <Pressable style={styles.declineButton} onPress={() => handleDecline(r)}>
                          <Ionicons name="close" size={20} color="#fff" />
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

          {!isParticipant && !isCreator && (
            <View style={styles.section}>
              <View style={styles.joinPrompt}>
                <Text style={styles.joinPromptIcon}>🍻</Text>
                <Text style={styles.joinPromptText}>Want to join this room?</Text>
                {hasRequestedJoin ? (
                  <View style={styles.pendingContainer}>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingText}>⏳ Pending</Text>
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

        <Modal visible={showUserProfile} animationType="slide" presentationStyle="pageSheet">
          {selectedUserProfile && <UserProfile uid={selectedUserProfile} onClose={closeUserProfile} />}
        </Modal>

        <Modal visible={reportModalVisible} transparent={true} animationType="fade">
          <View style={styles.reportModalOverlay}>
            <View style={styles.reportModalContainer}>
              <View style={styles.reportModalHeader}>
                <Text style={styles.reportModalTitle}>Report User</Text>
                <Pressable style={styles.reportModalClose} onPress={() => { setReportModalVisible(false); setReportedUser(null); setReportReason(''); }}>
                  <Ionicons name="close" size={20} color="#E8D5DA" />
                </Pressable>
              </View>
              <Text style={styles.reportModalSubtitle}>Reporting: {reportedUser?.nickname || 'User'}</Text>
              <TextInput
                style={styles.reportReasonInput}
                placeholder="Describe the issue..."
                placeholderTextColor="#999"
                value={reportReason}
                onChangeText={setReportReason}
                multiline={true}
                maxLength={500}
              />
              <View style={styles.reportModalButtons}>
                <Pressable style={styles.reportCancelButton} onPress={() => { setReportModalVisible(false); setReportedUser(null); setReportReason(''); }}>
                  <Text style={styles.reportCancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.reportSubmitButton, !reportReason.trim() && styles.reportSubmitButtonDisabled]} onPress={submitReport} disabled={!reportReason.trim()}>
                  <Text style={styles.reportSubmitButtonText}>Submit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4A3B47' },
  loadingContainer: { flex: 1, backgroundColor: '#4A3B47', justifyContent: 'center', alignItems: 'center' },
  loadingCard: { backgroundColor: '#5A4B5C', padding: 32, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#7A6B7D' },
  loadingText: { color: '#E8A4C7', fontSize: 16, fontWeight: '500', marginTop: 16 },
  header: { backgroundColor: '#4A3B47', borderBottomWidth: 1, borderBottomColor: '#5A4B5C', paddingTop: Platform.OS === 'ios' ? 0 : 10 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backButton: { padding: 8, marginRight: 12 },
  titleContainer: { flex: 1, marginRight: 12 },
  title: { color: '#E8A4C7', fontSize: 20, fontWeight: 'bold', marginBottom: 2 },
  subtitle: { color: '#E8D5DA', fontSize: 14, fontWeight: '400' },
  headerRight: { flexDirection: 'row', gap: 8 },
  chatToggleButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  chatToggleButtonActive: { backgroundColor: '#E8A4C7' },
  deleteButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 100 },
  infoCard: { backgroundColor: '#E8D5DA', marginHorizontal: 20, marginTop: 20, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#3A6A6F', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  cardTitle: { color: '#4d4c41', fontSize: 20, fontWeight: 'bold' },
  creatorBadge: { backgroundColor: '#E1B604', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  creatorBadgeText: { color: '#1C6F75', fontSize: 12, fontWeight: 'bold' },
  infoGrid: { gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'flex-start' },
  infoContent: { flex: 1 },
  infoLabel: { color: '#1C6F75', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  infoValue: { color: '#4d4c41', fontSize: 16, fontWeight: '400', lineHeight: 22 },
  section: { marginHorizontal: 20, marginTop: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { color: '#E8A4C7', fontSize: 18, fontWeight: 'bold' },
  participantCount: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  participantCountText: { color: '#E8D5DA', fontSize: 14, fontWeight: '600' },
  requestCount: { backgroundColor: '#E1B604', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  requestCountText: { color: '#1C6F75', fontSize: 14, fontWeight: 'bold' },
  participantsList: { gap: 12 },
  participantCard: { backgroundColor: '#E8D5DA', padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#3A6A6F' },
  firstParticipantCard: { borderWidth: 2, borderColor: '#E1B604' },
  participantLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  participantAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C6F75', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  participantAvatarText: { color: '#E8D5DA', fontSize: 18, fontWeight: 'bold' },
  participantInfo: { flex: 1 },
  participantNameContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  participantName: { color: '#4d4c41', fontSize: 16, fontWeight: '600' },
  clickableUsername: { textDecorationLine: 'underline' },
  hostBadge: { color: '#E1B604', fontWeight: 'bold' },
  youBadge: { color: '#1C6F75', fontWeight: 'bold' },
  participantMajor: { color: '#666', fontSize: 14 },
  reportButton: { marginLeft: 8, padding: 4 },
  kickButton: { backgroundColor: '#C62828', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  kickButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  approveAllButton: { backgroundColor: '#1C6F75', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  approveAllText: { color: '#E8D5DA', fontSize: 14, fontWeight: 'bold' },
  requestsList: { gap: 12 },
  requestCard: { backgroundColor: '#E8D5DA', padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: '#E1B604' },
  requestLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  requestAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E1B604', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  requestAvatarText: { color: '#1C6F75', fontSize: 18, fontWeight: 'bold' },
  requestInfo: { flex: 1 },
  requestName: { color: '#4d4c41', fontSize: 16, fontWeight: '600' },
  requestMajor: { color: '#666', fontSize: 14 },
  requestActions: { flexDirection: 'row', gap: 8 },
  approveButton: { backgroundColor: '#1C6F75', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  declineButton: { backgroundColor: '#C62828', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  chatContainer: { flex: 1, backgroundColor: '#4A3B47' },
  chatHeader: { backgroundColor: '#5A4B5C', paddingTop: Platform.OS === 'ios' ? 20 : 10, borderBottomWidth: 1, borderBottomColor: '#7A6B7D' },
  chatHeaderContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  chatTitle: { color: '#E8A4C7', fontSize: 18, fontWeight: 'bold' },
  closeChatButton: { padding: 8 },
  messagesFlatList: { flex: 1, backgroundColor: '#4A3B47' },
  flatListContent: { paddingVertical: 20, paddingHorizontal: 16 },
  messageContainer: { marginBottom: 12 },
  myMessage: { alignItems: 'flex-end' },
  otherMessage: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  myMessageBubble: { backgroundColor: '#E8D5DA', borderBottomRightRadius: 4 },
  otherMessageBubble: { backgroundColor: '#5A4B5C', borderBottomLeftRadius: 4 },
  senderName: { color: '#E8A4C7', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#4d4c41' },
  otherMessageText: { color: '#E8D5DA' },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  myTimestamp: { color: '#666' },
  otherTimestamp: { color: '#aaa' },
  inputContainer: { backgroundColor: '#5A4B5C', paddingBottom: Platform.OS === 'ios' ? 30 : 16, borderTopWidth: 1, borderTopColor: '#7A6B7D' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  input: { flex: 1, backgroundColor: '#4A3B47', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, color: '#E8D5DA', fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#7A6B7D' },
  inputDisabled: { opacity: 0.6 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E1B604', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#7A6B7D' },
  joinPrompt: { backgroundColor: '#E8D5DA', padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#3A6A6F' },
  joinPromptIcon: { fontSize: 32, marginBottom: 12 },
  joinPromptText: { color: '#4d4c41', fontSize: 18, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  joinButton: { backgroundColor: '#1C6F75', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, minWidth: 180, alignItems: 'center' },
  joinButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  pendingContainer: { alignItems: 'center', gap: 12 },
  pendingBadge: { backgroundColor: '#E1B604', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  pendingText: { color: '#1C6F75', fontSize: 14, fontWeight: 'bold' },
  cancelRequestButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelRequestButtonText: { color: '#C62828', fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  emptyState: { alignItems: 'center', padding: 32, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16 },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: '#E8D5DA', fontSize: 16, opacity: 0.7 },
  reportModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  reportModalContainer: { backgroundColor: '#5A4B5C', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#7A6B7D' },
  reportModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  reportModalTitle: { color: '#E8A4C7', fontSize: 20, fontWeight: 'bold' },
  reportModalClose: { padding: 4 },
  reportModalSubtitle: { color: '#E8D5DA', fontSize: 16, marginBottom: 20, textAlign: 'center' },
  reportReasonInput: { backgroundColor: '#4A3B47', borderRadius: 12, padding: 16, color: '#E8D5DA', fontSize: 15, minHeight: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#7A6B7D', marginBottom: 24 },
  reportModalButtons: { flexDirection: 'row', gap: 12 },
  reportCancelButton: { flex: 1, backgroundColor: '#7A6B7D', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  reportCancelButtonText: { color: '#E8D5DA', fontSize: 16, fontWeight: 'bold' },
  reportSubmitButton: { flex: 1, backgroundColor: '#C62828', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  reportSubmitButtonDisabled: { opacity: 0.5 },
  reportSubmitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});