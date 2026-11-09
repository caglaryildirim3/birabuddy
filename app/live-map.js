import { Ionicons } from '@expo/vector-icons';
import { IconMap2, IconWorld } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Image } from 'expo-image';
import { NEIGHBORHOOD_COORDINATES } from '../constants/locations';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import { formatDateTimeShort, parseRoomDateTime } from '../utils/dateUtils';
import { getFriendIds } from '../utils/friendUtils';
import { getFriendNudgeErrorMessage, sendFriendNudge } from '../utils/friendNudgeUtils';
import { isDeletedUser } from '../utils/deletedUserUtils';
import { isOutTonight } from '../utils/outTonightUtils';
import { applyRoomFilters, DEFAULT_ROOM_FILTERS, getNext7Days } from '../utils/roomListFilters';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import { canViewRoom, getRoomDisplayLocation, isRoomExpired } from '../utils/roomUtils';
import {
  getMapRegionForCoordinate,
  resolveFriendMapCoordinate,
} from '../utils/liveMapUtils';
import { mergeLivePresenceIntoUser } from '../utils/livePresenceUtils';
import { resolveFirstProfilePhotoUrl } from '../utils/photoUtils';
import RoomFilterModal from '../components/RoomFilterModal';
import UserProfile from '../components/UserProfile';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ISTANBUL_REGION = {
  latitude: 41.015,
  longitude: 28.979,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const FOCUS_REGION_DELTA = 0.04;

function AvatarCircle({ photoURL, name, size = 44, ring = false, isYou = false, accent, onAccent }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <View
      style={[
        avatarStyles.wrapper,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring ? 3 : 0,
          borderColor: ring ? '#4CAF50' : 'transparent',
        },
      ]}
    >
      {photoURL ? (
        <Image
          source={{ uri: photoURL }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            avatarStyles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isYou ? '#4CAF50' : accent,
            },
          ]}
        >
          <Text style={[avatarStyles.initial, { fontSize: size * 0.38, color: onAccent }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  wrapper: { overflow: 'hidden' },
  fallback: { justifyContent: 'center', alignItems: 'center' },
  initial: { fontWeight: 'bold' },
});

export default function LiveMap() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const mapRef = useRef(null);

  const currentUid = auth.currentUser?.uid;
  const [friendIds, setFriendIds] = useState([]);
  const [friendsData, setFriendsData] = useState([]);
  const [livePresenceByUid, setLivePresenceByUid] = useState({});
  const [currentUserData, setCurrentUserData] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);
  const [mapRooms, setMapRooms] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [participantCounts, setParticipantCounts] = useState({});
  const [userParticipations, setUserParticipations] = useState({});
  const [roomParticipantUids, setRoomParticipantUids] = useState({});
  const [isClusterFilterVisible, setIsClusterFilterVisible] = useState(false);
  const [activeName, setActiveName] = useState(DEFAULT_ROOM_FILTERS.name);
  const [activeDay, setActiveDay] = useState(DEFAULT_ROOM_FILTERS.day);
  const [activeTimeStart, setActiveTimeStart] = useState(DEFAULT_ROOM_FILTERS.timeStart);
  const [activeOnlyOpenSpots, setActiveOnlyOpenSpots] = useState(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
  const [activeWithFriendsOnly, setActiveWithFriendsOnly] = useState(false);
  const [activeSortBy, setActiveSortBy] = useState(DEFAULT_ROOM_FILTERS.sortBy);
  const [tempName, setTempName] = useState(DEFAULT_ROOM_FILTERS.name);
  const [tempDay, setTempDay] = useState(DEFAULT_ROOM_FILTERS.day);
  const [tempTimeStart, setTempTimeStart] = useState(DEFAULT_ROOM_FILTERS.timeStart);
  const [tempOnlyOpenSpots, setTempOnlyOpenSpots] = useState(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
  const [tempWithFriendsOnly, setTempWithFriendsOnly] = useState(false);
  const [tempSortBy, setTempSortBy] = useState(DEFAULT_ROOM_FILTERS.sortBy);
  const [friendPhotoUrls, setFriendPhotoUrls] = useState({});
  const [nudgeLoadingId, setNudgeLoadingId] = useState(null);

  const next7Days = useMemo(() => getNext7Days(i18n.language), [i18n.language]);

  const timeSlots = useMemo(
    () => [
      { label: t('before18'), start: -1 },
      { label: t('time1819'), start: 18 },
      { label: t('time1920'), start: 19 },
      { label: t('time2021'), start: 20 },
      { label: t('time2122'), start: 21 },
      { label: t('time2223'), start: 22 },
      { label: t('time2300'), start: 23 },
      { label: t('time00plus'), start: 24 },
    ],
    [t]
  );

  const openClusterFilterModal = () => {
    setTempName(activeName);
    setTempDay(activeDay);
    setTempTimeStart(activeTimeStart);
    setTempOnlyOpenSpots(activeOnlyOpenSpots);
    setTempWithFriendsOnly(activeWithFriendsOnly);
    setTempSortBy(activeSortBy);
    setIsClusterFilterVisible(true);
  };

  const applyClusterFilters = () => {
    setActiveName(tempName);
    setActiveDay(tempDay);
    setActiveTimeStart(tempTimeStart);
    setActiveOnlyOpenSpots(tempOnlyOpenSpots);
    setActiveWithFriendsOnly(tempWithFriendsOnly);
    setActiveSortBy(tempSortBy);
    setIsClusterFilterVisible(false);
  };

  const clearClusterFilters = () => {
    setTempName(DEFAULT_ROOM_FILTERS.name);
    setTempDay(DEFAULT_ROOM_FILTERS.day);
    setTempTimeStart(DEFAULT_ROOM_FILTERS.timeStart);
    setTempOnlyOpenSpots(DEFAULT_ROOM_FILTERS.onlyOpenSpots);
    setTempWithFriendsOnly(false);
    setTempSortBy(DEFAULT_ROOM_FILTERS.sortBy);
  };

  // Load friend IDs once
  useEffect(() => {
    if (!currentUid) return;
    getFriendIds(currentUid).then(setFriendIds).catch(() => {});
  }, [currentUid]);

  // Subscribe to friend + self docs
  useEffect(() => {
    if (!currentUid) return;
    const uidsToWatch = [...friendIds, currentUid];
    if (uidsToWatch.length === 0) return;

    // Watch friends
    const unsubscribers = [];

    // Current user doc
    const selfUnsub = onSnapshot(
      query(collection(db, 'users'), where('__name__', 'in', [currentUid])),
      (snap) => {
        if (!snap.empty) {
          setCurrentUserData({ uid: currentUid, ...snap.docs[0].data() });
        }
      }
    );
    unsubscribers.push(selfUnsub);

    // Friends docs (batched if needed)
    if (friendIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < friendIds.length; i += 10) {
        chunks.push(friendIds.slice(i, i + 10));
      }
      chunks.forEach((chunk) => {
        const unsub = onSnapshot(
          query(collection(db, 'users'), where('__name__', 'in', chunk)),
          (snap) => {
            const docs = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
            setFriendsData((prev) => {
              const map = new Map(prev.map((f) => [f.uid, f]));
              docs.forEach((d) => map.set(d.uid, d));
              return Array.from(map.values());
            });
          }
        );
        unsubscribers.push(unsub);
      });
    }

    return () => unsubscribers.forEach((u) => u());
  }, [currentUid, friendIds.join(',')]);

  useEffect(() => {
    if (!currentUid) return undefined;
    const uidsToWatch = [...friendIds, currentUid];
    if (uidsToWatch.length === 0) return undefined;

    const unsubscribers = [];
    const chunks = [];
    for (let i = 0; i < uidsToWatch.length; i += 10) {
      chunks.push(uidsToWatch.slice(i, i + 10));
    }

    chunks.forEach((chunk) => {
      const unsub = onSnapshot(
        query(collection(db, 'livePresence'), where('__name__', 'in', chunk)),
        (snap) => {
          setLivePresenceByUid((prev) => {
            const next = { ...prev };
            chunk.forEach((uid) => {
              if (!snap.docs.find((d) => d.id === uid)) {
                delete next[uid];
              }
            });
            snap.docs.forEach((presenceDoc) => {
              next[presenceDoc.id] = presenceDoc.data();
            });
            return next;
          });
        },
        handleFirestoreListenerError('live-map-presence')
      );
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((u) => u());
  }, [currentUid, friendIds.join(',')]);

  const mergedCurrentUser = useMemo(
    () => mergeLivePresenceIntoUser(currentUserData, livePresenceByUid[currentUid]),
    [currentUserData, livePresenceByUid, currentUid]
  );

  const mergedFriendsData = useMemo(
    () =>
      friendsData.map((friend) =>
        mergeLivePresenceIntoUser(friend, livePresenceByUid[friend.uid])
      ),
    [friendsData, livePresenceByUid]
  );

  useEffect(() => {
    if (!currentUid || !auth.currentUser?.emailVerified) {
      setMapRooms([]);
      return undefined;
    }

    const roomSources = { public: [], joined: [], friends: [] };
    const unsubs = [];

    const mapRoomDocs = (snapshot) =>
      snapshot.docs.map((roomDoc) => ({ id: roomDoc.id, ...roomDoc.data() }));

    const syncVisibleRooms = () => {
      const now = new Date();
      const merged = new Map();
      [...roomSources.public, ...roomSources.joined, ...roomSources.friends].forEach((room) => {
        merged.set(room.id, room);
      });

      const visibleRooms = [];
      for (const room of merged.values()) {
        const { date, time } = room;
        if (!date) continue;
        if (!parseRoomDateTime(date, time)) continue;
        if (isRoomExpired(date, time, now)) continue;
        if (room.creatorAccountDeleted) continue;
        if (!canViewRoom(room, currentUid, friendIds)) continue;

        const neighborhood = (room.neighborhood || room.location || '').toLowerCase();
        if (!neighborhood || !NEIGHBORHOOD_COORDINATES[neighborhood]) continue;

        visibleRooms.push({ ...room, neighborhood });
      }

      setMapRooms(visibleRooms);
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'rooms'), where('visibility', '==', 'public')),
        (snapshot) => {
          roomSources.public = mapRoomDocs(snapshot);
          syncVisibleRooms();
        },
        handleFirestoreListenerError('live-map-public-rooms')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'rooms'), where('participants', 'array-contains', currentUid)),
        (snapshot) => {
          roomSources.joined = mapRoomDocs(snapshot);
          syncVisibleRooms();
        },
        handleFirestoreListenerError('live-map-joined-rooms')
      )
    );

    if (friendIds.length > 0) {
      for (let i = 0; i < friendIds.length; i += 10) {
        const chunk = friendIds.slice(i, i + 10);
        const chunkIds = new Set(chunk);
        unsubs.push(
          onSnapshot(
            query(collection(db, 'rooms'), where('createdBy', 'in', chunk)),
            (snapshot) => {
              const friendRooms = mapRoomDocs(snapshot).filter((room) => chunkIds.has(room.createdBy));
              roomSources.friends = [
                ...roomSources.friends.filter((room) => !chunkIds.has(room.createdBy)),
                ...friendRooms,
              ];
              syncVisibleRooms();
            },
            handleFirestoreListenerError('live-map-friend-rooms')
          )
        );
      }
    } else {
      roomSources.friends = [];
      syncVisibleRooms();
    }

    return () => unsubs.forEach((unsub) => unsub());
  }, [currentUid, friendIds.join(',')]);

  useEffect(() => {
    const unsubs = mapRooms.map((room) =>
      onSnapshot(
        collection(db, 'rooms', room.id, 'participants'),
        (snapshot) => {
          const participants = snapshot.docs.map((docSnap) => docSnap.data());
          const isUserParticipant = participants.some((p) => p.uid === currentUid);

          setParticipantCounts((prev) => ({
            ...prev,
            [room.id]: snapshot.docs.length,
          }));
          setUserParticipations((prev) => ({
            ...prev,
            [room.id]: isUserParticipant,
          }));
          setRoomParticipantUids((prev) => ({
            ...prev,
            [room.id]: participants.map((p) => p.uid).filter(Boolean),
          }));
        },
        handleFirestoreListenerError('live-map-participants')
      )
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [mapRooms.map((room) => room.id).join(','), currentUid]);

  const filteredClusterRooms = useMemo(() => {
    if (!selectedCluster) return [];

    const friendIdSet = new Set(friendIds);

    return applyRoomFilters(selectedCluster.rooms, {
      name: activeName,
      cities: [],
      locations: [],
      day: activeDay,
      timeStart: activeTimeStart,
      onlyOpenSpots: activeOnlyOpenSpots,
      sortBy: activeSortBy,
    }, {
      participantCounts,
      currentUserUid: currentUid,
    }).filter((room) => {
      if (!activeWithFriendsOnly) return true;
      const participantUids = roomParticipantUids[room.id] || [];
      return participantUids.some((uid) => friendIdSet.has(uid));
    });
  }, [
    selectedCluster,
    activeName,
    activeDay,
    activeTimeStart,
    activeOnlyOpenSpots,
    activeWithFriendsOnly,
    activeSortBy,
    participantCounts,
    roomParticipantUids,
    friendIds,
    currentUid,
  ]);

  const roomClusters = useMemo(() => {
    const clusters = new Map();

    for (const room of mapRooms) {
      const key = room.neighborhood;
      if (!clusters.has(key)) {
        clusters.set(key, {
          neighborhood: key,
          city: room.city,
          coordinate: NEIGHBORHOOD_COORDINATES[key],
          rooms: [],
        });
      }
      clusters.get(key).rooms.push(room);
    }

    return Array.from(clusters.values()).sort((a, b) => b.rooms.length - a.rooms.length);
  }, [mapRooms]);

  const liveFriends = useMemo(
    () =>
      mergedFriendsData.filter((f) => !isDeletedUser(f) && isOutTonight(f)),
    [mergedFriendsData]
  );

  const friendsOnMap = useMemo(
    () =>
      liveFriends
        .map((friend) => ({
          ...friend,
          mapCoordinate: resolveFriendMapCoordinate(friend),
        }))
        .filter((friend) => friend.mapCoordinate != null),
    [liveFriends]
  );

  const selfMapCoordinate = useMemo(
    () => (mergedCurrentUser ? resolveFriendMapCoordinate(mergedCurrentUser) : null),
    [mergedCurrentUser]
  );

  const iAmLive = mergedCurrentUser && isOutTonight(mergedCurrentUser) && selfMapCoordinate != null;

  const hasMapMarkers = friendsOnMap.length > 0 || iAmLive || roomClusters.length > 0;

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      const photoTargets = [...liveFriends];
      if (currentUid && mergedCurrentUser) {
        photoTargets.push({ uid: currentUid, photos: mergedCurrentUser.photos });
      }

      const entries = await Promise.all(
        photoTargets.map(async (friend) => {
          const photoUrl = await resolveFirstProfilePhotoUrl(friend.uid, friend.photos);
          return [friend.uid, photoUrl];
        })
      );

      if (cancelled) return;
      setFriendPhotoUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([uid, photoUrl]) => {
          if (photoUrl) next[uid] = photoUrl;
        });
        return next;
      });
    };

    loadPhotos().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [liveFriends, currentUid, mergedCurrentUser]);

  const focusMapOnCoordinate = useCallback((coordinate) => {
    const region = getMapRegionForCoordinate(coordinate, FOCUS_REGION_DELTA);
    if (!region || !mapRef.current) return;
    mapRef.current.animateToRegion(region, 500);
  }, []);

  const openFriendProfile = useCallback((uid) => {
    setSelectedCluster(null);
    setSelectedUid(uid);
  }, []);

  const openChatWithFriend = useCallback(
    (friend) => {
      router.push(`/friend-chat/${friend.uid}`);
    },
    [router]
  );

  const handleNudgeFriend = async (friend) => {
    if (!currentUid || nudgeLoadingId) return;
    setNudgeLoadingId(friend.uid);
    try {
      await sendFriendNudge(friend.uid);
    } catch (error) {
      Alert.alert(t('error'), getFriendNudgeErrorMessage(error, t));
    } finally {
      setNudgeLoadingId(null);
    }
  };

  // MapView only reads initialRegion on mount, before our location has loaded,
  // so re-center once it arrives. Self wins over a friend; after that, leave the user's panning alone.
  const [mapReady, setMapReady] = useState(false);
  const centeredOnRef = useRef(null);

  useEffect(() => {
    if (!mapReady || !mapRef.current || centeredOnRef.current === 'self') return;

    if (selfMapCoordinate) {
      mapRef.current.animateToRegion(getMapRegionForCoordinate(selfMapCoordinate, 0.08), 500);
      centeredOnRef.current = 'self';
      return;
    }

    if (!centeredOnRef.current && friendsOnMap.length > 0) {
      mapRef.current.animateToRegion(
        getMapRegionForCoordinate(friendsOnMap[0].mapCoordinate, 0.12),
        500
      );
      centeredOnRef.current = 'friend';
    }
  }, [mapReady, selfMapCoordinate, friendsOnMap]);

  const initialRegion = useMemo(() => {
    if (selfMapCoordinate) {
      return getMapRegionForCoordinate(selfMapCoordinate, 0.08) || ISTANBUL_REGION;
    }
    if (friendsOnMap.length > 0) {
      return getMapRegionForCoordinate(friendsOnMap[0].mapCoordinate, 0.12) || ISTANBUL_REGION;
    }
    return ISTANBUL_REGION;
  }, [selfMapCoordinate, friendsOnMap]);

  const openCluster = (cluster) => {
    setSelectedUid(null);
    setSelectedCluster(cluster);
  };

  const renderRoomRow = ({ item }) => {
    const isParticipant = userParticipations[item.id] || false;
    const currentCount = participantCounts[item.id] || 0;
    const locationLine = getRoomDisplayLocation(item, {
      isParticipant,
      viewerUid: currentUid,
      t,
    });

    return (
      <Pressable
        style={styles.listRow}
        onPress={() => {
          setSelectedCluster(null);
          router.push(`/room-details/${item.id}`);
        }}
      >
        <Text style={styles.roomEmoji}>🍺</Text>
        <View style={styles.listRowText}>
          <Text style={styles.listRowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.listRowNote} numberOfLines={1}>
            {locationLine}
          </Text>
          <Text style={styles.listRowMeta} numberOfLines={1}>
            {formatDateTimeShort(item.date, item.time, { unknownLabel: t('unknown') })}
          </Text>
        </View>
        <Text style={styles.listRowCount}>
          {currentCount}/{item.maxParticipants || '?'}
        </Text>
      </Pressable>
    );
  };

  const renderFriendRow = ({ item }) => {
    const mapCoordinate = resolveFriendMapCoordinate(item);
    const photoURL = friendPhotoUrls[item.uid] || null;
    const name = item.name || item.nickname || item.instagram || 'Friend';

    return (
      <View style={styles.listRow}>
        <Pressable
          style={styles.listRowMain}
          onPress={() => {
            if (mapCoordinate) {
              focusMapOnCoordinate(mapCoordinate);
              return;
            }
            openFriendProfile(item.uid);
          }}
        >
          <AvatarCircle photoURL={photoURL} name={name} size={40} ring accent={colors.accent} onAccent={colors.onAccent} />
          <View style={styles.listRowText}>
            <Text style={styles.listRowName}>{name}</Text>
            {item.outTonightNote?.trim() ? (
              <Text style={styles.listRowNote} numberOfLines={2}>
                {item.outTonightNote.trim()}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.friendActions}>
          <Pressable
            style={styles.actionIconButton}
            onPress={() => handleNudgeFriend(item)}
            disabled={nudgeLoadingId === item.uid}
            hitSlop={8}
            accessibilityLabel={t('nudgeFriend')}
          >
            {nudgeLoadingId === item.uid ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.nudgeEmoji}>👉</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.actionIconButton}
            onPress={() => openChatWithFriend(item)}
            hitSlop={8}
            accessibilityLabel={t('chat')}
          >
            <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <IconWorld size={20} color={colors.textPrimary} />
          <Text style={styles.headerTitle}>{t('liveMapTitle')}</Text>
        </View>
        <View style={styles.headerRight}>
          {liveFriends.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {t('liveCount', { count: liveFriends.length })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onMapReady={() => setMapReady(true)}
          showsUserLocation={false}
        >
          {/* Friend markers */}
          {friendsOnMap.map((friend) => {
            const photoURL = friendPhotoUrls[friend.uid] || null;
            const name = friend.name || friend.nickname || friend.instagram || 'Friend';
            return (
              <Marker
                key={friend.uid}
                coordinate={{
                  latitude: friend.mapCoordinate.latitude,
                  longitude: friend.mapCoordinate.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                onPress={() => openFriendProfile(friend.uid)}
              >
                <Pressable
                  style={styles.markerWrapper}
                  onPress={() => openFriendProfile(friend.uid)}
                  hitSlop={8}
                >
                  <AvatarCircle photoURL={photoURL} name={name} size={44} ring accent={colors.accent} onAccent={colors.onAccent} />
                </Pressable>
              </Marker>
            );
          })}

          {/* Self marker */}
          {iAmLive && selfMapCoordinate ? (
            <Marker
              key="self"
              coordinate={{
                latitude: selfMapCoordinate.latitude,
                longitude: selfMapCoordinate.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => openFriendProfile(currentUid)}
            >
              <Pressable
                style={styles.markerWrapper}
                onPress={() => openFriendProfile(currentUid)}
                hitSlop={8}
              >
                <AvatarCircle
                  photoURL={friendPhotoUrls[currentUid] || null}
                  name="You"
                  size={52}
                  ring
                  isYou
                  accent={colors.accent}
                  onAccent={colors.onAccent}
                />
              </Pressable>
            </Marker>
          ) : null}

          {roomClusters.map((cluster) => (
            <Marker
              key={`room-cluster-${cluster.neighborhood}`}
              coordinate={cluster.coordinate}
              onPress={() => openCluster(cluster)}
            >
              <View style={styles.beerMarker}>
                <Text style={styles.beerEmoji}>🍺</Text>
                <View style={styles.beerCountBadge}>
                  <Text style={styles.beerCountText}>×{cluster.rooms.length}</Text>
                </View>
              </View>
            </Marker>
          ))}
        </MapView>

        {/* Empty overlay */}
        {!hasMapMarkers ? (
          <View style={styles.emptyOverlay} pointerEvents="box-none">
            <View style={styles.emptyCard} pointerEvents="none">
              <IconMap2 size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>
                {t('nothingOnLiveMap')}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Bottom sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.bottomSheetHandle} />
        {selectedCluster ? (
          <>
            <View style={styles.clusterHeaderRow}>
              <Pressable style={styles.clusterBackRow} onPress={() => setSelectedCluster(null)}>
                <Text style={styles.clusterBackText}>‹ {t('back')}</Text>
              </Pressable>
              <Pressable style={styles.clusterFilterBtn} onPress={openClusterFilterModal}>
                <Ionicons name="filter" size={20} color={colors.iconPrimary} />
              </Pressable>
            </View>
            <Text style={styles.bottomSheetTitle}>
              {t('roomsInNeighborhood', {
                neighborhood: selectedCluster.neighborhood,
                count: filteredClusterRooms.length,
              })}
            </Text>
            {filteredClusterRooms.length === 0 ? (
              <Text style={styles.emptyListText}>{t('noRoomsFound')}</Text>
            ) : (
              <FlatList
                data={filteredClusterRooms}
                keyExtractor={(item) => item.id}
                renderItem={renderRoomRow}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.bottomSheetTitle}>
              {liveFriends.length === 0
                ? t('noFriendsLive')
                : t('liveCount', { count: liveFriends.length })}
            </Text>
            {liveFriends.length === 0 ? (
              <Text style={styles.emptyListText}>
                {roomClusters.length > 0 ? t('tapBeerForRooms') : t('friendsGoLiveHint')}
              </Text>
            ) : (
              <FlatList
                data={liveFriends}
                keyExtractor={(item) => item.uid}
                renderItem={renderFriendRow}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
              />
            )}
          </>
        )}
      </View>

      <RoomFilterModal
        visible={isClusterFilterVisible}
        onClose={() => setIsClusterFilterVisible(false)}
        showLocationFilters={false}
        tempName={tempName}
        setTempName={setTempName}
        tempDay={tempDay}
        setTempDay={setTempDay}
        tempTimeStart={tempTimeStart}
        setTempTimeStart={setTempTimeStart}
        tempOnlyOpenSpots={tempOnlyOpenSpots}
        setTempOnlyOpenSpots={setTempOnlyOpenSpots}
        showWithFriendsFilter
        tempWithFriendsOnly={tempWithFriendsOnly}
        setTempWithFriendsOnly={setTempWithFriendsOnly}
        tempSortBy={tempSortBy}
        setTempSortBy={setTempSortBy}
        next7Days={next7Days}
        timeSlots={timeSlots}
        onApply={applyClusterFilters}
        onClear={clearClusterFilters}
      />

      {/* Profile modal */}
      <Modal
        visible={!!selectedUid}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedUid(null)}
      >
        {selectedUid ? (
          <UserProfile uid={selectedUid} onClose={() => setSelectedUid(null)} />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const BOTTOM_SHEET_HEIGHT = SCREEN_HEIGHT * 0.38;

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 64,
  },
  backText: {
    fontSize: 17,
    color: colors.accent,
    fontWeight: '600',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  headerRight: {
    width: 64,
    alignItems: 'flex-end',
  },
  countBadge: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Map
  mapContainer: {
    flex: 1,
  },
  markerWrapper: {
    alignItems: 'center',
  },
  beerMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  beerEmoji: {
    fontSize: 34,
    lineHeight: 38,
  },
  beerCountBadge: {
    marginTop: -4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: colors.white,
  },
  beerCountText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Empty state
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    maxWidth: 280,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Bottom sheet
  bottomSheet: {
    height: BOTTOM_SHEET_HEIGHT,
    backgroundColor: colors.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.borderSoft,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    alignSelf: 'center',
    marginBottom: 12,
  },
  bottomSheetTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  listRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listRowText: {
    flex: 1,
  },
  listRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listRowNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listRowMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  listRowCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    minWidth: 44,
    textAlign: 'right',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconButton: {
    padding: 8,
    marginLeft: 4,
  },
  nudgeEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  roomEmoji: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  clusterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
    marginBottom: 4,
  },
  clusterBackRow: {
    paddingHorizontal: 20,
  },
  clusterFilterBtn: {
    padding: 8,
    backgroundColor: colors.panelSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  clusterBackText: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '600',
  },
  emptyListText: {
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});
