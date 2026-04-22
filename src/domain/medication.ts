export interface Medication {
  id: string;
  name: string;
  dosageValue?: number;
  dosageUnit?: string;
  color?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
