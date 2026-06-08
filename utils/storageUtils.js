import { readAsStringAsync } from 'expo-file-system/legacy';
import { auth, STORAGE_BUCKET } from '../firebase/firebaseConfig';

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function uploadImageFromUri(_storage, path, uri, contentType = 'image/jpeg') {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }

  const idToken = await user.getIdToken();
  const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
  const body = base64ToUint8Array(base64);

  const encodedPath = encodeURIComponent(path);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodedPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Firebase ${idToken}`,
      'Content-Type': contentType,
    },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Upload failed (${response.status})`);
  }

  const downloadToken = data.downloadTokens?.split(',')[0];
  const objectPath = encodeURIComponent(data.name);
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${objectPath}?alt=media&token=${downloadToken}`;
}
