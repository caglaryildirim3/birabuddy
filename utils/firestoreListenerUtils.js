export function isFirestorePermissionDenied(error) {
  const code = error?.code;
  return code === 'permission-denied' || code === 'unauthenticated';
}

export function isFirestoreMissingIndex(error) {
  return error?.code === 'failed-precondition';
}

export function handleFirestoreListenerError(label) {
  return (error) => {
    if (isFirestorePermissionDenied(error) || isFirestoreMissingIndex(error)) return;
    if (label) {
      console.warn(`Firestore listener failed (${label}):`, error);
      return;
    }
    console.warn('Firestore listener failed:', error);
  };
}
