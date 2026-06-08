import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  SafeAreaView
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { useButtonDelay } from '../hooks/useButtonDelay';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BeerColors from '../constants/BeerColors';
import { NEIGHBORHOODS_BY_CITY, CITIES } from '../constants/locations';
import { ROOM_VISIBILITY } from '../utils/roomUtils';

export default function CreateRoom() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [barName, setBarName] = useState('');
  const [maxPeople, setMaxPeople] = useState('');
  const [visibility, setVisibility] = useState(ROOM_VISIBILITY.PUBLIC);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  const router = useRouter();
  
  const { isDisabled, executeWithDelay } = useButtonDelay(5000);

  const NAME_LIMIT = 50;
  const DESCRIPTION_LIMIT = 200;
  const BAR_NAME_LIMIT = 50;

  const cities = CITIES;
  const neighborhoods = city ? NEIGHBORHOODS_BY_CITY[city] : [];

  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 7);

  const getNext7Days = () => {
    const days = [];
    const dayNames = [t('sunday'), t('monday'), t('tuesday'), t('wednesday'), t('thursday'), t('friday'), t('saturday')];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
      
      days.push({
        date: date,
        dayName: dayNames[date.getDay()],
        shortDay: dayNames[date.getDay()].substring(0, 3).toLowerCase(),
        displayDate: `${date.getDate()}/${date.getMonth() + 1}`,
        isToday: i === 0
      });
    }
    return days;
  };

  const next7Days = getNext7Days();

  const handleCreateRoom = async () => {
    if (!name.trim()) {
      Alert.alert(t('missingField'), t('roomNameRequired'));
      return;
    }
    
    if (name.trim().length > NAME_LIMIT) {
      Alert.alert(t('nameTooLong'), t('roomNameLimit', { limit: NAME_LIMIT }));
      return;
    }

    if (!city) {
      Alert.alert(t('missingField'), t('selectCity'));
      return;
    }

    if (!neighborhood) {
      Alert.alert(t('missingField'), t('selectNeighborhood'));
      return;
    }

    if (!barName.trim()) {
      Alert.alert(t('missingField'), t('barNameRequired'));
      return;
    }
    
    if (barName.trim().length > BAR_NAME_LIMIT) {
      Alert.alert(t('barNameTooLong'), t('barNameLimit', { limit: BAR_NAME_LIMIT }));
      return;
    }

    if (description.length > DESCRIPTION_LIMIT) {
      Alert.alert(t('descriptionTooLong'), t('descriptionLimit', { limit: DESCRIPTION_LIMIT }));
      return;
    }

    if (!maxPeople) {
      Alert.alert(t('missingField'), t('maxPeopleRequired'));
      return;
    }

    const now = new Date();
    const roomDateTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedTime.getHours(),
      selectedTime.getMinutes()
    );

    if (roomDateTime < now) {
      Alert.alert(
        t('invalidDateTime'),
        t('timeInPast')
      );
      return;
    }

    if (selectedDate > maxDate) {
      Alert.alert(
        t('dateTooFarAhead'),
        t('sevenDaysLimit')
      );
      return;
    }

    const max = parseInt(maxPeople);
    if (isNaN(max) || max < 2 || max > 10) {
      Alert.alert(t('invalidMaxPeople'), t('maxPeopleBetween'));
      return;
    }

    const formattedDate = selectedDate.getFullYear() + '-' + 
      String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(selectedDate.getDate()).padStart(2, '0');
    
    const formattedTime = String(selectedTime.getHours()).padStart(2, '0') + ':' + 
      String(selectedTime.getMinutes()).padStart(2, '0');

    try {
      const roomRef = await addDoc(collection(db, 'rooms'), {
        name: name.trim(),
        description: description.trim(),
        city: city,
        neighborhood: neighborhood,
        barName: barName.trim(),
        fullLocation: `${barName.trim()}, ${neighborhood}, ${city}`,
        date: Timestamp.fromDate(roomDateTime), 
        time: formattedTime,
        maxParticipants: max,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid,
        participants: [auth.currentUser?.uid],
        requests: [],
        isActive: true,
        visibility,
      });

      await setDoc(doc(db, 'rooms', roomRef.id, 'participants', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        nickname: auth.currentUser.displayName || 'anonymous',
        joinedAt: serverTimestamp(),
      });

      router.replace('/(tabs)/feed');
      
    } catch (error) {
      console.error('Error creating room:', error);
      Alert.alert(t('error'), error.message);
    }
  };

  const handleButtonPress = () => {
    executeWithDelay(handleCreateRoom);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (event.type === 'set' && selectedDate) {
      setSelectedDate(selectedDate);
    }
  };

  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    
    if (event.type === 'set' && selectedTime) {
      setSelectedTime(selectedTime);
    }
  };

  const toggleDatePicker = () => {
    setShowDatePicker(!showDatePicker);
  };

  const toggleTimePicker = () => {
    setShowTimePicker(!showTimePicker);
  };

  const formatTimeForDisplay = (time) => {
    const hours = String(time.getHours()).padStart(2, '0');
    const minutes = String(time.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BeerColors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={BeerColors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>🍺 {t('createARoom')}</Text>
          <Text style={styles.subtitle}>{t('feelFree')}</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                name.length > NAME_LIMIT && styles.inputError
              ]}
              placeholder={t('roomNamePlaceholder')}
              placeholderTextColor={BeerColors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={NAME_LIMIT + 10} 
            />
            <Text style={[
              styles.characterCount,
              name.length > NAME_LIMIT && styles.characterCountError
            ]}>
              {name.length}/{NAME_LIMIT}
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                description.length > DESCRIPTION_LIMIT && styles.inputError
              ]}
              placeholder={t('descriptionPlaceholder')}
              placeholderTextColor={BeerColors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline={true}
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={DESCRIPTION_LIMIT + 10} 
            />
            <Text style={[
              styles.characterCount,
              description.length > DESCRIPTION_LIMIT && styles.characterCountError
            ]}>
              {description.length}/{DESCRIPTION_LIMIT}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>📍 {t('whereToMeet')}</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.fieldLabel}>{t('city')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.neighborhoodContainer}
            >
              {cities.map((cityOption, index) => (
                <Pressable
                  key={index}
                  style={[
                    styles.neighborhoodButton,
                    city === cityOption && styles.neighborhoodButtonSelected
                  ]}
                  onPress={() => {
                    setCity(cityOption);
                    setNeighborhood('');
                  }}
                >
                  <Text style={[
                    styles.neighborhoodButtonText,
                    city === cityOption && styles.neighborhoodButtonTextSelected
                  ]}>
                    {cityOption}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.fieldLabel}>{t('neighborhood')}</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.neighborhoodContainer}
            >
              {neighborhoods.map((hood, index) => (
                <Pressable
                  key={index}
                  style={[
                    styles.neighborhoodButton,
                    neighborhood === hood && styles.neighborhoodButtonSelected
                  ]}
                  onPress={() => setNeighborhood(hood)}
                >
                  <Text style={[
                    styles.neighborhoodButtonText,
                    neighborhood === hood && styles.neighborhoodButtonTextSelected
                  ]}>
                    {hood}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.fieldLabel}>{t('barName')}</Text>
            <TextInput
              style={[
                styles.input,
                barName.length > BAR_NAME_LIMIT && styles.inputError
              ]}
              placeholder={t('barPlaceholder')}
              placeholderTextColor={BeerColors.textMuted}
              value={barName}
              onChangeText={setBarName}
              maxLength={BAR_NAME_LIMIT + 10}
            />
            <Text style={[
              styles.characterCount,
              barName.length > BAR_NAME_LIMIT && styles.characterCountError
            ]}>
              {barName.length}/{BAR_NAME_LIMIT}
            </Text>
          </View>

          <View style={styles.dateContainer}>
            <Text style={styles.sectionTitle}>📅 {t('pickADay')}</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateButtonsContainer}
            >
              {next7Days.map((dayObj, index) => (
                <Pressable
                  key={index}
                  style={[
                    styles.dayButton,
                    selectedDate.toDateString() === dayObj.date.toDateString() && styles.dayButtonSelected,
                    dayObj.isToday && styles.todayButton
                  ]}
                  onPress={() => setSelectedDate(dayObj.date)}
                >
                  <Text style={[
                    styles.dayButtonText,
                    selectedDate.toDateString() === dayObj.date.toDateString() && styles.dayButtonTextSelected,
                    dayObj.isToday && styles.todayButtonText
                  ]}>
                    {dayObj.shortDay}
                  </Text>
                  <Text style={[
                    styles.dateButtonText,
                    selectedDate.toDateString() === dayObj.date.toDateString() && styles.dateButtonTextSelected,
                    dayObj.isToday && styles.todayDateText
                  ]}>
                    {dayObj.displayDate}
                  </Text>
                  {dayObj.isToday && (
                    <Text style={styles.todayLabel}>{t('today')}</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.fieldSpacing}>
            <Pressable onPress={toggleTimePicker} style={styles.input}>
              <Text style={styles.dateText}>
                ⏰ {formatTimeForDisplay(selectedTime)}
              </Text>
            </Pressable>

            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                is24Hour={true}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onTimeChange}
                {...(Platform.OS === 'ios' && {
                  textColor: BeerColors.textPrimary,
                  themeVariant: 'light',
                })}
              />
            )}
          </View>

          <View style={styles.fieldSpacing}>
            <TextInput
              style={styles.input}
              placeholder={t('maxPeoplePlaceholder')}
              placeholderTextColor={BeerColors.textMuted}
              keyboardType="numeric"
              value={maxPeople}
              onChangeText={setMaxPeople}
            />
          </View>

          <View style={styles.visibilitySection}>
          <View style={styles.visibilityRow}>
            <Pressable
              style={[
                styles.visibilityOption,
                visibility === ROOM_VISIBILITY.PUBLIC && styles.visibilityOptionSelected,
              ]}
              onPress={() => setVisibility(ROOM_VISIBILITY.PUBLIC)}
            >
              <Text
                style={[
                  styles.visibilityOptionText,
                  visibility === ROOM_VISIBILITY.PUBLIC && styles.visibilityOptionTextSelected,
                ]}
              >
                🌍 {t('roomPublic')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.visibilityOption,
                visibility === ROOM_VISIBILITY.PRIVATE && styles.visibilityOptionSelected,
              ]}
              onPress={() => setVisibility(ROOM_VISIBILITY.PRIVATE)}
            >
              <Text
                style={[
                  styles.visibilityOptionText,
                  visibility === ROOM_VISIBILITY.PRIVATE && styles.visibilityOptionTextSelected,
                ]}
              >
                🔒 {t('roomPrivate')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.visibilityHint}>
            {visibility === ROOM_VISIBILITY.PUBLIC ? t('roomPublicHint') : t('roomPrivateHint')}
          </Text>
          </View>

          <Pressable 
            style={[
              styles.button,
              isDisabled && styles.buttonDisabled
            ]} 
            onPress={handleButtonPress}
            disabled={isDisabled}
          >
            <Text style={[
              styles.buttonText,
              isDisabled && styles.buttonTextDisabled
            ]}>
              {isDisabled ? '⏳ ' + t('creatingRoom') : '✨ ' + t('createRoomButton')}
            </Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  container: {
    backgroundColor: BeerColors.background,
    padding: 24,
    paddingTop: 10,
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: BeerColors.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: BeerColors.panel,
    color: BeerColors.textPrimary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BeerColors.borderSoft,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputError: {
    borderColor: BeerColors.danger,
    borderWidth: 3,
  },
  textArea: {
    minHeight: 80,
  },
  characterCount: {
    color: BeerColors.textPrimary,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    opacity: 0.7,
  },
  characterCountError: {
    color: BeerColors.danger,
    fontWeight: 'bold',
    opacity: 1,
  },
  sectionTitle: {
    color: BeerColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  fieldLabel: {
    color: BeerColors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  neighborhoodContainer: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 8,
  },
  neighborhoodButton: {
    backgroundColor: BeerColors.panel,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: BeerColors.borderSoft,
  },
  neighborhoodButtonSelected: {
    backgroundColor: BeerColors.panelElevated,
    borderColor: BeerColors.borderSoft,
  },
  neighborhoodButtonText: {
    color: BeerColors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  neighborhoodButtonTextSelected: {
    color: BeerColors.textPrimary,
    fontWeight: 'bold',
  },
  dateContainer: {
    marginBottom: 20,
  },
  dateButtonsContainer: {
    paddingHorizontal: 4,
    gap: 8,
  },
  dayButton: {
    backgroundColor: BeerColors.panel,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BeerColors.borderSoft,
    minWidth: 70,
  },
  dayButtonSelected: {
    backgroundColor: BeerColors.panelElevated,
    borderColor: BeerColors.accent,
    borderWidth: 2,
  },
  todayButton: {
    borderColor: BeerColors.accent,
    borderWidth: 3,
  },
  dayButtonText: {
    color: BeerColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dayButtonTextSelected: {
    color: BeerColors.textPrimary,
    fontWeight: 'bold',
  },
  todayButtonText: {
    color: BeerColors.accent,
    fontWeight: 'bold',
  },
  dateButtonText: {
    color: BeerColors.textPrimary,
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
  },
  dateButtonTextSelected: {
    color: BeerColors.textPrimary,
    opacity: 1,
    fontWeight: '600',
  },
  todayDateText: {
    color: BeerColors.accent,
    opacity: 1,
    fontWeight: '600',
  },
  todayLabel: {
    color: BeerColors.accent,
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  dateText: {
    color: BeerColors.textPrimary,
    fontSize: 16,
  },
  fieldSpacing: {
    marginBottom: 16,
  },
  visibilitySection: {
    marginBottom: 8,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  visibilityOption: {
    flex: 1,
    backgroundColor: BeerColors.panel,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BeerColors.borderSoft,
  },
  visibilityOptionSelected: {
    borderColor: BeerColors.accent,
    backgroundColor: BeerColors.panelElevated,
  },
  visibilityOptionText: {
    color: BeerColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  visibilityOptionTextSelected: {
    color: BeerColors.textPrimary,
    fontWeight: 'bold',
  },
  visibilityHint: {
    color: BeerColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  button: {
    backgroundColor: BeerColors.accent,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  buttonText: {
    color: BeerColors.onAccent,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    backgroundColor: BeerColors.panel,
    opacity: 0.7,
  },
  buttonTextDisabled: {
    color: BeerColors.textPrimary,
  },
});