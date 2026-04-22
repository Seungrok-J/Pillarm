import { create } from 'zustand';
import { Medication } from '../domain';
import { getAllMedications, upsertMedication, deleteMedication } from '../db';

interface MedicationState {
  medications: Medication[];
  isLoading: boolean;
  error: string | null;
  fetchMedications: () => Promise<void>;
  addMedication: (medication: Medication) => Promise<void>;
  updateMedication: (medication: Medication) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
}

export const useMedicationStore = create<MedicationState>((set, get) => ({
  medications: [],
  isLoading: false,
  error: null,

  fetchMedications: async () => {
    set({ isLoading: true, error: null });
    try {
      const medications = await getAllMedications();
      set({ medications, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  addMedication: async (medication) => {
    set({ error: null });
    try {
      await upsertMedication(medication);
      set((state) => ({ medications: [...state.medications, medication] }));
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
      await upsertMedication(medication);
    } catch (e) {
      set({ medications: prev, error: (e as Error).message });
      throw e;
    }
  },

  deleteMedication: async (id) => {
    set({ error: null });
    const prev = get().medications;
    set((state) => ({
      medications: state.medications.filter((m) => m.id !== id),
    }));
    try {
      await deleteMedication(id);
    } catch (e) {
      set({ medications: prev, error: (e as Error).message });
      throw e;
    }
  },
}));
