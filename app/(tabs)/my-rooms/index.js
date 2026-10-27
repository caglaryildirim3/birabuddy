import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useNotificationIndicators } from '../../../contexts/NotificationContext';
import LiveMapFab from '../../../components/LiveMapFab';
import ActiveRooms from '../../../screens/active-rooms';
import MyRooms from '../../../screens/my-rooms';

export default function MyRoomsTab() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showMyRoomsSegmentDot, showActiveRoomsSegmentDot } = useNotificationIndicators();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [segment, setSegment] = useState('created');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, segment === 'created' && styles.segmentActive]}
          onPress={() => setSegment('created')}
        >
          <View style={styles.segmentLabelRow}>
            <Text style={[styles.segmentText, segment === 'created' && styles.segmentTextActive]}>
              {t('myRooms')}
            </Text>
            {showMyRoomsSegmentDot ? (
              <View style={[styles.segmentDot, segment === 'created' && styles.segmentDotActive]} />
            ) : null}
          </View>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'active' && styles.segmentActive]}
          onPress={() => setSegment('active')}
        >
          <View style={styles.segmentLabelRow}>
            <Text style={[styles.segmentText, segment === 'active' && styles.segmentTextActive]}>
              {t('activeRooms')}
            </Text>
            {showActiveRoomsSegmentDot ? (
              <View style={[styles.segmentDot, segment === 'active' && styles.segmentDotActive]} />
            ) : null}
          </View>
        </Pressable>
      </View>

      <View style={styles.content}>
        {segment === 'created' ? <MyRooms /> : <ActiveRooms />}
      </View>

      <LiveMapFab />
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    segmentBar: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: 10,
      marginBottom: 8,
      backgroundColor: colors.panel,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    segmentActive: {
      backgroundColor: colors.accent,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    segmentText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    segmentTextActive: {
      color: colors.onAccent,
      fontWeight: '700',
    },
    segmentLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    segmentDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.notificationDot,
    },
    segmentDotActive: {
      backgroundColor: colors.onAccent,
    },
    content: {
      flex: 1,
    },
  });
