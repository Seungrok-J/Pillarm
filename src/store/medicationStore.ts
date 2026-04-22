import { create } from 'zustand';
import { Medication } from '../domain';
import { getAllMedications, upsertMedication, deleteMedication } from '../db';

interface MedicationState {
  medications: Medication[];
  isLoading: boolean;
  loadMedications: () => Promise<void>;
  addOrUpdateMedication: (medication: Medication) => Promise<void>;
  removeMedication: (id: string) => Promise<void>;
}

export const useMedicationStore = create<MedicationState>((set) => ({
  medications: [],
  isLoading: false,

  loadMedications: async () => {
    set({ isLoading: true });
    const medications = await getAllMedications();
    set({ medications, isLoading: false });
  },

  addOrUpdateMedication: async (medication) => {
    await upsertMedication(medication);
    set((state) => {
      const exists = state.medications.some((m) => m.id === medication.id);
      const medications = exists
        ? state.medications.map((m) => (m.id === medication.id ? medication : m))
        : [...state.medications, medication];
      return { medications };
    });
  },

  removeMedication: async (id) => {
    await deleteMedication(id);
    set((state) => ({
      medications: state.medications.filter((m) => m.id !== id),
    }));
  },
}));
