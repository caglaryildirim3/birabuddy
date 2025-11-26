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
  SafeAreaView // Added SafeAreaView
} from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import { useButtonDelay } from '../hooks/useButtonDelay';
import { Ionicons } from '@expo/vector-icons'; // Added Ionicons

export default function CreateRoom() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [barName, setBarName] = useState('');
  const [maxPeople, setMaxPeople] = useState('');

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  const router = useRouter();
  
  const { isDisabled, executeWithDelay } = useButtonDelay(5000);

  const NAME_LIMIT = 50;
  const DESCRIPTION_LIMIT = 200;
  const BAR_NAME_LIMIT = 50;

  const neighborhoods = ['hisarustu', 'besiktas', 'kadikoy', 'cihangir', 'taksim', 'bomonti', 'karakoy'];

  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 7);

  const getNext7Days = () => {
    const days = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
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
    // --- VALIDATION CHECKS (Keep exactly as they were) ---
    if (!name.trim()) {
      Alert.alert('Missing Field', 'Room name is required.');
      return;
    }
    
    if (name.trim().length > NAME_LIMIT) {
      Alert.alert('Name Too Long', `Room name must be ${NAME_LIMIT} characters or less.`);
      return;
    }

    if (!neighborhood) {
      Alert.alert('Missing Field', 'Please select a neighborhood.');
      return;
    }

    if (!barName.trim()) {
      Alert.alert('Missing Field', 'Bar name is required.');
      return;
    }
    
    if (barName.trim().length > BAR_NAME_LIMIT) {
      Alert.alert('Bar Name Too Long', `Bar name must be ${BAR_NAME_LIMIT} characters or less.`);
      return;
    }

    if (description.length > DESCRIPTION_LIMIT) {
      Alert.alert('Description Too Long', `Description must be ${DESCRIPTION_LIMIT} characters or less.`);
      return;
    }

    if (!maxPeople) {
      Alert.alert('Missing Field', 'Max people is required.');
      return;
    }

    // This creates the combined Date + Time object
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
        'Invalid Date/Time',
        'Please choose a time that is not in the past.'
      );
      return;
    }

    if (selectedDate > maxDate) {
      Alert.alert(
        'Date Too Far Ahead',
        'You can only create rooms for the next 7 days.'
      );
      return;
    }

    const max = parseInt(maxPeople);
    if (isNaN(max) || max < 2 || max > 10) {
      Alert.alert('Invalid Max People', 'Max people must be a number between 2 and 10.');
      return;
    }

    // We still keep these formatted strings if you need them for other UI parts,
    // but we won't use 'formattedDate' for the main database field anymore.
    const formattedDate = selectedDate.getFullYear() + '-' + 
      String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(selectedDate.getDate()).padStart(2, '0');
    
    const formattedTime = String(selectedTime.getHours()).padStart(2, '0') + ':' + 
      String(selectedTime.getMinutes()).padStart(2, '0');

    try {
      const roomRef = await addDoc(collection(db, 'rooms'), {
        name: name.trim(),
        description: description.trim(),
        neighborhood: neighborhood,
        barName: barName.trim(),
        fullLocation: `${barName.trim()}, ${neighborhood}`,
        
        // --- CHANGE START ---
        // Instead of saving the string 'formattedDate', we save the Timestamp object.
        // This allows Firestore TTL to automatically delete old rooms.
        date: Timestamp.fromDate(roomDateTime), 
        // --- CHANGE END ---
        
        time: formattedTime, // We keep time as a string for easy display if needed
        maxParticipants: max,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid,
        participants: [auth.currentUser?.uid],
        requests: [],
        isActive: true,
      });

      await setDoc(doc(db, 'rooms', roomRef.id, 'participants', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        nickname: auth.currentUser.displayName || 'anonymous',
        joinedAt: serverTimestamp(),
      });

      Alert.alert('Room Created', 'Your room was successfully created.');
      
      router.replace('/my-rooms');
      
    } catch (error) {
      console.error('Error creating room:', error);
      Alert.alert('Error', error.message);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#4A3B47' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Back Button Header */}
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#E8A4C7" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>🍺 create a room</Text>
          <Text style={styles.subtitle}>feel free!</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                name.length > NAME_LIMIT && styles.inputError
              ]}
              placeholder="room name"
              placeholderTextColor="#999"
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
              placeholder="description (optional)"
              placeholderTextColor="#999"
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

          <Text style={styles.sectionTitle}>📍 Where to meet?</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.fieldLabel}>neighborhood:</Text>
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
            <Text style={styles.fieldLabel}>bar name:</Text>
            <TextInput
              style={[
                styles.input,
                barName.length > BAR_NAME_LIMIT && styles.inputError
              ]}
              placeholder="which bar or place?"
              placeholderTextColor="#999"
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
            <Text style={styles.sectionTitle}>📅 Pick a day</Text>
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
                    <Text style={styles.todayLabel}>today</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>

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
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="max people (2-10)"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={maxPeople}
            onChangeText={setMaxPeople}
          />

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
              {isDisabled ? '⏳ creating room...' : '✨ create room'}
            </Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Header row style for the back button
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 10, // Minimal padding from top safe area
    paddingBottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backButton: {
    padding: 8,
    marginLeft: -8, // Align with padding
  },
  container: {
    backgroundColor: '#4A3B47',
    padding: 24,
    paddingTop: 10, // Reduced top padding since header is above
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E8A4C7',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#E8D5DA',
    textAlign: 'center',
    marginBottom: 30,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#5A4B5C',
    color: '#E8D5DA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7A6B7D',
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputError: {
    borderColor: '#E74C3C',
    borderWidth: 3,
  },
  textArea: {
    minHeight: 80,
  },
  characterCount: {
    color: '#E8D5DA',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    opacity: 0.7,
  },
  characterCountError: {
    color: '#E74C3C',
    fontWeight: 'bold',
    opacity: 1,
  },
  sectionTitle: {
    color: '#E8A4C7',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  fieldLabel: {
    color: '#E8A4C7',
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
    backgroundColor: '#5A4B5C',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#7A6B7D',
  },
  neighborhoodButtonSelected: {
    backgroundColor: '#E8A4C7',
    borderColor: '#E8A4C7',
  },
  neighborhoodButtonText: {
    color: '#E8D5DA',
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  neighborhoodButtonTextSelected: {
    color: '#4A3B47',
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
    backgroundColor: '#5A4B5C',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#7A6B7D',
    minWidth: 70,
  },
  dayButtonSelected: {
    backgroundColor: '#E8A4C7',
    borderColor: '#E8A4C7',
  },
  todayButton: {
    borderColor: '#FFD700',
    borderWidth: 3,
  },
  dayButtonText: {
    color: '#E8D5DA',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dayButtonTextSelected: {
    color: '#4A3B47',
    fontWeight: 'bold',
  },
  todayButtonText: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  dateButtonText: {
    color: '#E8D5DA',
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
  },
  dateButtonTextSelected: {
    color: '#4A3B47',
    opacity: 1,
    fontWeight: '600',
  },
  todayDateText: {
    color: '#FFD700',
    opacity: 1,
    fontWeight: '600',
  },
  todayLabel: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  dateText: {
    color: '#E8D5DA',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#E8A4C7',
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
    color: '#4A3B47',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    backgroundColor: '#7A6B7D',
    opacity: 0.7,
  },
  buttonTextDisabled: {
    color: '#E8D5DA',
  },
});