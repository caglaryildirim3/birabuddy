import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { DRINKS, OTHER_DRINK_TYPE_LIMIT } from '../constants/drinks';
import { translateDrinkCategory, translateDrinkType } from '../utils/drinkI18n';

const MIN_QTY = 1;
const MAX_QTY = 20;

export default function DrinkPicker({ visible, onClose, onAdd }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [otherType, setOtherType] = useState('');
  const [quantity, setQuantity] = useState(1);
  const otherInputRef = useRef(null);

  const isOther = selectedCategory?.category === 'Other';
  const resolvedType = isOther ? otherType.trim() : selectedType;

  const reset = () => {
    setStep(1);
    setSelectedCategory(null);
    setSelectedType(null);
    setOtherType('');
    setQuantity(1);
  };

  useEffect(() => {
    if (!visible) {
      reset();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && step === 2 && isOther) {
      const timer = setTimeout(() => otherInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [visible, step, isOther]);

  const sheetBottomPadding =
    keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 20) + 12;

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectCategory = (category) => {
    setSelectedCategory(category);
    setSelectedType(null);
    setOtherType('');
    setQuantity(1);
    setStep(2);
  };

  const handleSelectType = (type) => {
    setSelectedType(type);
    setQuantity(1);
    setStep(3);
  };

  const handleOtherNext = () => {
    if (!otherType.trim()) return;
    setQuantity(1);
    setStep(3);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setSelectedCategory(null);
      setSelectedType(null);
      setOtherType('');
      setStep(1);
    }
  };

  const handleAdd = () => {
    if (!selectedCategory || !resolvedType) return;

    onAdd({
      category: selectedCategory.category,
      type: resolvedType,
      quantity,
      emoji: selectedCategory.emoji,
    });
    handleClose();
  };

  const decrementQty = () => setQuantity((q) => Math.max(MIN_QTY, q - 1));
  const incrementQty = () => setQuantity((q) => Math.min(MAX_QTY, q + 1));

  const renderStep1 = () => (
    <View style={styles.categoryGrid}>
      {DRINKS.map((item) => (
        <Pressable
          key={item.category}
          style={styles.categoryCard}
          onPress={() => handleSelectCategory(item)}
        >
          <Text style={styles.categoryEmoji}>{item.emoji}</Text>
          <Text style={styles.categoryName}>{translateDrinkCategory(t, item.category)}</Text>
        </Pressable>
      ))}
    </View>
  );

  const renderStep2 = () => {
    if (isOther) {
      return (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.otherScrollContent}
        >
          <Text style={styles.sheetTitle}>{t('whatDidYouDrink')}</Text>
          <TextInput
            ref={otherInputRef}
            style={styles.otherInput}
            placeholder={t('whatDidYouDrink')}
            placeholderTextColor={colors.textMuted}
            value={otherType}
            onChangeText={setOtherType}
            maxLength={OTHER_DRINK_TYPE_LIMIT}
            autoCapitalize="sentences"
            returnKeyType="next"
            onSubmitEditing={handleOtherNext}
          />
          <Text style={styles.charCounter}>
            {otherType.length}/{OTHER_DRINK_TYPE_LIMIT}
          </Text>
          <Pressable
            style={[styles.primaryButton, !otherType.trim() && styles.primaryButtonDisabled]}
            onPress={handleOtherNext}
            disabled={!otherType.trim()}
          >
            <Text style={styles.primaryButtonText}>{t('onboardingNext')}</Text>
          </Pressable>
        </ScrollView>
      );
    }

    return (
      <>
        <Text style={styles.sheetTitle}>
          {selectedCategory?.emoji} {translateDrinkCategory(t, selectedCategory?.category)}
        </Text>
        <ScrollView style={styles.typeList} showsVerticalScrollIndicator={false}>
          {selectedCategory?.types?.map((type) => (
            <Pressable
              key={type}
              style={styles.typeRow}
              onPress={() => handleSelectType(type)}
            >
              <Text style={styles.typeText}>{translateDrinkType(t, type)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </ScrollView>
      </>
    );
  };

  const renderStep3 = () => (
    <>
      <Text style={styles.sheetTitle}>
        {t('howManyDrinks', { drink: translateDrinkType(t, resolvedType) })}
      </Text>
      <View style={styles.stepperRow}>
        <Pressable
          style={[styles.stepperButton, quantity <= MIN_QTY && styles.stepperButtonDisabled]}
          onPress={decrementQty}
          disabled={quantity <= MIN_QTY}
        >
          <Ionicons name="remove" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.stepperValue}>{quantity}</Text>
        <Pressable
          style={[styles.stepperButton, quantity >= MAX_QTY && styles.stepperButtonDisabled]}
          onPress={incrementQty}
          disabled={quantity >= MAX_QTY}
        >
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Pressable style={styles.primaryButton} onPress={handleAdd}>
        <Text style={styles.primaryButtonText}>{t('addSegment')}</Text>
      </Pressable>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.sheetHandle, step === 1 && styles.sheetHandleCompact]} />

          <View style={[styles.sheetHeader, step === 1 && styles.sheetHeaderCompact]}>
            {step > 1 ? (
              <Pressable style={styles.backButton} onPress={handleBack}>
                <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
              </Pressable>
            ) : (
              <View style={styles.backPlaceholder} />
            )}
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayHeavy,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.panel,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      maxHeight: '85%',
    },
    otherScrollContent: {
      paddingBottom: 8,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      alignSelf: 'center',
      marginBottom: 12,
    },
    sheetHandleCompact: {
      marginBottom: 8,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sheetHeaderCompact: {
      marginBottom: 4,
    },
    backButton: {
      padding: 4,
    },
    backPlaceholder: {
      width: 30,
    },
    closeButton: {
      padding: 4,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    categoryCard: {
      width: '30%',
      flexGrow: 1,
      minWidth: 96,
      backgroundColor: colors.panelElevated,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    categoryEmoji: {
      fontSize: 28,
      marginBottom: 6,
    },
    categoryName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    typeList: {
      maxHeight: 320,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    typeText: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    otherInput: {
      backgroundColor: colors.panelElevated,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      marginBottom: 4,
    },
    charCounter: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'right',
      marginBottom: 16,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 24,
      marginTop: 8,
    },
    stepperButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.panelElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonDisabled: {
      opacity: 0.4,
    },
    stepperValue: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.textPrimary,
      minWidth: 48,
      textAlign: 'center',
    },
    primaryButton: {
      backgroundColor: colors.accent,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
