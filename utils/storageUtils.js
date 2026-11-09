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

function uploadBytesViaXhr(uploadUrl, bytes, headers) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (error) {
          reject(error);
        }
        return;
      }

      let message = `Upload failed (${xhr.status})`;
      try {
        const data = JSON.parse(xhr.responseText);
        message = data?.error?.message || message;
      } catch {
        // ignore parse errors
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(bytes);
  });
}

export async function uploadImageFromUri(_storage, path, uri, contentType = 'image/jpeg') {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }

  const idToken = await user.getIdToken();
  const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
  const bytes = base64ToUint8Array(base64);

  const encodedPath = encodeURIComponent(path);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodedPath}`;

  // Firebase JS SDK uploadBytes/uploadString both try to create Blobs, which
  // React Native does not support. XHR + REST avoids that entirely.
  const data = await uploadBytesViaXhr(uploadUrl, bytes, {
    Authorization: `Firebase ${idToken}`,
    'Content-Type': contentType,
  });

  const downloadToken = data.downloadTokens?.split(',')[0];
  if (!downloadToken || !data.name) {
    throw new Error('Upload succeeded but no download token returned');
  }

  const objectPath = encodeURIComponent(data.name);
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${objectPath}?alt=media&token=${downloadToken}`;
}
