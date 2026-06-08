import { Ionicons } from '@expo/vector-icons';
import {
  IconCalendar,
  IconClock,
  IconMapPin,
  IconMessageCircle,
  IconSchool,
} from '@tabler/icons-react-native';
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
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import UserProfile from '../../components/UserProfile';
import { isOutTonight } from '../../utils/outTonightUtils';
import { auth, db } from '../../firebase/firebaseConfig';
import { useButtonDelay } from '../../hooks/useButtonDelay';
import BeerColors from '../../constants/BeerColors';
import { getFriendIds } from '../../utils/friendUtils';
import { parseRoomDateTime } from '../../utils/dateUtils';
import { canRequestJoinRoom, canViewRoom, isRoomExpired } from '../../utils/roomUtils';

export default function RoomDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const { isDisabled, executeWithDelay } = useButtonDelay(2000);
  const [isParticipant, setIsParticipant] = useState(false);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [friendIds, setFriendIds] = useState([]);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [invitingId, setInvitingId] = useState(null);

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(0);
  const flatListRef = useRef(null);

  // Helper: Check if room is full
  const isRoomFull = useMemo(() => {
    if (!room) return false;
    return participants.length >= (room.maxParticipants || 0);
  }, [participants, room]);

  const formatDateString = (dateVal) => {
    if (!dateVal) return 'Not specified';
    if (dateVal.toDate) {
      return dateVal.toDate().toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    if (typeof dateVal === 'string') {
      try {
        const [year, month, day] = dateVal.split('-');
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      } catch (error) {
        return dateVal;
      }
    }
    return 'Not specified';
  };

  const formatTimeString = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return 'Not specified';
    return timeString;
  };

  const getDisplayLocation = () => {
    if (!room) return 'Not specified';
    const neighborhood = room.neighborhood || room.location;
    const city = room.city;

    if (isParticipant || isCreator) {
      if (room.barName && neighborhood) return `${room.barName}, ${neighborhood}`;
      if (room.fullLocation) return room.fullLocation;
      if (neighborhood && city) return `${neighborhood}, ${city}`;
      return neighborhood || 'Location details shared';
    }

    if (neighborhood && city) return `${neighborhood}, ${city}`;
    if (neighborhood) return neighborhood;
    return 'Location shared after joining';
  };

  useEffect(() => {
    if (!id || !isParticipant) return;
    const messagesRef = collection(db, 'rooms', id, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [id, isParticipant]);

  useEffect(() => {
    if (showChat) {
      setLastReadAt(Date.now());
    }
  }, [showChat, messages.length]);

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

      // Send Notification to others
      const recipients = participants.filter(p => p.uid !== auth.currentUser.uid);
      recipients.forEach(async (p) => {
          await addDoc(collection(db, 'notifications'), {
            userId: p.uid,
            type: 'message',
            title: `New message in ${room?.name || 'Chat'}`,
            message: message,
            roomId: id,
            createdAt: serverTimestamp(),
            read: false,
            senderId: auth.currentUser.uid
          });
      });

      setMessage('');
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleSendPress = () => {
    executeWithDelay(() => handleSend());
  };

  const renderChatMessage = ({ item }) => {
    const isMe = item.uid === auth.currentUser.uid;
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.otherMessage]}>
        <View style={[styles.messageBubble, isMe ? styles.myMessageBubble : styles.otherMessageBubble]}>
          {!isMe && <Text style={styles.senderName}>{item.sender}</Text>}
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>{item.text}</Text>
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

  const canAccessRoom = useMemo(() => {
    if (!room || !auth.currentUser?.uid) return false;
    return canViewRoom(room, auth.currentUser.uid, friendIds);
  }, [room, friendIds, auth.currentUser?.uid]);

  const canJoinRoom = useMemo(() => {
    if (!room || !auth.currentUser?.uid) return false;
    return canRequestJoinRoom(room, auth.currentUser.uid, friendIds);
  }, [room, friendIds, auth.currentUser?.uid]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setFriendIds([]);
      return;
    }
    getFriendIds(uid).then(setFriendIds).catch(() => setFriendIds([]));
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!isParticipant || !uid || friendIds.length === 0) {
      setInviteFriends([]);
      return undefined;
    }

    let cancelled = false;

    const loadInviteFriends = async () => {
      const eligibleIds = friendIds.filter(
        (friendUid) =>
          friendUid !== uid &&
          !participantIdSet.has(friendUid) &&
          !requestIdSet.has(friendUid)
      );

      const friends = [];
      for (const friendUid of eligibleIds) {
        try {
          const userSnap = await getDoc(doc(db, 'users', friendUid));
          if (!userSnap.exists()) continue;
          const data = userSnap.data();
          friends.push({
            uid: friendUid,
            nickname: data.instagram || data.nickname || data.name || 'Friend',
            major: data.major || '',
            invited: invitedIdSet.has(friendUid),
          });
        } catch (e) {
          // skip failed profile fetch
        }
      }

      if (!cancelled) {
        friends.sort((a, b) => a.nickname.localeCompare(b.nickname));
        setInviteFriends(friends);
      }
    };

    loadInviteFriends();

    return () => {
      cancelled = true;
    };
  }, [
    isParticipant,
    friendIds,
    participantIdSet,
    requestIdSet,
    invitedIdSet,
    auth.currentUser?.uid,
  ]);

  const formattedDate = useMemo(() => formatDateString(room?.date), [room?.date]);
  const formattedTime = useMemo(() => formatTimeString(room?.time), [room?.time]);

  const capacityFill = useMemo(() => {
    const max = room?.maxParticipants || 0;
    if (!max) return 0;
    return Math.min(participants.length / max, 1);
  }, [participants.length, room?.maxParticipants]);

  const hasUnreadMessages = useMemo(() => {
    if (!isParticipant || showChat) return false;
    const currentUid = auth.currentUser?.uid;
    return messages.some((msg) => {
      if (msg.uid === currentUid) return false;
      const msgTime = msg.createdAt?.toDate?.()?.getTime?.() || 0;
      return msgTime > lastReadAt;
    });
  }, [messages, lastReadAt, isParticipant, showChat]);

  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const participantIdSet = useMemo(
    () => new Set(participants.map((p) => p.uid)),
    [participants]
  );
  const requestIdSet = useMemo(
    () => new Set(joinRequests.map((r) => r.uid)),
    [joinRequests]
  );
  const invitedIdSet = useMemo(() => new Set(room?.invites || []), [room?.invites]);

  const handleUserProfileClick = useCallback((uid) => {
    if (!uid) return;
    setSelectedUserProfile(uid);
    setShowUserProfile(true);
  }, []);

  const closeUserProfile = useCallback(() => {
    setShowUserProfile(false);
    setSelectedUserProfile(null);
  }, []);

  useEffect(() => {
    if (!id) return;
    const roomRef = doc(db, 'rooms', id);
    const unsubscribeRoom = onSnapshot(roomRef, async (docSnap) => {
      if (!docSnap.exists()) {
        Alert.alert('Room Not Found', 'This room no longer exists.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/feed') }
        ]);
        return;
      }
      
      const roomData = docSnap.data();

      // Check Expiration
      const now = new Date();
      const { date, time } = roomData;
      if (date) {
         const startDateTime = parseRoomDateTime(date, time);

         if (startDateTime && isRoomExpired(date, time, now)) {
             Alert.alert('Room Expired', 'This meetup has ended.', [
                 { text: 'OK', onPress: () => router.replace('/(tabs)/feed') }
             ]);
             if (roomData.createdBy === auth.currentUser?.uid) {
                 deleteDoc(roomRef).catch(err => console.log('Auto-delete failed', err));
             }
             return;
         }
      }

      setRoom(roomData);
      
      const uids = roomData?.requests || [];
      if (uids.length > 0) {
        try {
          const requests = [];
          for (let i = 0; i < uids.length; i++) {
             const uid = uids[i];
             if (!uid) continue;
             try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                const nickname = userSnap.exists() ? (userSnap.data().instagram || userSnap.data().nickname) : `User-${uid.substr(0,5)}`;
                const major = userSnap.exists() ? userSnap.data().major : 'Unknown';
                requests.push({ uid, nickname, major });
             } catch (e) {}
          }
          setJoinRequests(requests);
        } catch (error) { setJoinRequests([]); }
      } else {
        setJoinRequests([]);
      }
    });

    let unsubscribeParticipants;
    if (auth.currentUser?.uid) {
      const participantsCollectionRef = collection(db, 'rooms', id, 'participants');
      unsubscribeParticipants = onSnapshot(participantsCollectionRef, async (snapshot) => {
        try {
          const list = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            if (!data.uid) return null;
            try {
              const userDoc = await getDoc(doc(db, 'users', data.uid));
              const userData = userDoc.exists() ? userDoc.data() : {};
              const nickname = userData.instagram || userData.nickname || `User-${data.uid.substr(0,5)}`;
              const major = userData.major || 'Not specified';
              return {
                uid: data.uid,
                nickname,
                major,
                isOutTonight: isOutTonight(userData),
              };
            } catch (e) { return { uid: data.uid, nickname: 'Unknown User', major: '', isOutTonight: false }; }
          }));
          setParticipants(list.filter(p => p !== null));
        } catch (e) {}
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
            const roomRef = doc(db, 'rooms', id);
            await updateDoc(roomRef, {
                participants: arrayRemove(participant.uid)
            });
          } catch (e) { Alert.alert('Error', 'Failed to remove participant'); }
        }
      }
    ]);
  };

  const handleRequestJoin = async () => {
    if (!auth.currentUser) return Alert.alert('Error', 'Login required');
    if (!canJoinRoom) return;
    try {
      const roomRef = doc(db, 'rooms', id);
      await updateDoc(roomRef, {
        requests: arrayUnion(auth.currentUser.uid),
        [`requestTimestamps.${auth.currentUser.uid}`]: serverTimestamp(),
      });
      
      if (room?.createdBy) {
          await addDoc(collection(db, 'notifications'), {
            userId: room.createdBy,
            type: 'request',
            title: 'New Join Request',
            message: `Someone wants to join your room: ${room.name || 'Room'}`,
            roomId: id,
            createdAt: serverTimestamp(),
            read: false,
            senderId: auth.currentUser.uid
          });
      }

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

  const handleDeleteRoom = async () => {
    Alert.alert('Delete Room', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'rooms', id));
            router.replace('/(tabs)/feed');
          } catch (e) { Alert.alert('Error', 'Failed to delete room'); }
        }
      }
    ]);
  };

  const handleApprove = async (requestUser) => {
    if (requestUser.uid === auth.currentUser?.uid) return;
    if (participants.length >= (room.maxParticipants || 0)) {
        Alert.alert('Room Full', 'This room has reached its capacity.');
        return;
    }

    const roomRef = doc(db, 'rooms', id);
    const participantDocRef = doc(db, 'rooms', id, 'participants', requestUser.uid);
    
    try {
      await setDoc(participantDocRef, { 
          uid: requestUser.uid, 
          nickname: requestUser.nickname, 
          joinedAt: serverTimestamp() 
      });

      await updateDoc(roomRef, { 
          requests: arrayRemove(requestUser.uid),
          participants: arrayUnion(requestUser.uid) 
      });

    } catch (e) { Alert.alert('Error', 'Failed to approve'); }
  };

  const handleDecline = async (requestUser) => {
    const roomRef = doc(db, 'rooms', id);
    try {
      if (room && room.requests) await updateDoc(roomRef, { requests: arrayRemove(requestUser.uid) });
    } catch (e) { Alert.alert('Error', 'Failed to decline'); }
  };

  const handleInviteFriend = async (friend) => {
    if (!auth.currentUser || friend.invited || invitingId || isRoomFull) return;

    setInvitingId(friend.uid);
    try {
      const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const inviterName = userSnap.exists()
        ? userSnap.data().instagram || userSnap.data().nickname || userSnap.data().name || 'A friend'
        : 'A friend';

      const roomRef = doc(db, 'rooms', id);
      await updateDoc(roomRef, {
        invites: arrayUnion(friend.uid),
      });

      await addDoc(collection(db, 'notifications'), {
        userId: friend.uid,
        type: 'invite',
        title: 'Room Invite',
        message: `${inviterName} invited you to join "${room?.name || 'a room'}"`,
        roomId: id,
        createdAt: serverTimestamp(),
        read: false,
        senderId: auth.currentUser.uid,
      });

      setInviteFriends((prev) =>
        prev.map((f) => (f.uid === friend.uid ? { ...f, invited: true } : f))
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to send invite');
    } finally {
      setInvitingId(null);
    }
  };

  if (!room) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={BeerColors.textPrimary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canAccessRoom) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <Text style={styles.privateRoomIcon}>🔒</Text>
          <Text style={styles.loadingText}>This is a private room</Text>
          <Text style={styles.privateRoomSubtext}>Only the host's friends can view it.</Text>
          <Pressable style={styles.privateRoomBackButton} onPress={() => router.back()}>
            <Text style={styles.privateRoomBackText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentUid = auth.currentUser?.uid;

  const renderPersonCard = ({
    person,
    isHost = false,
    isSelf = false,
    onPress,
    rightAction,
  }) => {
    const isFriend = friendIdSet.has(person.uid);
    const initial = (person.nickname || 'A').charAt(0).toUpperCase();

    return (
      <View
        key={person.uid}
        style={[styles.personCard, isHost && styles.personCardHost]}
      >
        <Pressable
          style={styles.personCardMain}
          onPress={onPress}
          disabled={!onPress}
        >
          <View style={styles.personAvatar}>
            <Text style={styles.personAvatarText}>{initial}</Text>
          </View>
          <View style={styles.personInfo}>
            <View style={styles.personNameRow}>
              <Text style={styles.personName}>{person.nickname || 'Anonymous'}</Text>
              {isHost ? (
                <View style={styles.inlineTag}>
                  <Text style={styles.inlineTagText}>host 👑</Text>
                </View>
              ) : null}
              {isSelf ? (
                <View style={[styles.inlineTag, styles.inlineTagYou]}>
                  <Text style={styles.inlineTagText}>you</Text>
                </View>
              ) : null}
              {person.isOutTonight ? <View style={styles.liveDot} /> : null}
            </View>
            <View style={styles.personSubtitleRow}>
              {person.major ? (
                <>
                  <IconSchool size={14} color={BeerColors.textMuted} />
                  <Text style={styles.personMajor}>{person.major}</Text>
                </>
              ) : null}
              {isFriend ? (
                <View style={styles.friendTag}>
                  <Text style={styles.friendTagText}>friend</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        {rightAction}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButtonCircle} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={BeerColors.textPrimary} />
          </Pressable>

          <View style={styles.topBarRight}>
            {isCreator ? (
              <Pressable style={styles.deleteIconButton} onPress={handleDeleteRoom}>
                <Ionicons name="trash-outline" size={20} color={BeerColors.danger} />
              </Pressable>
            ) : null}
            {isParticipant ? (
              <Pressable style={styles.chatPill} onPress={() => setShowChat(true)}>
                {hasUnreadMessages ? <View style={styles.chatUnreadDot} /> : null}
                <IconMessageCircle size={18} color={BeerColors.textPrimary} />
                <Text style={styles.chatPillText}>Chat</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* --- CHAT MODAL (FIXED KEYBOARD OFFSET) --- */}
        <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet">
          {/* FIX: keyboardVerticalOffset={100} adds space for the modal header 
              so the keyboard doesn't cover the input.
          */}
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={{flex: 1, backgroundColor: BeerColors.background}}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0} 
          >
            <View style={styles.chatContainer}>
              <View style={styles.chatHeader}>
                <View style={styles.chatHeaderContent}>
                  <Text style={styles.chatTitle}>room chat 💬</Text>
                  <Pressable style={styles.closeChatButton} onPress={() => setShowChat(false)}>
                     <Ionicons name="close" size={24} color={BeerColors.textPrimary} />
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

              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, isDisabled && styles.inputDisabled]}
                    placeholder="Type your message..."
                    placeholderTextColor={BeerColors.textMuted}
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
                     <Ionicons name="send" size={20} color={isDisabled ? BeerColors.textMuted : BeerColors.textPrimary} />
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>{room?.name || 'Untitled Room'}</Text>

            <View style={styles.metaPillRow}>
              <View style={styles.metaPill}>
                <IconCalendar size={15} color={BeerColors.textSecondary} />
                <Text style={styles.metaPillText}>{formattedDate}</Text>
              </View>
              <View style={styles.metaPill}>
                <IconClock size={15} color={BeerColors.textSecondary} />
                <Text style={styles.metaPillText}>{formattedTime}</Text>
              </View>
            </View>

            <View style={styles.locationRow}>
              <IconMapPin size={16} color={BeerColors.accent} />
              <Text style={styles.locationText}>{getDisplayLocation()}</Text>
            </View>

            {room?.description ? (
              <View style={styles.descriptionBox}>
                <Text style={styles.descriptionText}>{room.description}</Text>
              </View>
            ) : null}
          </View>

          {/* Capacity */}
          <View style={styles.capacitySection}>
            <View style={styles.capacityHeader}>
              <Text style={styles.capacityLabel}>Participants</Text>
              <View style={styles.capacityBadge}>
                <Text style={styles.capacityBadgeText}>
                  {participants.length} / {room?.maxParticipants || 0}
                </Text>
              </View>
            </View>
            <View style={styles.capacityTrack}>
              <View
                style={[styles.capacityFill, { width: `${capacityFill * 100}%` }]}
              />
            </View>
          </View>

          {/* Participants */}
          <Text style={styles.sectionLabel}>in the room</Text>
          <View style={styles.cardsList}>
            {participants.length > 0 ? (
              participants.map((p) =>
                renderPersonCard({
                  person: p,
                  isHost: p.uid === room.createdBy,
                  isSelf: p.uid === currentUid,
                  onPress: p.uid !== currentUid ? () => handleUserProfileClick(p.uid) : undefined,
                  rightAction:
                    isCreator && p.uid !== currentUid ? (
                      <Pressable
                        style={styles.kickButton}
                        onPress={() => handleKickParticipant(p)}
                      >
                        <Text style={styles.kickButtonText}>Remove</Text>
                      </Pressable>
                    ) : null,
                })
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No participants yet</Text>
              </View>
            )}
          </View>

          {/* Invite friends (participants only) */}
          {isParticipant && !isRoomFull ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>invite friends</Text>
              <Text style={styles.inviteSubtext}>
                Invite friends to view the room and request to join
              </Text>
              <View style={styles.cardsList}>
                {inviteFriends.length > 0 ? (
                  inviteFriends.map((friend) =>
                    renderPersonCard({
                      person: { ...friend, isOutTonight: false },
                      onPress: () => handleUserProfileClick(friend.uid),
                      rightAction: (
                        <Pressable
                          style={[
                            styles.inviteButton,
                            friend.invited && styles.inviteButtonDisabled,
                          ]}
                          disabled={friend.invited || invitingId === friend.uid}
                          onPress={() => handleInviteFriend(friend)}
                        >
                          {invitingId === friend.uid ? (
                            <ActivityIndicator size="small" color={BeerColors.onAccent} />
                          ) : (
                            <Text
                              style={[
                                styles.inviteButtonText,
                                friend.invited && styles.inviteButtonTextDisabled,
                              ]}
                            >
                              {friend.invited ? 'Invited' : 'Invite'}
                            </Text>
                          )}
                        </Pressable>
                      ),
                    })
                  )
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No friends available to invite</Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {/* Join requests (host only) */}
          {isCreator ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>join requests</Text>
              {joinRequests.length > 0 ? (
                <Pressable
                  style={styles.approveAllButton}
                  onPress={async () => {
                    for (const r of joinRequests) await handleApprove(r);
                  }}
                >
                  <Text style={styles.approveAllText}>Approve all ({joinRequests.length})</Text>
                </Pressable>
              ) : null}
              <View style={styles.cardsList}>
                {joinRequests.length > 0 ? (
                  joinRequests.map((r) =>
                    renderPersonCard({
                      person: { ...r, isOutTonight: false },
                      onPress: () => handleUserProfileClick(r.uid),
                      rightAction: (
                        <View style={styles.requestActions}>
                          <Pressable
                            style={[
                              styles.approveButton,
                              isRoomFull && styles.approveButtonDisabled,
                            ]}
                            disabled={isRoomFull}
                            onPress={() => handleApprove(r)}
                          >
                            <Ionicons name="checkmark" size={18} color={BeerColors.white} />
                          </Pressable>
                          <Pressable
                            style={styles.declineButton}
                            onPress={() => handleDecline(r)}
                          >
                            <Ionicons name="close" size={18} color={BeerColors.white} />
                          </Pressable>
                        </View>
                      ),
                    })
                  )
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No pending requests</Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {!isParticipant && !isCreator && canJoinRoom && (
            <View style={styles.section}>
              <View style={styles.joinPrompt}>
                <Text style={styles.joinPromptIcon}>🍻</Text>
                <Text style={styles.joinPromptText}>Want to join this room?</Text>
                {room?.invites?.includes(currentUid) ? (
                  <Text style={styles.invitedHint}>You were invited to this room</Text>
                ) : null}
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

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BeerColors.background },
  loadingContainer: { flex: 1, backgroundColor: BeerColors.background, justifyContent: 'center', alignItems: 'center' },
  loadingCard: { backgroundColor: BeerColors.panel, padding: 32, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: BeerColors.borderSoft },
  loadingText: { color: BeerColors.textPrimary, fontSize: 16, fontWeight: '500', marginTop: 16 },
  privateRoomIcon: { fontSize: 40 },
  privateRoomSubtext: {
    color: BeerColors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  privateRoomBackButton: {
    marginTop: 20,
    backgroundColor: BeerColors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  privateRoomBackText: {
    color: BeerColors.onAccent,
    fontWeight: 'bold',
    fontSize: 15,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BeerColors.panelElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 57, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.25)',
  },
  chatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: BeerColors.panelElevated,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    position: 'relative',
  },
  chatUnreadDot: {
    position: 'absolute',
    top: 6,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: BeerColors.panelElevated,
  },
  chatPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: BeerColors.textPrimary,
  },

  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 100 },

  // Hero
  heroSection: {
    marginTop: 4,
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  metaPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: BeerColors.panelElevated,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  metaPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: BeerColors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: BeerColors.textSecondary,
    fontWeight: '500',
  },
  descriptionBox: {
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  descriptionText: {
    fontSize: 15,
    color: BeerColors.textPrimary,
    lineHeight: 22,
  },

  // Capacity
  capacitySection: {
    marginBottom: 28,
  },
  capacityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  capacityLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BeerColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  capacityBadge: {
    backgroundColor: BeerColors.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  capacityBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: BeerColors.textPrimary,
  },
  capacityTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: BeerColors.panelElevated,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    backgroundColor: BeerColors.accent,
    borderRadius: 2,
  },

  // Sections
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BeerColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 8,
  },
  cardsList: {
    gap: 10,
    marginBottom: 24,
  },

  // Person cards
  personCard: {
    backgroundColor: BeerColors.panel,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  personCardHost: {
    borderColor: BeerColors.accent,
    backgroundColor: BeerColors.panelSoft,
  },
  personCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BeerColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  personAvatarText: {
    color: BeerColors.onAccent,
    fontSize: 18,
    fontWeight: 'bold',
  },
  personInfo: {
    flex: 1,
  },
  personNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: BeerColors.textPrimary,
  },
  inlineTag: {
    backgroundColor: BeerColors.panelElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  inlineTagYou: {
    backgroundColor: BeerColors.panelSoft,
    borderColor: BeerColors.accent,
  },
  inlineTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: BeerColors.textSecondary,
    textTransform: 'lowercase',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  personSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  personMajor: {
    fontSize: 13,
    color: BeerColors.textMuted,
  },
  friendTag: {
    backgroundColor: BeerColors.panelSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BeerColors.accent,
  },
  friendTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: BeerColors.accentDark,
    textTransform: 'lowercase',
  },

  inviteSubtext: {
    color: BeerColors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  inviteButton: {
    backgroundColor: BeerColors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  inviteButtonDisabled: {
    backgroundColor: BeerColors.panelElevated,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  inviteButtonText: {
    color: BeerColors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  inviteButtonTextDisabled: {
    color: BeerColors.textMuted,
  },
  invitedHint: {
    color: BeerColors.accentDark,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  kickButton: {
    backgroundColor: BeerColors.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 8,
  },
  kickButtonText: {
    color: BeerColors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  approveAllButton: {
    backgroundColor: BeerColors.accent,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  approveAllText: {
    color: BeerColors.onAccent,
    fontSize: 14,
    fontWeight: 'bold',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  approveButton: {
    backgroundColor: BeerColors.accent,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButtonDisabled: {
    backgroundColor: BeerColors.disabled,
    opacity: 0.6,
  },
  declineButton: {
    backgroundColor: BeerColors.danger,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContainer: { flex: 1, backgroundColor: BeerColors.background },
  chatHeader: { backgroundColor: BeerColors.panel, paddingTop: Platform.OS === 'ios' ? 20 : 10, borderBottomWidth: 1, borderBottomColor: BeerColors.borderSoft },
  chatHeaderContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  chatTitle: { color: BeerColors.textPrimary, fontSize: 18, fontWeight: 'bold' },
  closeChatButton: { padding: 8 },
  messagesFlatList: { flex: 1, backgroundColor: BeerColors.background },
  flatListContent: { paddingVertical: 20, paddingHorizontal: 16 },
  messageContainer: { marginBottom: 12 },
  myMessage: { alignItems: 'flex-end' },
  otherMessage: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  myMessageBubble: { backgroundColor: BeerColors.panelElevated, borderBottomRightRadius: 4, borderWidth: 1, borderColor: BeerColors.borderSoft },
  otherMessageBubble: { backgroundColor: BeerColors.panel, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: BeerColors.borderSoft },
  senderName: { color: BeerColors.iconPrimary, fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: BeerColors.textPrimary },
  otherMessageText: { color: BeerColors.textPrimary },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  myTimestamp: { color: BeerColors.textMuted },
  otherTimestamp: { color: BeerColors.textMuted },
  inputContainer: { backgroundColor: BeerColors.panel, paddingBottom: Platform.OS === 'ios' ? 30 : 16, borderTopWidth: 1, borderTopColor: BeerColors.borderSoft },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  input: { flex: 1, backgroundColor: BeerColors.panelElevated, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, color: BeerColors.textPrimary, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: BeerColors.borderSoft },
  inputDisabled: { opacity: 0.6 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: BeerColors.accent, borderWidth: 1, borderColor: BeerColors.accent, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: BeerColors.panelSoft },
  section: { marginTop: 8 },
  joinPrompt: { backgroundColor: BeerColors.panelElevated, padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: BeerColors.borderSoft },
  joinPromptIcon: { fontSize: 32, marginBottom: 12 },
  joinPromptText: { color: BeerColors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  joinButton: { backgroundColor: BeerColors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, minWidth: 180, alignItems: 'center' },
  joinButtonText: { color: BeerColors.onAccent, fontSize: 16, fontWeight: 'bold' },
  pendingContainer: { alignItems: 'center', gap: 12 },
  pendingBadge: { backgroundColor: BeerColors.panelSoft, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: BeerColors.accent },
  pendingText: { color: BeerColors.accentDark, fontSize: 14, fontWeight: 'bold' },
  cancelRequestButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelRequestButtonText: { color: BeerColors.danger, fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  emptyState: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  emptyText: { color: BeerColors.textMuted, fontSize: 14 },
});