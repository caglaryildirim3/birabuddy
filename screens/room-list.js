import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
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
import { useTranslation } from 'react-i18next';
import BeerColors from '../constants/BeerColors';
import { NEIGHBORHOODS_BY_CITY as CITY_NEIGHBORHOODS, CITIES, ALL_NEIGHBORHOODS } from '../constants/locations';
import { getFriendIds } from '../utils/friendUtils';
import { formatDateTimeShort, parseRoomDateTime } from '../utils/dateUtils';
import { canViewRoom, isRoomExpired } from '../utils/roomUtils';
import { isOutTonight } from '../utils/outTonightUtils';

export default function JoinRoom() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [userParticipations, setUserParticipations] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [friendIds, setFriendIds] = useState([]);
  const [roomParticipantUids, setRoomParticipantUids] = useState({});
  const [withFriendsOnly, setWithFriendsOnly] = useState(false);
  const [anyFriendLive, setAnyFriendLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // --- FILTERS ---
  const [activeName, setActiveName] = useState('');
  const [activeCities, setActiveCities] = useState([]);
  const [activeLocations, setActiveLocations] = useState([]); 
  const [activeDay, setActiveDay] = useState(null);
  const [activeTimeStart, setActiveTimeStart] = useState(null);

  const [tempName, setTempName] = useState('');
  const [tempCities, setTempCities] = useState([]);
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
    { label: t('before18'), start: -1 },
    { label: t('time1819'), start: 18 },
    { label: t('time1920'), start: 19 },
    { label: t('time2021'), start: 20 },
    { label: t('time2122'), start: 21 },
    { label: t('time2223'), start: 22 },
    { label: t('time2300'), start: 23 },
    { label: t('time00plus'), start: 24 }, 
  ];

  const openFilterModal = () => {
    setTempName(activeName);
    setTempCities([...activeCities]);
    setTempLocations([...activeLocations]);
    setTempDay(activeDay);
    setTempTimeStart(activeTimeStart);
    setIsFilterVisible(true);
  };

  const applyFilters = () => {
    setActiveName(tempName);
    setActiveCities(tempCities);
    setActiveLocations(tempLocations);
    setActiveDay(tempDay);
    setActiveTimeStart(tempTimeStart);
    setIsFilterVisible(false);
  };

  const clearFilters = () => {
    setTempName('');
    setTempCities([]);
    setTempLocations([]);
    setTempDay(null);
    setTempTimeStart(null);
  };

  const toggleCity = (city) => {
    const selectedCities = tempCities.includes(city)
      ? tempCities.filter((c) => c !== city)
      : [...tempCities, city];

    const allowedNeighborhoods = selectedCities.length > 0
      ? selectedCities.flatMap((selectedCity) => CITY_NEIGHBORHOODS[selectedCity] || [])
      : ALL_NEIGHBORHOODS;

    setTempLocations((prev) => prev.filter((loc) => allowedNeighborhoods.includes(loc)));

    setTempCities(selectedCities);
  };

  const visibleNeighborhoods = tempCities.length > 0
    ? tempCities.flatMap((selectedCity) => CITY_NEIGHBORHOODS[selectedCity] || [])
    : ALL_NEIGHBORHOODS;

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
        setFriendIds([]);
        setLoading(false);
        return;
      }

      getFriendIds(user.uid).then(setFriendIds).catch(() => setFriendIds([]));

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

            if (!parseRoomDateTime(date, time)) continue;

            // 3. THE 24-HOUR RULE
            if (isRoomExpired(date, time, now)) {
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

            // 5. Hide my own rooms; respect public/private visibility
            if (createdBy !== user.uid && canViewRoom(room, user.uid, friendIds)) {
              filteredRooms.push(room);
            }
          }

          // ... (Rest of your existing logic for participants stays here) ...
          
          filteredRooms.forEach((room) => {
            const participantsRef = collection(db, 'rooms', room.id, 'participants');
            const participantUnsub = onSnapshot(participantsRef, (participantSnapshot) => {
              const participants = participantSnapshot.docs.map((participantDoc) => participantDoc.data());
              const isUserParticipant = participants.some((p) => p.uid === user.uid);
              const participantUids = participants.map((p) => p.uid).filter(Boolean);

              setParticipantCounts((prev) => ({
                ...prev,
                [room.id]: participantSnapshot.docs.length,
              }));

              setUserParticipations((prev) => ({
                ...prev,
                [room.id]: isUserParticipant,
              }));

              setRoomParticipantUids((prev) => ({
                ...prev,
                [room.id]: participantUids,
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
  }, [friendIds.join(',')]);

  // Watch friends' live status for the green dot on the map button
  useEffect(() => {
    if (friendIds.length === 0) {
      setAnyFriendLive(false);
      return;
    }
    const chunks = [];
    for (let i = 0; i < friendIds.length; i += 10) {
      chunks.push(friendIds.slice(i, i + 10));
    }
    // Track per-chunk live status, merge into single boolean
    const chunkLive = new Array(chunks.length).fill(false);
    const unsubscribers = chunks.map((chunk, idx) =>
      onSnapshot(
        query(collection(db, 'users'), where('__name__', 'in', chunk)),
        (snap) => {
          chunkLive[idx] = snap.docs.some((d) => isOutTonight(d.data()));
          setAnyFriendLive(chunkLive.some(Boolean));
        }
      )
    );
    return () => unsubscribers.forEach((u) => u());
  }, [friendIds.join(',')]); 

  const availableRooms = useMemo(() => {
    const friendIdSet = new Set(friendIds);

    let filtered = rooms.filter((room) => {
      const max = room.maxParticipants || 0;
      const current = participantCounts[room.id] || 0;
      const isUserInRoom = userParticipations[room.id] || false;

      if (max > 0 && current >= max) return false;
      if (isUserInRoom) return false;

      if (withFriendsOnly) {
        const participantUids = roomParticipantUids[room.id] || [];
        const hasFriendInRoom = participantUids.some((uid) => friendIdSet.has(uid));
        if (!hasFriendInRoom) return false;
      }

      if (activeName && !room.name.toLowerCase().includes(activeName.toLowerCase())) return false;

      if (activeCities.length > 0) {
        const roomCity = (room.city || '').toLowerCase();
        const matchCity = activeCities.some((selectedCity) => roomCity === selectedCity.toLowerCase());
        if (!matchCity) return false;
      }

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
  }, [
    rooms,
    participantCounts,
    userParticipations,
    roomParticipantUids,
    friendIds,
    withFriendsOnly,
    activeName,
    activeCities,
    activeLocations,
    activeDay,
    activeTimeStart,
  ]);

  const handleRequest = async (room) => {
    if (!currentUser) return;
    if (!canViewRoom(room, currentUser.uid, friendIds)) return;
    try {
      const roomRef = doc(db, 'rooms', room.id);
      await updateDoc(roomRef, {
        requests: arrayUnion(currentUser.uid),
        requestTimestamps: { [currentUser.uid]: serverTimestamp() }
      });
      
    } catch (error) {
      Alert.alert(t('error'), error.message);
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
            <Ionicons name="location-outline" size={14} color={BeerColors.iconPrimary} />
            <Text style={styles.location} numberOfLines={1}>
              {item.city ? `${item.neighborhood || item.location}, ${item.city}` : (item.neighborhood || item.location)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color={BeerColors.iconPrimary} />
            <Text style={styles.time}>{formatDateTimeShort(item.date, item.time, { unknownLabel: t('unknown') })}</Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.countContainer}>
            <Ionicons name="people" size={16} color={BeerColors.iconPrimary} />
            <Text style={styles.peopleCount}>{currentCount}/{item.maxParticipants || '?'}</Text>
          </View>

          {requested ? (
            <View style={styles.requestedBadge}>
              <Text style={styles.requestedText}>{t('pending')}</Text>
            </View>
          ) : (
            <Pressable
              style={styles.joinButton}
              onPress={(e) => {
                e.stopPropagation();
                handleRequest(item);
              }}
            >
              <Text style={styles.joinButtonText}>{t('join')}</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  if (loading || !currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
          <Text style={styles.emptyText}>{t('loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={[styles.withFriendsButton, withFriendsOnly && styles.withFriendsButtonActive]}
          onPress={() => setWithFriendsOnly((prev) => !prev)}
        >
          <Ionicons
            name="people"
            size={16}
            color={withFriendsOnly ? BeerColors.onAccent : BeerColors.iconPrimary}
          />
          <Text
            style={[
              styles.withFriendsButtonText,
              withFriendsOnly && styles.withFriendsButtonTextActive,
            ]}
          >
            {t('withFriends')}
          </Text>
        </Pressable>
        <Pressable style={styles.filterIconBtn} onPress={openFilterModal}>
          <Ionicons name="filter" size={24} color={BeerColors.iconPrimary} />
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
              <Text style={styles.modalTitle}>{t('filterRooms')}</Text>
              <Pressable onPress={() => setIsFilterVisible(false)}>
                <Ionicons name="close" size={24} color={BeerColors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.filterLabel}>{t('roomName')}</Text>
              <TextInput 
                style={styles.input} 
                placeholder={t('searchByName')}
                value={tempName}
                onChangeText={setTempName}
              />
              <Text style={styles.filterLabel}>{t('cities')}</Text>
              <View style={styles.wrapContainer}>
                {CITIES.map((city) => {
                  const isSelected = tempCities.includes(city);
                  return (
                    <Pressable
                      key={city}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => toggleCity(city)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                        {city}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.filterLabel}>{t('neighborhoods')}</Text>
              <View style={styles.wrapContainer}>
                {visibleNeighborhoods.map((hood) => {
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
              <Text style={styles.filterLabel}>{t('day')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                <Pressable 
                  style={[styles.chip, tempDay === null && styles.chipActive]}
                  onPress={() => setTempDay(null)}
                >
                  <Text style={[styles.chipText, tempDay === null && styles.chipTextActive]}>{t('any')}</Text>
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
              <Text style={styles.filterLabel}>{t('timeInterval')}</Text>
              <View style={styles.wrapContainer}>
                <Pressable 
                  style={[styles.chip, tempTimeStart === null && styles.chipActive]}
                  onPress={() => setTempTimeStart(null)}
                >
                  <Text style={[styles.chipText, tempTimeStart === null && styles.chipTextActive]}>{t('any')}</Text>
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
                <Text style={styles.clearButtonText}>{t('clearAllFilters')}</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={applyFilters}>
                <Text style={styles.applyButtonText}>{t('showResults')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {availableRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('noRoomsFound')}</Text>
          <Pressable 
             onPress={() => {
               setActiveName('');
               setActiveCities([]);
               setActiveLocations([]);
               setActiveDay(null);
               setActiveTimeStart(null);
               setWithFriendsOnly(false);
             }}
          >
            <Text style={{color: BeerColors.textPrimary, marginTop: 10}}>{t('clearFilters')}</Text>
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

      {/* Live Map FAB */}
      <Pressable style={styles.liveMapFab} onPress={() => router.push('/live-map')}>
        <Ionicons name="globe-outline" size={26} color={BeerColors.onAccent} />
        {anyFriendLive ? <View style={styles.liveMapFabDot} /> : null}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: BeerColors.background,
  },
  filterIconBtn: { padding: 8, backgroundColor: BeerColors.panelSoft, borderRadius: 8, borderWidth: 1, borderColor: BeerColors.borderSoft },
  liveMapFab: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BeerColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  liveMapFabDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: BeerColors.accent,
  },
  withFriendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: BeerColors.panelElevated,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  withFriendsButtonActive: {
    backgroundColor: BeerColors.accent,
    borderColor: BeerColors.accent,
  },
  withFriendsButtonText: {
    color: BeerColors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  withFriendsButtonTextActive: {
    color: BeerColors.onAccent,
    fontWeight: 'bold',
  },
  flatListContent: { paddingBottom: 100 },
  card: {
    backgroundColor: BeerColors.panel,
    marginHorizontal: 20, 
    marginBottom: 12,     
    borderRadius: 12,
    flexDirection: 'row', 
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardLeft: { flex: 1, marginRight: 10 },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 70 },
  title: { fontSize: 18, fontWeight: 'bold', color: BeerColors.textPrimary, marginBottom: 2 },
  description: { fontSize: 13, color: BeerColors.textSecondary, marginBottom: 6, fontStyle: 'italic' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  location: { fontSize: 13, color: BeerColors.textPrimary, marginLeft: 4, fontWeight: '600', textTransform: 'capitalize' },
  time: { fontSize: 13, color: BeerColors.textSecondary, marginLeft: 4 },
  countContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  peopleCount: { fontSize: 14, fontWeight: 'bold', color: BeerColors.textPrimary, marginLeft: 4 },
  joinButton: { backgroundColor: BeerColors.accent, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: BeerColors.accent },
  joinButtonText: { color: BeerColors.onAccent, fontWeight: 'bold', fontSize: 12 },
  requestedBadge: { backgroundColor: BeerColors.panelSoft, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: BeerColors.borderSoft },
  requestedText: { fontSize: 11, color: BeerColors.textSecondary, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: BeerColors.textPrimary, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: BeerColors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: BeerColors.panel, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: BeerColors.textPrimary },
  filterLabel: { fontSize: 15, fontWeight: '700', color: BeerColors.textPrimary, marginTop: 15, marginBottom: 8 },
  input: { backgroundColor: BeerColors.panelElevated, borderRadius: 8, padding: 12, fontSize: 14, color: BeerColors.textPrimary, borderWidth: 1, borderColor: BeerColors.borderSoft },
  chipScroll: { flexDirection: 'row', marginBottom: 5 },
  wrapContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { backgroundColor: BeerColors.panelElevated, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: BeerColors.borderSoft },
  chipActive: { backgroundColor: BeerColors.accent, borderColor: BeerColors.accent },
  chipText: { color: BeerColors.textSecondary, fontSize: 12, textTransform: 'capitalize' },
  chipTextActive: { color: BeerColors.onAccent, fontWeight: 'bold' },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 20 },
  clearButton: { flex: 0.3, padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: BeerColors.borderSoft },
  clearButtonText: { color: BeerColors.textPrimary, fontWeight: 'bold' },
  applyButton: { flex: 0.65, backgroundColor: BeerColors.accent, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: BeerColors.accent },
  applyButtonText: { color: BeerColors.onAccent, fontSize: 16, fontWeight: 'bold' },
});