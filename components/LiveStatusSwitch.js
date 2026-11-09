import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useOutTonight } from '../contexts/OutTonightContext';
import { useTheme } from '../contexts/ThemeContext';

const LIVE_GREEN = '#4CAF50';
const HOME_RED = '#E53935';

export default function LiveStatusSwitch() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOut, openGoLiveModal, cancelStatus } = useOutTonight();

  const handleToggle = (nextValue) => {
    Haptics.selectionAsync();
    if (nextValue) {
      openGoLiveModal();
      return;
    }
    cancelStatus();
  };

  return (
    <View style={styles.container}>
      <View style={styles.switchWrap}>
        <Switch
          value={isOut}
          onValueChange={handleToggle}
          trackColor={{ false: HOME_RED, true: LIVE_GREEN }}
          thumbColor={colors.white}
          ios_backgroundColor={isOut ? LIVE_GREEN : HOME_RED}
        />
      </View>
      <Text style={[styles.label, isOut ? styles.labelLive : styles.labelHome]}>
        {isOut ? t('liveSwitchOn') : t('liveSwitchOff')}
      </Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    switchWrap: {
      overflow: 'hidden',
      borderRadius: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      minWidth: 42,
    },
    labelLive: {
      color: LIVE_GREEN,
    },
    labelHome: {
      color: HOME_RED,
    },
  });
