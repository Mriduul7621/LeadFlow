/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import localConfig from '../../firebase-applet-config.json';

// Support VITE env variables or fall back to local config
const cleanString = (val: any): string => {
  if (!val) return '';
  let s = String(val).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
};

const rawDatabaseId = 
  (import.meta.env.VITE_FIREBASE_DATABASE_ID && cleanString(import.meta.env.VITE_FIREBASE_DATABASE_ID) !== '' && cleanString(import.meta.env.VITE_FIREBASE_DATABASE_ID) !== '(default)')
    ? cleanString(import.meta.env.VITE_FIREBASE_DATABASE_ID)
    : ((localConfig.firestoreDatabaseId && localConfig.firestoreDatabaseId !== '(default)' && localConfig.firestoreDatabaseId.trim() !== '')
        ? cleanString(localConfig.firestoreDatabaseId)
        : 'ai-studio-bab68fae-dddf-4064-a9c1-9392af0e4c7f');
// Self-healing: If user accidentally entered a Google Analytics tracking ID starting with 'G-', ignore it and fall back to the resolved ID
const sanitizedDatabaseId = (rawDatabaseId && rawDatabaseId.toUpperCase().startsWith('G-')) ? 'ai-studio-bab68fae-dddf-4064-a9c1-9392af0e4c7f' : rawDatabaseId;

const firebaseConfig = {
  apiKey: cleanString(import.meta.env.VITE_FIREBASE_API_KEY || localConfig.apiKey),
  authDomain: cleanString(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localConfig.authDomain),
  projectId: cleanString(import.meta.env.VITE_FIREBASE_PROJECT_ID || localConfig.projectId),
  storageBucket: cleanString(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localConfig.storageBucket),
  messagingSenderId: cleanString(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localConfig.messagingSenderId),
  appId: cleanString(import.meta.env.VITE_FIREBASE_APP_ID || localConfig.appId),
  firestoreDatabaseId: sanitizedDatabaseId
};

// Detect if a valid custom Firebase configuration is loaded
export const hasFirebaseConfig = !!(
  firebaseConfig &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'placeholder-api-key' &&
  firebaseConfig.projectId !== 'placeholder-project'
);

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
