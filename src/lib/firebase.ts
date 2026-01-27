import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  Auth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

/* ✅ Firebase Config from .env */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/* ✅ Initialize Firebase only once */
let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("🔥 Firebase App Initialized");
} else {
  app = getApps()[0];
}

/* ✅ Auth Setup */
export const auth: Auth = getAuth(app);

/* ✅ Persistence */
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("⚠️ Failed to set auth persistence:", error);
});

/* ✅ Firestore Setup */
export const db: Firestore = getFirestore(app);

/* ✅ Debug Logs */
if (import.meta.env.DEV) {
  console.log("📦 Firebase Project:", firebaseConfig.projectId);
  console.log("🔐 Auth Domain:", firebaseConfig.authDomain);
}

export default app;
