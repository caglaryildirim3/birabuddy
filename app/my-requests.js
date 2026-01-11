import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';
import { useTranslation } from 'react-i18next';

export default function MyRequests() {
  const { t } = useTranslation();
  const [myRequests, setMyRequests] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchRequests = async () => {
      const querySnapshot = await getDocs(collection(db, 'rooms'));
      const results = [];

      querySnapshot.forEach((docSnap) => {
        const room = docSnap.data();
        const roomId = docSnap.id;

        const request = (room.joinRequests || []).find(r => r.uid === user.uid);
        const isParticipant = (room.participants || []).includes(user.uid);

        if (request) {
          results.push({
            id: roomId,
            title: room.title,
            location: room.location,
            time: room.time,
            status: isParticipant ? 'Approved' : 'Pending',
          });
        }
      });

      setMyRequests(results);
    };

    fetchRequests();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🔮 {t('myJoinRequests')}</Text>
      {myRequests.length === 0 ? (
        <Text style={styles.info}>{t('noRequestsYet')}</Text>
      ) : (
        <FlatList
          data={myRequests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.detail}>📍 {item.location}</Text>
              <Text style={styles.detail}>🕐 {item.time}</Text>
              <Text style={styles.status}>
                {item.status === 'Approved' ? `✅ ${t('approved')}` : `⏳ ${t('pending')}`}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7c4d2',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  info: {
    color: '#fff',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#f8cb54',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 6,
  },
  detail: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginTop: 8,
  },
});