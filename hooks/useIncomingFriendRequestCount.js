import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebase/firebaseConfig';

export function useIncomingFriendRequestCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let unsub1 = null;
    let unsub2 = null;
    let incoming1 = 0;
    let incoming2 = 0;

    const updateCount = () => setCount(incoming1 + incoming2);

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (unsub1) unsub1();
      if (unsub2) unsub2();
      unsub1 = null;
      unsub2 = null;
      incoming1 = 0;
      incoming2 = 0;
      setCount(0);

      if (!user) return;

      unsub1 = onSnapshot(
        query(
          collection(db, 'friendships'),
          where('user1Id', '==', user.uid),
          where('status', '==', 'pending')
        ),
        (snapshot) => {
          incoming1 = snapshot.docs.filter((d) => d.data().requestedBy !== user.uid).length;
          updateCount();
        }
      );

      unsub2 = onSnapshot(
        query(
          collection(db, 'friendships'),
          where('user2Id', '==', user.uid),
          where('status', '==', 'pending')
        ),
        (snapshot) => {
          incoming2 = snapshot.docs.filter((d) => d.data().requestedBy !== user.uid).length;
          updateCount();
        }
      );
    });

    return () => {
      authUnsub();
      if (unsub1) unsub1();
      if (unsub2) unsub2();
    };
  }, []);

  return count;
}
