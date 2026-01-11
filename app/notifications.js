import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function Notifications() {
  const { t } = useTranslation();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return t('justNow');
    
    const now = new Date();
    // Handle Firestore Timestamp or generic Date object
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
    let unsubscribe = null;

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribe) unsubscribe();

      if (!currentUser) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // NOTE: We do NOT use 'orderBy' in the query here to avoid
      // "Missing Index" crashes. We sort in the app instead.
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.uid)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Sort Client-Side (Newest First)
        fetched.sort((a, b) => {
           const timeA = a.createdAt?.seconds || 0;
           const timeB = b.createdAt?.seconds || 0;
           return timeB - timeA; 
        });

        setNotifications(fetched);
        setLoading(false);
      });
    });

    return () => {
      authUnsubscribe();
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      // 1. Optimistic UI Update
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
      
      // 2. Database Update
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
      console.log(error);
    }
  };

  const clearAll = () => {
    Alert.alert(t('clearAll'), t('deleteAllNotifications'), [
      { text: t('cancel'), style: "cancel" },
      { text: t('delete'), style: "destructive", onPress: async () => {
          const batch = writeBatch(db);
          notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
          await batch.commit();
      }}
    ]);
  };

  const handlePress = (n) => {
    markAsRead(n.id);
    // Navigate based on type
    if (n.roomId) {
        router.push(`/room-details/${n.roomId}`);
    } else if (n.meetupId) {
        // Handle legacy notification format if exists
        router.push(`/room-details/${n.meetupId}`);
    }
  };

  const getIconName = (type) => {
    if (!type) return "notifications";
    if (type.includes('request')) return "person-add";
    if (type.includes('message')) return "chatbubble";
    if (type.includes('delete') || type.includes('kick')) return "alert-circle";
    return "notifications";
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
          </Pressable>
          <Text style={styles.title}>{t('notifications')}</Text>
          <View style={{width: 24}} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E8A4C7" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
        </Pressable>
        <Text style={styles.title}>{t('notifications')}</Text>
        {notifications.length > 0 ? (
          <Pressable onPress={clearAll} style={styles.clearButton}>
            <Ionicons name="trash-outline" size={22} color="#E8A4C7" />
          </Pressable>
        ) : (
          <View style={{width: 24}} />
        )}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {notifications.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>{t('noNotificationsYet')}</Text>
            <Text style={styles.emptySubText}>{t('allCaughtUp')}</Text>
          </View>
        ) : (
          notifications.map((n) => (
            <Pressable
              key={n.id}
              style={[styles.card, !n.read && styles.unreadCard]}
              onPress={() => handlePress(n)}
            >
              <View style={styles.cardIcon}>
                <Ionicons 
                  name={getIconName(n.type)} 
                  size={24} 
                  color="#4d4c41" 
                />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.cardMessage}>{n.message}</Text>
                <Text style={styles.cardTime}>{formatTime(n.createdAt)}</Text>
              </View>
              {!n.read && <View style={styles.dot} />}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
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
    paddingTop: 50, // Safe area padding
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: '#4A3B47',
  },
  backButton: { padding: 4 },
  clearButton: { padding: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#E8A4C7' },
  
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  scrollContent: { padding: 20, paddingBottom: 50 },
  
  // Cards
  card: {
    backgroundColor: '#E8D5DA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#3A6A6F',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#fff', // Brighter background to highlight unread
    borderColor: '#E8A4C7', // Pink border for emphasis
    borderWidth: 2,
  },
  cardIcon: { marginRight: 12, marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#4d4c41', marginBottom: 2 },
  cardMessage: { fontSize: 14, color: '#666', lineHeight: 20 },
  cardTime: { fontSize: 12, color: '#999', marginTop: 6 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E8A4C7',
    marginTop: 6,
    marginLeft: 8,
  },

  // Empty State
  emptyIcon: { fontSize: 50, marginBottom: 10 },
  emptyText: { color: '#E8A4C7', fontSize: 18, fontWeight: 'bold' },
  emptySubText: { color: '#E8D5DA', fontSize: 14, marginTop: 5, opacity: 0.8 },
});