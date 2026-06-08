import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState } from 'react';
import OutTonightModal from '../components/OutTonightModal';
import { auth, db } from '../firebase/firebaseConfig';
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

  useEffect(() => {
    let userUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (userUnsub) userUnsub();
      userUnsub = null;
      setUserData(null);

      if (!user) return;

      userUnsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        setUserData(snap.exists() ? snap.data() : {});
      });
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
