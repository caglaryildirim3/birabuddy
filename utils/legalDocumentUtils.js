import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

const LEGAL_DOCUMENT_ASSETS = {
  'privacy-en': require('../assets/legal/privacy-en.html'),
  'privacy-tr': require('../assets/legal/privacy-tr.html'),
  'terms-en': require('../assets/legal/terms-en.html'),
  'terms-tr': require('../assets/legal/terms-tr.html'),
};

export function getPrivacyDocumentPath(language) {
  return language === 'tr' ? 'privacy-tr' : 'privacy-en';
}

export function getTermsDocumentPath(language) {
  return language === 'tr' ? 'terms-tr' : 'terms-en';
}

export async function resolveLegalDocumentUri(documentPath) {
  if (!documentPath || !LEGAL_DOCUMENT_ASSETS[documentPath]) {
    return null;
  }

  if (Platform.OS === 'android') {
    return `file:///android_asset/legal/${documentPath}.html`;
  }

  const asset = Asset.fromModule(LEGAL_DOCUMENT_ASSETS[documentPath]);
  await asset.downloadAsync();
  return asset.localUri || asset.uri;
}
