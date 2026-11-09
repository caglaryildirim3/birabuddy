import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DrinkStatsSection from '../components/DrinkStatsSection';
import LiveMapFab from '../components/LiveMapFab';
import UserProfile from '../components/UserProfile';
import OutTonightStatusRow from '../components/OutTonightStatusRow';
import { useNotificationIndicators } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db, storage } from '../firebase/firebaseConfig';
import {
  deleteMyAccount,
  getAccountDeleteErrorMessage,
} from '../utils/accountDeleteUtils';
import {
  ensureLoginHandleForUser,
  cleanInstagramHandle,
  formatUniversityDisplay,
  getUserDisplayName,
  isInstagramHandle,
  parseUniversityFromEmail,
  updateLoginHandle,
} from '../utils/authUtils';
import { calculateDrinkStats } from '../utils/drinkStatsUtils';
import { getFriendIds } from '../utils/friendUtils';
import {
  ensurePhotoLibraryPermission,
  PROFILE_PHOTO_PICKER_OPTIONS,
} from '../utils/imagePickerUtils';
import {
  EMPTY_PHOTOS,
  mergePhotoUrl,
  normalizePhotos,
  resolveProfilePhotoSlots,
  sanitizePhotosForStorage,
  clearProfilePhotoCache,
  deleteProfilePhotoAtSlot,
} from '../utils/photoUtils';
import { uploadImageFromUri } from '../utils/storageUtils';
import {
  getOwnUserData,
  getPrivateUserData,
  getPublicUserData,
  persistUserField,
} from '../utils/userDocUtils';

const BIO_LIMIT = 150;
const GO_TO_BAR_LIMIT = 50;

