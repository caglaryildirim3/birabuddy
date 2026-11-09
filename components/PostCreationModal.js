import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { selfieFlipStyle } from '../constants/selfieDisplay';
import DrinkPicker from './DrinkPicker';
import DualCameraCapture from './DualCameraCapture';
import { useTheme } from '../contexts/ThemeContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { auth } from '../firebase/firebaseConfig';
import {
  createPost,
  POST_VISIBILITY,
  TEXT_LIMIT,
  uploadPostPhoto,
  VENUE_LIMIT,
} from '../utils/postUtils';
import { translateDrinkType } from '../utils/drinkI18n';

export default function PostCreationModal({ visible, onClose, initialVenueTag = '' }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0;
  const [text, setText] = useState('');
  const [venueTag, setVenueTag] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [selfieUri, setSelfieUri] = useState(null);
  const [drinks, setDrinks] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mainShowsBack, setMainShowsBack] = useState(true);
  const [visibility, setVisibility] = useState(POST_VISIBILITY.PUBLIC);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && initialVenueTag) {
      setVenueTag(initialVenueTag);
    }
  }, [visible, initialVenueTag]);

  const resetForm = () => {
    setText('');
    setVenueTag('');
    setPhotoUri(null);
    setSelfieUri(null);
    setDrinks([]);
    setPickerVisible(false);
    setCameraOpen(false);
    setMainShowsBack(true);
    setVisibility(POST_VISIBILITY.PUBLIC);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const clearPhotos = () => {
    setPhotoUri(null);
    setSelfieUri(null);
    setMainShowsBack(true);
  };

  const dismissKeyboard = () => Keyboard.dismiss();

  const swapPhotoLayout = () => {
    dismissKeyboard();
    if (selfieUri) setMainShowsBack((prev) => !prev);
  };

  const handleTakePhoto = () => {
    Keyboard.dismiss();
    // If camera is already open, close it first so the old component fully
    // unmounts (releasing native resources) before we mount a new instance.
    if (cameraOpen) {
      setCameraOpen(false);
      setTimeout(() => setCameraOpen(true), 350);
    } else {
      setCameraOpen(true);
    }
  };

  const handleDualCapture = ({ backUri, frontUri }) => {
    setPhotoUri(backUri);
    setSelfieUri(frontUri);
    setMainShowsBack(true);
    setCameraOpen(false);
  };

  const canPost = Boolean(photoUri || text.trim());

  const handleSubmit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!canPost) return;

    setSubmitting(true);
    try {
      let photoURL = null;
      let selfiePhotoURL = null;
      const mainUri = mainShowsBack ? photoUri : selfieUri;
      const pipUri = mainShowsBack ? selfieUri : photoUri;
      if (mainUri) {
        photoURL = await uploadPostPhoto(uid, mainUri);
      }
      if (pipUri) {
        selfiePhotoURL = await uploadPostPhoto(uid, pipUri);
      }

      await createPost({
        uid,
        text,
        photoURL,
        selfiePhotoURL,
        venueTag: venueTag.trim() || null,
        drinks,
        visibility,
      });

      resetForm();
      onClose();
    } catch (error) {
      Alert.alert(t('error'), error.message || t('failedToCreatePost'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={cameraOpen ? 'fullScreen' : 'pageSheet'}
      onRequestClose={handleClose}
    >
      <View style={styles.modalRoot}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('shareAMemory')}</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={!canPost || submitting}
            style={[styles.headerButton, (!canPost || submitting) && styles.disabled]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.postText, !canPost && styles.postTextDisabled]}>{t('post')}</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={[styles.photoSection, keyboardOpen && styles.photoSectionCompact]}>
            {photoUri ? (
              <View style={styles.photoPreview}>
                <Pressable
                  style={styles.photoPressable}
                  onPress={swapPhotoLayout}
                  disabled={!selfieUri}
                >
                  <Image
                    source={{ uri: mainShowsBack ? photoUri : selfieUri }}
                    style={[styles.photo, !mainShowsBack && selfieFlipStyle]}
                    contentFit="cover"
                  />
                </Pressable>
                {selfieUri ? (
                  <Pressable style={styles.selfiePreview} onPress={swapPhotoLayout}>
                    <Image
                      source={{ uri: mainShowsBack ? selfieUri : photoUri }}
                      style={[styles.selfieImage, mainShowsBack && selfieFlipStyle]}
                      contentFit="cover"
                    />
                  </Pressable>
                ) : null}
                <Pressable style={styles.removePhoto} onPress={clearPhotos}>
                  <Ionicons name="close-circle" size={28} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.addPhotoButton} onPress={handleTakePhoto} hitSlop={8}>
                <Ionicons name="camera-outline" size={32} color={colors.textPrimary} />
                <Text style={styles.addPhotoText}>{t('takePhoto')}</Text>
              </Pressable>
            )}
          </View>

          <Pressable onPress={dismissKeyboard} style={styles.metaSection}>
          <Text style={styles.fieldLabel}>{t('postVisibility')}</Text>
          <View style={styles.visibilityRow}>
            <Pressable
              style={[
                styles.visibilityOption,
                visibility === POST_VISIBILITY.PUBLIC && styles.visibilityOptionActive,
              ]}
              onPress={() => setVisibility(POST_VISIBILITY.PUBLIC)}
            >
              <Ionicons
                name="earth-outline"
                size={16}
                color={
                  visibility === POST_VISIBILITY.PUBLIC
                    ? colors.onAccent
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.visibilityOptionText,
                  visibility === POST_VISIBILITY.PUBLIC && styles.visibilityOptionTextActive,
                ]}
              >
                {t('postVisibilityPublic')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.visibilityOption,
                visibility === POST_VISIBILITY.FRIENDS && styles.visibilityOptionActive,
              ]}
              onPress={() => setVisibility(POST_VISIBILITY.FRIENDS)}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color={
                  visibility === POST_VISIBILITY.FRIENDS
                    ? colors.onAccent
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.visibilityOptionText,
                  visibility === POST_VISIBILITY.FRIENDS && styles.visibilityOptionTextActive,
                ]}
              >
                {t('postVisibilityFriends')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.visibilityHint}>
            {visibility === POST_VISIBILITY.PUBLIC
              ? t('postVisibilityPublicHint')
              : t('postVisibilityFriendsHint')}
          </Text>

          <Text style={styles.fieldLabel}>{t('venueTagOptional')}</Text>
          <TextInput
            style={styles.venueInput}
            placeholder={t('venueTagPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={venueTag}
            onChangeText={setVenueTag}
            maxLength={VENUE_LIMIT}
          />
          <Text style={styles.counter}>
            {venueTag.length}/{VENUE_LIMIT}
          </Text>

          <View style={styles.drinksHeader}>
            <Text style={styles.drinksLabel}>🍺 {t('whatDidYouDrink')}</Text>
            <Pressable style={styles.addDrinkButton} onPress={() => setPickerVisible(true)}>
              <Text style={styles.addDrinkButtonText}>{t('addDrink')}</Text>
            </Pressable>
          </View>

          {drinks.length > 0 && (
            <View style={styles.drinkPills}>
              {drinks.map((drink, index) => (
                <View key={`${drink.category}-${drink.type}-${index}`} style={styles.drinkPill}>
                  <Text style={styles.drinkPillText}>
                    {drink.emoji} {translateDrinkType(t, drink.type)} ×{drink.quantity}
                  </Text>
                  <Pressable
                    style={styles.drinkPillRemove}
                    onPress={() => setDrinks((prev) => prev.filter((_, i) => i !== index))}
                    hitSlop={8}
                  >
                    <Text style={styles.drinkPillRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          </Pressable>

          <View style={[styles.captionBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
            <TextInput
              style={styles.textInput}
              placeholder={t('whatsOnYourMind')}
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={TEXT_LIMIT}
            />
            <Text style={styles.counter}>
              {text.length}/{TEXT_LIMIT}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>

      <DrinkPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onAdd={(drink) => setDrinks((prev) => [...prev, drink])}
      />

      {cameraOpen ? (
        <DualCameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={handleDualCapture}
        />
      ) : null}
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    modalRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    headerButton: {
      minWidth: 60,
      alignItems: 'center',
    },
    disabled: {
      opacity: 0.5,
    },
    cancelText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
    title: {
      fontSize: 17,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    postText: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: 'bold',
    },
    postTextDisabled: {
      color: colors.textMuted,
    },
    body: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    photoSection: {
      flex: 1,
      minHeight: 160,
      marginBottom: 8,
    },
    photoSectionCompact: {
      flex: 0.45,
      minHeight: 100,
    },
    metaSection: {
      flexShrink: 0,
    },
    captionBar: {
      flexShrink: 0,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.background,
      paddingTop: 6,
    },
    textInput: {
      fontSize: 15,
      color: colors.textPrimary,
      minHeight: 36,
      maxHeight: 56,
      textAlignVertical: 'top',
      backgroundColor: colors.panelElevated,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    counter: {
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'right',
      marginTop: 2,
      marginBottom: 4,
    },
    addPhotoButton: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.panelElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    addPhotoText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    photoPreview: {
      flex: 1,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
    },
    photoPressable: {
      flex: 1,
    },
    photo: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
    },
    selfiePreview: {
      position: 'absolute',
      top: 12,
      left: 12,
      width: 72,
      height: 96,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: '#000',
      overflow: 'hidden',
      backgroundColor: colors.panelElevated,
    },
    selfieImage: {
      width: '100%',
      height: '100%',
    },
    removePhoto: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 4,
    },
    visibilityRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 4,
    },
    visibilityOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    visibilityOptionActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    visibilityOptionText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    visibilityOptionTextActive: {
      color: colors.onAccent,
    },
    visibilityHint: {
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 15,
      marginBottom: 4,
    },
    venueInput: {
      backgroundColor: colors.panelElevated,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    drinksHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 0,
      marginBottom: 4,
    },
    drinksLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    addDrinkButton: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    addDrinkButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
    drinkPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 0,
    },
    drinkPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.panelSoft,
      borderRadius: 20,
      paddingVertical: 6,
      paddingLeft: 10,
      paddingRight: 6,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: 6,
    },
    drinkPillText: {
      fontSize: 13,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    drinkPillRemove: {
      padding: 2,
    },
    drinkPillRemoveText: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: 'bold',
    },
  });
