import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { darkTheme, lightTheme } from '../constants/themes';

const THEME_STORAGE_KEY = 'birabuddy_theme_mode';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  const colors = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark') setIsDark(true);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background, ready]);

  const setDarkMode = async (value) => {
    setIsDark(value);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, value ? 'dark' : 'light');
  };

  const toggleDarkMode = () => setDarkMode(!isDark);

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors,
        ready,
        setDarkMode,
        toggleDarkMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
