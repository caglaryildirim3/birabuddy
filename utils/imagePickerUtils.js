import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

/** Shared image-library options — iCloud photos need network download on iOS. */
export const PROFILE_PHOTO_PICKER_OPTIONS = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
  copyToCacheDirectory: true,
  shouldDownloadFromNetwork: true,
};

/** No crop step — uses PHPicker on iOS, which works without full library permission. */
export const ONBOARDING_PHOTO_PICKER_OPTIONS = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.75,
  copyToCacheDirectory: true,
  shouldDownloadFromNetwork: true,
};

export function hasPhotoLibraryAccess(permission) {
  if (!permission) return false;
  if (permission.granted) return true;
  if (permission.accessPrivileges === 'limited' || permission.accessPrivileges === 'all') return true;
  // Android 13+ uses the system photo picker — no storage permission required.
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) return true;
  return false;
}

/** For flows that use allowsEditing (legacy picker). Returns true when access is available. */
export async function ensurePhotoLibraryPermission({ t, Alert }) {
  let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (hasPhotoLibraryAccess(permission)) return true;

  permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (hasPhotoLibraryAccess(permission)) return true;

  if (!permission.canAskAgain) {
    Alert.alert(t('error'), t('photoPermissionRequired'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('onboardingOpenSettings'), onPress: () => Linking.openSettings() },
    ]);
  } else {
    Alert.alert(t('error'), t('photoPermissionRequired'));
  }
  return false;
}
