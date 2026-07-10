import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

const AUTH_STORAGE_KEY = 'leadflow-auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isOfflineMode: boolean;
  login: (user: User, isOffline?: boolean, token?: string | null) => void;
  logout: () => void;
  setInitialized: (val: boolean) => void;
  setOfflineMode: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: false,
      isOfflineMode: false,
      login: (user, isOffline = false, token: string | null = null) => {
        localStorage.setItem('leadflow_last_activity', Date.now().toString());
        const authSnapshot = { user, token, isAuthenticated: true, isOfflineMode: isOffline };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSnapshot));
        set({ user, token, isAuthenticated: true, isOfflineMode: isOffline });
      },
      logout: () => {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem('leadflow_last_activity');
        set({ user: null, token: null, isAuthenticated: false, isOfflineMode: false });
      },
      setInitialized: (val) => set({ isInitialized: val }),
      setOfflineMode: (val) => set({ isOfflineMode: val }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        isOfflineMode: state.isOfflineMode,
      }),
    }
  )
);
