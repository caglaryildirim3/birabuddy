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
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

export default function JoinRoom() {
  const [rooms, setRooms] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [userParticipations, setUserParticipations] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // --- FILTER STATES ---
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterDay, setFilterDay] = useState(null);
  const [filterTimeStart, setFilterTimeStart] = useState(null);

  // Next 7 Days for Filter
  const next7Days = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
        value: d.toISOString().split('T')[0]
      });
    }
    return days;
  }, []);

  // Time Slots for Filter
  const timeSlots = [
    { label: '18:00-19:00', start: 18 },
    { label: '19:00-20:00', start: 19 },
    { label: '20:00-21:00', start: 20 },
    { label: '21:00-22:00', start: 21 },
    { label: '22:00-23:00', start: 22 },
    { label: '23:00-00:00', start: 23 },
  ];

  const formatDateTimeShort = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return 'unknown';
    const date = new Date(`${dateStr}T${timeStr}`);
    // Format: "Fri, Nov 15 • 19:30"
    return date.toLocaleString('en-US', {
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
      participantUnsubscribes = [];

      setCurrentUser(user);
      setLoading(true);

      if (!user || !user.emailVerified) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const roomsRef = collection(db, 'rooms');

      unsubscribe = onSnapshot(roomsRef, async (snapshot) => {
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

            if (expiryDateTime < now && createdBy === user.uid) {
              try {
                await deleteDoc(doc(db, 'rooms', room.id));
              } catch (err) {}
              continue;
            }

            if (createdBy !== user.uid) {
              filteredRooms.push(room);
            }
          }

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

          setRooms(filteredRooms);
          setLoading(false);
        },
        (error) => {
          console.error('Error fetching rooms:', error);
          setLoading(false);
        }
      );
    });

    return () => {
      authUnsubscribe();
      if (unsubscribe) unsubscribe();
      participantUnsubscribes.forEach(unsub => unsub());
    };
  }, []);

  // --- FILTER LOGIC ---
  const availableRooms = useMemo(() => {
    let filtered = rooms.filter((room) => {
      const max = room.maxParticipants || 0;
      const current = participantCounts[room.id] || 0;
      const isUserInRoom = userParticipations[room.id] || false;
      
      if (current >= max || isUserInRoom) return false;

      if (filterName && !room.name.toLowerCase().includes(filterName.toLowerCase())) return false;

      const loc = room.neighborhood || room.location || '';
      if (filterLocation && !loc.toLowerCase().includes(filterLocation.toLowerCase())) return false;

      if (filterDay && room.date !== filterDay) return false;

      if (filterTimeStart !== null) {
        const roomHour = parseInt(room.time.split(':')[0], 10);
        if (roomHour !== filterTimeStart) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return b.createdAt.seconds - a.createdAt.seconds;
      }
      return 0;
    });
  }, [rooms, participantCounts, userParticipations, filterName, filterLocation, filterDay, filterTimeStart]);

  const handleRequest = async (roomId, requests = []) => {
    if (!currentUser) return;
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        requests: arrayUnion(currentUser.uid),
        requestTimestamps: { [currentUser.uid]: serverTimestamp() }
      });
      Alert.alert('Request Sent', 'Good luck!');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const renderRoom = ({ item }) => {
    const requested = item.requests?.includes(currentUser?.uid);
    const currentCount = participantCounts[item.id] || 0;
    
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/room-details/${item.id}`)}
      >
        {/* Left Side: Info */}
        <View style={styles.cardLeft}>
          <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color="#4d4c41" />
            <Text style={styles.location} numberOfLines={1}>{item.neighborhood || item.location}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color="#4d4c41" />
            <Text style={styles.time}>{formatDateTimeShort(item.date, item.time)}</Text>
          </View>
        </View>

        {/* Right Side: Action & Count */}
        <View style={styles.cardRight}>
          <View style={styles.countContainer}>
            <Ionicons name="people" size={16} color="#3A6A6F" />
            <Text style={styles.peopleCount}>{currentCount}/{item.maxParticipants || '?'}</Text>
          </View>

          {requested ? (
            <View style={styles.requestedBadge}>
              <Text style={styles.requestedText}>Pending</Text>
            </View>
          ) : (
            <Pressable
              style={styles.joinButton}
              onPress={(e) => {
                e.stopPropagation();
                handleRequest(item.id, item.requests || []);
              }}
            >
              <Text style={styles.joinButtonText}>Join</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  // --- FILTER MODAL COMPONENT ---
  const FilterModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isFilterVisible}
      onRequestClose={() => setIsFilterVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Rooms</Text>
            <Pressable onPress={() => setIsFilterVisible(false)}>
              <Ionicons name="close" size={24} color="#4A3B47" />
            </Pressable>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.filterLabel}>Room Name</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Chill drinks" 
              value={filterName}
              onChangeText={setFilterName}
            />

            <Text style={styles.filterLabel}>Location</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Kadikoy"
              value={filterLocation}
              onChangeText={setFilterLocation}
            />

            <Text style={styles.filterLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <Pressable 
                style={[styles.chip, filterDay === null && styles.chipActive]}
                onPress={() => setFilterDay(null)}
              >
                <Text style={[styles.chipText, filterDay === null && styles.chipTextActive]}>Any</Text>
              </Pressable>
              {next7Days.map((day) => (
                <Pressable
                  key={day.value}
                  style={[styles.chip, filterDay === day.value && styles.chipActive]}
                  onPress={() => setFilterDay(day.value === filterDay ? null : day.value)}
                >
                  <Text style={[styles.chipText, filterDay === day.value && styles.chipTextActive]}>
                    {day.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>Time Interval</Text>
            <View style={styles.wrapContainer}>
              <Pressable 
                style={[styles.chip, filterTimeStart === null && styles.chipActive]}
                onPress={() => setFilterTimeStart(null)}
              >
                <Text style={[styles.chipText, filterTimeStart === null && styles.chipTextActive]}>Any</Text>
              </Pressable>
              {timeSlots.map((slot) => (
                <Pressable
                  key={slot.start}
                  style={[styles.chip, filterTimeStart === slot.start && styles.chipActive]}
                  onPress={() => setFilterTimeStart(slot.start === filterTimeStart ? null : slot.start)}
                >
                  <Text style={[styles.chipText, filterTimeStart === slot.start && styles.chipTextActive]}>
                    {slot.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable style={styles.applyButton} onPress={() => setIsFilterVisible(false)}>
            <Text style={styles.applyButtonText}>Show Results</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (loading || !currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.header}>join a meetup 🍻</Text>
        <Text style={styles.emptyText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.header}>join a meetup 🍻</Text>
        <Pressable style={styles.filterIconBtn} onPress={() => setIsFilterVisible(true)}>
          <Ionicons name="filter" size={24} color="#E1B604" />
        </Pressable>
      </View>

      <FilterModal />

      {availableRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>no rooms found</Text>
          <Pressable 
             onPress={() => {
               setFilterName(''); 
               setFilterLocation(''); 
               setFilterDay(null); 
               setFilterTimeStart(null);
             }}
          >
            <Text style={{color: '#E1B604', marginTop: 10}}>Clear Filters</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={availableRooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoom}
          // Removed numColumns (default is 1)
          // Removed horizontal props
          contentContainerStyle={styles.flatListContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E8A4C7',
  },
  filterIconBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  flatListContent: {
    paddingBottom: 100,
  },
  // --- NEW WIDE CARD STYLES ---
  card: {
    backgroundColor: '#E8D5DA',
    marginHorizontal: 20, // Side spacing
    marginBottom: 12,     // Spacing between cards
    borderRadius: 12,
    flexDirection: 'row', // Organize content Left/Right
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
    flex: 1, // Take up remaining space
    marginRight: 10,
  },
  cardRight: {
    alignItems: 'flex-end', // Align button/count to the right
    justifyContent: 'space-between',
    minWidth: 70,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4d4c41',
    marginBottom: 6,
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
  joinButton: {
    backgroundColor: '#E1B604',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  joinButtonText: {
    color: '#1C6F75',
    fontWeight: 'bold',
    fontSize: 12,
  },
  requestedBadge: {
    backgroundColor: '#DCD8A7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  requestedText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#E8A4C7',
    fontSize: 16,
  },
  // --- MODAL STYLES ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#E8D5DA',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    height: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4A3B47',
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4A3B47',
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#FFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E1B604',
  },
  chipActive: {
    backgroundColor: '#E1B604',
  },
  chipText: {
    color: '#4A3B47',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  applyButton: {
    backgroundColor: '#4A3B47',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  applyButtonText: {
    color: '#E1B604',
    fontSize: 16,
    fontWeight: 'bold',
  },
});