import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { setAppLanguage } from '../i18n';

export default function LanguagePicker({
  compact = false,
  minimal = false,
  showLabel = true,
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, compact, minimal), [colors, compact, minimal]);

  const changeLanguage = async (lng) => {
    if (i18n.language === lng) return;
    Haptics.selectionAsync();
    await setAppLanguage(lng);
  };

  return (
    <View style={styles.wrapper}>
      {showLabel && !minimal ? <Text style={styles.label}>{t('chooseLanguage')}</Text> : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.option, i18n.language === 'en' && styles.optionActive]}
          onPress={() => changeLanguage('en')}
        >
          <Text style={[styles.optionText, i18n.language === 'en' && styles.optionTextActive]}>
            English
          </Text>
        </Pressable>
        <Pressable
          style={[styles.option, i18n.language === 'tr' && styles.optionActive]}
          onPress={() => changeLanguage('tr')}
        >
          <Text style={[styles.optionText, i18n.language === 'tr' && styles.optionTextActive]}>
            Türkçe
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors, compact, minimal) {
  return StyleSheet.create({
    wrapper: {
      width: minimal ? 'auto' : '100%',
      marginBottom: compact ? 16 : 0,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginLeft: compact ? 0 : 4,
      textAlign: compact ? 'center' : 'left',
    },
    row: {
      flexDirection: 'row',
      gap: minimal ? 6 : 10,
      paddingVertical: minimal || compact ? 0 : 14,
    },
    option: {
      flex: minimal ? 0 : 1,
      paddingVertical: minimal ? 5 : compact ? 10 : 12,
      paddingHorizontal: minimal ? 10 : 0,
      borderRadius: minimal ? 8 : 10,
      alignItems: 'center',
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    optionActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    optionText: {
      fontSize: minimal ? 12 : compact ? 14 : 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    optionTextActive: {
      color: colors.onAccent,
    },
  });
}
