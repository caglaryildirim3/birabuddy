import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BeerColors from '../constants/BeerColors';
import { getFuzzedLiveLocation } from '../utils/locationUtils';
import { OUT_TONIGHT_NOTE_LIMIT } from '../utils/outTonightUtils';

const PLACEHOLDER_SUGGESTIONS = [
  'Kadıköy area',
  'Looking for a bar in Beşiktaş',
  'Anyone in Cihangir?',
];

export default function OutTonightModal({
  visible,
  mode = 'create',
  initialNote = '',
  onClose,
  onGoLive,
  onUpdateNote,
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setNote(initialNote || '');
    }
  }, [visible, initialNote]);

  const handleGoLive = async () => {
    setSubmitting(true);
    try {
      if (mode === 'edit') {
        await onUpdateNote?.(note);
        return;
      }

      const fuzzedLocation = await getFuzzedLiveLocation();
      await onGoLive?.(note, fuzzedLocation);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            {mode === 'edit' ? 'Update your note' : "You're going live 🟢"}
          </Text>
          <Text style={styles.subtitle}>Add a note (optional)</Text>

          <TextInput
            style={styles.input}
            placeholder={PLACEHOLDER_SUGGESTIONS[0]}
            placeholderTextColor={BeerColors.textMuted}
            value={note}
            onChangeText={setNote}
            maxLength={OUT_TONIGHT_NOTE_LIMIT}
            autoFocus
          />
          <Text style={styles.suggestions}>
            e.g. "{PLACEHOLDER_SUGGESTIONS.join('", "')}"
          </Text>
          <Text style={styles.counter}>
            {note.length}/{OUT_TONIGHT_NOTE_LIMIT}
          </Text>

          <Pressable
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={handleGoLive}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={BeerColors.onAccent} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'edit' ? 'Save note' : 'Go live'}
              </Text>
            )}
          </Pressable>

          {mode === 'edit' ? (
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: BeerColors.overlayHeavy,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: BeerColors.panel,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    marginBottom: 16,
  },
  input: {
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: BeerColors.textPrimary,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  suggestions: {
    fontSize: 12,
    color: BeerColors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  counter: {
    fontSize: 12,
    color: BeerColors.textMuted,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: BeerColors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: BeerColors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: BeerColors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
