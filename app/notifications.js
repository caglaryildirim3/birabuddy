import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig'; // adjust path if needed
import { onAuthStateChanged } from 'firebase/auth';

const { width } = Dimensions.get('window');

export default function Notifications() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Format timestamp to readable time
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

  // Firebase listener for real-time notifications
 useEffect(() => {
  let unsubscribe = null;

  const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
    // Clean up existing listener
    if (unsubscribe) unsubscribe();

    if (!currentUser || !currentUser.emailVerified) {
      // User not authenticated, clear notifications
      setNotifications([]);
      setLoading(false);
      return;
    }

    // User is authenticated, start listening to notifications
    setLoading(true);
    
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid), // assuming you filter by userId
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

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      // Update local state immediately for better UX
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, read: true }
            : notif
        )
      );

      // Update in Firebase
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date()
      });

    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Revert local state if Firebase update fails
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, read: false }
            : notif
        )
      );
    }
  }, []);

  // Get notification icon based on type
  const getNotificationIcon = useCallback((type) => {
    const icons = {
      // New room-related notification types
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
      // Legacy meetup types (for backward compatibility)
      'meetup_request': '👋',
      'meetup_accepted': '✅',
      'meetup_reminder': '⏰',
      'meetup_cancelled': '❌',
      'meetup_updated': '📝',
      'default': '🔔'
    };
    return icons[type] || icons.default;
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
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

              // Clear local state
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

  // Handle notification press (navigate to relevant screen)
  const handleNotificationPress = useCallback((notification) => {
    markAsRead(notification.id);
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'join_request':
  // Navigate to room details page where host can see join requests
  if (notification.roomId) {
    router.push(`/room-details/${notification.roomId}`);
  }
  break;
  
case 'join_approved':
case 'join_rejected':
case 'room_invitation':
case 'study_reminder':
  // Navigate to the specific room
  if (notification.roomId) {
    router.push(`/room-details/${notification.roomId}`);
  }
  break;
        
      case 'room_deleted':
      case 'kicked_from_room':
        // Navigate back to rooms list since room no longer exists or user was kicked
        router.push('/room-list');
        break;
        
      case 'new_message':
        // Navigate to room and try to open chat
        if (notification.roomId) {
          router.push({
            pathname: `/room-details/${notification.roomId}`,
            params: { openChat: 'true' }
          });
        }
        break;
        
      case 'user_joined':
      case 'user_left':
        // Navigate to the room where user joined/left
        if (notification.roomId) {
          router.push(`/room-details/${notification.roomId}`);
        } else if (notification.userId) {
          router.push(`/my-profile/${notification.userId}`);
        }
        break;

      // Legacy meetup types (for backward compatibility)
      case 'meetup_request':
      case 'meetup_accepted':
      case 'meetup_reminder':
      case 'meetup_cancelled':
      case 'meetup_updated':
        // Handle old meetup notifications - convert roomId from meetupId if needed
        if (notification.meetupId) {
          router.push(`/room-details/${notification.meetupId}`);
        } else if (notification.roomId) {
          router.push(`/room-details/${notification.roomId}`);
        }
        break;
        
      default:
        // Just mark as read for other types
        console.log('Unknown notification type:', notification.type);
        break;
    }
  }, [markAsRead, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← back</Text>
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
            <Text style={styles.backButtonText}>← back</Text>
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
            // Trigger re-fetch by updating a state that useEffect depends on
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
          <Text style={styles.backButtonText}>← back</Text>
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
              accessibilityRole="button"
              accessibilityLabel={`${notification.title}: ${notification.message}`}
            >
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationIcon}>
                  {getNotificationIcon(notification.type)}
                </Text>
                <View style={styles.notificationContent}>
                  <Text style={[
                    styles.notificationTitle,
                    !notification.read && styles.unreadTitle
                  ]}>
                    {notification.title}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {notification.time || formatTime(notification.createdAt)}
                  </Text>
                </View>
                {!notification.read && <View style={styles.unreadDot} />}
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
    backgroundColor: '#1C6F75',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 60,
  },
  backButtonText: {
    color: '#DCD8A7',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#DCD8A7',
    textAlign: 'center',
    flex: 1,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 60,
  },
  clearButtonText: {
    color: '#E1B604',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40, // Extra padding for bottom safe area
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#B8D4D6',
  },
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
    color: '#DCD8A7',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#B8D4D6',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#E1B604',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#1C6F75',
    fontSize: 16,
    fontWeight: '600',
  },
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
    color: '#DCD8A7',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#B8D4D6',
    textAlign: 'center',
  },
  notificationCard: {
    backgroundColor: 'rgba(220, 216, 167, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(220, 216, 167, 0.2)',
  },
  unreadCard: {
    backgroundColor: 'rgba(225, 182, 4, 0.15)',
    borderColor: 'rgba(225, 182, 4, 0.3)',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DCD8A7',
    marginBottom: 4,
  },
  unreadTitle: {
    color: '#E1B604',
  },
  notificationTime: {
    fontSize: 12,
    color: '#B8D4D6',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E1B604',
    marginLeft: 8,
    marginTop: 6,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#B8D4D6',
    lineHeight: 20,
  },
});