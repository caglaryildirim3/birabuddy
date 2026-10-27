import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { auth, storage } from '../firebase/firebaseConfig';
import { ONBOARDING_PHOTO_PICKER_OPTIONS } from '../utils/imagePickerUtils';
import { mergePhotoUrl, sanitizePhotosForStorage } from '../utils/photoUtils';
import { registerForPushNotifications } from '../utils/notificationUtils';
import { uploadImageFromUri } from '../utils/storageUtils';
import {
  getOwnUserData,
  getPublicUserData,
  setPrivateUser,
  updatePublicUser,
} from '../utils/userDocUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function Onboarding() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [step, setStep] = useState(0);
  const slideX = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  // Step 1
  const [photoUri, setPhotoUri] = useState(null);
  const [bio, setBio] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Step 2 — 'undetermined' | 'granted' | 'denied'
  const [notifStatus, setNotifStatus] = useState('undetermined');
  const [locationStatus, setLocationStatus] = useState('undetermined');

  // Step 3
  const [finishing, setFinishing] = useState(false);

  // Guard: only valid users with incomplete onboarding may stay here
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.replace('/login');
      return;
    }
    getOwnUserData(uid).then(async (data) => {
      if (!data) {
        await signOut(auth);
        router.replace('/login');
      } else if (data.onboardingComplete === true) {
        router.replace('/(tabs)/feed');
      }
    });
  }, []);

  // Restore existing profile photo when entering step 1
  useEffect(() => {
    if (step !== 1) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getPublicUserData(uid)
      .then((data) => {
        const existing = data?.photos?.[0];
        if (typeof existing === 'string' && /^https:\/\//i.test(existing)) {
          setPhotoUri(existing);
        }
      })
      .catch(() => {});
  }, [step]);

  // Spring-in checkmark when step 3 appears
  useEffect(() => {
    if (step === 3) {
      checkScale.setValue(0);
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }).start();
    }
  }, [step]);

  // ── NAVIGATION ──────────────────────────────────────────

  const goTo = (nextStep, direction = 'forward') => {
    const exitTo = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const enterFrom = direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;

    Animated.timing(slideX, {
      toValue: exitTo,
      duration: 240,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(() => {
      setStep(nextStep);
      slideX.setValue(enterFrom);
      Animated.timing(slideX, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    });
  };

  const handleBack = () => goTo(step - 1, 'backward');
  const handleSkip = () => goTo(3);
  const handleNext = async () => {
    if (step === 1) await saveStep1().catch(() => {});
    goTo(step + 1);
  };

  // ── STEP 1 LOGIC ─────────────────────────────────────────

  const saveStep1 = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updates = {};
    if (bio.trim()) updates.bio = bio.trim();
    if (neighborhood.trim()) updates.goToBar = neighborhood.trim();
    if (Object.keys(updates).length > 0) {
      await updatePublicUser(uid, updates);
    }
  };

  const pickPhoto = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync(ONBOARDING_PHOTO_PICKER_OPTIONS);
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setUploadingPhoto(true);

      const downloadUrl = await uploadImageFromUri(
        storage,
        `users/${uid}/photos/0`,
        asset.uri,
        asset.mimeType || 'image/jpeg'
      );

      const userData = await getPublicUserData(uid);
      const existingPhotos = userData?.photos || [];
      const nextPhotos = mergePhotoUrl(existingPhotos, downloadUrl, 0);
      await updatePublicUser(uid, { photos: sanitizePhotosForStorage(nextPhotos) });
      setPhotoUri(downloadUrl);
    } catch (error) {
      const userData = await getPublicUserData(uid).catch(() => null);
      const existing = userData?.photos?.[0];
      setPhotoUri(typeof existing === 'string' && existing ? existing : null);
      const code = error?.code || error?.message || '';
      const isIcloudIssue =
        String(code).includes('3164') ||
        String(code).toLowerCase().includes('icloud') ||
        String(code).toLowerCase().includes('network');
      Alert.alert(
        t('error'),
        isIcloudIssue
          ? `${t('failedToUploadPhoto')}\n\n${t('icloudPhotoHint')}`
          : error?.message || t('failedToUploadPhoto')
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── STEP 2 LOGIC ─────────────────────────────────────────

  // Read actual device permission state when entering step 2
  useEffect(() => {
    if (step !== 2) return;
    Notifications.getPermissionsAsync()
      .then(({ status }) =>
        setNotifStatus(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined')
      )
      .catch(() => {});
    Location.getForegroundPermissionsAsync()
      .then(({ status }) =>
        setLocationStatus(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined')
      )
      .catch(() => {});
  }, [step]);

  const handleRequestNotif = async () => {
    if (notifStatus === 'granted') return;
    if (notifStatus === 'denied') {
      Linking.openSettings();
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifStatus(status);
    if (status === 'granted') {
      registerForPushNotifications(auth.currentUser?.uid).catch(() => {});
    }
  };

  const handleRequestLocation = async () => {
    if (locationStatus === 'granted') return;
    if (locationStatus === 'denied') {
      Linking.openSettings();
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationStatus(status);
  };

  const notifButtonLabel =
    notifStatus === 'granted'
      ? t('onboardingAllowed')
      : notifStatus === 'denied'
        ? t('onboardingOpenSettings')
        : t('onboardingAllowNotif');

  const locationButtonLabel =
    locationStatus === 'granted'
      ? t('onboardingAllowed')
      : locationStatus === 'denied'
        ? t('onboardingOpenSettings')
        : t('onboardingAllowLocation');

  // ── STEP 3 LOGIC ─────────────────────────────────────────

  const finishOnboarding = async (goLive = false) => {
    if (finishing) return;
    setFinishing(true);
    const uid = auth.currentUser?.uid;
    try {
      if (!uid) throw new Error('Not signed in');
      await setPrivateUser(uid, { onboardingComplete: true });
      if (goLive) await AsyncStorage.setItem('openGoLiveAfterOnboarding', 'true');
      router.replace(goLive ? '/(tabs)/feed' : '/(tabs)/discover');
    } catch (error) {
      Alert.alert(t('error'), t('failedToUpdateProfile', { error: error.message }));
    } finally {
      setFinishing(false);
    }
  };

  // ── STEP RENDERERS ───────────────────────────────────────

  const renderStep0 = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.step0Hero}>
        <Text style={styles.wordmark}>birabuddy</Text>
        <Text style={styles.tagline}>{t('onboardingTagline')}</Text>
        <View style={styles.featureList}>
          {[
            t('onboardingFeature1'),
            t('onboardingFeature2'),
            t('onboardingFeature3'),
          ].map((line) => (
            <Text key={line} style={styles.featureLine}>{line}</Text>
          ))}
        </View>
      </View>
      <Pressable style={styles.primaryButton} onPress={() => goTo(1)}>
        <Text style={styles.primaryButtonText}>{t('onboardingLetsGo')}</Text>
      </Pressable>
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('onboardingProfileTitle')}</Text>
        <Text style={styles.stepSubtitle}>{t('onboardingProfileSubtitle')}</Text>
      </View>

      {/* Photo picker */}
      <Pressable
        style={styles.photoPicker}
        onPress={pickPhoto}
        disabled={uploadingPhoto}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="camera" size={30} color={colors.textMuted} />
            <Text style={styles.photoPlaceholderText}>{t('onboardingAddPhoto')}</Text>
          </View>
        )}
        {uploadingPhoto ? (
          <View style={styles.photoOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </Pressable>

      {/* Bio */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('bio')}</Text>
        <TextInput
          style={styles.textArea}
          placeholder={t('onboardingBioPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, 150))}
          multiline
          maxLength={150}
        />
        <Text style={styles.charCount}>{bio.length}/150</Text>
      </View>

      {/* Go-to bar */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('goToBarLabel')}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={t('onboardingGoToBarPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={neighborhood}
          onChangeText={(text) => setNeighborhood(text.slice(0, 50))}
          maxLength={50}
          returnKeyType="done"
        />
        <Text style={styles.charCount}>{neighborhood.length}/50</Text>
      </View>

      <Text style={styles.optionalHint}>{t('onboardingOptionalHint')}</Text>

      <Pressable style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryButtonText}>{t('onboardingNext')}</Text>
      </Pressable>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('onboardingPermissionsTitle')}</Text>
      </View>

      {/* Notifications */}
      <View style={styles.permCard}>
        <Ionicons name="notifications-outline" size={28} color={colors.accent} />
        <Text style={styles.permCardTitle}>{t('onboardingNotifTitle')}</Text>
        <Text style={styles.permCardSubtitle}>{t('onboardingNotifSubtitle')}</Text>
        <Pressable
          style={[styles.permButton, notifStatus === 'granted' && styles.permButtonDone]}
          onPress={handleRequestNotif}
          disabled={notifStatus === 'granted'}
        >
          <Text style={[styles.permButtonText, notifStatus === 'granted' && styles.permButtonTextDone]}>
            {notifButtonLabel}
          </Text>
        </Pressable>
      </View>

      {/* Location */}
      <View style={styles.permCard}>
        <Ionicons name="location-outline" size={28} color={colors.accent} />
        <Text style={styles.permCardTitle}>{t('onboardingLocationTitle')}</Text>
        <Text style={styles.permCardSubtitle}>{t('onboardingLocationSubtitle')}</Text>
        <Pressable
          style={[styles.permButton, locationStatus === 'granted' && styles.permButtonDone]}
          onPress={handleRequestLocation}
          disabled={locationStatus === 'granted'}
        >
          <Text style={[styles.permButtonText, locationStatus === 'granted' && styles.permButtonTextDone]}>
            {locationButtonLabel}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryButtonText}>{t('onboardingNext')}</Text>
      </Pressable>
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.step3Hero}>
        <Animated.View
          style={[styles.checkmarkCircle, { transform: [{ scale: checkScale }] }]}
        >
          <Ionicons name="checkmark" size={56} color="#fff" />
        </Animated.View>
        <Text style={styles.step3Title}>{t('onboardingDoneTitle')}</Text>
        <Text style={styles.stepSubtitle}>{t('onboardingDoneSubtitle')}</Text>
        <View style={[styles.featureList, { marginTop: 24 }]}>
          {[
            t('onboardingDoneFeature1'),
            t('onboardingDoneFeature2'),
            t('onboardingDoneFeature3'),
          ].map((line) => (
            <Text key={line} style={styles.featureLine}>{line}</Text>
          ))}
        </View>
      </View>

      <View style={styles.step3Buttons}>
        <View style={styles.goLiveHelper}>
          <Text style={styles.goLiveHelperText}>{t('onboardingGoLiveHelper')}</Text>
        </View>
        <Pressable
          style={[styles.primaryButton, finishing && styles.buttonBusy]}
          onPress={() => finishOnboarding(false)}
          disabled={finishing}
        >
          {finishing ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('onboardingFindRoom')}</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, finishing && styles.buttonBusy]}
          onPress={() => finishOnboarding(true)}
          disabled={finishing}
        >
          <Text style={styles.secondaryButtonText}>{t('onboardingGoLiveNow')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      default: return null;
    }
  };

  // ── LAYOUT ───────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar: back | dots | skip */}
      <View style={styles.topBar}>
        {step > 0 ? (
          <Pressable onPress={handleBack} style={styles.topBarSide} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.topBarSide} />
        )}

        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.dot, step === i && styles.dotActive]}
            />
          ))}
        </View>

        {[1, 2].includes(step) ? (
          <Pressable onPress={handleSkip} style={styles.topBarSide} hitSlop={12}>
            <Text style={styles.skipText}>{t('onboardingSkip')}</Text>
          </Pressable>
        ) : (
          <View style={styles.topBarSide} />
        )}
      </View>

      {/* Sliding step content — KeyboardAvoidingView lifts content above keyboard */}
      <KeyboardAvoidingView
        style={styles.slideContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          style={[styles.slideContainer, { transform: [{ translateX: slideX }] }]}
        >
          {renderCurrentStep()}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // Top bar
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    topBarSide: {
      width: 52,
      alignItems: 'flex-start',
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.borderSoft,
    },
    dotActive: {
      width: 22,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    skipText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'right',
      width: 52,
    },

    // Slide container
    slideContainer: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingBottom: 24,
    },

    // ── Step 0 ──
    step0Hero: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 48,
      paddingBottom: 40,
    },
    wordmark: {
      fontSize: 44,
      fontWeight: '900',
      color: colors.accent,
      letterSpacing: -1.5,
      marginBottom: 10,
    },
    tagline: {
      fontSize: 18,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 44,
    },
    featureList: {
      gap: 14,
      alignSelf: 'stretch',
    },
    featureLine: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 22,
    },

    // ── Shared buttons ──
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 20,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 17,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 12,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    secondaryButtonText: {
      color: colors.accent,
      fontSize: 17,
      fontWeight: '700',
    },
    buttonBusy: {
      opacity: 0.6,
    },

    // ── Step header (steps 1-2) ──
    stepHeader: {
      paddingTop: 8,
      paddingBottom: 24,
    },
    stepTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    stepSubtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    // ── Step 1 ──
    photoPicker: {
      width: 110,
      height: 110,
      borderRadius: 55,
      alignSelf: 'center',
      marginBottom: 24,
      overflow: 'hidden',
      backgroundColor: colors.panelElevated,
      borderWidth: 2,
      borderColor: colors.borderSoft,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoPreview: {
      width: 110,
      height: 110,
    },
    photoPlaceholder: {
      alignItems: 'center',
      gap: 6,
    },
    photoPlaceholderText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    photoOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.42)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fieldGroup: {
      marginBottom: 14,
    },
    textArea: {
      backgroundColor: colors.panelElevated,
      borderRadius: 12,
      padding: 14,
      color: colors.textPrimary,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    textInput: {
      backgroundColor: colors.panelElevated,
      borderRadius: 12,
      padding: 14,
      color: colors.textPrimary,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    charCount: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'right',
      marginTop: 4,
    },
    infoNote: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      backgroundColor: colors.panelSoft,
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    infoNoteText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    optionalHint: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 4,
    },

    // ── Step 2 ──
    permCard: {
      backgroundColor: colors.panel,
      borderRadius: 16,
      padding: 20,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: 8,
    },
    permCardTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    permCardSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    permButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    permButtonDone: {
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    permButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
    permButtonTextDone: {
      color: colors.textSecondary,
    },

    // ── Step 3 ──
    step3Hero: {
      flex: 1,
      alignItems: 'center',
      paddingTop: 32,
      paddingBottom: 24,
    },
    checkmarkCircle: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: '#4CAF50',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 28,
      shadowColor: '#4CAF50',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
      elevation: 10,
    },
    step3Title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    step3Buttons: {
      paddingBottom: 4,
    },
    goLiveHelper: {
      backgroundColor: colors.panelSoft,
      borderRadius: 14,
      padding: 16,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    goLiveHelperText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 21,
    },
    goLiveHelperBold: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
