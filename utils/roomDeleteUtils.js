import {
  collection,
  deleteDoc,
  doc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export async function deleteRoomTree(roomId) {
  if (!roomId) return;

  const [participantsSnap, messagesSnap] = await Promise.all([
    getDocs(collection(db, 'rooms', roomId, 'participants')),
    getDocs(collection(db, 'rooms', roomId, 'messages')),
  ]);

  await Promise.all([
    ...participantsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)),
    ...messagesSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)),
    deleteDoc(doc(db, 'rooms', roomId)),
  ]);
}
