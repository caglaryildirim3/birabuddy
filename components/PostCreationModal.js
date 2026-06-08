import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DrinkPicker from './DrinkPicker';
import BeerColors from '../constants/BeerColors';
import { auth } from '../firebase/firebaseConfig';
import { createPost, TEXT_LIMIT, uploadPostPhoto, VENUE_LIMIT } from '../utils/postUtils';

export default function PostCreationModal({ visible, onClose }) {
  const [text, setText] = useState('');
  const [venueTag, setVenueTag] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [drinks, setDrinks] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setText('');
    setVenueTag('');
    setPhotoUri(null);
    setDrinks([]);
    setPickerVisible(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Photo library access is needed.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      let photoURL = null;
      if (photoUri) {
        photoURL = await uploadPostPhoto(uid, photoUri);
      }

      await createPost({
        uid,
        text,
        photoURL,
        venueTag: venueTag.trim() || null,
        drinks,
      });

      resetForm();
      onClose();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Share a memory</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={!text.trim() || submitting}
            style={[styles.headerButton, (!text.trim() || submitting) && styles.disabled]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={BeerColors.accent} />
            ) : (
              <Text style={[styles.postText, !text.trim() && styles.postTextDisabled]}>Post</Text>
            )}
          </Pressable>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.textInput}
            placeholder="What's on your mind?"
            placeholderTextColor={BeerColors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={TEXT_LIMIT}
            autoFocus
          />
          <Text style={styles.counter}>
            {text.length}/{TEXT_LIMIT}
          </Text>

          {photoUri ? (
            <View style={styles.photoPreview}>
              <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
              <Pressable style={styles.removePhoto} onPress={() => setPhotoUri(null)}>
                <Ionicons name="close-circle" size={28} color={BeerColors.danger} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.addPhotoButton} onPress={handlePickPhoto}>
              <Ionicons name="image-outline" size={22} color={BeerColors.textPrimary} />
              <Text style={styles.addPhotoText}>Add photo</Text>
            </Pressable>
          )}

          <Text style={styles.fieldLabel}>Venue tag (optional)</Text>
          <TextInput
            style={styles.venueInput}
            placeholder="e.g. Bomonti Pub"
            placeholderTextColor={BeerColors.textMuted}
            value={venueTag}
            onChangeText={setVenueTag}
            maxLength={VENUE_LIMIT}
          />
          <Text style={styles.counter}>
            {venueTag.length}/{VENUE_LIMIT}
          </Text>

          <View style={styles.drinksHeader}>
            <Text style={styles.drinksLabel}>🍺 What did you drink?</Text>
            <Pressable style={styles.addDrinkButton} onPress={() => setPickerVisible(true)}>
              <Text style={styles.addDrinkButtonText}>+ Add drink</Text>
            </Pressable>
          </View>

          {drinks.length > 0 && (
            <View style={styles.drinkPills}>
              {drinks.map((drink, index) => (
                <View key={`${drink.category}-${drink.type}-${index}`} style={styles.drinkPill}>
                  <Text style={styles.drinkPillText}>
                    {drink.emoji} {drink.type} ×{drink.quantity}
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
        </ScrollView>
      </View>

      <DrinkPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onAdd={(drink) => setDrinks((prev) => [...prev, drink])}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BeerColors.borderSoft,
  },
  headerButton: {
    minWidth: 60,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  cancelText: {
    color: BeerColors.textSecondary,
    fontSize: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  postText: {
    color: BeerColors.accent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  postTextDisabled: {
    color: BeerColors.textMuted,
  },
  body: {
    flex: 1,
    padding: 20,
  },
  textInput: {
    fontSize: 18,
    color: BeerColors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: 12,
    color: BeerColors.textMuted,
    textAlign: 'right',
    marginBottom: 16,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BeerColors.panelElevated,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    marginBottom: 20,
  },
  addPhotoText: {
    color: BeerColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  photoPreview: {
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  removePhoto: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: BeerColors.textSecondary,
    marginBottom: 8,
  },
  venueInput: {
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: BeerColors.textPrimary,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  drinksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  drinksLabel: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    fontWeight: '500',
  },
  addDrinkButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BeerColors.accent,
  },
  addDrinkButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: BeerColors.accent,
  },
  drinkPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  drinkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BeerColors.panelSoft,
    borderRadius: 20,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    gap: 6,
  },
  drinkPillText: {
    fontSize: 14,
    color: BeerColors.textPrimary,
    fontWeight: '500',
  },
  drinkPillRemove: {
    padding: 2,
  },
  drinkPillRemoveText: {
    fontSize: 14,
    color: BeerColors.textMuted,
    fontWeight: 'bold',
  },
});
