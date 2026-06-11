import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_SYNC_KEY = '@pillarm/pending_sync';

interface NetworkState {
  isOnline: boolean;
  hasPendingSync: boolean;
  setOnline: (v: boolean) => void;
  markPendingSync: () => Promise<void>;
  clearPendingSync: () => Promise<void>;
  loadPendingSync: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true,
  hasPendingSync: false,

  setOnline: (isOnline) => set({ isOnline }),

  markPendingSync: async () => {
    await AsyncStorage.setItem(PENDING_SYNC_KEY, '1');
    set({ hasPendingSync: true });
  },

  clearPendingSync: async () => {
    await AsyncStorage.removeItem(PENDING_SYNC_KEY);
    set({ hasPendingSync: false });
  },

  loadPendingSync: async () => {
    const val = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    set({ hasPendingSync: val === '1' });
  },
}));
