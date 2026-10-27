import { deleteObject, getDownloadURL, listAll, ref } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';

export const PHOTO_COUNT = 5;

export const EMPTY_PHOTOS = Array(PHOTO_COUNT).fill('');

const resolvedUrlCache = new Map();

/** Drop cached download URLs after a profile photo changes. */
export function clearProfilePhotoCache(uid, slotIndex = null) {
  if (!uid) return;

  for (const key of [...resolvedUrlCache.keys()]) {
    if (key === `list:${uid}`) {
      resolvedUrlCache.delete(key);
      continue;
    }

    if (slotIndex == null) {
      if (key.startsWith(`${uid}:`)) resolvedUrlCache.delete(key);
      continue;
    }

    if (key.startsWith(`${uid}:${slotIndex}:`)) {
      resolvedUrlCache.delete(key);
    }
  }
}

function hasValidStorageToken(url) {
  try {
    const token = new URL(url).searchParams.get('token');
    return Boolean(token && token !== 'undefined');
  } catch {
    return false;
  }
}

export function isPersistablePhotoUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  if (trimmed.includes('token=undefined') || trimmed.endsWith('token=')) return false;
  if (trimmed.includes('firebasestorage.googleapis.com')) {
    return hasValidStorageToken(trimmed);
  }
  return true;
}

/** Keep slot positions while reading whatever is stored in Firestore. */
export function getRawPhotoSlots(rawPhotos) {
  const next = [...EMPTY_PHOTOS];
  if (Array.isArray(rawPhotos)) {
    rawPhotos.slice(0, PHOTO_COUNT).forEach((url, index) => {
      if (typeof url === 'string' && url.trim()) {
        next[index] = url.trim();
      }
    });
  }
  return next;
}

export function getProfilePhotoUrls(rawPhotos) {
  return getRawPhotoSlots(rawPhotos).filter(isPersistablePhotoUrl);
}

export function getProfilePhotoStoragePath(uid, index) {
  return `users/${uid}/photos/${index}`;
}

/**
 * Extract the Storage object path from a Firebase Storage download URL.
 * Handles URLs like: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded_path}?...
 */
function getStoragePathFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/o\/(.+)$/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function resolvePhotoSlotUrl(uid, url, index) {
  if (!uid || index < 0 || index >= PHOTO_COUNT) return null;

  const cacheKey = `${uid}:${index}:${url || ''}`;
  if (resolvedUrlCache.has(cacheKey)) {
    return resolvedUrlCache.get(cacheKey);
  }

  if (isPersistablePhotoUrl(url)) {
    resolvedUrlCache.set(cacheKey, url);
    return url;
  }

  // Prefer the slot index path first — stale Firestore URLs often all point at the
  // same Storage object, which makes every slot resolve to the same photo.
  const storagePaths = [getProfilePhotoStoragePath(uid, index)];
  if (url) {
    const extractedPath = getStoragePathFromUrl(url);
    if (extractedPath && !storagePaths.includes(extractedPath)) {
      storagePaths.push(extractedPath);
    }
  }

  for (const path of storagePaths) {
    try {
      const resolved = await getDownloadURL(ref(storage, path));
      resolvedUrlCache.set(cacheKey, resolved);
      return resolved;
    } catch {
      // try next path
    }
  }

  return null;
}

export async function deleteProfilePhotoAtSlot(storageRef, uid, index) {
  if (!uid || index < 0 || index >= PHOTO_COUNT) return;

  try {
    await deleteObject(ref(storageRef, getProfilePhotoStoragePath(uid, index)));
  } catch (error) {
    const code = error?.code || '';
    if (code !== 'storage/object-not-found') {
      throw error;
    }
  }
  clearProfilePhotoCache(uid, index);
}

async function listProfilePhotosFromStorage(uid) {
  const cacheKey = `list:${uid}`;
  if (resolvedUrlCache.has(cacheKey)) {
    return resolvedUrlCache.get(cacheKey);
  }

  try {
    const folderRef = ref(storage, `users/${uid}/photos`);
    const listing = await listAll(folderRef);
    const urls = await Promise.all(
      listing.items
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((item) => getDownloadURL(item).catch(() => null))
    );
    const seen = new Set();
    const valid = urls.filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    resolvedUrlCache.set(cacheKey, valid);
    return valid;
  } catch {
    resolvedUrlCache.set(cacheKey, []);
    return [];
  }
}

export async function resolveProfilePhotoSlots(uid, rawPhotos) {
  const hasPhotosField = Array.isArray(rawPhotos);
  const slots = getRawPhotoSlots(rawPhotos);

  const resolved = await Promise.all(
    slots.map((url, index) => {
      if (hasPhotosField && !url?.trim()) {
        return Promise.resolve(null);
      }
      return resolvePhotoSlotUrl(uid, url, index);
    })
  );

  const next = [...EMPTY_PHOTOS];
  resolved.forEach((photoUrl, index) => {
    if (photoUrl) next[index] = photoUrl;
  });

  if (!hasPhotosField) {
    const listed = await listProfilePhotosFromStorage(uid);
    listed.forEach((url, index) => {
      if (index < PHOTO_COUNT && !next[index]) {
        next[index] = url;
      }
    });
  }

  return next;
}

export async function resolveProfilePhotoUrls(uid, rawPhotos) {
  const slots = await resolveProfilePhotoSlots(uid, rawPhotos);
  return slots.filter(Boolean);
}

export async function resolveFirstProfilePhotoUrl(uid, rawPhotos) {
  const slots = await resolveProfilePhotoSlots(uid, rawPhotos);
  return slots.find(Boolean) || null;
}

/** Normalize Firestore photos into fixed 5 slots. */
export function normalizePhotos(rawPhotos) {
  const next = [...EMPTY_PHOTOS];
  if (Array.isArray(rawPhotos)) {
    rawPhotos.slice(0, PHOTO_COUNT).forEach((url, index) => {
      if (isPersistablePhotoUrl(url)) {
        next[index] = url.trim();
      }
    });
  }
  return next;
}

/** Strip local/temporary URIs before writing to Firestore. */
export function sanitizePhotosForStorage(slots) {
  return normalizePhotos(slots);
}

/** Insert a download URL into the first empty slot, or a specific index. */
export function mergePhotoUrl(existingPhotos, downloadUrl, preferredIndex = null) {
  const next = normalizePhotos(existingPhotos);
  const index =
    typeof preferredIndex === 'number' && preferredIndex >= 0 && preferredIndex < PHOTO_COUNT
      ? preferredIndex
      : next.findIndex((url) => !url);

  if (index === -1 || !isPersistablePhotoUrl(downloadUrl)) {
    return next;
  }

  next[index] = downloadUrl.trim();
  return next;
}
