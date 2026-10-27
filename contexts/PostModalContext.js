import { createContext, useCallback, useContext, useState } from 'react';
import PostCreationModal from '../components/PostCreationModal';

const PostModalContext = createContext(null);

export function PostModalProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [initialVenueTag, setInitialVenueTag] = useState('');

  const openPostModal = useCallback((options = {}) => {
    setInitialVenueTag(options.venueTag || '');
    setVisible(true);
  }, []);

  const closePostModal = useCallback(() => {
    setVisible(false);
    setInitialVenueTag('');
  }, []);

  return (
    <PostModalContext.Provider
      value={{
        openPostModal,
        closePostModal,
      }}
    >
      {children}
      <PostCreationModal
        visible={visible}
        onClose={closePostModal}
        initialVenueTag={initialVenueTag}
      />
    </PostModalContext.Provider>
  );
}

export function usePostModal() {
  const ctx = useContext(PostModalContext);
  if (!ctx) {
    throw new Error('usePostModal must be used within PostModalProvider');
  }
  return ctx;
}
