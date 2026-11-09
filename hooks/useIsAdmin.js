import { useEffect, useState } from 'react';
import { subscribeIsAdmin } from '../utils/adminUtils';

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = subscribeIsAdmin((admin) => {
      setIsAdmin(admin);
      setChecking(false);
    });
    return unsub;
  }, []);

  return { isAdmin, checking };
}
