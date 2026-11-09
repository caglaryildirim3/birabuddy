import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform } from 'react-native';
import Share from 'react-native-share';

const FACEBOOK_APP_ID = Constants.expoConfig?.extra?.facebookAppId || '';

async function deleteFileSilently(filePath) {
  try {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  } catch {
    // cleanup failure is non-fatal
  }
}

function toFileUri(filePath) {
  if (!filePath) return filePath;
  return filePath.startsWith('file://') ? filePath : `file://${filePath}`;
}

async function isInstagramInstalled() {
  const scheme = Platform.OS === 'ios' ? 'instagram-stories://share' : 'instagram://app';
  return Linking.canOpenURL(scheme);
}

async function shareViaShareSheet(filePath) {
  const fileUri = toFileUri(filePath);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'image/png',
    dialogTitle: 'Share to Instagram Stories',
  });
}

async function shareViaInstagramStories(filePath) {
  const fileUri = toFileUri(filePath);

  if (Platform.OS === 'ios') {
    if (!FACEBOOK_APP_ID) {
      // iOS Stories requires a Meta/Facebook App ID — fall back to share sheet
      await shareViaShareSheet(filePath);
      return;
    }

    await Share.shareSingle({
      social: Share.Social.INSTAGRAM_STORIES,
      appId: FACEBOOK_APP_ID,
      backgroundImage: fileUri,
      backgroundTopColor: '#0a0a0a',
      backgroundBottomColor: '#0a0a0a',
    });
    return;
  }

  // Android: react-native-share opens Instagram directly when available
  try {
    await Share.shareSingle({
      social: Share.Social.INSTAGRAM_STORIES,
      backgroundImage: fileUri,
      backgroundTopColor: '#0a0a0a',
      backgroundBottomColor: '#0a0a0a',
    });
  } catch {
    await shareViaShareSheet(filePath);
  }
}

export async function shareToInstagramStories(viewShotRef) {
  let filePath;

  try {
    if (!viewShotRef?.current?.capture) {
      throw new Error('Story card is not ready');
    }

    // Brief pause so off-screen StoryCard (and remote photo) can finish layout
    await new Promise((resolve) => setTimeout(resolve, 400));

    filePath = await viewShotRef.current.capture();

    if (!(await isInstagramInstalled())) {
      await deleteFileSilently(filePath);
      Alert.alert('Instagram not found', 'Instagram is not installed on this device.');
      return;
    }

    await shareViaInstagramStories(filePath);
    await deleteFileSilently(filePath);
  } catch (error) {
    if (filePath) await deleteFileSilently(filePath);

    const message = error?.message || '';
    if (message.includes('User did not share') || message.includes('CANCELLED')) {
      return;
    }

    // Last resort: system share sheet with the captured image
    try {
      if (filePath) {
        await shareViaShareSheet(filePath);
        await deleteFileSilently(filePath);
        return;
      }
    } catch {
      // fall through to alert below
    }

    Alert.alert('Could not share', "Couldn't share to Instagram. Try again.");
  }
}
