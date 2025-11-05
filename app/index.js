import { View, Text, Pressable, StyleSheet, Image, Alert, Dimensions, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import CheersImage from '../assets/cheers.png';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';

const { width } = Dimensions.get('window');

export default function Home() {
  const router = useRouter();
  const [activeRooms, setActiveRooms] = useState([]);
  const [notifications, setNotifications] = useState([]); 
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Fetch user's joined rooms from Firebase
  useEffect(() => {
    // TODO: Replace with real Firebase query to get user's joined rooms
    // For now, showing empty array - only real joined rooms should appear
    const fetchUserRooms = async () => {
      try {
        // Example Firebase query (implement this):
        // const userRooms = await getUserJoinedRooms(auth.currentUser.uid);
        // setActiveRooms(userRooms);
        setActiveRooms([]); // Empty until you implement Firebase query
      } catch (error) {
        console.error('Error fetching user rooms:', error);
        setActiveRooms([]);
      }
    };
    
    fetchUserRooms();
  }, []);

  const handleSignOut = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace('/login');
            } catch (error) {
              console.error('Sign-out error:', error.message);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          }
        }
      ]
    );
  };

const handleActiveRooms = () => {
  router.push('/active-rooms');
};

  return (
    <View style={styles.container}>
      {/* Notifications Button */}
      <Link href="/notifications" asChild>
        <Pressable style={styles.notificationButton}>
          <Text style={styles.notificationIcon}>🔔</Text>
          {notifications > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{notifications}</Text>
            </View>
          )}
        </Pressable>
      </Link>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>birabuddy</Text>
          <Text style={styles.subtitle}>hello</Text>
        </View>

        {/* Active Rooms Section */}
        {activeRooms.length > 0 && (
          <View style={styles.activeRoomsSection}>
            <Text style={styles.sectionTitle}>your active rooms</Text>
            {activeRooms.map((room) => (
              <View key={room.id} style={styles.activeRoomCard}>
                <Text style={styles.roomName}>{room.name}</Text>
                <Text style={styles.roomDetails}>{room.location} • {room.time}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.menuContainer}>
          <Link href="/create-room" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>create a room</Text>
            </Pressable>
          </Link>

          <Link href="/room-list" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>join a room</Text>
            </Pressable>
          </Link>

          <Link href="/my-rooms" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>my rooms</Text>
            </Pressable>
          </Link>

          <Pressable style={styles.button} onPress={handleActiveRooms}>
            <Text style={styles.buttonText}>active rooms</Text>
          </Pressable>

          <Link href="/my-profile" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>my profile</Text>
            </Pressable>
          </Link>
        </View>

        <Image source={CheersImage} style={styles.cheers} />
      </ScrollView>

      {/* Sign out button */}
      <Pressable 
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.signOutButtonPressed
        ]} 
        onPress={handleSignOut}
      >
        <Text style={styles.signOutText}>sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#775871ff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60, // Space for notification button
  },
  notificationButton: {
    position: 'absolute',
    top: 16,
    right: 0,
    backgroundColor: '#775871ff',
    padding: 10,
    borderRadius: 20,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#1d58c6ff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  notificationIcon: {
    fontSize: 16,
    color: '#20696eff',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#D32F2F',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 36,
    fontWeight: '600',
    color: '#e2c8e9ff',
    fontFamily: 'Courier New', // Simple, clean system font
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '300',
    color: '#d7d7baff',
    marginTop: 20,
    fontStyle: 'italic',
  },
  activeRoomsSection: {
    width: '100%',
    marginBottom: 30,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#DCD8A7',
    marginBottom: 15,
    textAlign: 'center',
  },
  activeRoomCard: {
    backgroundColor: 'rgba(225, 182, 4, 0.9)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    width: Math.min(width * 0.85, 320),
    alignItems: 'center',
  },
  roomName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C6F75',
    marginBottom: 4,
  },
  roomDetails: {
    fontSize: 14,
    color: '#1C6F75',
    opacity: 0.8,
  },
  menuContainer: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#f7ffe8ff',
    paddingVertical: 22,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginBottom: 16,
    width: Math.min(width * 0.8, 280),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonText: {
    color: '#1C6F75',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cheers: {
    width: 80,
    height: 60,
    marginTop: 15,
    marginBottom: 80, // Space for sign out button
    resizeMode: 'contain',
    opacity: 0.8,
  },
  signOutButton: {
    position: 'absolute',
    bottom: 40,
    right: 24,
    backgroundColor: '#D32F2F',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  signOutButtonPressed: {
    backgroundColor: '#B71C1C',
    transform: [{ scale: 0.95 }],
  },
  signOutText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});