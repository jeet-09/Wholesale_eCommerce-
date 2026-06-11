import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthContext, User } from './types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  context: AuthContext | null;
  setSession: (session: { accessToken: string; user: User; context: AuthContext }) => void;
  setAccessToken: (token: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      context: null,
      setSession: ({ accessToken, user, context }) => set({ accessToken, user, context }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, user: null, context: null }),
    }),
    {
      name: 'procurement-auth',
      // Only persist the data we need to restore a session across reloads.
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        context: state.context,
      }),
    },
  ),
);

// Non-react access for the API client (token read/write outside components).
export const authToken = {
  get: () => useAuthStore.getState().accessToken,
  set: (token: string) => useAuthStore.getState().setAccessToken(token),
  clear: () => useAuthStore.getState().clear(),
};