export default function MyProfile() {
  const { t } = useTranslation();
  const user = auth.currentUser;
  const router = useRouter();
  const { colors } = useTheme();
  const { showFriendsDot } = useNotificationIndicators();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { mainPhotoSize, smallPhotoSize } = useMemo(() => {
    const photoGridWidth = Dimensions.get('window').width - 40;
    const gap = 10;
    const small = Math.floor((photoGridWidth - gap * 3) / 4);
    return { mainPhotoSize: photoGridWidth, smallPhotoSize: small };
  }, []);

  const [photos, setPhotos] = useState(EMPTY_PHOTOS);
  const [bio, setBio] = useState('');
  const [originalBio, setOriginalBio] = useState('');
  const [name, setName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [loginHandle, setLoginHandle] = useState('');
  const [major, setMajor] = useState('');
  const [age, setAge] = useState('');
  const [favDrink, setFavDrink] = useState('');
  const [goToBar, setGoToBar] = useState('');
  const [university, setUniversity] = useState('');

  const [loading, setLoading] = useState(true);
  const [uploadingPhotoIndex, setUploadingPhotoIndex] = useState(null);
  const [savingBio, setSavingBio] = useState(false);
  const [userStats, setUserStats] = useState({ roomsCreated: 0, roomsJoined: 0, friends: 0 });
  const [drinkStats, setDrinkStats] = useState(null);
  const [statsRefreshing, setStatsRefreshing] = useState(false);

  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [reorderSourceIndex, setReorderSourceIndex] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);

        const data = (await getOwnUserData(user.uid)) || {};

        const fetchedInstagram = data.instagram || '';
        const fetchedMajor = data.major || '';
        const fetchedAge = data.age ? data.age.toString() : '';
        const fetchedFavDrink = data.favDrink || '';
        const fetchedGoToBar = data.goToBar || '';
        const fetchedBio = data.bio || '';
        const fetchedName = getUserDisplayName(data, user?.email);

        const fetchedUniversity = formatUniversityDisplay(
          data.university || parseUniversityFromEmail(user.email)
        );

        const nextPhotos = await resolveProfilePhotoSlots(user.uid, data.photos);
        setPhotos(nextPhotos);
        setBio(fetchedBio);
        setOriginalBio(fetchedBio);
        setName(fetchedName);
        setInstagram(fetchedInstagram);
        setLoginHandle(data.loginHandle || fetchedInstagram);
        setMajor(fetchedMajor);
        setAge(fetchedAge);
        setFavDrink(fetchedFavDrink);
        setGoToBar(fetchedGoToBar);
        setUniversity(fetchedUniversity);

        const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', user.uid));
        const [roomsSnap, friendIds] = await Promise.all([
          getDocs(roomsQuery),
          getFriendIds(user.uid),
        ]);

        setUserStats({
          roomsCreated: roomsSnap.docs.length,
          roomsJoined: 0,
          friends: friendIds.length,
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
  }, [user, t]);

  const fetchDrinkStats = useCallback(async () => {
    if (!user?.uid) return;
    const postsQuery = query(collection(db, 'posts'), where('userId', '==', user.uid));
    const postsSnap = await getDocs(postsQuery);
    const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setDrinkStats(calculateDrinkStats(posts));
  }, [user?.uid]);

  const refreshProfileStats = useCallback(async () => {
    if (!user?.uid) return;
    const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', user.uid));
    const [roomsSnap, friendIds] = await Promise.all([
      getDocs(roomsQuery),
      getFriendIds(user.uid),
    ]);
    setUserStats((prev) => ({
      ...prev,
      roomsCreated: roomsSnap.docs.length,
      friends: friendIds.length,
    }));
  }, [user?.uid]);

  const onRefresh = useCallback(async () => {
    setStatsRefreshing(true);
    try {
      await Promise.all([fetchDrinkStats(), refreshProfileStats()]);
    } catch (err) {
      console.log('Profile refresh error:', err);
    } finally {
      setStatsRefreshing(false);
    }
  }, [fetchDrinkStats, refreshProfileStats]);

  useEffect(() => {
    if (!user?.uid || !instagram || !user.email) return;
    ensureLoginHandleForUser(user.uid, {
      instagram,
      email: user.email,
      loginHandle,
    });
  }, [user?.uid, user?.email, instagram, loginHandle]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) return;

      const refreshPhotos = async () => {
        try {
          const data = await getPublicUserData(user.uid);
          if (data) {
            const next = await resolveProfilePhotoSlots(user.uid, data.photos);
            setPhotos(next);
          }
        } catch (err) {
          console.log('Photo refresh error:', err);
        }
      };

      refreshPhotos();
      fetchDrinkStats().catch((err) => {
        console.log('Drink stats fetch error:', err);
      });
      refreshProfileStats().catch(() => {});
    }, [user?.uid, fetchDrinkStats, refreshProfileStats])
  );

  const validateAge = (ageString) => {
    const ageNum = parseInt(ageString, 10);
    if (isNaN(ageNum)) return { valid: false, message: t('pleaseEnterValidAge') };
    if (ageNum < 18) return { valid: false, message: t('mustBe18') };
    if (ageNum > 100) return { valid: false, message: t('pleaseEnterValidAge') };
    return { valid: true };
  };

  const resolveUserEmail = async () => {
    const authEmail = user?.email?.toLowerCase();
    if (authEmail) return authEmail;
    const privateData = await getPrivateUserData(user.uid);
    return privateData?.email?.toLowerCase() || null;
  };

  const persistField = async (field, value) => {
    await persistUserField(user.uid, field, value);
  };

  const persistPhotos = async (nextPhotos) => {
    const sanitized = sanitizePhotosForStorage(nextPhotos);
    clearProfilePhotoCache(user.uid);
    setPhotos(sanitized);
    await persistField('photos', sanitized);
  };

  const cancelReorder = () => setReorderSourceIndex(null);

  const swapPhotoSlots = async (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const next = [...photos];
    const temp = next[fromIndex];
    next[fromIndex] = next[toIndex];
    next[toIndex] = temp;
    await persistPhotos(next);
  };

  const handleDeletePhoto = async (index) => {
    if (!photos[index]) return;

    try {
      await deleteProfilePhotoAtSlot(storage, user.uid, index);
      const next = [...photos];
      next[index] = '';
      await persistPhotos(next);
      setReorderSourceIndex((prev) => (prev === index ? null : prev));
    } catch (error) {
      Alert.alert(t('error'), error.message || t('failedToDeletePhoto'));
    }
  };

  const handlePhotoPress = async (index, isMain, url) => {
    if (reorderSourceIndex !== null) {
      if (index !== reorderSourceIndex) {
        await swapPhotoSlots(reorderSourceIndex, index);
      }
      setReorderSourceIndex(null);
      return;
    }

    if (isMain && url) {
      setShowProfilePreview(true);
      return;
    }

    handlePickPhoto(index);
  };

  const handlePhotoLongPress = (index, url) => {
    if (!url || uploadingPhotoIndex !== null) return;
    setReorderSourceIndex(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePickPhoto = async (index) => {
    try {
      const hasPermission = await ensurePhotoLibraryPermission({ t, Alert });
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync(PROFILE_PHOTO_PICKER_OPTIONS);

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      setUploadingPhotoIndex(index);
      setPhotos((prev) => {
        const next = [...prev];
        next[index] = asset.uri;
        return next;
      });

      const downloadUrl = await uploadImageFromUri(
        storage,
        `users/${user.uid}/photos/${index}`,
        asset.uri,
        asset.mimeType || 'image/jpeg'
      );

      clearProfilePhotoCache(user.uid, index);

      const userData = await getPublicUserData(user.uid);
      const storedPhotos = userData?.photos || [];
      const nextPhotos = mergePhotoUrl(storedPhotos, downloadUrl, index);
      await persistPhotos(nextPhotos);
    } catch (error) {
      const userData = await getPublicUserData(user.uid);
      setPhotos(normalizePhotos(userData?.photos || []));
      const code = error?.code || error?.message || '';
      const isIcloudIssue =
        String(code).includes('3164') ||
        String(code).toLowerCase().includes('icloud') ||
        String(code).toLowerCase().includes('network');
      Alert.alert(
        t('error'),
        isIcloudIssue
          ? `${t('failedToUploadPhoto')}\n\n${t('icloudPhotoHint')}`
          : error.message || t('failedToUploadPhoto')
      );
    } finally {
      setUploadingPhotoIndex(null);
    }
  };

  const saveBio = async () => {
    const trimmedBio = bio.trim();
    if (trimmedBio === originalBio) return;

    try {
      setSavingBio(true);
      await persistField('bio', trimmedBio);
      setBio(trimmedBio);
      setOriginalBio(trimmedBio);
    } catch (error) {
      Alert.alert(t('error'), t('failedToUpdateProfile', { error: error.message }));
      setBio(originalBio);
    } finally {
      setSavingBio(false);
    }
  };

  const openEditModal = (field, currentValue) => {
    setEditField(field);
    setEditValue(currentValue);
  };

  const closeEditModal = () => {
    setEditField(null);
    setEditValue('');
  };

  const saveEditField = async () => {
    if (!editField) return;

    try {
      setSavingField(true);
      let valueToSave = editValue.trim();

      if (editField === 'name') {
        if (!valueToSave) {
          Alert.alert(t('error'), t('nameCannotBeEmpty'));
          return;
        }
        if (valueToSave.length > 40) {
          Alert.alert(t('error'), t('nameTooLong40'));
          return;
        }
        await persistField('name', valueToSave);
        setName(valueToSave);
      } else if (editField === 'instagram') {
        valueToSave = cleanInstagramHandle(editValue);
        if (!isInstagramHandle(valueToSave)) {
          Alert.alert(t('invalidUsername'), t('enterValidInstagram'));
          return;
        }
        const email = await resolveUserEmail();
        if (!email) {
          Alert.alert(t('error'), t('loginFailed'));
          return;
        }
        await updateLoginHandle({
          oldHandle: loginHandle || instagram,
          newHandle: valueToSave,
          email,
          uid: user.uid,
        });
        await persistField('instagram', valueToSave);
        setInstagram(valueToSave);
        setLoginHandle(valueToSave);
      } else if (editField === 'age') {
        if (valueToSave) {
          const ageValidation = validateAge(valueToSave);
          if (!ageValidation.valid) {
            Alert.alert(t('invalidAge'), ageValidation.message);
            return;
          }
          await persistField('age', parseInt(valueToSave, 10));
          setAge(valueToSave);
        }
      } else if (editField === 'major') {
        if (valueToSave.length > 50) {
          Alert.alert(t('error'), t('majorTooLong'));
          return;
        }
        await persistField('major', valueToSave);
        setMajor(valueToSave);
      } else if (editField === 'favDrink') {
        if (valueToSave.length > 30) {
          Alert.alert(t('error'), t('favoriteDrinkTooLong'));
          return;
        }
        await persistField('favDrink', valueToSave);
        setFavDrink(valueToSave);
      } else if (editField === 'goToBar') {
        if (valueToSave.length > GO_TO_BAR_LIMIT) {
          Alert.alert(t('error'), t('goToBarTooLong', { limit: GO_TO_BAR_LIMIT }));
          return;
        }
        await persistField('goToBar', valueToSave);
        setGoToBar(valueToSave);
      }

      closeEditModal();
    } catch (error) {
      if (error?.code === 'handle-taken') {
        Alert.alert(t('invalidUsername'), t('usernameAlreadyTaken'));
        return;
      }
      Alert.alert(t('error'), t('failedToUpdateProfile', { error: error.message }));
    } finally {
      setSavingField(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'default',
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace('/login');
          } catch (error) {
            Alert.alert(t('error'), t('failedToSignOut'));
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('deleteAccount'), t('deleteAccountConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteForever'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('finalWarning'), t('absolutelySure'), [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('yesDeleteEverything'),
              style: 'destructive',
              onPress: async () => {
                if (!user || deletingAccount) return;
                setDeletingAccount(true);
                try {
                  await deleteMyAccount();
                  await signOut(auth);
                  router.replace('/login');
                } catch (err) {
                  Alert.alert(t('error'), getAccountDeleteErrorMessage(err, t));
                } finally {
                  setDeletingAccount(false);
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const renderPhotoSlot = (index, size, isMain = false) => {
    const url = photos[index];
    const isUploading = uploadingPhotoIndex === index;
    const isSelected = reorderSourceIndex === index;
    const isDropTarget =
      reorderSourceIndex !== null && reorderSourceIndex !== index;

    return (
      <Pressable
        key={index}
        style={[
          isMain ? styles.mainPhoto : styles.smallPhoto,
          { width: size, height: size },
          isSelected && styles.photoSlotSelected,
          isDropTarget && styles.photoSlotDropTarget,
        ]}
        onPress={() => handlePhotoPress(index, isMain, url)}
        onLongPress={() => handlePhotoLongPress(index, url)}
        delayLongPress={300}
        disabled={isUploading}
      >
        {url ? (
          <Image
            key={url}
            source={{ uri: url }}
            style={{ width: size, height: size }}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.photoPlaceholder, { width: size, height: size }]}>
            <Ionicons
              name={isMain ? 'camera' : 'add'}
              size={isMain ? 36 : 20}
              color={colors.textMuted}
            />
          </View>
        )}
        {url && reorderSourceIndex !== null ? (
          <Pressable
            style={styles.photoDeleteButton}
            onPress={(event) => {
              event?.stopPropagation?.();
              handleDeletePhoto(index);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color="#FFFFFF" />
          </Pressable>
        ) : null}
        {isUploading ? (
          <View style={styles.photoOverlay}>
            <ActivityIndicator color={colors.textPrimary} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderInfoRow = ({ label, value, onPress, readOnly = false }) => (
    <Pressable
      style={[styles.infoRow, readOnly && styles.infoRowReadOnly]}
      onPress={readOnly ? undefined : onPress}
      disabled={readOnly}
    >
      <View style={styles.infoRowLeft}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>
          {value || '—'}
        </Text>
      </View>
      {!readOnly && (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );

  const getEditModalTitle = () => {
    switch (editField) {
      case 'name':
        return t('nameLabel');
      case 'instagram':
        return t('editInstagram');
      case 'age':
        return t('age');
      case 'major':
        return t('universityMajor');
      case 'favDrink':
        return t('favoriteDrink');
      case 'goToBar':
        return t('goToBarLabel');
      default:
        return t('editProfile');
    }
  };

  const getEditPlaceholder = () => {
    switch (editField) {
      case 'name':
        return t('yourNamePlaceholder');
      case 'instagram':
        return t('instagramEditPlaceholder');
      case 'age':
        return t('yourAgePlaceholder');
      case 'major':
        return t('yourMajorPlaceholder');
      case 'favDrink':
        return t('yourFavoriteDrinkPlaceholder');
      case 'goToBar':
        return t('yourFavoriteBarPlaceholder');
      default:
        return '';
    }
  };

  const getEditMaxLength = () => {
    switch (editField) {
      case 'name':
        return 40;
      case 'instagram':
        return 30;
      case 'age':
        return 3;
      case 'major':
        return 50;
      case 'favDrink':
        return 30;
      case 'goToBar':
        return GO_TO_BAR_LIMIT;
      default:
        return 100;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
          <Text style={styles.loadingText}>{t('loadingProfile')}</Text>
        </View>
        <LiveMapFab />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={reorderSourceIndex === null}
        bounces={reorderSourceIndex === null}
        refreshControl={
          reorderSourceIndex !== null ? undefined : (
            <RefreshControl
              refreshing={statsRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          )
        }
      >
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Pressable
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={26} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.photoSection}>
          {reorderSourceIndex !== null ? (
            <View style={styles.reorderBanner}>
              <Text style={styles.reorderBannerText}>{t('tapPhotoToSwap')}</Text>
              <Pressable onPress={cancelReorder} hitSlop={8}>
                <Text style={styles.reorderCancelText}>{t('cancel')}</Text>
              </Pressable>
            </View>
          ) : null}
          {renderPhotoSlot(0, mainPhotoSize, true)}
          <View style={styles.smallPhotoRow}>
            {[1, 2, 3, 4].map((index) => renderPhotoSlot(index, smallPhotoSize))}
          </View>
        </View>

        <Text style={styles.profileName}>{name}</Text>
        <OutTonightStatusRow />

        <Pressable style={styles.friendsNavButton} onPress={() => router.push('/friends-list')}>
          <Text style={styles.friendsNavButtonText}>{t('friendsNav')}</Text>
          <View style={styles.friendsNavRight}>
            {showFriendsDot ? <View style={styles.friendsNavDot} /> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <Pressable style={styles.friendsNavButton} onPress={() => router.push('/post-archive')}>
          <Text style={styles.friendsNavButtonText}>{t('archive')}</Text>
          <View style={styles.friendsNavRight}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('bio')}</Text>
          <TextInput
            style={styles.bioInput}
            value={bio}
            onChangeText={(text) => setBio(text.slice(0, BIO_LIMIT))}
            onBlur={saveBio}
            placeholder={t('bioPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={BIO_LIMIT}
          />
          <View style={styles.bioFooter}>
            <Text style={styles.charCount}>
              {bio.length}/{BIO_LIMIT}
            </Text>
            {savingBio && <ActivityIndicator size="small" color={colors.textPrimary} />}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('info')}</Text>
          {renderInfoRow({
            label: t('nameLabel'),
            value: name,
            onPress: () => openEditModal('name', name),
          })}
          {renderInfoRow({
            label: t('universityLabel'),
            value: university,
            readOnly: true,
          })}
          {renderInfoRow({
            label: t('universityMajor'),
            value: major,
            onPress: () => openEditModal('major', major),
          })}
          {renderInfoRow({
            label: t('age'),
            value: age,
            onPress: () => openEditModal('age', age),
          })}
          {renderInfoRow({
            label: t('instagramUsername'),
            value: instagram ? `@${instagram}` : '',
            onPress: () => openEditModal('instagram', instagram),
          })}
          {renderInfoRow({
            label: t('favoriteDrink'),
            value: favDrink,
            onPress: () => openEditModal('favDrink', favDrink),
          })}
          {renderInfoRow({
            label: t('goToBarLabel'),
            value: goToBar,
            onPress: () => openEditModal('goToBar', goToBar),
          })}
        </View>

        <DrinkStatsSection stats={drinkStats} />

        <View style={styles.statsSection}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.roomsCreated}</Text>
            <Text style={styles.statLabel}>{t('roomsCreated')}</Text>
          </View>
          <Pressable style={styles.statBox} onPress={() => router.push('/friends-list')}>
            <Text style={styles.statNumber}>{userStats.friends}</Text>
            <Text style={styles.statLabel}>{t('friendsStat')}</Text>
          </Pressable>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.roomsJoined}</Text>
            <Text style={styles.statLabel}>{t('roomsJoined')}</Text>
          </View>
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

      <Modal
        visible={showProfilePreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfilePreview(false)}
      >
        {user?.uid ? (
          <UserProfile
            key={photos.join('|')}
            uid={user.uid}
            previewMode
            onClose={() => setShowProfilePreview(false)}
          />
        ) : null}
      </Modal>

      <Modal
        visible={!!editField}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getEditModalTitle()}</Text>
              <Pressable style={styles.modalCloseButton} onPress={closeEditModal}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={getEditPlaceholder()}
              placeholderTextColor={colors.textMuted}
              autoCapitalize={editField === 'instagram' ? 'none' : 'sentences'}
              autoCorrect={false}
              keyboardType={editField === 'age' ? 'numeric' : 'default'}
              maxLength={getEditMaxLength()}
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelButton} onPress={closeEditModal}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveButton, savingField && styles.buttonDisabled]}
                onPress={saveEditField}
                disabled={savingField}
              >
                {savingField ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.modalSaveText}>{t('save')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <LiveMapFab />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  topBarSpacer: {
    flex: 1,
  },
  settingsButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
    color: colors.textPrimary,
    marginTop: 10,
    fontSize: 16,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
  photoSection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  reorderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: colors.panelSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  reorderBannerText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  reorderCancelText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  mainPhoto: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  smallPhotoRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  smallPhoto: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelElevated,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 12,
  },
  photoSlotSelected: {
    borderColor: colors.accent,
    borderWidth: 3,
    transform: [{ scale: 1.04 }],
  },
  photoSlotDropTarget: {
    borderColor: colors.accent,
    borderStyle: 'dashed',
    borderWidth: 2,
  },
  sectionCard: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  bioInput: {
    minHeight: 96,
    backgroundColor: colors.panelElevated,
    color: colors.textPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  bioFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  charCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panelElevated,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  infoRowReadOnly: {
    opacity: 0.85,
  },
  infoRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  friendsNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  friendsNavButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  friendsNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  friendsNavDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.notificationDot,
  },
  statsSection: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 15,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.panel,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  signOutButton: {
    backgroundColor: colors.panel,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  signOutButtonText: {
    color: colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
  },
  deleteButtonText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayHeavy,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: colors.panel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: colors.borderSoft,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panelElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: colors.panelElevated,
    color: colors.textPrimary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderSoft,
    fontSize: 16,
    marginBottom: 8,
  },
  modalHelpText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: colors.panelElevated,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  });
}
