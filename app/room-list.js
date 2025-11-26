import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

const NEIGHBORHOODS = ['hisarustu', 'besiktas', 'kadikoy', 'cihangir', 'taksim', 'bomonti', 'karakoy'];

export default function JoinRoom() {
  const [rooms, setRooms] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [userParticipations, setUserParticipations] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // --- FILTERS ---
  const [activeName, setActiveName] = useState('');
  const [activeLocations, setActiveLocations] = useState([]); 
  const [activeDay, setActiveDay] = useState(null);
  const [activeTimeStart, setActiveTimeStart] = useState(null);

  const [tempName, setTempName] = useState('');
  const [tempLocations, setTempLocations] = useState([]);
  const [tempDay, setTempDay] = useState(null);
  const [tempTimeStart, setTempTimeStart] = useState(null);

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

  const timeSlots = [
    { label: 'Before 18:00', start: -1 },
    { label: '18:00-19:00', start: 18 },
    { label: '19:00-20:00', start: 19 },
    { label: '20:00-21:00', start: 20 },
    { label: '21:00-22:00', start: 21 },
    { label: '22:00-23:00', start: 22 },
    { label: '23:00-00:00', start: 23 },
    { label: '00:00+', start: 24 }, 
  ];

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

  const openFilterModal = () => {
    setTempName(activeName);
    setTempLocations([...activeLocations]);
    setTempDay(activeDay);
    setTempTimeStart(activeTimeStart);
    setIsFilterVisible(true);
  };

  const applyFilters = () => {
    setActiveName(tempName);
    setActiveLocations(tempLocations);
    setActiveDay(tempDay);
    setActiveTimeStart(tempTimeStart);
    setIsFilterVisible(false);
  };

  const clearFilters = () => {
    setTempName('');
    setTempLocations([]);
    setTempDay(null);
    setTempTimeStart(null);
  };

  const toggleNeighborhood = (neighborhood) => {
    if (tempLocations.includes(neighborhood)) {
      setTempLocations(tempLocations.filter(loc => loc !== neighborhood));
    } else {
      setTempLocations([...tempLocations, neighborhood]);
    }
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
            
            // 1. Safety Check: If no date, skip
            if (!date) continue;

            let eventDateTime;

            // 2. DATA TYPE CHECK (Crucial for your transition)
            if (date.toDate) {
                // Case A: It's a Firestore Timestamp (New Rooms)
                eventDateTime = date.toDate();
            } else if (typeof date === 'string' && time) {
                // Case B: It's a String (Old Rooms)
                // We combine the date string + time string to get the start time
                eventDateTime = new Date(`${date}T${time}`);
            } else {
                continue; // Skip invalid data
            }

            // 3. THE 24-HOUR RULE
            // We calculate the exact moment 24 hours AFTER the meeting starts
            const expiryDateTime = new Date(eventDateTime.getTime() + (24 * 60 * 60 * 1000));

            // 4. Check if the room has expired
            if (now > expiryDateTime) {
              // If I am the creator, delete it from the database to clean up
              if (createdBy === user.uid) {
                try {
                  await deleteDoc(doc(db, 'rooms', room.id));
                  console.log(`Deleted expired room: ${room.name}`);
                } catch (err) {
                  console.error("Failed to auto-delete room:", err);
                }
              }
              // STRICTLY SKIP: Don't show this room in the list, even if delete failed
              continue;
            }

            // 5. If not expired, show it (but hide my own rooms from the "Join" list)
            if (createdBy !== user.uid) {
              filteredRooms.push(room);
            }
          }

          // ... (Rest of your existing logic for participants stays here) ...
          
          filteredRooms.forEach((room) => {
            const participantsRef = collection(db, 'rooms', room.id, 'participants');
            const participantUnsub = onSnapshot(participantsRef, (participantSnapshot) => {
              const participants = participantSnapshot.docs.map(doc => doc.data());
              const isUserParticipant = participants.some(p => p.uid === user.uid);

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

  const availableRooms = useMemo(() => {
    let filtered = rooms.filter((room) => {
      const max = room.maxParticipants || 0;
      const current = participantCounts[room.id] || 0;
      const isUserInRoom = userParticipations[room.id] || false;
      
      if (current >= max || isUserInRoom) return false;

      if (activeName && !room.name.toLowerCase().includes(activeName.toLowerCase())) return false;

      if (activeLocations.length > 0) {
        const roomLoc = (room.neighborhood || room.location || '').toLowerCase();
        const match = activeLocations.some(selectedLoc => 
          roomLoc.includes(selectedLoc.toLowerCase())
        );
        if (!match) return false;
      }

      // --- CHANGE 3 START: Handle Date Filter for both Old (String) and New (Timestamp) data ---
      if (activeDay) {
        let roomDateStr;

        if (room.date && room.date.toDate) {
            // New Data: Convert Timestamp to 'YYYY-MM-DD' string to match the filter
            const d = room.date.toDate();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            roomDateStr = `${year}-${month}-${day}`;
        } else {
            // Old Data: It's already a string like "2025-11-26"
            roomDateStr = room.date;
        }

        // Compare the converted string with the filter
        if (roomDateStr !== activeDay) return false;
      }
      // --- CHANGE 3 END ---

      if (activeTimeStart !== null) {
        const roomHour = parseInt(room.time.split(':')[0], 10);
        
        if (activeTimeStart === -1) {
          if (roomHour >= 18) return false;
        } else if (activeTimeStart === 24) {
          if (roomHour >= 6) return false; 
        } else {
          if (roomHour !== activeTimeStart) return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      // Safety check: sometimes new rooms might not have createdAt immediately
      if (a.createdAt && b.createdAt) {
        return b.createdAt.seconds - a.createdAt.seconds;
      }
      return 0;
    });
  }, [rooms, participantCounts, userParticipations, activeName, activeLocations, activeDay, activeTimeStart]);

  const handleRequest = async (roomId, requests = []) => {
    if (!currentUser) return;
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        requests: arrayUnion(currentUser.uid),
        requestTimestamps: { [currentUser.uid]: serverTimestamp() }
      });
      
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
        <View style={styles.cardLeft}>
          <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
          
          {item.description ? (
            <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
          ) : null}

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color="#4d4c41" />
            <Text style={styles.location} numberOfLines={1}>{item.neighborhood || item.location}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color="#4d4c41" />
            <Text style={styles.time}>{formatDateTimeShort(item.date, item.time)}</Text>
          </View>
        </View>

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

  if (loading || !currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
          </Pressable>
          <Text style={styles.headerTitle}>join a meetup 🍻</Text>
          <View style={{width: 40}} /> 
        </View>
        <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
          <Text style={styles.emptyText}>Loading...</Text>
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
        <Text style={styles.headerTitle}>join a meetup 🍻</Text>
        <Pressable style={styles.filterIconBtn} onPress={openFilterModal}>
          <Ionicons name="filter" size={24} color="#E1B604" />
        </Pressable>
      </View>

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
                placeholder="Search by name..." 
                value={tempName}
                onChangeText={setTempName}
              />
              <Text style={styles.filterLabel}>Neighborhoods</Text>
              <View style={styles.wrapContainer}>
                {NEIGHBORHOODS.map((hood) => {
                  const isSelected = tempLocations.includes(hood);
                  return (
                    <Pressable
                      key={hood}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => toggleNeighborhood(hood)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                        {hood}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.filterLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                <Pressable 
                  style={[styles.chip, tempDay === null && styles.chipActive]}
                  onPress={() => setTempDay(null)}
                >
                  <Text style={[styles.chipText, tempDay === null && styles.chipTextActive]}>Any</Text>
                </Pressable>
                {next7Days.map((day) => (
                  <Pressable
                    key={day.value}
                    style={[styles.chip, tempDay === day.value && styles.chipActive]}
                    onPress={() => setTempDay(day.value === tempDay ? null : day.value)}
                  >
                    <Text style={[styles.chipText, tempDay === day.value && styles.chipTextActive]}>
                      {day.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.filterLabel}>Time Interval</Text>
              <View style={styles.wrapContainer}>
                <Pressable 
                  style={[styles.chip, tempTimeStart === null && styles.chipActive]}
                  onPress={() => setTempTimeStart(null)}
                >
                  <Text style={[styles.chipText, tempTimeStart === null && styles.chipTextActive]}>Any</Text>
                </Pressable>
                {timeSlots.map((slot) => (
                  <Pressable
                    key={slot.start}
                    style={[styles.chip, tempTimeStart === slot.start && styles.chipActive]}
                    onPress={() => setTempTimeStart(slot.start === tempTimeStart ? null : slot.start)}
                  >
                    <Text style={[styles.chipText, tempTimeStart === slot.start && styles.chipTextActive]}>
                      {slot.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear All</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={applyFilters}>
                <Text style={styles.applyButtonText}>Show Results</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {availableRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>no rooms found</Text>
          <Pressable 
             onPress={() => {
               setActiveName('');
               setActiveLocations([]);
               setActiveDay(null);
               setActiveTimeStart(null);
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: '#4A3B47',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#E8A4C7' },
  filterIconBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 },
  flatListContent: { paddingBottom: 100 },
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
  cardLeft: { flex: 1, marginRight: 10 },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 70 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#4d4c41', marginBottom: 2 },
  description: { fontSize: 13, color: '#666', marginBottom: 6, fontStyle: 'italic' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  location: { fontSize: 13, color: '#4d4c41', marginLeft: 4, fontWeight: '600', textTransform: 'capitalize' },
  time: { fontSize: 13, color: '#666', marginLeft: 4 },
  countContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  peopleCount: { fontSize: 14, fontWeight: 'bold', color: '#3A6A6F', marginLeft: 4 },
  joinButton: { backgroundColor: '#E1B604', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  joinButtonText: { color: '#1C6F75', fontWeight: 'bold', fontSize: 12 },
  requestedBadge: { backgroundColor: '#DCD8A7', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20 },
  requestedText: { fontSize: 11, color: '#555', fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#E8A4C7', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#E8D5DA', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#4A3B47' },
  filterLabel: { fontSize: 15, fontWeight: '700', color: '#4A3B47', marginTop: 15, marginBottom: 8 },
  input: { backgroundColor: '#FFF', borderRadius: 8, padding: 12, fontSize: 14, color: '#333' },
  chipScroll: { flexDirection: 'row', marginBottom: 5 },
  wrapContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E1B604' },
  chipActive: { backgroundColor: '#E1B604' },
  chipText: { color: '#4A3B47', fontSize: 12, textTransform: 'capitalize' },
  chipTextActive: { color: '#FFF', fontWeight: 'bold' },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 20 },
  clearButton: { flex: 0.3, padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: '#4A3B47' },
  clearButtonText: { color: '#4A3B47', fontWeight: 'bold' },
  applyButton: { flex: 0.65, backgroundColor: '#4A3B47', padding: 15, borderRadius: 12, alignItems: 'center' },
  applyButtonText: { color: '#E1B604', fontSize: 16, fontWeight: 'bold' },
});