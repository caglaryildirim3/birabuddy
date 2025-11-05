// firebase/roomService.js
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// Get all rooms that a user has joined
export const getUserJoinedRooms = async (userId) => {
  try {
    const roomsRef = collection(db, 'rooms');
    const q = query(
      roomsRef,
      where('participants', 'array-contains', userId),
      orderBy('date', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const rooms = [];
    
    querySnapshot.forEach((doc) => {
      const roomData = doc.data();
      rooms.push({
        id: doc.id,
        ...roomData,
        // Determine room status based on date/time
        status: getRoomStatus(roomData.date, roomData.time)
      });
    });
    
    return rooms;
  } catch (error) {
    console.error('Error fetching user joined rooms:', error);
    throw error;
  }
};

// Helper function to determine room status
const getRoomStatus = (roomDate, roomTime) => {
  const now = new Date();
  const roomDateTime = new Date(`${roomDate} ${roomTime}`);
  
  // Add 3 hours buffer for "live" status (adjust as needed)
  const roomEndTime = new Date(roomDateTime.getTime() + (3 * 60 * 60 * 1000));
  
  if (now < roomDateTime) {
    return 'upcoming';
  } else if (now >= roomDateTime && now <= roomEndTime) {
    return 'live';
  } else {
    return 'ended';
  }
};

// Leave a room (remove user from participants)
export const leaveRoom = async (roomId, userId) => {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    
    // Remove user from participants array
    await updateDoc(roomRef, {
      participants: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Error leaving room:', error);
    throw error;
  }
};

// Join a room (add user to participants)
export const joinRoom = async (roomId, userId) => {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      throw new Error('Room not found');
    }
    
    const roomData = roomDoc.data();
    
    // Check if room is full
    if (roomData.participants && roomData.participants.length >= roomData.maxParticipants) {
      throw new Error('Room is full');
    }
    
    // Check if user is already in the room
    if (roomData.participants && roomData.participants.includes(userId)) {
      throw new Error('You are already in this room');
    }
    
    // Add user to participants
    await updateDoc(roomRef, {
      participants: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Error joining room:', error);
    throw error;
  }
};

// Get room details by ID
export const getRoomById = async (roomId) => {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      throw new Error('Room not found');
    }
    
    const roomData = roomDoc.data();
    return {
      id: roomDoc.id,
      ...roomData,
      status: getRoomStatus(roomData.date, roomData.time)
    };
  } catch (error) {
    console.error('Error fetching room details:', error);
    throw error;
  }
};

// Get user profile data for participants (with deleted user filtering)
export const getUserProfiles = async (userIds) => {
  try {
    const profiles = [];
    const deletedUserIds = [];
    
    for (const userId of userIds) {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Check if user is marked as deleted
        if (!userData.isDeleted) {
          profiles.push({
            id: userDoc.id,
            ...userData
          });
        } else {
          deletedUserIds.push(userId);
        }
      } else {
        // User document doesn't exist (deleted)
        deletedUserIds.push(userId);
      }
    }
    
    return { profiles, deletedUserIds };
  } catch (error) {
    console.error('Error fetching user profiles:', error);
    throw error;
  }
};

