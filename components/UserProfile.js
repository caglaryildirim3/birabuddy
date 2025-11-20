import { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  Pressable, 
  StyleSheet, 
  SafeAreaView,
  ActivityIndicator,
  Linking,
  Alert,
  ScrollView
} from 'react-native';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export default function UserProfile({ uid, onClose }) {
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({ roomsCreated: 0 });

  // Helper to extract university from email
  const getUniversityFromEmail = (email) => {
    if (!email) return '';
    try {
      const domainPart = email.split('@')[1];
      if (domainPart) {
          let cleanDomain = domainPart.replace('std.', '').replace('mail.', '').replace('ogrenci.', '');
          let uniName = cleanDomain.replace('.edu.tr', '');
          return uniName.toUpperCase() + ' UNIV.';
      }
    } catch (e) {
      return '';
    }
    return '';
  };

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          
          // SMART UNIVERSITY CHECK
          let finalUniversity = userData.university;
          if (!finalUniversity && userData.email) {
            finalUniversity = getUniversityFromEmail(userData.email);
          }

          // Update state with the calculated university
          setUserProfile({ ...userData, university: finalUniversity });
          
          const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', uid));
          const roomsSnap = await getDocs(roomsQuery);
          
          setUserStats({
            roomsCreated: roomsSnap.docs.length,
          });
        } else {
          setUserProfile({ name: 'User not found' });
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        Alert.alert('Error', 'Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };

    if (uid) {
      fetchUserProfile();
    }
  }, [uid]);

