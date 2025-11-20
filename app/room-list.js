import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';

// Get screen dimensions for consistent card sizing
const { width: screenWidth } = Dimensions.get('window');
const cardWidth = (screenWidth - 60) / 2; // 60 = padding (20*2) + margins (6*4)

export default function JoinRoom() {
  const [rooms, setRooms] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [participantCounts, setParticipantCounts] = useState({});
  const [userParticipations, setUserParticipations] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const formatFullDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return 'unknown';
    const date = new Date(`${dateStr}T${timeStr}`);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    let unsubscribe = null;
    let participantUnsubscribes = [];

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      // Clean up existing listeners
      if (unsubscribe) unsubscribe();
      participantUnsubscribes.forEach(unsub => unsub());
      participantUnsubscribes = [];

      setCurrentUser(user);
      setLoading(true);

      if (!user || !user.emailVerified) {
        // User not authenticated or not verified, clear data
        setRooms([]);
        setParticipantCounts({});
        setUserParticipations({});
        setLoading(false);
        return;
      }

      // User is authenticated and verified, start listening
      const roomsRef = collection(db, 'rooms');

      unsubscribe = onSnapshot(
        roomsRef,
        async (snapshot) => {
          const now = new Date();
          const fetchedRooms = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          }));

          const filteredRooms = [];

          for (const room of fetchedRooms) {
            const { date, time, createdBy } = room;

            if (!date || !time) continue;

            const eventDateTime = new Date(`${date}T${time}`);
            const expiryDateTime = new Date(eventDateTime.getTime() + 24 * 60 * 60 * 1000);

            // If expired and this user is the creator, delete
            if (expiryDateTime < now && createdBy === user.uid) {
              try {
                await deleteDoc(doc(db, 'rooms', room.id));
                console.log(`Deleted expired room: ${room.name}`);
              } catch (err) {
                console.error('Error deleting expired room:', err);
              }
              continue;
            }

            // Don't show own rooms on join page
            if (createdBy !== user.uid) {
              filteredRooms.push(room);
            }
          }

          // Clean up old participant listeners
          participantUnsubscribes.forEach(unsub => unsub());
          participantUnsubscribes = [];

          // Setup participants listeners for each room
          filteredRooms.forEach((room) => {
            const participantsRef = collection(db, 'rooms', room.id, 'participants');
            const participantUnsub = onSnapshot(participantsRef, (participantSnapshot) => {
              const participants = participantSnapshot.docs.map(doc => doc.data());
              const isUserParticipant = participants.some(p => p.userId === user.uid);

              setParticipantCounts((prev) => ({
                ...prev,
                [room.id]: participantSnapshot.docs.length
              }));

              setUserParticipations((prev) => ({
                ...prev,
                [room.id]: isUserParticipant
              }));
            });

            participantUnsubscribes.push(participantUnsub);
          });

          // Store all filtered rooms
          setRooms(filteredRooms);
          setLoading(false);
        },
        (error) => {
          console.error('Error fetching rooms:', error);
          Alert.alert('Error', 'Failed to load rooms. Please try again.');
          setLoading(false);
        }
      );
    });

    return () => {
      authUnsubscribe();
      if (unsubscribe) unsubscribe();
      participantUnsubscribes.forEach(unsub => unsub());
    };
  }, []); // No dependencies - we handle everything inside onAuthStateChanged

  // Filter and sort rooms for display
  const availableRooms = useMemo(() => {
    const filtered = rooms.filter((room) => {
      const max = room.maxParticipants || 0;
      const current = participantCounts[room.id] || 0;
      const isUserInRoom = userParticipations[room.id] || false;
      
      // Only show rooms where user is not already a participant and room is not full
      return current < max && !isUserInRoom;
    });

    // Sort by creation time
    return filtered.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return b.createdAt.seconds - a.createdAt.seconds;
      }
      return 0;
    });
  }, [rooms, participantCounts, userParticipations]);

  const handleRequest = async (roomId, requests = []) => {
    if (!currentUser) {
      Alert.alert('Authentication Required', 'Please log in to join rooms.');
      return;
    }

    // Check if user is already a participant
    const isUserInRoom = userParticipations[roomId] || false;
    if (isUserInRoom) {
      Alert.alert('Already Joined', 'You are already a participant in this room.');
      return;
    }

    if (requests.includes(currentUser.uid)) {
      Alert.alert('Already Requested', 'You have already sent a request to join this room.');
      return;
    }

    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        requests: arrayUnion(currentUser.uid),
        requestTimestamps: {
          [currentUser.uid]: serverTimestamp()
        }
      });

      const roomSnap = await getDoc(roomRef);
      const roomData = roomSnap.data();
      const roomCreatorId = roomData?.createdBy;
      const roomName = roomData?.name || 'your room';

      await addDoc(collection(db, 'notifications'), {
        userId: roomCreatorId,
        title: 'New join request',
        message: `${currentUser.displayName || 'someone'} wants to join your room "${roomName}"`,
        type: 'meetup_request',
        meetupId: roomId,
        createdAt: serverTimestamp(),
        read: false
      });

      Alert.alert('Request Sent', 'Your request to join the room has been sent!');
    } catch (error) {
      console.error('Error sending request:', error);
      Alert.alert('Error', `Failed to send request: ${error.message}`);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const renderRoom = ({ item }) => {
    if (!currentUser) return null;

    const requested = item.requests?.includes(currentUser.uid);
    const currentCount = participantCounts[item.id] || 0;
    const isFull = currentCount >= (item.maxParticipants || 0);
    const isUserInRoom = userParticipations[item.id] || false;

    // This shouldn't happen anymore due to filtering, but keep as extra safety
    if (isUserInRoom) {
      return null;
    }

    return (
      <Pressable
        style={[styles.card, { width: cardWidth }]}
        onPress={() => router.push(`/room-details/${item.id}`)}
      >
        <Text style={styles.title} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.location} numberOfLines={1}>📍 {item.neighborhood || item.location}</Text>
        <Text style={styles.time}>🗓️ {formatFullDateTime(item.date, item.time)}</Text>
        <Text style={styles.peopleCount}>
          👥 {currentCount}/{item.maxParticipants || '?'}
        </Text>

        {isFull && <Text style={styles.fullStatus}>full</Text>}
        {requested && !isFull && <Text style={styles.requestedStatus}>pending</Text>}

        {!requested && !isFull && (
          <Pressable
            style={styles.button}
            onPress={(e) => {
              e.stopPropagation();
              handleRequest(item.id, item.requests || []);
            }}
          >
            <Text style={styles.buttonText}>join</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  // Show loading while checking authentication
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.header}>join a meetup 🍻</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show login message if not authenticated
  if (!currentUser || !currentUser.emailVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Please log in to view available rooms.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>join a meetup 🍻</Text>

      {availableRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>no available rooms right now</Text>
          <Text style={styles.emptySubtext}>check back later or create your own!</Text>
        </View>
      ) : (
        <FlatList
          data={availableRooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoom}
          numColumns={2}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#E1B604']}
              tintColor="#E1B604"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.flatListContent}
          columnWrapperStyle={styles.row}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47',
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E8A4C7',
    marginBottom: 20,
    marginTop: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#E8D5DA',
    padding: 10,
    margin: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A6A6F',
    height: cardWidth,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4d4c41ff',
    textAlign: 'center',
    marginBottom: 6,
    
  },
  location: {
    color: '#4d4c41ff',
    fontSize: 11,
    opacity: 0.9,
    textAlign: 'center',
  },
  time: {
    color: '#4d4c41ff',
    fontSize: 11,
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 4,
  },
  peopleCount: {
    color: '#4d4c41ff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  requestedStatus: {
    color: '#4d4c41ff',
    fontWeight: '600',
    fontSize: 10,
    textAlign: 'center',
  },
  fullStatus: {
    color: '#C62828',
    fontWeight: '600',
    fontSize: 10,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#E1B604',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#1C6F75',
    fontWeight: 'bold',
    fontSize: 11,
  },
  row: {
    justifyContent: 'space-around',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#2d3fa4ff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888fb6ff',
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  errorText: {
    color: '#DCD8A7',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
  },
  flatListContent: {
    paddingBottom: 20,
  },
});