// Clean up deleted users from a specific room
export const cleanupDeletedUsersFromRoom = async (roomId) => {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      return false;
    }
    
    const roomData = roomDoc.data();
    const participants = roomData.participants || [];
    
    if (participants.length === 0) {
      return false;
    }
    
    // Check which users still exist
    const activeParticipants = [];
    const deletedUserIds = [];
    
    for (const userId of participants) {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && !userDoc.data().isDeleted) {
        activeParticipants.push(userId);
      } else {
        deletedUserIds.push(userId);
      }
    }
    
    // Update room if there are deleted users to remove
    if (deletedUserIds.length > 0) {
      await updateDoc(roomRef, {
        participants: activeParticipants,
        updatedAt: serverTimestamp()
      });
      
      console.log(`Cleaned up ${deletedUserIds.length} deleted users from room ${roomId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error cleaning up deleted users from room:', error);
    throw error;
  }
};

// Batch cleanup deleted users from multiple rooms
export const batchCleanupDeletedUsers = async (roomIds) => {
  try {
    const batch = writeBatch(db);
    let updatedRoomsCount = 0;
    
    for (const roomId of roomIds) {
      const roomRef = doc(db, 'rooms', roomId);
      const roomDoc = await getDoc(roomRef);
      
      if (!roomDoc.exists()) {
        continue;
      }
      
      const roomData = roomDoc.data();
      const participants = roomData.participants || [];
      
      if (participants.length === 0) {
        continue;
      }
      
      // Check which users still exist
      const activeParticipants = [];
      let hasDeletedUsers = false;
      
      for (const userId of participants) {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists() && !userDoc.data().isDeleted) {
          activeParticipants.push(userId);
        } else {
          hasDeletedUsers = true;
        }
      }
      
      // Add to batch if there are changes needed
      if (hasDeletedUsers) {
        batch.update(roomRef, {
          participants: activeParticipants,
          updatedAt: serverTimestamp()
        });
        updatedRoomsCount++;
      }
    }
    
    // Commit all updates
    if (updatedRoomsCount > 0) {
      await batch.commit();
      console.log(`Batch cleanup completed: ${updatedRoomsCount} rooms updated`);
    }
    
    return updatedRoomsCount;
  } catch (error) {
    console.error('Error in batch cleanup:', error);
    throw error;
  }
};

// Clean up all rooms (run periodically)
export const cleanupAllRoomsFromDeletedUsers = async () => {
  try {
    const roomsRef = collection(db, 'rooms');
    const querySnapshot = await getDocs(roomsRef);
    
    const roomIds = [];
    querySnapshot.forEach((doc) => {
      roomIds.push(doc.id);
    });
    
    const updatedCount = await batchCleanupDeletedUsers(roomIds);
    return updatedCount;
  } catch (error) {
    console.error('Error cleaning up all rooms:', error);
    throw error;
  }
};

// Enhanced getUserJoinedRooms with automatic cleanup
export const getUserJoinedRoomsWithCleanup = async (userId) => {
  try {
    // First get the rooms
    const rooms = await getUserJoinedRooms(userId);
    
    // Extract room IDs that have participants
    const roomIdsToCleanup = rooms
      .filter(room => room.participants && room.participants.length > 1)
      .map(room => room.id);
    
    // Run cleanup in background (don't await to avoid slowing down the main request)
    if (roomIdsToCleanup.length > 0) {
      batchCleanupDeletedUsers(roomIdsToCleanup).catch(error => {
        console.error('Background cleanup failed:', error);
      });
    }
    
    return rooms;
  } catch (error) {
    console.error('Error fetching user joined rooms with cleanup:', error);
    throw error;
  }
};

// Function to mark user as deleted (soft delete)
export const markUserAsDeleted = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Optionally run immediate cleanup for this user
    await removeDeletedUserFromAllRooms(userId);
    
    return true;
  } catch (error) {
    console.error('Error marking user as deleted:', error);
    throw error;
  }
};

// Remove a specific deleted user from all rooms
export const removeDeletedUserFromAllRooms = async (userId) => {
  try {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('participants', 'array-contains', userId));
    const querySnapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    let updateCount = 0;
    
    querySnapshot.forEach((roomDoc) => {
      const roomRef = doc(db, 'rooms', roomDoc.id);
      batch.update(roomRef, {
        participants: arrayRemove(userId),
        updatedAt: serverTimestamp()
      });
      updateCount++;
    });
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`Removed deleted user ${userId} from ${updateCount} rooms`);
    }
    
    return updateCount;
  } catch (error) {
    console.error('Error removing deleted user from rooms:', error);
    throw error;
  }
};