const openInstagram = async () => {
  if (!userProfile?.instagram) return;
  
  const instagramUrl = `https://www.instagram.com/${userProfile.instagram}/`;
  const instagramAppUrl = `instagram://user?username=${userProfile.instagram}`;
  
  try {
    const canOpenApp = await Linking.canOpenURL(instagramAppUrl);
    if (canOpenApp) {
      await Linking.openURL(instagramAppUrl);
    } else {
      await Linking.openURL(instagramUrl);
    }
  } catch (error) {
    console.log('Error opening Instagram:', error);
    try {
      await Linking.openURL(`https://www.instagram.com/${userProfile.instagram}`);
    } catch (fallbackError) {
      Alert.alert('Error', 'Could not open Instagram profile');
    }
  }
};

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E8A4C7" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!userProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>User profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍺 user profile</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
      </View>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {userProfile.name || userProfile.nickname || userProfile.instagram ? 
                  (userProfile.name || userProfile.nickname || userProfile.instagram).charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            {userProfile.age && (
              <View style={styles.ageTag}>
                <Text style={styles.ageTagText}>{userProfile.age}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.userInfo}>
            <Text style={styles.name}>
              {userProfile.name || userProfile.nickname || userProfile.instagram || 'User'}
            </Text>
            
            {/* UNIVERSITY DISPLAY ADDED HERE */}
            {userProfile.university ? (
              <Text style={styles.university}>🏛️ {userProfile.university}</Text>
            ) : null}

            {userProfile.major && (
              <Text style={styles.major}>🎓 {userProfile.major}</Text>
            )}
            {userProfile.favDrink && (
              <Text style={styles.favDrink}>🍻 {userProfile.favDrink}</Text>
            )}
            {userProfile.instagram && (
              <Pressable onPress={openInstagram}>
                <Text style={styles.instagram}>📸 @{userProfile.instagram}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.quickInfoSection}>
          {userProfile.age && (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardIcon}>🎂</Text>
              <Text style={styles.infoCardLabel}>Age</Text>
              <Text style={styles.infoCardValue}>{userProfile.age}</Text>
            </View>
          )}
          
          {userProfile.favDrink && (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardIcon}>🍻</Text>
              <Text style={styles.infoCardLabel}>Favorite Drink</Text>
              <Text style={styles.infoCardValue}>{userProfile.favDrink}</Text>
            </View>
          )}
        </View>

        <View style={styles.detailsSection}>
          <Text style={styles.detailsSectionTitle}>📋 profile details</Text>
          
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>👤 Name:</Text>
              <Text style={styles.detailValue}>
                {userProfile.name || userProfile.nickname || userProfile.instagram || 'Not set'}
              </Text>
            </View>

            {/* ADDED UNIVERSITY TO DETAILS LIST TOO */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>🏛️ University:</Text>
              <Text style={styles.detailValue}>
                {userProfile.university || 'Not specified'}
              </Text>
            </View>
            
            {userProfile.age && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🎂 Age:</Text>
                <Text style={styles.detailValue}>{userProfile.age} years old</Text>
              </View>
            )}
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>🎓 Major:</Text>
              <Text style={styles.detailValue}>
                {userProfile.major || 'Not specified'}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>🍻 Favorite Drink:</Text>
              <Text style={styles.detailValue}>
                {userProfile.favDrink || 'Not specified'}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>📸 Instagram:</Text>
              {userProfile.instagram ? (
                <Pressable onPress={openInstagram}>
                  <Text style={[styles.detailValue, styles.instagramLink]}>
                    @{userProfile.instagram}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.detailValue}>Not provided</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>📊 activity stats</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{userStats.roomsCreated}</Text>
              <Text style={styles.statLabel}>rooms created</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>rooms joined</Text>
            </View>
          </View>
        </View>

        {userProfile.favDrink && (
          <View style={styles.compatibilitySection}>
            <Text style={styles.compatibilitySectionTitle}>🍺 drink compatibility</Text>
            <View style={styles.compatibilityCard}>
              <Text style={styles.compatibilityText}>
                This person loves <Text style={styles.drinkHighlight}>{userProfile.favDrink}</Text>! 
                {userProfile.favDrink.toLowerCase().includes('beer') ? 
                  " Perfect beer buddy material! 🍻" : 
                  " Maybe you can introduce them to some great beers! 🍺"}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#5A4B5C',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#E8A4C7',
    letterSpacing: 1,
  },
  closeButton: {
    backgroundColor: '#5A4B5C',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#7A6B7D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  closeButtonText: {
    color: '#E8D5DA',
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#E8D5DA',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#E8D5DA',
    fontSize: 16,
    opacity: 0.7,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#5A4B5C',
    padding: 24,
    borderRadius: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#7A6B7D',
  },
  avatarContainer: {
    alignItems: 'center',
    marginRight: 20,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8A4C7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 3,
    borderColor: '#E8D5DA',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4A3B47',
  },
  ageTag: {
    backgroundColor: '#C97BA3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  ageTagText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  name: {
    color: '#E8D5DA',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  university: {
    color: '#E1B604', // Mustard Yellow for university name
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  major: {
    color: '#E8A4C7',
    fontSize: 16,
    marginBottom: 6,
    fontWeight: '600',
  },
  favDrink: {
    color: '#C97BA3',
    fontSize: 16,
    marginBottom: 6,
    fontWeight: '600',
  },
  instagram: {
    color: '#A3C7E8',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  quickInfoSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#5A4B5C',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#7A6B7D',
  },
  infoCardIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  infoCardLabel: {
    color: '#E8D5DA',
    fontSize: 12,
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 4,
  },
  infoCardValue: {
    color: '#E8A4C7',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  detailsSection: {
    marginBottom: 20,
  },
  detailsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E8A4C7',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  detailCard: {
    backgroundColor: '#5A4B5C',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#7A6B7D',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#7A6B7D',
  },
  detailLabel: {
    color: '#E8D5DA',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  detailValue: {
    color: '#E8D5DA',
    fontSize: 15,
    flex: 1.5,
    textAlign: 'right',
  },
  instagramLink: {
    color: '#A3C7E8',
    textDecorationLine: 'underline',
  },
  statsSection: {
    marginBottom: 20,
  },
  statsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E8A4C7',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#5A4B5C',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#7A6B7D',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#E8A4C7',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#E8D5DA',
    opacity: 0.8,
    textAlign: 'center',
  },
  compatibilitySection: {
    marginBottom: 20,
  },
  compatibilitySectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E8A4C7',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  compatibilityCard: {
    backgroundColor: '#5A4B5C',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#7A6B7D',
  },
  compatibilityText: {
    color: '#E8D5DA',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  drinkHighlight: {
    color: '#C97BA3',
    fontWeight: 'bold',
  },
});