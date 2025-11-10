import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { auth } from '../firebase/firebaseConfig';
import { getUserJoinedRooms, leaveRoom, getUserProfiles } from '../firebase/roomService';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig'; // Adjust path as needed

const { width } = Dimensions.get('window');
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

export default function ActiveRooms() {
  const router = useRouter();
  const [activeRooms, setActiveRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch user's joined rooms from Firebase
 useEffect(() => {
  const fetchActiveRooms = async () => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const userRooms = await getUserJoinedRooms(auth.currentUser.uid);
      const now = new Date();
      const filteredRooms = [];

      for (const room of userRooms) {
        if (!room.date || !room.time) continue;

        const roomTime = new Date(`${room.date}T${room.time}`);
        const expiryTime = new Date(roomTime.getTime() + 24 * 60 * 60 * 1000);

        if (expiryTime > now) {
          filteredRooms.push(room);
        } else {
          // optionally, remove expired room reference from user's joined rooms
          try {
            await leaveRoom(room.id, auth.currentUser.uid);
            console.log(`Removed expired room from active list: ${room.name}`);
          } catch (err) {
            console.error('Failed to remove expired room from joined list:', err);
          }
        }
      }

  // Get creator profile for each valid room
const roomsWithCreatorInfo = await Promise.all(
  filteredRooms.map(async (room) => {
    try {
      // Fetch creator profile directly from Firestore
      const creatorDoc = await getDoc(doc(db, 'users', room.createdBy));
      
      let createdByName = 'Unknown User';
      
      if (creatorDoc.exists()) {
        const creatorData = creatorDoc.data();
        // Try different possible name fields in order of preference
        createdByName = creatorData.nickname || 
                      creatorData.displayName || 
                      creatorData.name || 
                      `User-${room.createdBy.substring(0, 6)}`;
      }
      
      return {
        ...room,
        createdByName,
      };
    } catch (error) {
      console.error('Error fetching creator profile for room:', room.id, error);
      return {
        ...room,
        createdByName: 'Unknown User',
      };
    }
  })
);


      setActiveRooms(roomsWithCreatorInfo);
    } catch (error) {
      console.error('Error fetching active rooms:', error);
      Alert.alert('Error', 'Failed to load your active rooms. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  fetchActiveRooms();
}, []);


  const getStatusColor = (status) => {
    switch (status) {
      case 'upcoming': return '#4CAF50';
      case 'live': return '#FF9800';
      case 'ended': return '#757575';
      default: return '#757575';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'upcoming': return 'Upcoming';
      case 'live': return 'Live Now';
      case 'ended': return 'Ended';
      default: return 'Unknown';
    }
  };

  const handleLeaveRoom = (room) => {
    Alert.alert(
      "Leave Room",
      `Are you sure you want to leave "${room.name}"?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveRoom(room.id, auth.currentUser.uid);
              
              // Remove from local state
              setActiveRooms(prevRooms => prevRooms.filter(r => r.id !== room.id));
              Alert.alert('Success', `You have left "${room.name}"`);
            } catch (error) {
              console.error('Error leaving room:', error);
              Alert.alert('Error', error.message || 'Failed to leave room. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleRoomPress = (room) => {
    // Navigate to room details page
    router.push(`/room-details/${room.id}`);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Active Rooms</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your rooms...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Active Rooms</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeRooms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍺</Text>
            <Text style={styles.emptyTitle}>No Active Rooms</Text>
            <Text style={styles.emptySubtitle}>
              You haven't joined any rooms yet.{'\n'}
              Browse available rooms to start socializing!
            </Text>
            <Pressable 
              style={styles.browseButton}
              onPress={() => router.push('/room-list')}
            >
              <Text style={styles.browseButtonText}>Browse Rooms</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {activeRooms.length} room{activeRooms.length !== 1 ? 's' : ''}
            </Text>
            
            {activeRooms.map((room) => (
              <Pressable
                key={room.id}
                style={styles.roomCard}
                onPress={() => handleRoomPress(room)}
                android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
              >
                <View style={styles.roomHeader}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(room.status) }]}>
                    <Text style={styles.statusText}>{getStatusText(room.status)}</Text>
                  </View>
                </View>

               <Text style={styles.roomLocation}>📍 {room.neighborhood || room.location || 'no location'}</Text>
                <Text style={styles.roomDateTime}>
  🗓️ {formatFullDateTime(room.date, room.time)}
</Text>
                
                <View style={styles.roomDetails}>
                  <Text style={styles.participantCount}>
                    👥 {room.participants?.length || 0}/{room.maxParticipants} people
                  </Text>
                  <Text style={styles.createdBy}>
                    Created by {room.createdByName}
                  </Text>
                </View>

                {room.description && (
                  <Text style={styles.roomDescription}>"{room.description}"</Text>
                )}

                <View style={styles.roomActions}>
                  {room.status !== 'ended' && (
                    <Pressable
                      style={styles.leaveButton}
                      onPress={() => handleLeaveRoom(room)}
                    >
                      <Text style={styles.leaveButtonText}>Leave Room</Text>
                    </Pressable>
                  )}
                  
                  {room.status === 'live' && (
                    <Pressable
                      style={styles.joinButton}
                      onPress={() => handleRoomPress(room)}
                    >
                      <Text style={styles.joinButtonText}>Join Now</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 50,
    padding: 10,
  },
  backButtonText: {
    color: '#E8D5DA',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#E8A4C7',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#E8D5DA',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  emptyIcon: {
    fontSize: 60,
    marginBottom: 20,
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
    backgroundColor: '#E8D5DA',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4d4c41ff',
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  roomLocation: {
    fontSize: 14,
    color: '#4d4c41ff',
    marginBottom: 6,
    opacity: 0.8,
  },
  roomDateTime: {
    fontSize: 14,
    color: '#4d4c41ff',
    marginBottom: 12,
    opacity: 0.8,
  },
  roomDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  participantCount: {
    fontSize: 14,
    color: '#4d4c41ff',
    fontWeight: '500',
  },
  createdBy: {
    fontSize: 12,
    color: '#4d4c41ff',
    opacity: 0.7,
    fontStyle: 'italic',
  },
  roomDescription: {
    fontSize: 14,
    color: '#4d4c41ff',
    fontStyle: 'italic',
    marginBottom: 15,
    opacity: 0.8,
  },
  roomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
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
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});