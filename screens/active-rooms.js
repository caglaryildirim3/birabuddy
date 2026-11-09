import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateTimeShort, parseRoomDateTime } from '../utils/dateUtils';
import { isRoomExpired } from '../utils/roomUtils';
import RoomCardDot from '../components/RoomCardDot';
import { useNotificationIndicators } from '../contexts/NotificationContext';

export default function ActiveRooms() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { hasActiveRoomAlert } = useNotificationIndicators();
  const router = useRouter();
  const [activeRooms, setActiveRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveRooms = async () => {
      if (!auth.currentUser?.emailVerified) {
        setActiveRooms([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const uid = auth.currentUser.uid;
        const roomsRef = collection(db, 'rooms');

        const [createdSnap, joinedSnap] = await Promise.all([
          getDocs(query(roomsRef, where('createdBy', '==', uid))),
          getDocs(query(roomsRef, where('participants', 'array-contains', uid))),
        ]);

        const roomMap = new Map();
        for (const roomDoc of [...createdSnap.docs, ...joinedSnap.docs]) {
          roomMap.set(roomDoc.id, { id: roomDoc.id, ...roomDoc.data() });
        }

        const myActiveRooms = [];
        const now = new Date();

        for (const room of roomMap.values()) {
          const { date, time } = room;

          if (!date) continue;
          if (!parseRoomDateTime(date, time)) continue;
          if (isRoomExpired(date, time, now)) continue;

          let createdByName = 'Unknown User';
          try {
            const creatorDoc = await getDoc(doc(db, 'users', room.createdBy));
            if (creatorDoc.exists()) {
              const cData = creatorDoc.data();
              createdByName = cData.nickname || cData.instagram || 'User';
            }
          } catch (e) {
            // skip creator name fetch failure
          }

          myActiveRooms.push({ ...room, createdByName });
        }

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
      t('leaveRoom'),
      t('leaveRoomConfirm', { roomName: room.name }),
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('leave'),
          style: "destructive",
          onPress: async () => {
            try {
              const uid = auth.currentUser.uid;
              await deleteDoc(doc(db, 'rooms', room.id, 'participants', uid));
              await updateDoc(doc(db, 'rooms', room.id), {
                participants: arrayRemove(uid),
              });
              setActiveRooms((prevRooms) => prevRooms.filter((r) => r.id !== room.id));
            } catch (error) {
              Alert.alert(t('error'), t('failedToLeaveRoom'));
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
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeRooms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍺</Text>
            <Text style={styles.emptyTitle}>{t('noActiveRooms')}</Text>
            <Pressable 
              style={styles.browseButton}
              onPress={() => router.push('/(tabs)/discover')}
            >
              <Text style={styles.browseButtonText}>{t('browseRooms')}</Text>
            </Pressable>
          </View>
        ) : (
          activeRooms.map((room) => (
            <Pressable
              key={room.id}
              style={styles.card}
              onPress={() => handleRoomPress(room)}
            >
              <RoomCardDot visible={hasActiveRoomAlert(room.id)} />
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle} numberOfLines={1}>{room.name}</Text>
                
                {room.description ? (
                  <Text style={styles.description} numberOfLines={1}>{room.description}</Text>
                ) : null}

                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={14} color={colors.iconPrimary} />
                  <Text style={styles.location} numberOfLines={1}>{room.neighborhood || t('noLocation')}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={14} color={colors.iconPrimary} />
                  <Text style={styles.time}>{formatDateTimeShort(room.date, room.time)}</Text>
                </View>
              </View>

              <View style={styles.cardRight}>
                <View style={styles.countContainer}>
                  <Ionicons name="people" size={16} color={colors.iconPrimary} />
                  <Text style={styles.peopleCount}>
                    {(Array.isArray(room.participants) ? room.participants.length : 0)}/{room.maxParticipants || '?'}
                  </Text>
                </View>

                <Pressable
                  style={styles.leaveButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleLeaveRoom(room);
                  }}
                >
                  <Text style={styles.leaveButtonText}>{t('leave')}</Text>
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textPrimary, fontSize: 16 },
  
  card: {
    position: 'relative',
    backgroundColor: colors.panel,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
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
    color: colors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
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
    color: colors.textPrimary,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  time: {
    fontSize: 13,
    color: colors.textSecondary,
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
    color: colors.textPrimary,
    marginLeft: 4,
  },
  leaveButton: {
    backgroundColor: colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  leaveButtonText: {
    color: colors.white,
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
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 10 },
  browseButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  browseButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: 'bold' },
});