/**
 * Firebase authentication hook.
 * 
 * Provides user state and auth methods throughout the app.
 */

import { useState, useEffect } from 'react';
import { 
  type User, 
  onAuthStateChanged, 
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface AuthActions {
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | undefined>;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setUser(user);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Auth state change error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await firebaseSignOut(auth);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const getToken = async () => {
    if (!user) return undefined;
    try {
      return await user.getIdToken();
    } catch (err) {
      console.error('Failed to get token:', err);
      return undefined;
    }
  };

  return {
    user,
    loading,
    error,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    logout,
    getToken,
  };
}

