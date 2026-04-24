export interface CareCircle {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type MemberRole = 'admin' | 'viewer' | 'notifyOnly';

export interface CareMember {
  id: string;
  careCircleId: string;
  memberUserId: string;
  role: MemberRole;
  createdAt: string;
}

export type ShareScope = 'all' | 'specificMedication' | 'specificSchedule';
export type NotificationPolicy = 'realtime' | 'dailySummary';

export interface SharePolicy {
  id: string;
  careCircleId: string;
  shareScope: ShareScope;
  allowedFields: string[];
  notificationPolicy: NotificationPolicy;
  createdAt: string;
  updatedAt: string;
}
