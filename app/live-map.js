import { IconMap2, IconMapPin, IconWorld } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Image } from 'expo-image';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';
import { getFriendIds } from '../utils/friendUtils';
import { isOutTonight, toMillis } from '../utils/outTonightUtils';
import UserProfile from '../components/UserProfile';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ISTANBUL_REGION = {
  latitude: 41.015,
  longitude: 28.979,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const BOTTOM_SHEET_PEEK = 180;

function AvatarCircle({ photoURL, name, size = 44, ring = false, isYou = false }) {
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
              backgroundColor: isYou ? '#4CAF50' : BeerColors.accent,
            },
          ]}
        >
          <Text style={[avatarStyles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  wrapper: { overflow: 'hidden' },
  fallback: { justifyContent: 'center', alignItems: 'center' },
  initial: { fontWeight: 'bold', color: BeerColors.onAccent },
});

export default function LiveMap() {
  const router = useRouter();
  const mapRef = useRef(null);

  const currentUid = auth.currentUser?.uid;
  const [friendIds, setFriendIds] = useState([]);
  const [friendsData, setFriendsData] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);

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

  const liveFriends = useMemo(
    () =>
      friendsData.filter((f) => {
        if (!isOutTonight(f)) return false;
        return true;
      }),
    [friendsData]
  );

  const mappableFriends = useMemo(
    () =>
      liveFriends.filter(
        (f) =>
          f.liveLocationShared === true &&
          f.liveLocation?.latitude != null &&
          f.liveLocation?.longitude != null
      ),
    [liveFriends]
  );

  const iAmLive =
    currentUserData &&
    isOutTonight(currentUserData) &&
    currentUserData.liveLocationShared === true &&
    currentUserData.liveLocation?.latitude != null;

  const hasMapMarkers = mappableFriends.length > 0 || iAmLive;

  const initialRegion = useMemo(() => {
    if (currentUserData?.liveLocation?.latitude != null) {
      return {
        latitude: currentUserData.liveLocation.latitude,
        longitude: currentUserData.liveLocation.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    if (mappableFriends.length > 0) {
      return {
        latitude: mappableFriends[0].liveLocation.latitude,
        longitude: mappableFriends[0].liveLocation.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      };
    }
    return ISTANBUL_REGION;
  }, []);

  const renderFriendRow = ({ item }) => {
    const hasLocation = item.liveLocationShared && item.liveLocation?.latitude != null;
    const photoURL =
      Array.isArray(item.photos) && item.photos[0] ? item.photos[0] : null;
    const name = item.name || item.nickname || item.instagram || 'Friend';

    return (
      <Pressable style={styles.listRow} onPress={() => setSelectedUid(item.uid)}>
        <AvatarCircle photoURL={photoURL} name={name} size={40} ring />
        <View style={styles.listRowText}>
          <Text style={styles.listRowName}>{name}</Text>
          {item.outTonightNote ? (
            <Text style={styles.listRowNote} numberOfLines={1}>
              {item.outTonightNote}
            </Text>
          ) : null}
        </View>
        {hasLocation ? (
          <IconMapPin size={14} color={BeerColors.accent} />
        ) : null}
      </Pressable>
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
          <IconWorld size={20} color={BeerColors.textPrimary} />
          <Text style={styles.headerTitle}>Live now</Text>
        </View>
        <View style={styles.headerRight}>
          {liveFriends.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {liveFriends.length} live
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
          showsUserLocation={false}
        >
          {/* Friend markers */}
          {mappableFriends.map((friend) => {
            const photoURL =
              Array.isArray(friend.photos) && friend.photos[0] ? friend.photos[0] : null;
            const name = friend.name || friend.nickname || friend.instagram || 'Friend';
            return (
              <Marker
                key={friend.uid}
                coordinate={{
                  latitude: friend.liveLocation.latitude,
                  longitude: friend.liveLocation.longitude,
                }}
                onPress={() => setSelectedUid(friend.uid)}
              >
                <View style={styles.markerWrapper}>
                  <AvatarCircle photoURL={photoURL} name={name} size={44} ring />
                  <Text style={styles.markerLabel} numberOfLines={1}>
                    {name.split(' ')[0]}
                  </Text>
                </View>
              </Marker>
            );
          })}

          {/* Self marker */}
          {iAmLive ? (
            <Marker
              key="self"
              coordinate={{
                latitude: currentUserData.liveLocation.latitude,
                longitude: currentUserData.liveLocation.longitude,
              }}
            >
              <View style={styles.markerWrapper}>
                <AvatarCircle
                  photoURL={
                    Array.isArray(currentUserData.photos) && currentUserData.photos[0]
                      ? currentUserData.photos[0]
                      : null
                  }
                  name="You"
                  size={52}
                  ring
                  isYou
                />
                <Text style={[styles.markerLabel, styles.markerLabelYou]}>You</Text>
              </View>
            </Marker>
          ) : null}
        </MapView>

        {/* Empty overlay */}
        {!hasMapMarkers ? (
          <View style={styles.emptyOverlay}>
            <View style={styles.emptyCard}>
              <IconMap2 size={32} color={BeerColors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>
                None of your friends are live with location sharing right now
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Bottom sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.bottomSheetHandle} />
        <Text style={styles.bottomSheetTitle}>
          {liveFriends.length === 0 ? 'No friends out tonight' : `${liveFriends.length} out tonight`}
        </Text>
        {liveFriends.length === 0 ? (
          <Text style={styles.emptyListText}>
            When friends go live you'll see them here.
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
      </View>

      {/* Profile modal */}
      <Modal
        visible={!!selectedUid}
        animationType="slide"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BeerColors.borderSoft,
    backgroundColor: BeerColors.background,
  },
  backButton: {
    width: 64,
  },
  backText: {
    fontSize: 17,
    color: BeerColors.accent,
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
    color: BeerColors.textPrimary,
  },
  headerRight: {
    width: 64,
    alignItems: 'flex-end',
  },
  countBadge: {
    backgroundColor: BeerColors.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: BeerColors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Map
  mapContainer: {
    flex: 1,
  },
  markerWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  markerLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    backgroundColor: BeerColors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  markerLabelYou: {
    color: '#2E7D32',
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
    backgroundColor: BeerColors.panel,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    maxWidth: 280,
  },
  emptyText: {
    fontSize: 15,
    color: BeerColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Bottom sheet
  bottomSheet: {
    height: BOTTOM_SHEET_HEIGHT,
    backgroundColor: BeerColors.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: BeerColors.borderSoft,
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
    backgroundColor: BeerColors.borderSoft,
    alignSelf: 'center',
    marginBottom: 12,
  },
  bottomSheetTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BeerColors.textSecondary,
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
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BeerColors.borderSoft,
  },
  listRowText: {
    flex: 1,
  },
  listRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: BeerColors.textPrimary,
  },
  listRowNote: {
    fontSize: 13,
    color: BeerColors.textSecondary,
    marginTop: 2,
  },
  emptyListText: {
    fontSize: 14,
    color: BeerColors.textMuted,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});
