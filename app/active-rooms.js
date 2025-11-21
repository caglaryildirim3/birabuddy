import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { auth } from '../firebase/firebaseConfig';
import { getUserJoinedRooms, leaveRoom } from '../firebase/roomService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

const formatDateTimeShort = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return 'unknown';
  const date = new Date(`${dateStr}T${timeStr}`);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' • ' + timeStr;
};

export default function ActiveRooms() {
  const router = useRouter();
  const [activeRooms, setActiveRooms] = useState([]);
  const [loading, setLoading] = useState(true);

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
            try {
              await leaveRoom(room.id, auth.currentUser.uid);
            } catch (err) {}
          }
        }

        const roomsWithCreatorInfo = await Promise.all(
          filteredRooms.map(async (room) => {
            try {
              const creatorDoc = await getDoc(doc(db, 'users', room.createdBy));
              let createdByName = 'Unknown User';
              if (creatorDoc.exists()) {
                const creatorData = creatorDoc.data();
                createdByName = creatorData.nickname || creatorData.displayName || creatorData.name || `User-${room.createdBy.substring(0, 6)}`;
              }
              return { ...room, createdByName };
            } catch (error) {
              return { ...room, createdByName: 'Unknown User' };
            }
          })
        );

        setActiveRooms(roomsWithCreatorInfo);
      } catch (error) {
        Alert.alert('Error', 'Failed to load rooms.');
      } finally {
        setLoading(false);
      }
    };

    fetchActiveRooms();
  }, []);

  const handleLeaveRoom = (room) => {
    Alert.alert(
      "Leave Room",
      `Leave "${room.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveRoom(room.id, auth.currentUser.uid);
              setActiveRooms(prevRooms => prevRooms.filter(r => r.id !== room.id));
            } catch (error) {
              Alert.alert('Error', 'Failed to leave room.');
            }
          }
        }
      ]
    );
  };

  const handleRoomPress = (room) => {
    router.push(`/room-details/${room.id}`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
          </Pressable>
          <Text style={styles.title}>Active Rooms</Text>
          <View style={{width: 24}} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
        </Pressable>
        <Text style={styles.title}>active rooms</Text>
        <View style={{width: 24}} />
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
            <Pressable 
              style={styles.browseButton}
              onPress={() => router.push('/room-list')}
            >
              <Text style={styles.browseButtonText}>BROWSE ROOMS</Text>
            </Pressable>
          </View>
        ) : (
          activeRooms.map((room) => (
            <Pressable
              key={room.id}
              style={styles.card}
              onPress={() => handleRoomPress(room)}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle} numberOfLines={1}>{room.name}</Text>
                
                {/* DESCRIPTION ADDED */}
                {room.description ? (
                  <Text style={styles.description} numberOfLines={1}>{room.description}</Text>
                ) : null}

                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={14} color="#4d4c41" />
                  <Text style={styles.location} numberOfLines={1}>{room.neighborhood || 'No location'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={14} color="#4d4c41" />
                  <Text style={styles.time}>{formatDateTimeShort(room.date, room.time)}</Text>
                </View>
              </View>

              <View style={styles.cardRight}>
                <View style={styles.countContainer}>
                  <Ionicons name="people" size={16} color="#3A6A6F" />
                  <Text style={styles.peopleCount}>
                    {room.participants?.length || 0}/{room.maxParticipants}
                  </Text>
                </View>

                <Pressable
                  style={styles.leaveButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleLeaveRoom(room);
                  }}
                >
                  <Text style={styles.leaveButtonText}>Leave</Text>
                </Pressable>
              </View>
            </Pressable>
          ))
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
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: '#4A3B47',
  },
  backButton: { padding: 4 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#E8A4C7' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#E8A4C7', fontSize: 16 },
  
  card: {
    backgroundColor: '#E8D5DA',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A6A6F',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardLeft: {
    flex: 1,
    marginRight: 10,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minWidth: 70,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4d4c41',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  location: {
    fontSize: 13,
    color: '#4d4c41',
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  time: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  peopleCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3A6A6F',
    marginLeft: 4,
  },
  leaveButton: {
    backgroundColor: '#C62828',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  leaveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: { fontSize: 60, marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#E8A4C7', marginBottom: 10 },
  browseButton: {
    backgroundColor: '#E8A4C7',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  browseButtonText: { color: '#4A3B47', fontSize: 16, fontWeight: 'bold' },
});