import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { REACTION_EMOJIS } from '../constants/reactions';
import BeerColors from '../constants/BeerColors';

export default function ReactionPicker({ visible, onClose, onSelect, currentReaction }) {
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: BeerColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BeerColors.panel,
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    shadowColor: BeerColors.shadow,
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
    backgroundColor: BeerColors.panelSoft,
    borderWidth: 2,
    borderColor: BeerColors.accent,
  },
  emoji: {
    fontSize: 26,
  },
});
