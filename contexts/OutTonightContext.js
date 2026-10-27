import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import OutTonightModal from '../components/OutTonightModal';
import { auth, db } from '../firebase/firebaseConfig';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import {
  clearOutTonightStatus,
  getOutTonightSinceLabel,
  isOutTonight,
  setOutTonightStatus,
  updateOutTonightNote,
} from '../utils/outTonightUtils';

const OutTonightContext = createContext(null);

export function OutTonightProvider({ children }) {
  const [userData, setUserData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const openGoLiveRef = useRef(null);

  useEffect(() => {
    let userUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (userUnsub) userUnsub();
      userUnsub = null;
      setUserData(null);

      if (!user?.emailVerified) return;

      userUnsub = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          setUserData(snap.exists() ? snap.data() : {});
        },
        (error) => {
          handleFirestoreListenerError('out-tonight-user')(error);
          setUserData(null);
        }
      );
    });

    return () => {
      authUnsub();
      if (userUnsub) userUnsub();
    };
  }, []);

  const isOut = isOutTonight(userData);
  const note = userData?.outTonightNote || null;
  const sinceLabel = getOutTonightSinceLabel(userData?.outTonightSince);
  const photoURL =
    Array.isArray(userData?.photos) && userData.photos[0] ? userData.photos[0] : null;
  const name =
    userData?.name || userData?.nickname || userData?.instagram || auth.currentUser?.email?.split('@')[0] || 'You';

  const openGoLiveModal = () => {
    setModalMode('create');
    setModalVisible(true);
  };

  // Keep ref in sync so the AsyncStorage check below can call it
  openGoLiveRef.current = openGoLiveModal;

  // Open Go Live modal automatically if flagged by onboarding "Go live now"
  useEffect(() => {
    AsyncStorage.getItem('openGoLiveAfterOnboarding').then((val) => {
      if (val === 'true') {
        AsyncStorage.removeItem('openGoLiveAfterOnboarding');
        // Small delay to ensure the modal's parent is fully mounted
        setTimeout(() => openGoLiveRef.current?.(), 400);
      }
    });
  }, []);

  const openEditNoteModal = () => {
    setModalMode('edit');
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  const handleGoLive = async (noteText, fuzzedLocation = null) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setOutTonightStatus(uid, noteText, fuzzedLocation);
    closeModal();
  };

  const handleUpdateNote = async (noteText) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateOutTonightNote(uid, noteText);
    closeModal();
  };

  const cancelStatus = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await clearOutTonightStatus(uid);
  };

  return (
    <OutTonightContext.Provider
      value={{
        isOut,
        note,
        sinceLabel,
        name,
        photoURL,
        openGoLiveModal,
        openEditNoteModal,
        cancelStatus,
      }}
    >
      {children}
      <OutTonightModal
        visible={modalVisible}
        mode={modalMode}
        initialNote={note || ''}
        onClose={closeModal}
        onGoLive={handleGoLive}
        onUpdateNote={handleUpdateNote}
      />
    </OutTonightContext.Provider>
  );
}

export function useOutTonight() {
  const ctx = useContext(OutTonightContext);
  if (!ctx) {
    throw new Error('useOutTonight must be used within OutTonightProvider');
  }
  return ctx;
}
