import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(uid, roomId) {
  return `birabuddy_room_chat_read_${uid}_${roomId}`;
}

export async function loadRoomChatLastReadAt(uid, roomId) {
  if (!uid || !roomId) return 0;
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid, roomId));
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function saveRoomChatLastReadAt(uid, roomId, timestamp = Date.now()) {
  if (!uid || !roomId) return timestamp;
  try {
    await AsyncStorage.setItem(storageKey(uid, roomId), String(timestamp));
  } catch {
    // ignore storage failures
  }
  return timestamp;
}

export function getRoomChatReadTimestamp(messages, currentUid) {
  const latestOtherMessageAt = (messages || []).reduce((max, msg) => {
    if (msg.uid === currentUid) return max;
    const msgTime = msg.createdAt?.toDate?.()?.getTime?.() || 0;
    return Math.max(max, msgTime);
  }, 0);

  return Math.max(Date.now(), latestOtherMessageAt);
}
