import { create } from 'zustand';
import { Medication } from '../domain';
import { getAllMedications, upsertMedication, deleteMedication } from '../db';
import { useAuthStore } from './authStore';
import { isSyncEnabled, pushMedication } from '../sync/syncService';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

interface MedicationState {
  medications: Medication[];
  isLoading: boolean;
  error: string | null;
  _lastUserId: string | null;
  fetchMedications: () => Promise<void>;
  addMedication: (medication: Medication) => Promise<void>;
  updateMedication: (medication: Medication) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
}

export const useMedicationStore = create<MedicationState>((set, get) => ({
  medications: [],
  isLoading: false,
  error: null,
  _lastUserId: null,

  fetchMedications: async () => {
    const uid = currentUserId();
    const userChanged = get()._lastUserId !== uid;
    // 사용자가 바뀐 경우에만 즉시 초기화 (탭 재포커스 시 깜빡임 방지)
    set(userChanged
      ? { isLoading: true, error: null, medications: [], _lastUserId: uid }
      : { isLoading: true, error: null },
    );
    try {
      const medications = await getAllMedications(uid);
      set({ medications, isLoading: false, _lastUserId: uid });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  addMedication: async (medication) => {
    set({ error: null });
    try {
      await upsertMedication(medication, currentUserId());
      set((state) => ({ medications: [...state.medications, medication] }));
      if (isSyncEnabled()) pushMedication(medication).catch(() => {});
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  updateMedication: async (medication) => {
    set({ error: null });
    // Optimistic update
    const prev = get().medications;
    set((state) => ({
      medications: state.medications.map((m) =>
        m.id === medication.id ? medication : m,
      ),
    }));
    try {
      await upsertMedication(medication, currentUserId());
      if (isSyncEnabled()) pushMedication(medication).catch(() => {});
    } catch (e) {
      set({ medications: prev, error: (e as Error).message });
      throw e;
    }
  },

  deleteMedication: async (id) => {
    set({ error: null });
    const prev = get().medications;
    const target = prev.find((m) => m.id === id);
    set((state) => ({
      medications: state.medications.filter((m) => m.id !== id),
    }));
    try {
      await deleteMedication(id);
      if (isSyncEnabled() && target) {
        pushMedication({ ...target, isActive: false, updatedAt: new Date().toISOString() }).catch(() => {});
      }
    } catch (e) {
      set({ medications: prev, error: (e as Error).message });
      throw e;
    }
  },
}));
