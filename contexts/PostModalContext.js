import { createContext, useContext, useState } from 'react';
import PostCreationModal from '../components/PostCreationModal';

const PostModalContext = createContext(null);

export function PostModalProvider({ children }) {
  const [visible, setVisible] = useState(false);

  return (
    <PostModalContext.Provider
      value={{
        openPostModal: () => setVisible(true),
        closePostModal: () => setVisible(false),
      }}
    >
      {children}
      <PostCreationModal visible={visible} onClose={() => setVisible(false)} />
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
