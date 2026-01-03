/**
 * Firebase configuration and initialization.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyBZrMGc3XjeZNQQ7MQDmSOunX32MSNn9wI",
    authDomain: "cascade-6dcb0.firebaseapp.com",
    projectId: "cascade-6dcb0",
    storageBucket: "cascade-6dcb0.firebasestorage.app",
    messagingSenderId: "179333456822",
    appId: "1:179333456822:web:2fcbb560d53cb600fa9717",
    measurementId: "G-N5DVSLM916"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Google OAuth provider
export const googleProvider = new GoogleAuthProvider();
