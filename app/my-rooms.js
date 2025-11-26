import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, RefreshControl, Alert } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function MyRooms() {
  const [myRooms, setMyRooms] = useState([]);
  const [roomStats, setRoomStats] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
    }) + ' • ' + timeStr;
  };

  useEffect(() => {
    let unsubscribe = null;
    let participantUnsubscribes = [];

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (unsubscribe) unsubscribe();
      participantUnsubscribes.forEach(unsub => unsub());
      
      if (!user || !user.emailVerified) {
        setMyRooms([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', user.uid));

      unsubscribe = onSnapshot(roomsQuery, async (snapshot) => {
          const now = new Date();
          const fetched = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          const validRooms = [];

          for (const room of fetched) {
            const { date, time } = room;
            
            // Safety check
            if (!date) continue;

            let eventDateTime;

            // --- DATA TYPE CHECK START ---
            if (date.toDate) {
                // New Data (Timestamp)
                eventDateTime = date.toDate();
            } else if (typeof date === 'string' && time) {
                // Old Data (String)
                eventDateTime = new Date(`${date}T${time}`);
            } else {
                continue;
            }
            // --- DATA TYPE CHECK END ---

            // Check 24-hour expiration
            const expiryDateTime = new Date(eventDateTime.getTime() + 24 * 60 * 60 * 1000);
            
            if (expiryDateTime < now) {
              // It's expired -> Delete from database
              try {
                await deleteDoc(doc(db, 'rooms', room.id));
              } catch (e) {
                console.error("Error deleting expired room:", e);
              }
              continue; // Don't show in list
            }
            
            validRooms.push(room);
          }

          const sortedRooms = validRooms.sort((a, b) => {
            if (a.createdAt && b.createdAt) return b.createdAt.seconds - a.createdAt.seconds;
            return 0;
          });

          setMyRooms(sortedRooms);
          setLoading(false);

          // (Keep the rest of your participant listener logic exactly the same)
          sortedRooms.forEach((room) => {
            const participantsRef = collection(db, 'rooms', room.id, 'participants');
            const sub = onSnapshot(participantsRef, (snap) => {
                setRoomStats((prev) => ({
                  ...prev,
                  [room.id]: {
                    participants: snap.docs.length,
                    requests: Array.isArray(room.requests) ? room.requests.length : 0,
                  },
                }));
            });
            participantUnsubscribes.push(sub);
          });
      });
    });

    return () => {
      authUnsubscribe();
      if (unsubscribe) unsubscribe();
      participantUnsubscribes.forEach(unsub => unsub());
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const renderRoom = ({ item }) => {
    const stats = roomStats[item.id] || { participants: 0, requests: 0 };
    
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/room-details/${item.id}`)}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          
          {/* DESCRIPTION ADDED */}
          {item.description ? (
            <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
          ) : null}

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color="#4d4c41" />
            <Text style={styles.location} numberOfLines={1}>{item.neighborhood || 'No location'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color="#4d4c41" />
            <Text style={styles.time}>{formatDateTimeShort(item.date, item.time)}</Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.countContainer}>
            <Ionicons name="people" size={16} color="#3A6A6F" />
            <Text style={styles.peopleCount}>{stats.participants}/{item.maxParticipants || '?'}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
          </Pressable>
          <Text style={styles.title}>My Rooms</Text>
          <View style={{width: 24}} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
        </Pressable>
        <Text style={styles.title}>my rooms</Text>
        <View style={{width: 24}} />
      </View>

      <FlatList
        data={myRooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8A4C7" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No rooms yet</Text>
            <Pressable style={styles.createButton} onPress={() => router.push('/create-room')}>
              <Text style={styles.createButtonText}>Create Room</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  backButton: { padding: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#E8A4C7' },
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
    justifyContent: 'center',
    minWidth: 60,
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
  },
  peopleCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3A6A6F',
    marginLeft: 4,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#E8A4C7', marginBottom: 10 },
  createButton: { backgroundColor: '#E8A4C7', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  createButtonText: { color: '#4A3B47', fontSize: 16, fontWeight: 'bold' },
});