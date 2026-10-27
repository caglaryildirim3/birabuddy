import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useOutTonight } from '../contexts/OutTonightContext';
import { useTheme } from '../contexts/ThemeContext';

export default function OutTonightStatusRow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOut, note, openGoLiveModal, openEditNoteModal, cancelStatus } = useOutTonight();

  if (!isOut) {
    return (
      <Pressable style={styles.homeButton} onPress={openGoLiveModal}>
        <Text style={styles.homeButtonText}>{t('homeTapToGoLive')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.outPill}>
      <Pressable style={styles.outPillMain} onPress={openEditNoteModal}>
        <Text style={styles.outPillTitle}>🟢 {t('live')}</Text>
        {note ? <Text style={styles.outPillNote}>{note}</Text> : null}
      </Pressable>
      <Pressable style={styles.cancelButton} onPress={cancelStatus} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    homeButton: {
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 16,
    },
    homeButtonText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    outPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(76, 175, 80, 0.12)',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(76, 175, 80, 0.35)',
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 10,
      marginBottom: 16,
    },
    outPillMain: {
      flex: 1,
    },
    outPillTitle: {
      fontSize: 15,
      fontWeight: 'bold',
      color: '#4CAF50',
    },
    outPillNote: {
      fontSize: 14,
      color: colors.textPrimary,
      marginTop: 4,
    },
    cancelButton: {
      padding: 6,
    },
  });
