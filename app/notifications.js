import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function Notifications() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown time';
    
    const now = new Date();
    const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffInMs = now - notificationTime;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    
    return notificationTime.toLocaleDateString();
  }, []);

 useEffect(() => {
  let unsubscribe = null;

  const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
    if (unsubscribe) unsubscribe();

    if (!currentUser || !currentUser.emailVerified) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const fetchedNotifications = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          time: formatTime(doc.data().createdAt),
        }));
        setNotifications(fetchedNotifications);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to notifications:', err);
        setError('Failed to load notifications');
        setLoading(false);
      }
    );
  });

  return () => {
    authUnsubscribe();
    if (unsubscribe) unsubscribe();
  };
}, [formatTime]);

  const markAsRead = useCallback(async (notificationId) => {
    try {
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, read: true }
            : notif
        )
      );

      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date()
      });

    } catch (error) {
      console.error('Error marking notification as read:', error);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, read: false }
            : notif
        )
      );
    }
  }, []);

  const getNotificationIcon = useCallback((type) => {
    const icons = {
      'join_request': '👋',
      'join_approved': '✅',
      'join_rejected': '❌',
      'room_deleted': '🗑️',
      'kicked_from_room': '🚫',
      'new_message': '💬',
      'room_invitation': '📧',
      'study_reminder': '⏰',
      'user_joined': '🎉',
      'user_left': '👋',
      'meetup_request': '👋',
      'meetup_accepted': '✅',
      'meetup_reminder': '⏰',
      'meetup_cancelled': '❌',
      'meetup_updated': '📝',
      'default': '🔔'
    };
    return icons[type] || icons.default;
  }, []);

  const clearAllNotifications = useCallback(() => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (user) {
                const batch = writeBatch(db);
                notifications.forEach((notification) => {
                  const notificationRef = doc(db, 'notifications', notification.id);
                  batch.delete(notificationRef);
                });
                await batch.commit();
              }
              setNotifications([]);
            } catch (error) {
              console.error('Error clearing notifications:', error);
              Alert.alert('Error', 'Failed to clear notifications. Please try again.');
            }
          },
        },
      ]
    );
  }, [notifications]);

  const handleNotificationPress = useCallback((notification) => {
    markAsRead(notification.id);
    
    switch (notification.type) {
      case 'join_request':
        if (notification.roomId) router.push(`/room-details/${notification.roomId}`);
        break;
      case 'join_approved':
      case 'join_rejected':
      case 'room_invitation':
      case 'study_reminder':
        if (notification.roomId) router.push(`/room-details/${notification.roomId}`);
        break;
      case 'room_deleted':
      case 'kicked_from_room':
        router.push('/room-list');
        break;
      case 'new_message':
        if (notification.roomId) {
          router.push({
            pathname: `/room-details/${notification.roomId}`,
            params: { openChat: 'true' }
          });
        }
        break;
      case 'user_joined':
      case 'user_left':
        if (notification.roomId) {
          router.push(`/room-details/${notification.roomId}`);
        } else if (notification.userId) {
          router.push(`/my-profile/${notification.userId}`);
        }
        break;
      case 'meetup_request':
      case 'meetup_accepted':
      case 'meetup_reminder':
      case 'meetup_cancelled':
      case 'meetup_updated':
        if (notification.meetupId) {
          router.push(`/room-details/${notification.meetupId}`);
        } else if (notification.roomId) {
          router.push(`/room-details/${notification.roomId}`);
        }
        break;
      default:
        break;
    }
  }, [markAsRead, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
          </Pressable>
          <Text style={styles.title}>notifications</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
             <Ionicons name="arrow-back" size={24} color="#E8A4C7" />
          </Pressable>
          <Text style={styles.title}>notifications</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => {
            setError(null);
            setLoading(true);
          }}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
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
        <Text style={styles.title}>notifications</Text>
        {notifications.length > 0 && (
          <Pressable style={styles.clearButton} onPress={clearAllNotifications}>
            <Text style={styles.clearButtonText}>clear all</Text>
          </Pressable>
        )}
      </View>

      {/* Notifications List */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>no notifications</Text>
            <Text style={styles.emptySubtitle}>you're all caught up!</Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <Pressable
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.read && styles.unreadCard
              ]}
              onPress={() => handleNotificationPress(notification)}
            >
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationIcon}>
                  {getNotificationIcon(notification.type)}
                </Text>
                <View style={styles.notificationContent}>
                  <View style={styles.titleRow}>
                    <Text style={[
                      styles.notificationTitle,
                      !notification.read && styles.unreadTitle
                    ]}>
                      {notification.title}
                    </Text>
                    {!notification.read && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notificationTime}>
                    {notification.time || formatTime(notification.createdAt)}
                  </Text>
                </View>
              </View>
              <Text style={styles.notificationMessage}>
                {notification.message}
              </Text>
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
    backgroundColor: '#4A3B47', // Main background matches room-list
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E8A4C7', // Pink title
    textAlign: 'center',
    flex: 1,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearButtonText: {
    color: '#E1B604', // Mustard yellow accent
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#E8A4C7',
  },
  // Error States
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E8A4C7',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#E1B604',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#1C6F75',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E8A4C7',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  // Cards matching room-list style
  notificationCard: {
    backgroundColor: '#E8D5DA', // Light card background
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3A6A6F', // Dark teal border
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  unreadCard: {
    backgroundColor: '#fff', // Brighter background for unread
    borderColor: '#E1B604', // Yellow border for emphasis
    borderWidth: 2,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4d4c41', // Dark text for readability
    flex: 1,
    marginBottom: 4,
  },
  unreadTitle: {
    color: '#3A6A6F',
  },
  notificationTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E1B604', // Mustard dot
    marginLeft: 8,
    marginTop: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#4d4c41',
    lineHeight: 20,
    marginTop: 4,
  },
});