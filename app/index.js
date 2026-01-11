import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import CheersImage from '../assets/cheers.png';
import { auth } from '../firebase/firebaseConfig';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');
const GAP = 20;
const PADDING = 24;
const BUTTON_WIDTH = (width - (PADDING * 2) - GAP) / 2; 

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeRooms, setActiveRooms] = useState([]);
  const [notifications, setNotifications] = useState([]); 
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const fetchUserRooms = async () => {
      try {
        setActiveRooms([]); 
      } catch (error) {
        console.error('Failed to load your rooms', error);
        setActiveRooms([]);
      }
    };
    fetchUserRooms();
  }, []);

  const handleSignOut = async () => {
    Alert.alert(
      t('signOut'),
      t('signOutConfirm'),
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('signOut'),
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace('/login');
            } catch (error) {
              Alert.alert(t('error'), t('failedToSignOut'));
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
    <SafeAreaView style={styles.container}>
      {/* TOP BAR */}
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#E8A4C7" />
        </Pressable>

        <Link href="/notifications" asChild>
          <Pressable style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={24} color="#E8A4C7" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </Link>
      </View>

      {/* MAIN CONTENT */}
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. HEADER SECTION */}
        <View style={styles.headerSection}>
          <Text style={styles.title}>{t('appName')}</Text>
          <Text style={styles.subtitle}>{t('tagline')}</Text>
        </View>

        {/* 2. DYNAMIC CONTENT (Active Rooms) */}
        {activeRooms.length > 0 && (
          <View style={styles.activeRoomsSection}>
            <Text style={styles.sectionTitle}>{t('yourActiveRooms')}</Text>
            {activeRooms.map((room) => (
              <View key={room.id} style={styles.activeRoomCard}>
                <Text style={styles.roomName}>{room.name}</Text>
                <Text style={styles.roomDetails}>{room.location} • {room.time}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 3. GRID MENU SECTION */}
        <View style={styles.gridSection}>
          <View style={styles.gridRow}>
            <Link href="/create-room" asChild>
              <Pressable style={styles.gridButton}>
                <View style={styles.iconCircle}>
                  <Ionicons name="add" size={32} color="#4A3B47" />
                </View>
                <Text style={styles.gridButtonText}>{t('createARoom')}</Text>
              </Pressable>
            </Link>

            <Link href="/room-list" asChild>
              <Pressable style={styles.gridButton}>
                <View style={styles.iconCircle}>
                  <Ionicons name="search" size={28} color="#4A3B47" />
                </View>
                <Text style={styles.gridButtonText}>{t('joinARoom')}</Text>
              </Pressable>
            </Link>
          </View>

          <View style={styles.gridRow}>
            <Link href="/my-rooms" asChild>
              <Pressable style={styles.gridButton}>
                <View style={styles.iconCircle}>
                  <Ionicons name="home" size={28} color="#4A3B47" />
                </View>
                <Text style={styles.gridButtonText}>{t('myRooms')}</Text>
              </Pressable>
            </Link>

            <Pressable style={styles.gridButton} onPress={handleActiveRooms}>
              <View style={styles.iconCircle}>
                <Ionicons name="beer" size={28} color="#4A3B47" />
              </View>
              <Text style={styles.gridButtonText}>{t('activeRooms')}</Text>
            </Pressable>
          </View>
        </View>

        {/* 4. FOOTER SECTION */}
        <View style={styles.footerSection}>
          <Image source={CheersImage} style={styles.cheers} />
        </View>
      </ScrollView>

      {/* FAB */}
      <Link href="/my-profile" asChild>
        <Pressable style={styles.fab}>
          <Ionicons name="person" size={32} color="#4A3B47" />
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    zIndex: 10,
  },
  iconButton: {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#D32F2F',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4A3B47',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingBottom: 40, 
  },

  headerSection: {
    alignItems: 'center',
    marginTop: 20, 
    marginBottom: 20,
  },
  title: {
    fontSize: 46,
    fontWeight: 'bold',
    color: '#E8A4C7',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#E8D5DA',
    opacity: 0.7,
    fontStyle: 'italic',
  },

  activeRoomsSection: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DCD8A7',
    marginBottom: 12,
  },
  activeRoomCard: {
    backgroundColor: '#3A6A6F',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  roomName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E8D5DA',
    marginBottom: 4,
  },
  roomDetails: {
    fontSize: 14,
    color: '#E8D5DA',
    opacity: 0.8,
  },

  gridSection: {
    width: '100%',
    gap: GAP,
    marginVertical: 20,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridButton: {
    width: BUTTON_WIDTH,
    height: BUTTON_WIDTH,
    backgroundColor: '#E8D5DA',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(74, 59, 71, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gridButtonText: {
    color: '#4A3B47',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  footerSection: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 40,
  },
  cheers: {
    width: 100,
    height: 80,
    resizeMode: 'contain',
    opacity: 0.8,
  },

  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8A4C7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#4A3B47',
  },
});