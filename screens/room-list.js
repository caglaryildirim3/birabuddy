import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiveMapFab from '../components/LiveMapFab';
import RoomFilterModal from '../components/RoomFilterModal';
import { NEIGHBORHOODS_BY_CITY as CITY_NEIGHBORHOODS } from '../constants/locations';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import { getUserDisplayName } from '../utils/authUtils';
import { formatDateTimeShort, parseRoomDateTime } from '../utils/dateUtils';
import { getFriendIds } from '../utils/friendUtils';
import { deleteRoomTree } from '../utils/roomDeleteUtils';
import {
  countUnreadRoomInvites,
  isUnreadRoomInvite,
  loadSeenRoomInvites,
} from '../utils/roomInviteUtils';
import { applyRoomFilters, DEFAULT_ROOM_FILTERS, getNext7Days } from '../utils/roomListFilters';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import { canViewRoom, isRoomExpired } from '../utils/roomUtils';

export default function JoinRoom() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rooms, setRooms] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [userParticipations, setUserParticipations] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [friendIds, setFriendIds] = useState([]);
  const [roomParticipantUids, setRoomParticipantUids] = useState({});
  const [withFriendsOnly, setWithFriendsOnly] = useState(false);
  const [invitesOnly, setInvitesOnly] = useState(false);
  const [inviteSenderByRoomId, setInviteSenderByRoomId] = useState({});
  const [inviterNamesByUid, setInviterNamesByUid] = useState({});
  const [loading, setLoading] = useState(true);
  const [seenInviteMap, setSeenInviteMap] = useState({});
  const router = useRouter();

  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // --- FILTERS ---
  const [activeName, setActiveName] = useState('');
  const [activeCities, setActiveCities] = useState([]);
  const [activeLocations, setActiveLocations] = useState([]); 
  const [activeDay, setActiveDay] = useState(null);
  const [activeTimeStart, setActiveTimeStart] = useState(null);
  const [activeOnlyOpenSpots, setActiveOnlyOpenSpots] = useState(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
  const [activeSortBy, setActiveSortBy] = useState(DEFAULT_ROOM_FILTERS.sortBy);

  const [tempName, setTempName] = useState('');
  const [tempCities, setTempCities] = useState([]);
  const [tempLocations, setTempLocations] = useState([]);
  const [tempDay, setTempDay] = useState(null);
  const [tempTimeStart, setTempTimeStart] = useState(null);
  const [tempOnlyOpenSpots, setTempOnlyOpenSpots] = useState(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
  const [tempSortBy, setTempSortBy] = useState(DEFAULT_ROOM_FILTERS.sortBy);

  const next7Days = useMemo(() => getNext7Days(i18n.language), [i18n.language]);

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
    setTempOnlyOpenSpots(activeOnlyOpenSpots);
    setTempSortBy(activeSortBy);
    setIsFilterVisible(true);
  };

  const applyFilters = () => {
    setActiveName(tempName);
    setActiveCities(tempCities);
    setActiveLocations(tempLocations);
    setActiveDay(tempDay);
    setActiveTimeStart(tempTimeStart);
    setActiveOnlyOpenSpots(tempOnlyOpenSpots);
    setActiveSortBy(tempSortBy);
    setIsFilterVisible(false);
  };

  const clearFilters = () => {
    setTempName(DEFAULT_ROOM_FILTERS.name);
    setTempCities([...DEFAULT_ROOM_FILTERS.cities]);
    setTempLocations([...DEFAULT_ROOM_FILTERS.locations]);
    setTempDay(DEFAULT_ROOM_FILTERS.day);
    setTempTimeStart(DEFAULT_ROOM_FILTERS.timeStart);
    setTempOnlyOpenSpots(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
    setTempSortBy(DEFAULT_ROOM_FILTERS.sortBy);
  };

  const toggleCity = (city) => {
    const selectedCities = tempCities.includes(city)
      ? tempCities.filter((c) => c !== city)
      : [...tempCities, city];

    const allowedNeighborhoods = selectedCities.flatMap(
      (selectedCity) => CITY_NEIGHBORHOODS[selectedCity] || []
    );

    setTempLocations((prev) => prev.filter((loc) => allowedNeighborhoods.includes(loc)));

    setTempCities(selectedCities);
  };

  const visibleNeighborhoods = tempCities.flatMap(
    (selectedCity) => CITY_NEIGHBORHOODS[selectedCity] || []
  );

  const toggleNeighborhood = (neighborhood) => {
    if (tempLocations.includes(neighborhood)) {
      setTempLocations(tempLocations.filter(loc => loc !== neighborhood));
    } else {
      setTempLocations([...tempLocations, neighborhood]);
    }
  };

  useEffect(() => {
    let roomUnsubs = [];
    let participantUnsubscribes = [];
    const roomSources = {
      public: [],
      joined: [],
      friends: [],
    };

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      roomUnsubs.forEach((unsub) => unsub());
      roomUnsubs = [];
      participantUnsubscribes.forEach((unsub) => unsub());
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

      const mapRoomDocs = (snapshot) =>
        snapshot.docs.map((roomDoc) => ({ id: roomDoc.id, ...roomDoc.data() }));

      const syncParticipantListeners = (filteredRooms) => {
        participantUnsubscribes.forEach((unsub) => unsub());
        participantUnsubscribes = [];

        filteredRooms.forEach((room) => {
          const participantsRef = collection(db, 'rooms', room.id, 'participants');
          const participantUnsub = onSnapshot(
            participantsRef,
            (participantSnapshot) => {
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
            },
            handleFirestoreListenerError('room-list-participants')
          );
          participantUnsubscribes.push(participantUnsub);
        });
      };

      const processMergedRooms = async () => {
        const merged = new Map();
        [...roomSources.public, ...roomSources.joined, ...roomSources.friends].forEach((room) => {
          merged.set(room.id, room);
        });

        const now = new Date();
        const filteredRooms = [];

        for (const room of merged.values()) {
          const { date, time, createdBy } = room;

          if (!date) continue;
          if (!parseRoomDateTime(date, time)) continue;

          if (isRoomExpired(date, time, now)) {
            if (createdBy === user.uid) {
              try {
                await deleteRoomTree(room.id);
              } catch (err) {
                if (err?.code !== 'permission-denied') {
                  console.warn('Failed to auto-delete room:', err);
                }
              }
            }
            continue;
          }

          if (room.creatorAccountDeleted) continue;

          if (createdBy !== user.uid && canViewRoom(room, user.uid, friendIds)) {
            filteredRooms.push(room);
          }
        }

        syncParticipantListeners(filteredRooms);
        setRooms(filteredRooms);
        setLoading(false);
      };

      const handleRoomListenerError = (label) => (error) => {
        handleFirestoreListenerError(`room-list-${label}`)(error);
        setLoading(false);
      };

      roomUnsubs.push(
        onSnapshot(
          query(collection(db, 'rooms'), where('visibility', '==', 'public')),
          (snapshot) => {
            roomSources.public = mapRoomDocs(snapshot);
            processMergedRooms();
          },
          handleRoomListenerError('public')
        )
      );

      roomUnsubs.push(
        onSnapshot(
          query(collection(db, 'rooms'), where('participants', 'array-contains', user.uid)),
          (snapshot) => {
            roomSources.joined = mapRoomDocs(snapshot);
            processMergedRooms();
          },
          handleRoomListenerError('joined')
        )
      );

      if (friendIds.length > 0) {
        for (let i = 0; i < friendIds.length; i += 10) {
          const chunk = friendIds.slice(i, i + 10);
          roomUnsubs.push(
            onSnapshot(
              query(collection(db, 'rooms'), where('createdBy', 'in', chunk)),
              (snapshot) => {
                const chunkIds = new Set(chunk);
                const friendRooms = mapRoomDocs(snapshot).filter((room) => chunkIds.has(room.createdBy));
                roomSources.friends = [
                  ...roomSources.friends.filter((room) => !chunkIds.has(room.createdBy)),
                  ...friendRooms,
                ];
                processMergedRooms();
              },
              handleRoomListenerError('friends')
            )
          );
        }
      } else {
        roomSources.friends = [];
      }
    });

    return () => {
      authUnsubscribe();
      roomUnsubs.forEach((unsub) => unsub());
      participantUnsubscribes.forEach((unsub) => unsub());
    };
  }, [friendIds.join(',')]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setInviteSenderByRoomId({});
      return undefined;
    }

    const unsub = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', currentUser.uid)),
      (snapshot) => {
        const next = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.type === 'invite' && data.roomId && data.senderId) {
            next[data.roomId] = data.senderId;
          }
        });
        setInviteSenderByRoomId(next);
      },
      handleFirestoreListenerError('room-list-invites')
    );

    return unsub;
  }, [currentUser?.uid]);

  const invitedRoomMetaById = useMemo(() => {
    if (!currentUser?.uid) return {};

    const map = {};
    rooms.forEach((room) => {
      if (!room.invites?.includes(currentUser.uid)) return;
      const meta = room.inviteMeta?.[currentUser.uid];
      const senderUid = meta?.senderId || inviteSenderByRoomId[room.id];
      map[room.id] = {
        inviterName:
          (senderUid && inviterNamesByUid[senderUid]) ||
          meta?.senderName ||
          t('aFriend'),
        inviterUid: senderUid,
      };
    });
    return map;
  }, [rooms, currentUser?.uid, inviteSenderByRoomId, inviterNamesByUid, t]);

  const unreadInviteCount = useMemo(
    () =>
      countUnreadRoomInvites(rooms, currentUser?.uid, seenInviteMap, userParticipations),
    [rooms, currentUser?.uid, seenInviteMap, userParticipations]
  );

  useFocusEffect(
    useCallback(() => {
      if (!currentUser?.uid) {
        setSeenInviteMap({});
        return;
      }
      loadSeenRoomInvites(currentUser.uid).then(setSeenInviteMap).catch(() => setSeenInviteMap({}));
    }, [currentUser?.uid])
  );

  useEffect(() => {
    const uids = new Set();
    Object.values(invitedRoomMetaById).forEach((meta) => {
      if (meta.inviterUid) uids.add(meta.inviterUid);
    });

    if (uids.size === 0) return undefined;

    let cancelled = false;

    Promise.all(
      [...uids].map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (!snap.exists()) return { uid, name: null };
          const data = snap.data();
          return { uid, name: getUserDisplayName(data) || null };
        } catch {
          return { uid, name: null };
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      const next = { ...inviterNamesByUid };
      rows.forEach((row) => {
        if (row.name) next[row.uid] = row.name;
      });
      setInviterNamesByUid(next);
    });

    return () => {
      cancelled = true;
    };
  }, [invitedRoomMetaById]);

  const availableRooms = useMemo(() => {
    const friendIdSet = new Set(friendIds);

    const filtered = applyRoomFilters(rooms, {
      name: activeName,
      cities: activeCities,
      locations: activeLocations,
      day: activeDay,
      timeStart: activeTimeStart,
      onlyOpenSpots: activeOnlyOpenSpots,
      sortBy: activeSortBy,
    }, {
      participantCounts,
      userParticipations,
      currentUserUid: currentUser?.uid,
    }).filter((room) => {
      if (invitesOnly && !room.invites?.includes(currentUser?.uid)) return false;

      if (withFriendsOnly) {
        const participantUids = roomParticipantUids[room.id] || [];
        const hasFriendInRoom = participantUids.some((uid) => friendIdSet.has(uid));
        if (!hasFriendInRoom) return false;
      }

      return true;
    });

    return filtered;
  }, [
    rooms,
    participantCounts,
    userParticipations,
    roomParticipantUids,
    friendIds,
    withFriendsOnly,
    invitesOnly,
    activeName,
    activeCities,
    activeLocations,
    activeDay,
    activeTimeStart,
    activeOnlyOpenSpots,
    activeSortBy,
    currentUser?.uid,
  ]);

  const handleRequest = async (room) => {
    if (!currentUser) return;
    if (!canViewRoom(room, currentUser.uid, friendIds)) return;
    try {
      const roomRef = doc(db, 'rooms', room.id);
      await updateDoc(roomRef, {
        requests: arrayUnion(currentUser.uid),
        [`requestTimestamps.${currentUser.uid}`]: serverTimestamp(),
      });
      
    } catch (error) {
      Alert.alert(t('error'), error.message);
    }
  };

  const renderRoom = ({ item }) => {
    const requested = item.requests?.includes(currentUser?.uid);
    const currentCount = participantCounts[item.id] || 0;
    const inviteMeta = invitedRoomMetaById[item.id];
    const hasUnreadInvite = isUnreadRoomInvite(item, currentUser?.uid, seenInviteMap);

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/room-details/${item.id}`)}
      >
        {hasUnreadInvite ? <View style={styles.cardInviteDot} /> : null}
        <View style={styles.cardLeft}>
          <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
          {inviteMeta ? (
            <Text style={styles.inviteByLine} numberOfLines={1}>
              {t('roomInviteBy', { name: inviteMeta.inviterName })}
            </Text>
          ) : null}

          {item.description ? (
            <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
          ) : null}

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={colors.iconPrimary} />
            <Text style={styles.location} numberOfLines={1}>
              {item.city ? `${item.neighborhood || item.location}, ${item.city}` : (item.neighborhood || item.location)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color={colors.iconPrimary} />
            <Text style={styles.time}>{formatDateTimeShort(item.date, item.time, { unknownLabel: t('unknown') })}</Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.countContainer}>
            <Ionicons name="people" size={16} color={colors.iconPrimary} />
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.headerScroll}
          contentContainerStyle={styles.headerButtons}
        >
          <Pressable
            style={[styles.filterChip, withFriendsOnly && styles.filterChipActive]}
            onPress={() => setWithFriendsOnly((prev) => !prev)}
          >
            <Ionicons
              name="people"
              size={15}
              color={withFriendsOnly ? colors.onAccent : colors.iconPrimary}
            />
            <Text
              style={[
                styles.filterChipText,
                withFriendsOnly && styles.filterChipTextActive,
              ]}
            >
              {t('withFriends')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, invitesOnly && styles.filterChipActive]}
            onPress={() => setInvitesOnly((prev) => !prev)}
          >
            <Ionicons
              name="mail-outline"
              size={15}
              color={invitesOnly ? colors.onAccent : colors.iconPrimary}
            />
            <Text
              style={[
                styles.filterChipText,
                invitesOnly && styles.filterChipTextActive,
              ]}
            >
              {t('roomInvites')}
            </Text>
            {unreadInviteCount > 0 ? <View style={styles.invitesDot} /> : null}
          </Pressable>
        </ScrollView>
        <Pressable style={styles.filterIconBtn} onPress={openFilterModal}>
          <Ionicons name="filter" size={24} color={colors.iconPrimary} />
        </Pressable>
      </View>

      <RoomFilterModal
        visible={isFilterVisible}
        onClose={() => setIsFilterVisible(false)}
        showLocationFilters
        tempName={tempName}
        setTempName={setTempName}
        tempCities={tempCities}
        toggleCity={toggleCity}
        tempLocations={tempLocations}
        toggleNeighborhood={toggleNeighborhood}
        visibleNeighborhoods={visibleNeighborhoods}
        tempDay={tempDay}
        setTempDay={setTempDay}
        tempTimeStart={tempTimeStart}
        setTempTimeStart={setTempTimeStart}
        tempOnlyOpenSpots={tempOnlyOpenSpots}
        setTempOnlyOpenSpots={setTempOnlyOpenSpots}
        tempSortBy={tempSortBy}
        setTempSortBy={setTempSortBy}
        next7Days={next7Days}
        timeSlots={timeSlots}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {availableRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {invitesOnly ? t('noRoomInvites') : t('noRoomsFound')}
          </Text>
          <Pressable
            style={styles.createRoomButton}
            onPress={() => router.push('/create-room')}
          >
            <Ionicons name="add" size={18} color={colors.onAccent} />
            <Text style={styles.createRoomButtonText}>{t('createARoom')}</Text>
          </Pressable>
          <Pressable
             onPress={() => {
               setActiveName('');
               setActiveCities([]);
               setActiveLocations([]);
               setActiveDay(null);
               setActiveTimeStart(null);
               setActiveOnlyOpenSpots(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
               setActiveSortBy(DEFAULT_ROOM_FILTERS.sortBy);
               setWithFriendsOnly(false);
               setInvitesOnly(false);
             }}
          >
            <Text style={{color: colors.textPrimary, marginTop: 10}}>{t('clearFilters')}</Text>
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

      <LiveMapFab />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 20,
    paddingRight: 12,
    backgroundColor: colors.background,
    gap: 8,
  },
  headerScroll: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  filterIconBtn: {
    padding: 8,
    backgroundColor: colors.panelSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    flexShrink: 0,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.panelElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.onAccent,
    fontWeight: 'bold',
  },
  invitesDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginLeft: 2,
  },
  inviteByLine: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  flatListContent: { paddingBottom: 100 },
  card: {
    backgroundColor: colors.panel,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    position: 'relative',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardInviteDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: colors.panel,
    zIndex: 1,
  },
  cardLeft: { flex: 1, marginRight: 10 },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 70 },
  title: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 2 },
  description: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, fontStyle: 'italic' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  location: { fontSize: 13, color: colors.textPrimary, marginLeft: 4, fontWeight: '600', textTransform: 'capitalize' },
  time: { fontSize: 13, color: colors.textSecondary, marginLeft: 4 },
  countContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  peopleCount: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary, marginLeft: 4 },
  joinButton: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.accent },
  joinButtonText: { color: colors.onAccent, fontWeight: 'bold', fontSize: 12 },
  requestedBadge: { backgroundColor: colors.panelSoft, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft },
  requestedText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.textPrimary, fontSize: 16 },
  createRoomButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 16 },
  createRoomButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.panel, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary },
  filterLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 15, marginBottom: 8 },
  input: { backgroundColor: colors.panelElevated, borderRadius: 8, padding: 12, fontSize: 14, color: colors.textPrimary, borderWidth: 1, borderColor: colors.borderSoft },
  chipScroll: { flexDirection: 'row', marginBottom: 5 },
  wrapContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { backgroundColor: colors.panelElevated, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 12, textTransform: 'capitalize' },
  chipTextActive: { color: colors.onAccent, fontWeight: 'bold' },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 20 },
  clearButton: { flex: 0.3, padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderSoft },
  clearButtonText: { color: colors.textPrimary, fontWeight: 'bold' },
  applyButton: { flex: 0.65, backgroundColor: colors.accent, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.accent },
  applyButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: 'bold' },
  });
}