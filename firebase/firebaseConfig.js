import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyCqZEw-muWr1ZQhnE0QodRv-HSFd2bMOOA",
  authDomain: "meetup-mobile.firebaseapp.com",
  projectId: "meetup-mobile",
  storageBucket: "meetup-mobile.firebasestorage.app",
  messagingSenderId: "953553713685",
  appId: "1:953553713685:web:b58986fb598bf5328b6c1c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const STORAGE_BUCKET = firebaseConfig.storageBucket;
