import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebase/firebaseConfig';
import { handleFirestoreListenerError } from '../utils/firestoreListenerUtils';
import { getFriendIds } from '../utils/friendUtils';
import { isOutTonight } from '../utils/outTonightUtils';

export function useAnyFriendLive() {
  const [anyFriendLive, setAnyFriendLive] = useState(false);

  useEffect(() => {
    let friendUnsubs = [];

    const authUnsub = onAuthStateChanged(auth, async (user) => {
      friendUnsubs.forEach((unsub) => unsub());
      friendUnsubs = [];

      if (!user?.uid) {
        setAnyFriendLive(false);
        return;
      }

      try {
        const friendIds = await getFriendIds(user.uid);
        if (friendIds.length === 0) {
          setAnyFriendLive(false);
          return;
        }

        const chunks = [];
        for (let i = 0; i < friendIds.length; i += 10) {
          chunks.push(friendIds.slice(i, i + 10));
        }

        const chunkLive = new Array(chunks.length).fill(false);
        friendUnsubs = chunks.map((chunk, idx) =>
          onSnapshot(
            query(collection(db, 'users'), where('__name__', 'in', chunk)),
            (snap) => {
              chunkLive[idx] = snap.docs.some((d) => isOutTonight(d.data()));
              setAnyFriendLive(chunkLive.some(Boolean));
            },
            handleFirestoreListenerError('any-friend-live')
          )
        );
      } catch {
        setAnyFriendLive(false);
      }
    });

    return () => {
      authUnsub();
      friendUnsubs.forEach((unsub) => unsub());
    };
  }, []);

  return anyFriendLive;
}
