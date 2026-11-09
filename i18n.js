import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import tr from './locales/tr.json';

export const LANGUAGE_STORAGE_KEY = 'birabuddy_language';

export async function setAppLanguage(lng) {
  if (lng !== 'en' && lng !== 'tr') return;
  await i18n.changeLanguage(lng);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
}

export async function loadStoredLanguage() {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'tr') {
    await i18n.changeLanguage(stored);
  }
  return stored;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
    },
    lng: 'tr',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

loadStoredLanguage();

export default i18n;