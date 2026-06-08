import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BeerColors from '../constants/BeerColors';
import UserProfile from '../components/UserProfile';

export default function Notifications() {
  const { t } = useTranslation();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [friendNotifications, setFriendNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFriendUid, setSelectedFriendUid] = useState(null);

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return t('justNow');
    
    const now = new Date();
    const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const diffInMs = now - notificationTime;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return t('justNow');
    if (diffInMinutes < 60) return t('minutesAgo', { minutes: diffInMinutes });
    if (diffInHours < 24) return t('hoursAgo', { hours: diffInHours });
    return t('daysAgo', { days: diffInDays });
  }, [t]);

  useEffect(() => {
    let roomUnsub = null;
    let friendUnsub = null;
    let roomLoaded = false;
    let friendLoaded = false;

    const checkLoading = () => {
      if (roomLoaded && friendLoaded) setLoading(false);
    };

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (roomUnsub) roomUnsub();
      if (friendUnsub) friendUnsub();
      roomUnsub = null;
      friendUnsub = null;
      roomLoaded = false;
      friendLoaded = false;

      if (!currentUser) {
        setNotifications([]);
        setFriendNotifications([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const roomQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.uid)
      );

      roomUnsub = onSnapshot(roomQuery, (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        fetched.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        setNotifications(fetched);
        roomLoaded = true;
        checkLoading();
      });

      const friendQuery = query(
        collection(db, 'friendNotifications'),
        where('userId', '==', currentUser.uid)
      );

      friendUnsub = onSnapshot(friendQuery, (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        fetched.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        setFriendNotifications(fetched);
        friendLoaded = true;
        checkLoading();
      });
    });

    return () => {
      authUnsubscribe();
      if (roomUnsub) roomUnsub();
      if (friendUnsub) friendUnsub();
    };
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
      console.log(error);
    }
  };

  const markFriendAsRead = async (notificationId) => {
    try {
      setFriendNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      await updateDoc(doc(db, 'friendNotifications', notificationId), { read: true });
    } catch (error) {
      console.log(error);
    }
  };

  const clearAll = () => {
    Alert.alert(t('clearAll'), t('deleteAllNotifications'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const batch = writeBatch(db);
          notifications.forEach((n) => batch.delete(doc(db, 'notifications', n.id)));
          await batch.commit();
        },
      },
    ]);
  };

  const handleRoomPress = (n) => {
    markAsRead(n.id);
    if (n.roomId) {
      router.push(`/room-details/${n.roomId}`);
    }
  };

  const handleFriendPress = (n) => {
    markFriendAsRead(n.id);
    if (n.senderId) {
      setSelectedFriendUid(n.senderId);
    }
  };

  const getRoomIconName = (type) => {
    if (!type) return 'notifications';
    if (type.includes('invite')) return 'mail';
    if (type.includes('request')) return 'person-add';
    if (type.includes('message')) return 'chatbubble';
    if (type.includes('delete') || type.includes('kick')) return 'alert-circle';
    return 'notifications';
  };

  const getFriendMessage = (n) => {
    if (n.type === 'friend_request') {
      return `${n.senderName || 'Someone'} sent you a friend request`;
    }
    if (n.type === 'friend_accepted') {
      return `${n.senderName || 'Someone'} accepted your friend request`;
    }
    return 'Friend activity';
  };

  const hasAnyNotifications = notifications.length > 0 || friendNotifications.length > 0;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={BeerColors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>{t('notifications')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BeerColors.textPrimary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={BeerColors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('notifications')}</Text>
        {notifications.length > 0 ? (
          <Pressable onPress={clearAll} style={styles.clearButton}>
            <Ionicons name="trash-outline" size={22} color={BeerColors.textPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!hasAnyNotifications ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>{t('noNotificationsYet')}</Text>
            <Text style={styles.emptySubText}>{t('allCaughtUp')}</Text>
          </View>
        ) : (
          <>
            {notifications.length > 0 && (
              <>
                {notifications.map((n) => (
                  <Pressable
                    key={n.id}
                    style={[styles.card, !n.read && styles.unreadCard]}
                    onPress={() => handleRoomPress(n)}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons
                        name={getRoomIconName(n.type)}
                        size={24}
                        color={BeerColors.iconPrimary}
                      />
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>{n.title}</Text>
                      <Text style={styles.cardMessage}>{n.message}</Text>
                      <Text style={styles.cardTime}>{formatTime(n.createdAt)}</Text>
                    </View>
                    {!n.read && <View style={styles.dot} />}
                  </Pressable>
                ))}
              </>
            )}

            {friendNotifications.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Friend Requests</Text>
                {friendNotifications.map((n) => (
                  <Pressable
                    key={n.id}
                    style={[styles.card, !n.read && styles.unreadCard]}
                    onPress={() => handleFriendPress(n)}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons
                        name={n.type === 'friend_accepted' ? 'people' : 'person-add'}
                        size={24}
                        color={BeerColors.iconPrimary}
                      />
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>
                        {n.type === 'friend_accepted' ? 'Friend Accepted' : 'Friend Request'}
                      </Text>
                      <Text style={styles.cardMessage}>{getFriendMessage(n)}</Text>
                      <Text style={styles.cardTime}>{formatTime(n.createdAt)}</Text>
                    </View>
                    {!n.read && <View style={styles.dot} />}
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedFriendUid} animationType="slide" presentationStyle="pageSheet">
        {selectedFriendUid && (
          <UserProfile uid={selectedFriendUid} onClose={() => setSelectedFriendUid(null)} />
        )}
      </Modal>
    </View>
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
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: BeerColors.background,
  },
  backButton: { padding: 4 },
  clearButton: { padding: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: BeerColors.textPrimary },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  scrollContent: { padding: 20, paddingBottom: 50 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    marginTop: 8,
    marginBottom: 12,
  },

  card: {
    backgroundColor: BeerColors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: BeerColors.panelElevated,
    borderColor: BeerColors.accent,
    borderWidth: 2,
  },
  cardIcon: { marginRight: 12, marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: BeerColors.textPrimary, marginBottom: 2 },
  cardMessage: { fontSize: 14, color: BeerColors.textSecondary, lineHeight: 20 },
  cardTime: { fontSize: 12, color: BeerColors.textMuted, marginTop: 6 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BeerColors.accent,
    marginTop: 6,
    marginLeft: 8,
  },

  emptyIcon: { fontSize: 50, marginBottom: 10 },
  emptyText: { color: BeerColors.textPrimary, fontSize: 18, fontWeight: 'bold' },
  emptySubText: { color: BeerColors.textSecondary, fontSize: 14, marginTop: 5, opacity: 0.9 },
});
