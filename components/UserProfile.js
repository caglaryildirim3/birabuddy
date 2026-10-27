import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  View, 
  Text, 
  Pressable, 
  StyleSheet, 
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Alert,
  Modal,
  Platform,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { useTheme } from '../contexts/ThemeContext';
import { blockUser } from '../utils/blockUtils';
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendshipDocId,
  getFriendshipStatus,
  sendFriendRequest,
  unfriend,
} from '../utils/friendUtils';
import LiveStatusDot from './LiveStatusDot';
import { isOutTonight } from '../utils/outTonightUtils';
import { submitUserReport } from '../utils/reportUtils';
import { calculateDrinkStats } from '../utils/drinkStatsUtils';
import { formatUniversityDisplay } from '../utils/authUtils';
import { isDeletedUser } from '../utils/deletedUserUtils';
import { loadProfileConnectionStats } from '../utils/friendSuggestionUtils';
import { clearProfilePhotoCache, resolveProfilePhotoUrls } from '../utils/photoUtils';

export default function UserProfile({ uid, onClose, previewMode = false }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({ roomsCreated: 0 });
  const [friendStatus, setFriendStatus] = useState('none');
  const [friendDocId, setFriendDocId] = useState(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [drinkHistory, setDrinkHistory] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [safetyActionLoading, setSafetyActionLoading] = useState(false);
  const [connectionStats, setConnectionStats] = useState([]);
  const [resolvedPhotos, setResolvedPhotos] = useState([]);
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid ?? null);
  const scrollRef = useRef(null);
  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);

  const handleDismiss = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const scrollNativeGesture = useMemo(() => Gesture.Native(), []);
  const dismissGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-9999, 12])
    .failOffsetX([-24, 24])
    .simultaneousWithExternalGesture(scrollNativeGesture)
    .onUpdate((event) => {
      if (scrollOffset.value <= 0 && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (translateY.value > 90 || event.velocityY > 650) {
        runOnJS(handleDismiss)();
        return;
      }
      translateY.value = withSpring(0, { damping: 20, stiffness: 280 });
    }), [handleDismiss, scrollNativeGesture, scrollOffset, translateY]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const router = useRouter();
  const isSelf = currentUid && uid === currentUid;
  const showPublicView = previewMode && isSelf;
  const isDeletedProfile = isDeletedUser(userProfile);

  useEffect(() => {
    if (!uid) return undefined;

    setLoading(true);
    setPhotoIndex(0);

    const userRef = doc(db, 'users', uid);
    const unsub = onSnapshot(
      userRef,
      (userSnap) => {
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUserProfile({
            ...userData,
            university: formatUniversityDisplay(userData.university || ''),
          });
        } else {
          setUserProfile({ name: 'User not found' });
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching user profile:', error);
        Alert.alert(t('error'), t('failedToLoadUserProfile'));
        setLoading(false);
      }
    );

    const fetchRoomStats = async () => {
      try {
        const roomsQuery = query(collection(db, 'rooms'), where('createdBy', '==', uid));
        const roomsSnap = await getDocs(roomsQuery);
        setUserStats({ roomsCreated: roomsSnap.docs.length });
      } catch (error) {
        console.error('Error fetching room stats:', error);
      }
    };

    fetchRoomStats();

    return unsub;
  }, [uid]);

  const photosSignature = JSON.stringify(userProfile?.photos ?? []);

  useEffect(() => {
    if (!uid || !userProfile) {
      setResolvedPhotos([]);
      return undefined;
    }

    let cancelled = false;
    clearProfilePhotoCache(uid);
    setPhotoIndex(0);
    resolveProfilePhotoUrls(uid, userProfile.photos)
      .then((urls) => {
        if (!cancelled) setResolvedPhotos(urls);
      })
      .catch(() => {
        if (!cancelled) setResolvedPhotos([]);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, photosSignature, userProfile]);

  const loadFriendStatus = useCallback(async () => {
    if (!currentUid || !uid || currentUid === uid) {
      setFriendStatus('none');
      setFriendDocId(null);
      return;
    }
    const status = await getFriendshipStatus(currentUid, uid);
    setFriendStatus(status);
    if (status !== 'none') {
      setFriendDocId(getFriendshipDocId(currentUid, uid));
    } else {
      setFriendDocId(null);
    }
  }, [currentUid, uid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    loadFriendStatus();
  }, [loadFriendStatus]);

  useEffect(() => {
    if (!currentUid || !uid || isSelf || previewMode) {
      setConnectionStats([]);
      return undefined;
    }

    let cancelled = false;

    const loadConnectionStats = async () => {
      try {
        const stats = await loadProfileConnectionStats(currentUid, uid, {
          locale: i18n.language,
          t,
        });
        if (!cancelled) setConnectionStats(stats);
      } catch (error) {
        console.error('Failed to load profile connection stats:', error);
        if (!cancelled) setConnectionStats([]);
      }
    };

    loadConnectionStats();

    return () => {
      cancelled = true;
    };
  }, [currentUid, uid, isSelf, previewMode, i18n.language, t]);

  useEffect(() => {
    const fetchDrinkHistory = async () => {
      if ((isSelf && !previewMode) || friendStatus !== 'friends' || !uid) {
        setDrinkHistory(null);
        return;
      }

      try {
        const checkQuery = query(
          collection(db, 'posts'),
          where('userId', '==', uid),
          limit(1)
        );
        const checkSnap = await getDocs(checkQuery);
        if (checkSnap.empty) {
          setDrinkHistory(null);
          return;
        }

        const postsQuery = query(collection(db, 'posts'), where('userId', '==', uid));
        const postsSnap = await getDocs(postsQuery);
        const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const stats = calculateDrinkStats(posts);
        if (stats.totalDrinks === 0) {
          setDrinkHistory(null);
          return;
        }
        setDrinkHistory(stats);
      } catch (error) {
        setDrinkHistory(null);
      }
    };

    fetchDrinkHistory();
  }, [uid, friendStatus, isSelf, previewMode]);

  const handleAddFriend = async () => {
    if (!currentUid) return;
    setFriendActionLoading(true);
    try {
      const docId = await sendFriendRequest(currentUid, uid);
      setFriendDocId(docId);
      setFriendStatus('pending_sent');
    } catch (error) {
      Alert.alert(t('error'), error.message || t('failedToSendFriendRequest'));
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleCancelRequest = () => {
    Alert.alert(t('cancelFriendRequest'), t('cancelFriendRequestConfirm'), [
      { text: t('keep'), style: 'cancel' },
      {
        text: t('cancelRequest'),
        style: 'destructive',
        onPress: async () => {
          if (!friendDocId) return;
          setFriendActionLoading(true);
          try {
            await declineFriendRequest(friendDocId);
            setFriendStatus('none');
            setFriendDocId(null);
          } catch (error) {
            Alert.alert(t('error'), t('failedToCancelFriendRequest'));
          } finally {
            setFriendActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleAccept = async () => {
    if (!friendDocId) return;
    setFriendActionLoading(true);
    try {
      await acceptFriendRequest(friendDocId);
      setFriendStatus('friends');
    } catch (error) {
      Alert.alert(t('error'), t('failedToAcceptRequest'));
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!friendDocId) return;
    setFriendActionLoading(true);
    try {
      await declineFriendRequest(friendDocId);
      setFriendStatus('none');
      setFriendDocId(null);
    } catch (error) {
      Alert.alert(t('error'), t('failedToDeclineFriendRequest'));
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleUnfriend = () => {
    Alert.alert(t('unfriend'), t('unfriendConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unfriendAction'),
        style: 'destructive',
        onPress: async () => {
          if (!friendDocId) return;
          setFriendActionLoading(true);
          try {
            await unfriend(friendDocId);
            setFriendStatus('none');
            setFriendDocId(null);
          } catch (error) {
            Alert.alert(t('error'), t('failedToUnfriend'));
          } finally {
            setFriendActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleOpenChat = () => {
    onClose?.();
    router.push(`/friend-chat/${uid}`);
  };

  const renderFriendActions = () => {
    if (isSelf || previewMode || !currentUid) return null;

    if (friendActionLoading) {
      return (
        <View style={styles.friendActionSection}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }

    if (friendStatus === 'none') {
      return (
        <View style={styles.friendActionSection}>
          <Pressable style={styles.addFriendButton} onPress={handleAddFriend}>
            <Text style={styles.addFriendButtonText}>{t('addFriend')}</Text>
          </Pressable>
        </View>
      );
    }

    if (friendStatus === 'pending_sent') {
      return (
        <View style={styles.friendActionSection}>
          <Pressable style={styles.pendingSentButton} onPress={handleCancelRequest}>
            <Text style={styles.pendingSentButtonText}>{t('requestSent')}</Text>
          </Pressable>
        </View>
      );
    }

    if (friendStatus === 'pending_received') {
      return (
        <View style={styles.friendActionSection}>
          <View style={styles.friendActionRow}>
            <Pressable style={styles.acceptButton} onPress={handleAccept}>
              <Text style={styles.acceptButtonText}>{t('accept')}</Text>
            </Pressable>
            <Pressable style={styles.declineButton} onPress={handleDecline}>
              <Text style={styles.declineButtonText}>{t('decline')}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (friendStatus === 'friends') {
      return (
        <View style={styles.friendActionSection}>
          <View style={styles.friendActionRow}>
            <Pressable style={styles.messageButton} onPress={handleOpenChat}>
              <Text style={styles.messageButtonText}>{t('messageButton')}</Text>
            </Pressable>
            <Pressable style={styles.friendsButton} onPress={handleUnfriend}>
              <Text style={styles.friendsButtonText}>{t('friendsButton')}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return null;
  };

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
        Alert.alert(t('error'), t('couldNotOpenInstagram'));
      }
    }
  };

  const handleOpenReport = () => {
    setReportReason('');
    setReportModalVisible(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim() || !currentUid || !uid) {
      Alert.alert(t('error'), t('reportReasonRequired'));
      return;
    }

    setSafetyActionLoading(true);
    try {
      await submitUserReport({
        uid,
        userProfile,
        reporterUserId: currentUid,
        reporterEmail: auth.currentUser?.email,
        reason: reportReason,
      });
      setReportModalVisible(false);
      setReportReason('');
      Alert.alert(t('reportSubmittedTitle'), t('reportSubmittedMessage'));
    } catch (error) {
      Alert.alert(t('error'), t('failedToSubmitReport'));
    } finally {
      setSafetyActionLoading(false);
    }
  };

  const handleBlockUser = () => {
    if (!currentUid || !uid) return;

    const blockTargetName =
      userProfile?.name || userProfile?.nickname || userProfile?.instagram || 'this user';

    Alert.alert(
      t('blockUser'),
      t('blockUserConfirm', { name: blockTargetName }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('blockAction'),
          style: 'destructive',
          onPress: async () => {
            setSafetyActionLoading(true);
            try {
              await blockUser(currentUid, uid);
              setFriendStatus('none');
              setFriendDocId(null);
              onClose?.();
            } catch (error) {
              Alert.alert(t('error'), t('failedToBlockUser'));
            } finally {
              setSafetyActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const photos = resolvedPhotos;
  const displayName = userProfile?.name || userProfile?.nickname || userProfile?.instagram || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const isLive = userProfile ? isOutTonight(userProfile) : false;
  const vibes = Array.isArray(userProfile?.vibes) ? userProfile.vibes : [];

  const handlePhotoTap = (evt) => {
    if (photos.length <= 1) return;
    const x = evt.nativeEvent.locationX;
    const half = SCREEN_WIDTH / 2;
    if (x > half) {
      setPhotoIndex((i) => Math.min(i + 1, photos.length - 1));
    } else {
      setPhotoIndex((i) => Math.max(i - 1, 0));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.floatingClose} onPress={onClose}>
          <Text style={styles.floatingCloseText}>✕</Text>
        </Pressable>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!userProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.floatingClose} onPress={onClose}>
          <Text style={styles.floatingCloseText}>✕</Text>
        </Pressable>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isDeletedProfile && !isSelf) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.floatingClose} onPress={onClose}>
          <Text style={styles.floatingCloseText}>✕</Text>
        </Pressable>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{t('deletedUser')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureDetector gesture={dismissGesture}>
      <Animated.View style={[styles.dismissContainer, animatedContainerStyle]}>
        <SafeAreaView style={styles.container}>
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandleBar} />
          </View>
          <GestureDetector gesture={scrollNativeGesture}>
            <Animated.ScrollView
              ref={scrollRef}
              style={styles.scrollView}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              bounces
            >
        {showPublicView ? (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerText}>How others see your profile</Text>
          </View>
        ) : null}

        {/* ── PHOTO HERO ── */}
        <Pressable onPress={handlePhotoTap} style={styles.photoHero}>
          {photos.length > 0 ? (
            <Image
              source={{ uri: photos[photoIndex] }}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={styles.heroInitial}>{initial}</Text>
            </View>
          )}


          {/* Close button */}
          <Pressable style={styles.floatingClose} onPress={onClose} hitSlop={8}>
            <Text style={styles.floatingCloseText}>✕</Text>
          </Pressable>

          {/* Dot indicators */}
          {photos.length > 1 ? (
            <View style={styles.dotRow}>
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === photoIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}

          {/* Name + live dot overlaid bottom */}
          <View style={styles.heroBottom}>
            <View style={styles.heroNameRow}>
              {(friendStatus === 'friends' || (isSelf && !previewMode)) ? (
                <LiveStatusDot isLive={isLive} size={10} style={{ marginRight: 6 }} />
              ) : null}
              <Text style={styles.heroName}>{displayName}</Text>
              {userProfile.age ? (
                <View style={styles.agePill}>
                  <Text style={styles.agePillText}>{userProfile.age}</Text>
                </View>
              ) : null}
            </View>
            {userProfile.instagram ? (
              <Pressable onPress={openInstagram}>
                <Text style={styles.heroInstagram}>@{userProfile.instagram}</Text>
              </Pressable>
            ) : null}
            {userProfile.university ? (
              <Text style={styles.heroUniversity}>{userProfile.university}</Text>
            ) : null}
          </View>
        </Pressable>

        {!isSelf && !previewMode && connectionStats.length > 0 ? (
          <View style={styles.connectionStatsSection}>
            {connectionStats.map((stat) => (
              <Text key={stat} style={styles.connectionStatText}>
                {stat}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── BIO ── */}
        {userProfile.bio?.trim() ? (
          <View style={styles.bioSection}>
            <Text style={styles.bioTitle}>Bio</Text>
            <Text style={styles.bioText}>{userProfile.bio.trim()}</Text>
          </View>
        ) : null}

        {/* ── OUT TONIGHT BANNER ── */}
        {isLive ? (
          <View style={styles.outTonightBanner}>
            <Text style={styles.outTonightBannerTitle}>🟢 {t('live')}</Text>
            {userProfile.outTonightNote ? (
              <Text style={styles.outTonightBannerNote}>{userProfile.outTonightNote}</Text>
            ) : null}
          </View>
        ) : null}

        {/* ── FRIEND ACTIONS ── */}
        {renderFriendActions()}

        {/* ── INFO ROWS ── */}
        <View style={styles.sectionCard}>
          {userProfile.major ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowIcon}>🎓</Text>
              <Text style={styles.infoRowValue}>{userProfile.major}</Text>
            </View>
          ) : null}
          {userProfile.favDrink ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowIcon}>🍻</Text>
              <Text style={styles.infoRowValue}>{userProfile.favDrink}</Text>
            </View>
          ) : null}
          {userProfile.goToBar ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowIcon}>📍</Text>
              <Text style={styles.infoRowValue}>{userProfile.goToBar}</Text>
            </View>
          ) : null}
          {userStats.roomsCreated > 0 ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowIcon}>🍺</Text>
              <Text style={styles.infoRowValue}>{userStats.roomsCreated} rooms created</Text>
            </View>
          ) : null}
        </View>

        {/* ── VIBES ── */}
        {vibes.length > 0 ? (
          <View style={styles.vibeGrid}>
            {vibes.map((vibe) => (
              <View key={vibe} style={styles.vibePill}>
                <Text style={styles.vibePillText}>{vibe}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── DRINK HISTORY (friends only) ── */}
        {drinkHistory ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Drink history</Text>
            <View style={styles.drinkRow}>
              <View style={styles.drinkStat}>
                <Text style={styles.drinkStatValue}>{drinkHistory.totalNightsOut}</Text>
                <Text style={styles.drinkStatLabel}>nights out</Text>
              </View>
              <View style={styles.drinkStat}>
                <Text style={styles.drinkStatValue}>{drinkHistory.totalDrinks}</Text>
                <Text style={styles.drinkStatLabel}>drinks total</Text>
              </View>
              {drinkHistory.topDrink ? (
                <View style={styles.drinkStat}>
                  <Text style={styles.drinkStatValue}>
                    {drinkHistory.topDrink.emoji}
                  </Text>
                  <Text style={styles.drinkStatLabel} numberOfLines={1}>
                    {drinkHistory.topDrink.type}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {!isSelf && !previewMode && currentUid ? (
          <View style={styles.safetySection}>
            <Pressable
              style={styles.safetyButton}
              onPress={handleOpenReport}
              disabled={safetyActionLoading}
            >
              <Text style={styles.safetyButtonText}>Report user</Text>
            </Pressable>
            <Pressable
              style={[styles.safetyButton, styles.blockButton]}
              onPress={handleBlockUser}
              disabled={safetyActionLoading}
            >
              <Text style={[styles.safetyButtonText, styles.blockButtonText]}>Block user</Text>
            </Pressable>
          </View>
        ) : null}
            </Animated.ScrollView>
          </GestureDetector>

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.reportModalOverlay}
          >
            <TouchableWithoutFeedback>
              <View style={styles.reportModalContainer}>
                <Text style={styles.reportModalTitle}>Report user</Text>
                <Text style={styles.reportModalSubtitle}>
                  Reporting: {displayName}
                </Text>
                <TextInput
                  style={styles.reportReasonInput}
                  placeholder="Describe the issue..."
                  placeholderTextColor={colors.textMuted}
                  value={reportReason}
                  onChangeText={setReportReason}
                  multiline
                  maxLength={500}
                  blurOnSubmit
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                <View style={styles.reportModalButtons}>
                  <Pressable
                    style={styles.reportCancelButton}
                    onPress={() => {
                      setReportModalVisible(false);
                      setReportReason('');
                    }}
                  >
                    <Text style={styles.reportCancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.reportSubmitButton,
                      (!reportReason.trim() || safetyActionLoading) && styles.reportSubmitButtonDisabled,
                    ]}
                    onPress={submitReport}
                    disabled={!reportReason.trim() || safetyActionLoading}
                  >
                    <Text style={styles.reportSubmitButtonText}>Submit</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

        </SafeAreaView>
      </Animated.View>
    </GestureDetector>
  );
}

const PHOTO_HEIGHT = 420;

const createStyles = (colors) => StyleSheet.create({
  dismissContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dragHandleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  dragHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border ?? '#ccc',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 48,
  },

  // ── LOADING / ERROR ──
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
  },

  previewBanner: {
    backgroundColor: colors.panelSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  previewBannerText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── PHOTO HERO ──
  photoHero: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
    backgroundColor: colors.panelElevated,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
  },
  heroFallback: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInitial: {
    fontSize: 96,
    fontWeight: 'bold',
    color: colors.onAccent,
  },
  floatingClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  floatingCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  dotRow: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },
  heroBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 20,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  heroName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  agePill: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  agePillText: {
    color: colors.onAccent,
    fontWeight: 'bold',
    fontSize: 13,
  },
  heroInstagram: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  heroUniversity: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  connectionStatsSection: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 4,
  },
  connectionStatText: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },

  // ── BIO ──
  bioSection: {
    backgroundColor: colors.panelElevated,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  bioTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bioText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // ── OUT TONIGHT ──
  outTonightBanner: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.35)',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  outTonightBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  outTonightBannerNote: {
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 4,
  },

  // ── FRIEND ACTIONS ──
  friendActionSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  friendActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addFriendButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addFriendButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pendingSentButton: {
    flex: 1,
    backgroundColor: colors.panelElevated,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    opacity: 0.7,
  },
  pendingSentButtonText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  declineButton: {
    flex: 1,
    backgroundColor: colors.panelElevated,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  declineButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  messageButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  messageButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  friendsButton: {
    flex: 1,
    backgroundColor: colors.panelSoft,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  friendsButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ── SECTION CARDS ──
  sectionCard: {
    backgroundColor: colors.panelElevated,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  sectionCardText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  infoRowIcon: {
    fontSize: 17,
    width: 24,
    textAlign: 'center',
  },
  infoRowValue: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },

  // ── VIBES ──
  vibeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  vibePill: {
    backgroundColor: colors.panelSoft,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  vibePillText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── DRINK HISTORY ──
  drinkRow: {
    flexDirection: 'row',
    gap: 10,
  },
  drinkStat: {
    flex: 1,
    alignItems: 'center',
  },
  drinkStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.accent,
    marginBottom: 4,
  },
  drinkStatLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // ── SAFETY ──
  safetySection: {
    marginHorizontal: 16,
    marginTop: 24,
    gap: 10,
  },
  safetyButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.panelElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  safetyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  blockButton: {
    borderColor: 'rgba(229, 57, 53, 0.35)',
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
  },
  blockButtonText: {
    color: colors.danger,
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayHeavy,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reportModalContainer: {
    backgroundColor: colors.panel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  reportModalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  reportModalSubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 16,
  },
  reportReasonInput: {
    backgroundColor: colors.panelElevated,
    borderRadius: 12,
    padding: 16,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    marginBottom: 20,
  },
  reportModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  reportCancelButton: {
    flex: 1,
    backgroundColor: colors.panelElevated,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  reportCancelButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  reportSubmitButton: {
    flex: 1,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportSubmitButtonDisabled: {
    opacity: 0.5,
  },
  reportSubmitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});