import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useOutTonight } from '../contexts/OutTonightContext';
import BeerColors from '../constants/BeerColors';

export default function OutTonightStatusRow() {
  const { isOut, note, sinceLabel, openGoLiveModal, openEditNoteModal, cancelStatus } = useOutTonight();

  if (!isOut) {
    return (
      <Pressable style={styles.homeButton} onPress={openGoLiveModal}>
        <Text style={styles.homeButtonText}>🔴 I'm home — tap to go live</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.outPill}>
      <Pressable style={styles.outPillMain} onPress={openEditNoteModal}>
        <Text style={styles.outPillTitle}>🟢 Out tonight</Text>
        {note ? <Text style={styles.outPillNote}>{note}</Text> : null}
        {sinceLabel ? <Text style={styles.outPillSince}>since {sinceLabel}</Text> : null}
      </Pressable>
      <Pressable style={styles.cancelButton} onPress={cancelStatus} hitSlop={8}>
        <Ionicons name="close" size={18} color={BeerColors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  homeButton: {
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  homeButtonText: {
    fontSize: 14,
    color: BeerColors.textSecondary,
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
    color: '#2E7D32',
  },
  outPillNote: {
    fontSize: 14,
    color: BeerColors.textPrimary,
    marginTop: 4,
  },
  outPillSince: {
    fontSize: 12,
    color: BeerColors.textMuted,
    marginTop: 2,
  },
  cancelButton: {
    padding: 6,
  },
});
