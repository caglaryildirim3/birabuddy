import { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  Alert, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';

export default function MyProfile() {
  const user = auth.currentUser;
  const router = useRouter();
  const [instagram, setInstagram] = useState('');
  const [major, setMajor] = useState('');
  const [age, setAge] = useState('');
  const [favDrink, setFavDrink] = useState('');
  const [originalInstagram, setOriginalInstagram] = useState('');
  const [originalMajor, setOriginalMajor] = useState('');
  const [originalAge, setOriginalAge] = useState('');
  const [originalFavDrink, setOriginalFavDrink] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [userStats, setUserStats] = useState({ roomsCreated: 0, roomsJoined: 0 });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        // Fetch user data
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.exists() ? userSnap.data() : {};
        
        // Debug: Let's see what's actually in the database
        console.log('User data from Firestore:', data);
        console.log('User UID:', user.uid);
        
        // Get Instagram username - check for instagram field first
        const fetchedInstagram = data.instagram || '';
        console.log('Fetched Instagram username:', fetchedInstagram);
        const fetchedMajor = data.major || '';
        const fetchedAge = data.age ? data.age.toString() : '';
        const fetchedFavDrink = data.favDrink || '';

        setInstagram(fetchedInstagram);
        setOriginalInstagram(fetchedInstagram);
        setMajor(fetchedMajor);
        setOriginalMajor(fetchedMajor);
        setAge(fetchedAge);
        setOriginalAge(fetchedAge);
        setFavDrink(fetchedFavDrink);
        setOriginalFavDrink(fetchedFavDrink);

        // Fetch user stats
        const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', user.uid));
        const roomsSnap = await getDocs(roomsQuery);
        
        setUserStats({
          roomsCreated: roomsSnap.docs.length,
          roomsJoined: 0
        });
        
      } catch (err) {
        console.log('Error fetching user data:', err);
        Alert.alert('Error', 'Failed to load profile data');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchUserData();
    }
  }, [user]);

  // Validate age
  const validateAge = (ageString) => {
    const ageNum = parseInt(ageString);
    if (isNaN(ageNum)) {
      return { valid: false, message: 'Please enter a valid age' };
    }
    if (ageNum < 18) {
      return { valid: false, message: 'You must be at least 18 years old' };
    }
    if (ageNum > 100) {
      return { valid: false, message: 'Please enter a valid age' };
    }
    return { valid: true };
  };

  // Clean Instagram username
  const cleanInstagramHandle = (handle) => {
    return handle.replace(/[@\s]/g, '').toLowerCase();
  };

  const handleUpdateProfile = async () => {
    // Validate age
    if (age.trim()) {
      const ageValidation = validateAge(age);
      if (!ageValidation.valid) {
        Alert.alert('Invalid Age', ageValidation.message);
        return;
      }
    }

    const trimmedMajor = major.trim();
    const trimmedFavDrink = favDrink.trim();

    if (
      trimmedMajor === originalMajor &&
      age === originalAge &&
      trimmedFavDrink === originalFavDrink
    ) {
      Alert.alert('No Changes', 'No changes were made');
      return;
    }

    try {
      setUpdating(true);
      const updateData = { 
        major: trimmedMajor,
        favDrink: trimmedFavDrink,
        updatedAt: new Date()
      };

      if (age.trim()) {
        updateData.age = parseInt(age);
      }

      await setDoc(
        doc(db, 'users', user.uid),
        updateData,
        { merge: true }
      );

      setOriginalMajor(trimmedMajor);
      setOriginalAge(age);
      setOriginalFavDrink(trimmedFavDrink);
      Alert.alert('Success! 🍻', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Error', `Failed to update profile: ${error.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const openInstagram = async () => {
    if (!instagram) return;
    
    const instagramUrl = `https://www.instagram.com/${instagram}/`;
    const instagramAppUrl = `instagram://user?username=${instagram}`;
    
    try {
      const canOpenApp = await Linking.canOpenURL(instagramAppUrl);
      if (canOpenApp) {
        await Linking.openURL(instagramAppUrl);
      } else {
        await Linking.openURL(instagramUrl);
      }
    } catch (error) {
      console.log('Error opening Instagram:', error);
      // Try a simpler fallback URL
      try {
        await Linking.openURL(`https://www.instagram.com/${instagram}`);
      } catch (fallbackError) {
        Alert.alert('Error', 'Could not open Instagram profile');
      }
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'default',
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace('/login');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Warning',
              'Are you absolutely sure? This will delete everything permanently.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteDoc(doc(db, 'users', user.uid));
                      await user.delete();
                      Alert.alert('Account Deleted', 'Your account has been permanently removed');
                    } catch (err) {
                      Alert.alert('Error', `Failed to delete account: ${err.message}`);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E8A4C7" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>🍺 my profile</Text>
        
        {/* Profile Info Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {instagram ? instagram.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </Text>
            </View>
            {age && (
              <View style={styles.ageTag}>
                <Text style={styles.ageTagText}>{age}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.userInfo}>
            <Text style={styles.name}>{instagram || 'No Instagram username set'}</Text>
            <Text style={styles.subtitle}>other users can not see your e-mail</Text>
            <Text style={styles.email}>{user.email}</Text>
            {major && (
              <Text style={styles.major}>🎓 {major}</Text>
            )}
            {favDrink && (
              <Text style={styles.favDrink}>🍻 {favDrink}</Text>
            )}
            {instagram && (
              <Pressable onPress={openInstagram}>
                <Text style={styles.instagram}>📸 @{instagram}</Text>
              </Pressable>
            )}
            <Text style={styles.joinDate}>
              joined {user.metadata.creationTime ? 
                new Date(user.metadata.creationTime).toLocaleDateString() : 'recently'}
            </Text>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.roomsCreated}</Text>
            <Text style={styles.statLabel}>rooms created</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.roomsJoined}</Text>
            <Text style={styles.statLabel}>rooms joined</Text>
          </View>
        </View>

        {/* Edit Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✏️ edit profile</Text>
          
          <Text style={styles.label}>age </Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder="enter your age"
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={3}
          />
          
          <Text style={styles.label}>university major</Text>
          <TextInput
            style={styles.input}
            value={major}
            onChangeText={setMajor}
            placeholder="e.g. Computer Science, Business, etc."
            placeholderTextColor="#999"
            maxLength={50}
          />
          <Text style={styles.charCount}>{major.length}/50</Text>
          
          <Text style={styles.label}>favorite drink 🍻</Text>
          <TextInput
            style={styles.input}
            value={favDrink}
            onChangeText={setFavDrink}
            placeholder="e.g. Beer, Wine, Cocktails, etc."
            placeholderTextColor="#999"
            maxLength={30}
          />
          <Text style={styles.charCount}>{favDrink.length}/30</Text>
          
          <Pressable 
            style={[styles.updateButton, updating && styles.buttonDisabled]} 
            onPress={handleUpdateProfile}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator size="small" color="#4A3B47" />
            ) : (
              <Text style={styles.updateButtonText}>🍻 save changes</Text>
            )}
          </Pressable>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>sign out</Text>
          </Pressable>
          
          <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteButtonText}>delete account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47', // Muted dark pink/mauve
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 120,
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
  header: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#E8A4C7', // Soft pink
    textAlign: 'center',
    marginBottom: 30,
    letterSpacing: 1,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#5A4B5C', // Slightly lighter muted pink
    padding: 24,
    borderRadius: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#7A6B7D', // Muted purple-pink border
  },
  avatarContainer: {
    alignItems: 'center',
    marginRight: 20,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8A4C7', // Soft pink
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 3,
    borderColor: '#E8D5DA', // Light pink border
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4A3B47', // Dark pink text
  },
  ageTag: {
    backgroundColor: '#C97BA3', // Medium pink
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
    color: '#E8D5DA', // Light pink text
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  email: {
    color: '#E8D5DA',
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.8,
  },
  major: {
    color: '#E8A4C7', // Soft pink accent
    fontSize: 16,
    marginBottom: 6,
    fontWeight: '600',
  },
  favDrink: {
    color: '#C97BA3', // Medium pink accent
    fontSize: 16,
    marginBottom: 6,
    fontWeight: '600',
  },
  instagram: {
    color: '#A3C7E8', // Soft blue
    fontSize: 15,
    marginBottom: 8,
    textDecorationLine: 'underline',
  },
  joinDate: {
    color: '#E8D5DA',
    fontSize: 12,
    opacity: 0.7,
  },
  statsSection: {
    flexDirection: 'row',
    marginBottom: 30,
    gap: 15,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#5A4B5C', // Slightly lighter muted pink
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#7A6B7D', // Muted purple-pink border
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#E8A4C7', // Soft pink
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#E8D5DA', // Light pink
    opacity: 0.8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 24,
    color: '#E8A4C7', // Soft pink
    fontWeight: 'bold',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 16,
    color: '#E8D5DA', // Light pink
    marginBottom: 10,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#5A4B5C', // Slightly lighter muted pink
    color: '#E8D5DA', // Light pink text
    padding: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7A6B7D', // Muted purple-pink border
    fontSize: 16,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  charCount: {
    color: '#E8D5DA',
    fontSize: 12,
    opacity: 0.6,
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  helpText: {
    color: '#E8D5DA',
    fontSize: 12,
    opacity: 0.7,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  updateButton: {
    backgroundColor: '#E8A4C7', // Soft pink
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    color: '#4A3B47', // Dark pink text
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  signOutButton: {
    backgroundColor: '#5A4B5C', // Slightly lighter muted pink
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7A6B7D', // Muted purple-pink border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  signOutButtonText: {
    color: '#E8D5DA', // Light pink
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#B85A6E', // Muted red-pink
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '300',
    color: '#d7d7baff',
    bottom: 5,
    fontStyle: 'italic',
  },
});