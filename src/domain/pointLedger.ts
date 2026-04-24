export type PointReason =
  | 'dose_taken'
  | 'streak_7days'
  | 'perfect_week'
  | 'theme_purchase'
  | 'badge_unlock';

export interface PointLedger {
  id: string;
  userId: string;
  reason: PointReason;
  delta: number;
  balance: number;
  refId?: string;
  createdAt: string;
}
