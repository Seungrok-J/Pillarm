export interface MedicationCourse {
  id: string;
  userId: string;
  title?: string;
  startDate: string;
  endDate?: string;
  source?: 'hospital' | 'pharmacy' | 'self';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationCourseItem {
  id: string;
  courseId: string;
  medicationId: string;
  dosePerIntakeValue?: number;
  dosePerIntakeUnit?: string;
  instructions?: string;
  sortOrder: number;
}
