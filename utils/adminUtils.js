import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';

export async function fetchIsAdmin(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) return false;

  const token = await user.getIdTokenResult(forceRefresh);
  return token.claims.admin === true;
}

export function subscribeIsAdmin(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(false);
      return;
    }
    try {
      const token = await user.getIdTokenResult(true);
      callback(token.claims.admin === true);
    } catch {
      callback(false);
    }
  });
}
