import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BeerColors from '../constants/BeerColors';
import { formatDateTimeShort, parseRoomDateTime } from '../utils/dateUtils';
import { isRoomExpired } from '../utils/roomUtils';

export default function MyRooms() {
  const { t } = useTranslation();
  const [myRooms, setMyRooms] = useState([]);
  const [roomStats, setRoomStats] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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

            if (!parseRoomDateTime(date, time)) continue;

            if (isRoomExpired(date, time, now)) {
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
            <Ionicons name="location-outline" size={14} color={BeerColors.iconPrimary} />
            <Text style={styles.location} numberOfLines={1}>{item.neighborhood || t('noLocation')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color={BeerColors.iconPrimary} />
            <Text style={styles.time}>{formatDateTimeShort(item.date, item.time, { unknownLabel: t('unknown'), appendTime: true })}</Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.countContainer}>
            <Ionicons name="people" size={16} color={BeerColors.iconPrimary} />
            <Text style={styles.peopleCount}>{stats.participants}/{item.maxParticipants || '?'}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={myRooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BeerColors.textPrimary} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>{t('no rooms yet')}</Text>
            <Pressable style={styles.createButton} onPress={() => router.push('/create-room')}>
              <Text style={styles.createButtonText}>{t('create a room')}</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  scrollContent: { paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: BeerColors.textPrimary, fontSize: 16 },
  
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
    color: BeerColors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: BeerColors.textSecondary,
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
    color: BeerColors.textPrimary,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  time: {
    fontSize: 13,
    color: BeerColors.textSecondary,
    marginLeft: 4,
  },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peopleCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    marginLeft: 4,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: BeerColors.textPrimary, marginBottom: 10 },
  createButton: { backgroundColor: BeerColors.accent, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: BeerColors.accent },
  createButtonText: { color: BeerColors.onAccent, fontSize: 16, fontWeight: 'bold' },
});