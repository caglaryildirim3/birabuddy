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
  Modal
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function MyProfile() {
  const { t } = useTranslation();
  const user = auth.currentUser;
  const router = useRouter();
  const [instagram, setInstagram] = useState('');
  const [major, setMajor] = useState('');
  const [age, setAge] = useState('');
  const [favDrink, setFavDrink] = useState('');
  const [university, setUniversity] = useState(''); 
  
  const [originalInstagram, setOriginalInstagram] = useState('');
  const [originalMajor, setOriginalMajor] = useState('');
  const [originalAge, setOriginalAge] = useState('');
  const [originalFavDrink, setOriginalFavDrink] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [userStats, setUserStats] = useState({ roomsCreated: 0, roomsJoined: 0 });
  
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [tempInstagram, setTempInstagram] = useState('');
  const [updatingInstagram, setUpdatingInstagram] = useState(false);

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
    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.exists() ? userSnap.data() : {};
        
        const fetchedInstagram = data.instagram || '';
        const fetchedMajor = data.major || '';
        const fetchedAge = data.age ? data.age.toString() : '';
        const fetchedFavDrink = data.favDrink || '';

        let fetchedUniversity = data.university;
        if (!fetchedUniversity) {
            fetchedUniversity = getUniversityFromEmail(user.email);
        }

        setInstagram(fetchedInstagram);
        setOriginalInstagram(fetchedInstagram);
        setMajor(fetchedMajor);
        setOriginalMajor(fetchedMajor);
        setAge(fetchedAge);
        setOriginalAge(fetchedAge);
        setFavDrink(fetchedFavDrink);
        setOriginalFavDrink(fetchedFavDrink);
        setUniversity(fetchedUniversity);

        const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', user.uid));
        const roomsSnap = await getDocs(roomsQuery);
        
        setUserStats({
          roomsCreated: roomsSnap.docs.length,
          roomsJoined: 0
        });
        
      } catch (err) {
        console.log('Error fetching user data:', err);
        Alert.alert(t('error'), t('failedToLoadProfile'));
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchUserData();
    }
  }, [user]);

  const validateAge = (ageString) => {
    const ageNum = parseInt(ageString);
    if (isNaN(ageNum)) return { valid: false, message: t('pleaseEnterValidAge') };
    if (ageNum < 18) return { valid: false, message: t('mustBe18') };
    if (ageNum > 100) return { valid: false, message: t('pleaseEnterValidAge') };
    return { valid: true };
  };

  const cleanInstagramHandle = (handle) => {
    return handle.replace(/[@\s]/g, '').toLowerCase();
  };

  const openInstagramEdit = () => {
    setTempInstagram(instagram);
    setShowInstagramModal(true);
  };

  const saveInstagram = async () => {
    const cleanedHandle = cleanInstagramHandle(tempInstagram);
    
    if (!cleanedHandle.trim()) {
      Alert.alert(t('invalidUsername'), t('enterValidInstagram'));
      return;
    }

    if (cleanedHandle === instagram) {
      setShowInstagramModal(false);
      return;
    }

    try {
      setUpdatingInstagram(true);
      await setDoc(doc(db, 'users', user.uid), { 
          instagram: cleanedHandle,
          updatedAt: new Date()
        }, { merge: true }
      );
      setInstagram(cleanedHandle);
      setOriginalInstagram(cleanedHandle);
      setShowInstagramModal(false);
      Alert.alert(t('successProfile'), t('instagramUpdated'));
    } catch (error) {
      Alert.alert(t('error'), t('failedToUpdateInstagram', { error: error.message }));
    } finally {
      setUpdatingInstagram(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (age.trim()) {
      const ageValidation = validateAge(age);
      if (!ageValidation.valid) {
        Alert.alert(t('invalidAge'), ageValidation.message);
        return;
      }
    }

    const trimmedMajor = major.trim();
    const trimmedFavDrink = favDrink.trim();

    if (trimmedMajor === originalMajor && age === originalAge && trimmedFavDrink === originalFavDrink) {
      Alert.alert(t('noChanges'), t('noChangesMade'));
      return;
    }

    try {
      setUpdating(true);
      const updateData = { 
        major: trimmedMajor,
        favDrink: trimmedFavDrink,
        updatedAt: new Date()
      };
      if (age.trim()) updateData.age = parseInt(age);

      await setDoc(doc(db, 'users', user.uid), updateData, { merge: true });

      setOriginalMajor(trimmedMajor);
      setOriginalAge(age);
      setOriginalFavDrink(trimmedFavDrink);
      Alert.alert(t('successProfile'), t('profileUpdatedSuccess'));
    } catch (error) {
      Alert.alert(t('error'), t('failedToUpdateProfile', { error: error.message }));
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
      try { await Linking.openURL(`https://www.instagram.com/${instagram}`); } catch (e) {}
    }
  };

  const handleSignOut = () => {
    Alert.alert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'default', onPress: async () => {
          try {
            await signOut(auth);
            router.replace('/login');
          } catch (error) { Alert.alert(t('error'), t('failedToSignOut')); }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('deleteAccount'), t('deleteAccountConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteForever'), style: 'destructive', onPress: () => {
          Alert.alert(t('finalWarning'), t('absolutelySure'), [
            { text: t('cancel'), style: 'cancel' },
            { text: t('yesDeleteEverything'), style: 'destructive', onPress: async () => {
                try {
                  await deleteDoc(doc(db, 'users', user.uid));
                  await user.delete();
                  Alert.alert(t('accountDeleted'), t('accountRemoved'));
                } catch (err) { Alert.alert(t('error'), t('failedToDelete', { error: err.message })); }
              },
            },
          ]);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E8A4C7" />
          <Text style={styles.loadingText}>{t('loadingProfile')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#E8A4C7" />
        </Pressable>
        <Text style={styles.headerTitle}></Text>
        <View style={{width: 28}} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>🍺 {t('myProfile')}</Text>
        
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
            <Text style={styles.name}>{instagram || t('noInstagramUsername')}</Text>
            
            {university ? (
               <Text style={styles.university}>🏛️ {university}</Text>
            ) : null}
            
            <Text style={styles.subtitle}>{t('otherUsersCantSeeEmail')}</Text>
            <Text style={styles.email}>{user.email}</Text>
            {major && <Text style={styles.major}>🎓 {major}</Text>}
            {favDrink && <Text style={styles.favDrink}>🍻 {favDrink}</Text>}
            
            {instagram && (
              <View style={styles.instagramContainer}>
                <Pressable onPress={openInstagram}>
                  <Text style={styles.instagram}>📸 @{instagram}</Text>
                </Pressable>
                <Pressable style={styles.editInstagramButton} onPress={openInstagramEdit}>
                  <Text style={styles.editInstagramButtonText}>✏️</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.joinDate}>
              {t('joinedDate', { 
                date: user.metadata.creationTime 
                  ? new Date(user.metadata.creationTime).toLocaleDateString() 
                  : t('recently') 
              })}
            </Text>
          </View>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.roomsCreated}</Text>
            <Text style={styles.statLabel}>{t('roomsCreated')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.roomsJoined}</Text>
            <Text style={styles.statLabel}>{t('roomsJoined')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✏️ {t('editProfile')}</Text>
          
          <Text style={styles.label}>{t('age')} </Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder={t('enterYourAge')}
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={3}
          />
          
          <Text style={styles.label}>{t('universityMajor')}</Text>
          <TextInput
            style={styles.input}
            value={major}
            onChangeText={setMajor}
            placeholder={t('majorExample')}
            placeholderTextColor="#999"
            maxLength={50}
          />
          <Text style={styles.charCount}>{major.length}/50</Text>
          
          <Text style={styles.label}>{t('favoriteDrink')} 🍻</Text>
          <TextInput
            style={styles.input}
            value={favDrink}
            onChangeText={setFavDrink}
            placeholder={t('drinkExample')}
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
              <Text style={styles.updateButtonText}>🍻 {t('saveChanges')}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.bottomActions}>
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>{t('signOut').toLowerCase()}</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteButtonText}>{t('deleteAccount').toLowerCase()}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showInstagramModal} animationType="slide" presentationStyle="pageSheet" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📸 {t('editInstagram')}</Text>
              <Pressable style={styles.modalCloseButton} onPress={() => setShowInstagramModal(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>{t('instagramUsername')}</Text>
            <TextInput
              style={styles.modalInput}
              value={tempInstagram}
              onChangeText={setTempInstagram}
              placeholder={t('enterUsername')}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
            <Text style={styles.modalHelpText}>{t('dontIncludeAt')}</Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelButton} onPress={() => setShowInstagramModal(false)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.modalSaveButton, updatingInstagram && styles.buttonDisabled]} onPress={saveInstagram} disabled={updatingInstagram}>
                {updatingInstagram ? <ActivityIndicator size="small" color="#4A3B47" /> : <Text style={styles.modalSaveText}>{t('save')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B47',
  },
  // Header styles
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitle: {
    color: '#E8A4C7',
    fontSize: 18,
    fontWeight: '600',
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
  pageTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#E8A4C7',
    textAlign: 'center',
    marginBottom: 30,
    letterSpacing: 1,
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
    color: '#E1B604',
    fontSize: 14,
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
  instagramContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  instagram: {
    color: '#A3C7E8',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  editInstagramButton: {
    marginLeft: 8,
    backgroundColor: '#7A6B7D',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  editInstagramButtonText: {
    fontSize: 14,
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
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 24,
    color: '#E8A4C7',
    fontWeight: 'bold',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 16,
    color: '#E8D5DA',
    marginBottom: 10,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#5A4B5C',
    color: '#E8D5DA',
    padding: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7A6B7D',
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
  updateButton: {
    backgroundColor: '#E8A4C7',
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
    color: '#4A3B47',
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
    backgroundColor: '#5A4B5C',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7A6B7D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  signOutButtonText: {
    color: '#E8D5DA',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#B85A6E',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#5A4B5C',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: '#7A6B7D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#E8A4C7',
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7A6B7D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#E8D5DA',
    fontSize: 18,
    fontWeight: '600',
  },
  modalLabel: {
    color: '#E8D5DA',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  modalInput: {
    backgroundColor: '#4A3B47',
    color: '#E8D5DA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7A6B7D',
    fontSize: 16,
    marginBottom: 8,
  },
  modalHelpText: {
    color: '#E8D5DA',
    fontSize: 12,
    opacity: 0.7,
    fontStyle: 'italic',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#7A6B7D',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#E8D5DA',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: '#E8A4C7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#4A3B47',
    fontSize: 16,
    fontWeight: 'bold',
  },
});