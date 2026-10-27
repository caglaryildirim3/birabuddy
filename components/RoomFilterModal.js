import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
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
import { CITIES, NEIGHBORHOODS_BY_CITY as CITY_NEIGHBORHOODS } from '../constants/locations';
import { useTheme } from '../contexts/ThemeContext';
import { ROOM_SORT } from '../utils/roomListFilters';

export default function RoomFilterModal({
  visible,
  onClose,
  showLocationFilters = true,
  tempName,
  setTempName,
  tempCities = [],
  toggleCity,
  tempLocations = [],
  toggleNeighborhood,
  visibleNeighborhoods = [],
  tempDay,
  setTempDay,
  tempTimeStart,
  setTempTimeStart,
  tempOnlyOpenSpots,
  setTempOnlyOpenSpots,
  showWithFriendsFilter = false,
  tempWithFriendsOnly = false,
  setTempWithFriendsOnly,
  tempSortBy,
  setTempSortBy,
  next7Days,
  timeSlots,
  onApply,
  onClear,
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('filterRooms')}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.filterLabel}>{t('roomName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('searchByName')}
              value={tempName}
              onChangeText={setTempName}
            />

            <View style={styles.toggleChipRow}>
              <Pressable
                style={[styles.chip, tempOnlyOpenSpots && styles.chipActive]}
                onPress={() => setTempOnlyOpenSpots((prev) => !prev)}
              >
                <Text style={[styles.chipText, tempOnlyOpenSpots && styles.chipTextActive]}>
                  {t('onlyOpenSpots')}
                </Text>
              </Pressable>
              {showWithFriendsFilter ? (
                <Pressable
                  style={[styles.chip, tempWithFriendsOnly && styles.chipActive]}
                  onPress={() => setTempWithFriendsOnly((prev) => !prev)}
                >
                  <Text style={[styles.chipText, tempWithFriendsOnly && styles.chipTextActive]}>
                    {t('withFriends')}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.filterLabel}>{t('orderBy')}</Text>
            <View style={styles.wrapContainer}>
              <Pressable
                style={[styles.chip, tempSortBy === ROOM_SORT.TIME && styles.chipActive]}
                onPress={() => setTempSortBy(ROOM_SORT.TIME)}
              >
                <Text
                  style={[
                    styles.chipText,
                    tempSortBy === ROOM_SORT.TIME && styles.chipTextActive,
                  ]}
                >
                  {t('sortClosestTime')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, tempSortBy === ROOM_SORT.CROWDED && styles.chipActive]}
                onPress={() => setTempSortBy(ROOM_SORT.CROWDED)}
              >
                <Text
                  style={[
                    styles.chipText,
                    tempSortBy === ROOM_SORT.CROWDED && styles.chipTextActive,
                  ]}
                >
                  {t('sortMostCrowded')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, tempSortBy === ROOM_SORT.CREATED && styles.chipActive]}
                onPress={() => setTempSortBy(ROOM_SORT.CREATED)}
              >
                <Text
                  style={[
                    styles.chipText,
                    tempSortBy === ROOM_SORT.CREATED && styles.chipTextActive,
                  ]}
                >
                  {t('sortNewlyCreated')}
                </Text>
              </Pressable>
            </View>

            {showLocationFilters ? (
              <>
                <Text style={styles.filterLabel}>{t('cities')}</Text>
                <View style={styles.wrapContainer}>
                  {CITIES.map((city) => {
                    const isSelected = tempCities.includes(city);
                    return (
                      <Pressable
                        key={city}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleCity(city)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {city}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {tempCities.length > 0 ? (
                  <>
                    <Text style={styles.filterLabel}>{t('neighborhoods')}</Text>
                    <View style={styles.wrapContainer}>
                      {(visibleNeighborhoods.length > 0
                        ? visibleNeighborhoods
                        : tempCities.flatMap((city) => CITY_NEIGHBORHOODS[city] || [])
                      ).map((hood) => {
                        const isSelected = tempLocations.includes(hood);
                        return (
                          <Pressable
                            key={hood}
                            style={[styles.chip, isSelected && styles.chipActive]}
                            onPress={() => toggleNeighborhood(hood)}
                          >
                            <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                              {hood}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            <Text style={styles.filterLabel}>{t('day')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <Pressable
                style={[styles.chip, tempDay === null && styles.chipActive]}
                onPress={() => setTempDay(null)}
              >
                <Text style={[styles.chipText, tempDay === null && styles.chipTextActive]}>
                  {t('any')}
                </Text>
              </Pressable>
              {next7Days.map((day) => (
                <Pressable
                  key={day.value}
                  style={[styles.chip, tempDay === day.value && styles.chipActive]}
                  onPress={() => setTempDay(day.value === tempDay ? null : day.value)}
                >
                  <Text style={[styles.chipText, tempDay === day.value && styles.chipTextActive]}>
                    {day.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>{t('timeInterval')}</Text>
            <View style={styles.wrapContainer}>
              <Pressable
                style={[styles.chip, tempTimeStart === null && styles.chipActive]}
                onPress={() => setTempTimeStart(null)}
              >
                <Text style={[styles.chipText, tempTimeStart === null && styles.chipTextActive]}>
                  {t('any')}
                </Text>
              </Pressable>
              {timeSlots.map((slot) => (
                <Pressable
                  key={slot.start}
                  style={[styles.chip, tempTimeStart === slot.start && styles.chipActive]}
                  onPress={() => setTempTimeStart(slot.start === tempTimeStart ? null : slot.start)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      tempTimeStart === slot.start && styles.chipTextActive,
                    ]}
                  >
                    {slot.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable style={styles.clearButton} onPress={onClear}>
              <Text style={styles.clearButtonText}>{t('clearAllFilters')}</Text>
            </Pressable>
            <Pressable style={styles.applyButton} onPress={onApply}>
              <Text style={styles.applyButtonText}>{t('showResults')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    modalContent: {
      backgroundColor: colors.panel,
      borderTopLeftRadius: 25,
      borderTopRightRadius: 25,
      padding: 20,
      height: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    filterLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 15,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.panelElevated,
      borderRadius: 8,
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    toggleChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 15,
      marginBottom: 8,
    },
    chipScroll: {
      flexDirection: 'row',
      marginBottom: 5,
    },
    wrapContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    chip: {
      backgroundColor: colors.panelElevated,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginRight: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    chipTextActive: {
      color: colors.onAccent,
      fontWeight: 'bold',
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 20,
    },
    clearButton: {
      flex: 0.3,
      padding: 15,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    clearButtonText: {
      color: colors.textPrimary,
      fontWeight: 'bold',
    },
    applyButton: {
      flex: 0.65,
      backgroundColor: colors.accent,
      padding: 15,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.accent,
    },
    applyButtonText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
}
