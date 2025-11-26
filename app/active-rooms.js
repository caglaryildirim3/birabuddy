import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';

const formatDateTimeShort = (dateVal, timeStr) => {
  if (!dateVal) return 'unknown';

  let dateObj;

  // 1. Handle New Data (Firestore Timestamp)
  if (dateVal.toDate) {
    dateObj = dateVal.toDate();
  } 
  // 2. Handle Old Data (String)
  else if (typeof dateVal === 'string' && timeStr) {
    dateObj = new Date(`${dateVal}T${timeStr}`);
  } else {
    return 'unknown';
  }

  return dateObj.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
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
        
        // 1. Fetch ALL rooms (It's okay for <500 rooms)
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);
        const allRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const myActiveRooms = [];
        const now = new Date();

        // 2. Check each room to see if I am a participant
        for (const room of allRooms) {
            const { date, time } = room;
            
            // Safety Check
            if (!date) continue;

            let roomTime;

            // --- DATA TYPE CHECK START ---
            if (date.toDate) {
                // Case A: New Data (Timestamp)
                roomTime = date.toDate();
            } else if (typeof date === 'string' && time) {
                // Case B: Old Data (String)
                roomTime = new Date(`${date}T${time}`);
            } else {
                continue; // Skip invalid data
            }
            // --- DATA TYPE CHECK END ---
            
            // 24-Hour Expiration Check
            const expiryTime = new Date(roomTime.getTime() + 24 * 60 * 60 * 1000);
            
            if (expiryTime < now) continue; // Skip expired

            // CHECK SUBCOLLECTION (Existing Logic)
            const participantDoc = await getDoc(doc(db, 'rooms', room.id, 'participants', auth.currentUser.uid));
            
            // If I am in the subcollection OR I am the creator
            if (participantDoc.exists() || room.createdBy === auth.currentUser.uid) {
                
                // Get Creator Name
                let createdByName = 'Unknown User';
                try {
                    const creatorDoc = await getDoc(doc(db, 'users', room.createdBy));
                    if (creatorDoc.exists()) {
                        const cData = creatorDoc.data();
                        createdByName = cData.nickname || cData.instagram || 'User';
                    }
                } catch (e) {}

                myActiveRooms.push({ ...room, createdByName });
            }
        }

        // ... rest of the function (setActiveRooms, etc.)

        setActiveRooms(myActiveRooms);

      } catch (error) {
        console.error('Error fetching active rooms:', error);
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
              await deleteDoc(doc(db, 'rooms', room.id, 'participants', auth.currentUser.uid));
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
          <Text style={styles.title}>active rooms</Text>
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
            <Text style={styles.emptyTitle}>no active rooms</Text>
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
                     {room.maxParticipants} max
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