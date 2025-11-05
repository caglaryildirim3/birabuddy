import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  Alert,
} from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';
import { useRouter } from 'expo-router';

export default function MyRooms() {
  const [myRooms, setMyRooms] = useState([]);
  const [roomStats, setRoomStats] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const router = useRouter();

  const formatFullDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return 'unknown';
    try {
      const date = new Date(`${dateStr}T${timeStr}`);
      if (isNaN(date.getTime())) return 'invalid date';
      
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'invalid date';
    }
  };

  useEffect(() => {
    let unsubscribe = null;
    let participantUnsubscribes = []; // Track all participant listeners

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user?.uid || 'no user');
      
      // Clean up any existing listeners
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      participantUnsubscribes.forEach(unsub => {
        try {
          unsub();
        } catch (error) {
          console.error('Error unsubscribing from participant listener:', error);
        }
      });
      participantUnsubscribes = [];

      // Update current user state
      setCurrentUser(user);

      if (!user || !user.emailVerified) {
        // User not authenticated or not verified, clear data
        setMyRooms([]);
        setRoomStats({});
        setLoading(false);
        return;
      }

      // User is authenticated and verified, start listening
      setLoading(true);
      
      try {
        const roomsQuery = query(
          collection(db, 'rooms'),
          where('createdBy', '==', user.uid)
        );

        unsubscribe = onSnapshot(
          roomsQuery,
          async (snapshot) => {
            try {
              console.log('Rooms snapshot received, doc count:', snapshot.docs.length);
              
              const now = new Date();
              const fetched = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }));

              const validRooms = [];

              // Process rooms sequentially to avoid overwhelming Firebase
              for (const room of fetched) {
                const { date, time } = room;

                if (!date || !time) {
                  console.warn(`Room ${room.id} missing date/time`);
                  continue;
                }

                try {
                  const eventDateTime = new Date(`${date}T${time}`);
                  if (isNaN(eventDateTime.getTime())) {
                    console.warn(`Room ${room.id} has invalid date/time: ${date}T${time}`);
                    continue;
                  }

                  const expiryDateTime = new Date(eventDateTime.getTime() + 24 * 60 * 60 * 1000);

                  if (expiryDateTime < now) {
                    try {
                      console.log(`Deleting expired room: ${room.name || room.id}`);
                      await deleteDoc(doc(db, 'rooms', room.id));
                    } catch (deleteError) {
                      console.error('Failed to delete expired room:', deleteError);
                      // Don't throw, just log and continue
                    }
                    continue;
                  }

                  validRooms.push(room);
                } catch (dateError) {
                  console.error(`Error processing room ${room.id}:`, dateError);
                  continue;
                }
              }

              const sortedRooms = validRooms.sort((a, b) => {
                if (a.createdAt && b.createdAt) {
                  const aTime = a.createdAt.seconds || a.createdAt.toSeconds?.() || 0;
                  const bTime = b.createdAt.seconds || b.createdAt.toSeconds?.() || 0;
                  return bTime - aTime;
                }
                return 0;
              });

              setMyRooms(sortedRooms);
              setLoading(false);

              // Clean up old participant listeners
              participantUnsubscribes.forEach(unsub => {
                try {
                  unsub();
                } catch (error) {
                  console.error('Error cleaning up participant listener:', error);
                }
              });
              participantUnsubscribes = [];

              // Set up new participant listeners with error handling
              sortedRooms.forEach((room) => {
                try {
                  const participantsRef = collection(db, 'rooms', room.id, 'participants');
                  const participantUnsub = onSnapshot(
                    participantsRef, 
                    (participantSnapshot) => {
                      try {
                        const participantCount = participantSnapshot.docs.length;
                        const requestCount = Array.isArray(room.requests) ? room.requests.length : 0;

                        setRoomStats((prev) => ({
                          ...prev,
                          [room.id]: {
                            participants: participantCount,
                            requests: requestCount,
                            isFull: participantCount >= (room.maxParticipants || 0),
                          },
                        }));
                      } catch (error) {
                        console.error(`Error processing participant snapshot for room ${room.id}:`, error);
                      }
                    },
                    (participantError) => {
                      console.error(`Error listening to participants for room ${room.id}:`, participantError);
                      // Remove this room's stats on error
                      setRoomStats((prev) => {
                        const newStats = { ...prev };
                        delete newStats[room.id];
                        return newStats;
                      });
                    }
                  );
                  
                  participantUnsubscribes.push(participantUnsub);
                } catch (error) {
                  console.error(`Error setting up participant listener for room ${room.id}:`, error);
                }
              });
            } catch (error) {
              console.error('Error processing rooms snapshot:', error);
              setLoading(false);
              // Don't show alert for every error, just log
            }
          },
          (error) => {
            console.error('Error fetching rooms:', error);
            setLoading(false);
            
            // Only show alert for permission errors or critical issues
            if (error.code === 'permission-denied') {
              Alert.alert('Permission Error', 'You don\'t have permission to access your rooms. Please try logging out and back in.');
            } else if (error.code === 'unavailable') {
              // Network issues, don't show alert
              console.log('Firebase temporarily unavailable');
            } else {
              Alert.alert('Error', 'Failed to load your rooms. Please check your connection.');
            }
          }
        );
      } catch (error) {
        console.error('Error setting up rooms listener:', error);
        setLoading(false);
        Alert.alert('Error', 'Failed to initialize rooms listener');
      }
    });

    // Cleanup function
    return () => {
      try {
        authUnsubscribe();
      } catch (error) {
        console.error('Error unsubscribing from auth:', error);
      }
      
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.error('Error unsubscribing from rooms:', error);
        }
      }
      
      participantUnsubscribes.forEach(unsub => {
        try {
          unsub();
        } catch (error) {
          console.error('Error unsubscribing from participant listener:', error);
        }
      });
    };
  }, []); // Empty dependency array is correct

  const onRefresh = async () => {
    setRefreshing(true);
    // The onSnapshot listeners will automatically refresh data
    // Just add a small delay for UX
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleDeleteRoom = (roomId, roomTitle) => {
    Alert.alert(
      'Delete Room',
      `Are you sure you want to delete "${roomTitle}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'rooms', roomId));
              Alert.alert('Success', 'Room deleted successfully');
            } catch (error) {
              console.error('Error deleting room:', error);
              if (error.code === 'permission-denied') {
                Alert.alert('Permission Error', 'You don\'t have permission to delete this room');
              } else {
                Alert.alert('Error', 'Could not delete room. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  const renderRoom = ({ item }) => {
    const stats = roomStats[item.id] || { participants: 0, requests: 0, isFull: false };
    const hasRequests = stats.requests > 0;

    const roomName = item.name || 'No name';
    const maxParticipants = item.maxParticipants !== undefined ? item.maxParticipants : '?';
    
    let formattedDate = 'Unknown date';
    if (item.createdAt) {
      try {
        const timestamp = item.createdAt.seconds || item.createdAt.toSeconds?.();
        if (timestamp) {
          formattedDate = new Date(timestamp * 1000).toLocaleDateString();
        }
      } catch (error) {
        console.error('Error formatting created date:', error);
      }
    }

    return (
      <View style={styles.roomCard}>
        {/* Room Name */}
        <Text style={styles.roomName}>{roomName}</Text>

        {/* Created Date */}
        <Text style={styles.roomDateTime}>Created on {formattedDate}</Text>

        {/* Location & Time */}
        <Text style={styles.roomLocation}>
          📍 {item.neighborhood || item.location || 'No location'}
        </Text>
        <Text style={styles.roomDateTime}>
          🗓️ {formatFullDateTime(item.date, item.time)}
        </Text>

        {/* Participants */}
        <Text style={styles.participantCount}>
          👥 {stats.participants}/{maxParticipants}
        </Text>

        {/* Buttons */}
        <View style={styles.roomActions}>
          <Pressable
            style={styles.joinButton}
            onPress={() => router.push(`/room-details/${item.id}`)}
          >
            <Text style={styles.joinButtonText}>
              {hasRequests ? `Manage (${stats.requests})` : 'View Details'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.leaveButton}
            onPress={() => handleDeleteRoom(item.id, roomName)}
          >
            <Text style={styles.leaveButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No rooms yet</Text>
      <Text style={styles.emptySubtitle}>
        Create your first room to start organizing meetups!
      </Text>
      <Pressable
        style={styles.browseButton}
        onPress={() => router.push('/create-room')}
      >
        <Text style={styles.browseButtonText}>Create Room</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your rooms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={myRooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#E1B604']}
            tintColor="#E1B604"
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#86945fff',
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#DCD8A7',
    fontSize: 16,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f3f1d4ff',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#DCD8A7',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  browseButton: {
    backgroundColor: '#f7ffe8ff',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  browseButtonText: {
    color: '#1C6F75',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roomCard: {
    backgroundColor: 'rgba(247, 255, 232, 0.95)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C6F75',
  },
  roomLocation: {
    fontSize: 14,
    color: '#1C6F75',
    marginBottom: 4,
    opacity: 0.8,
  },
  roomDateTime: {
    fontSize: 14,
    color: '#1C6F75',
    marginBottom: 4,
    opacity: 0.8,
  },
  participantCount: {
    fontSize: 14,
    color: '#1C6F75',
    fontWeight: '500',
    marginBottom: 12,
  },
  roomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leaveButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  joinButton: {
    backgroundColor: '#E1B604',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  joinButtonText: {
    color: '#1C6F75',
    fontSize: 14,
    fontWeight: 'bold',
  },
});