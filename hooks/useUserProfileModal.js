import { useCallback, useState } from 'react';
import { Modal } from 'react-native';
import UserProfile from '../components/UserProfile';

export function useUserProfileModal() {
  const [selectedUid, setSelectedUid] = useState(null);

  const openProfile = useCallback((uid) => {
    if (!uid) return;
    setSelectedUid(uid);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedUid(null);
  }, []);

  const ProfileModal = useCallback(
    () => (
      <Modal visible={!!selectedUid} animationType="slide" presentationStyle="pageSheet">
        {selectedUid ? <UserProfile uid={selectedUid} onClose={closeProfile} /> : null}
      </Modal>
    ),
    [selectedUid, closeProfile]
  );

  return { selectedUid, openProfile, closeProfile, ProfileModal };
}
