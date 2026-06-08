import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import BeerColors from '../../../constants/BeerColors';
import ActiveRooms from '../../../screens/active-rooms';
import MyRooms from '../../../screens/my-rooms';

export default function MyRoomsTab() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState('created');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, segment === 'created' && styles.segmentActive]}
          onPress={() => setSegment('created')}
        >
          <Text style={[styles.segmentText, segment === 'created' && styles.segmentTextActive]}>
            {t('myRooms')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'active' && styles.segmentActive]}
          onPress={() => setSegment('active')}
        >
          <Text style={[styles.segmentText, segment === 'active' && styles.segmentTextActive]}>
            {t('activeRooms')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {segment === 'created' ? <MyRooms /> : <ActiveRooms />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: BeerColors.panel,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: BeerColors.accent,
    borderWidth: 1,
    borderColor: BeerColors.accent,
  },
  segmentText: {
    color: BeerColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: BeerColors.onAccent,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
