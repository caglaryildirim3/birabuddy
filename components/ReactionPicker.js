import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { REACTION_EMOJIS } from '../constants/reactions';
import { useTheme } from '../contexts/ThemeContext';

export default function ReactionPicker({ visible, onClose, onSelect, currentReaction }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.bar}>
          {REACTION_EMOJIS.map((emoji) => {
            const selected = currentReaction === emoji;
            return (
              <Pressable
                key={emoji}
                style={[styles.emojiButton, selected && styles.emojiButtonSelected]}
                onPress={() => onSelect(emoji)}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    bar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.panel,
      borderRadius: 28,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    emojiButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiButtonSelected: {
      backgroundColor: colors.panelSoft,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    emoji: {
      fontSize: 26,
    },
  });
