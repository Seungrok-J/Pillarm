import { api } from '../careCircle/careCircleApi';

export interface RetentionPoint {
  /** 가입 후 N일이 지나 측정 대상이 된 사용자 수 */
  eligible: number;
  /** 그중 가입일+N일 이후에도 복용 체크 기록이 있는 사용자 수 */
  retained: number;
  /** retained / eligible (0~1) */
  rate:     number;
}

export interface AdminStats {
  totalUsers:  number;
  activeToday: number;
  newThisWeek: number;

  /** 가입만 하고 이탈한 사용자와 실제로 쓰기 시작한 사용자를 구분 */
  activation: {
    usersWithSchedule: number;
    rate:              number;
  };

  /** PRD Phase 5(수익 모델) 착수 판단의 핵심 지표 */
  careCircle: {
    circleCount:             number;
    usersInAnyCircle:        number;
    /** 0.10 미만이면 보호자 결제 모델의 전제를 재검토한다 */
    adoptionRate:            number;
    caregiverCount:          number;
    avgPatientsPerCaregiver: number;
  };

  scan: {
    windowDays:      number;
    dailyLimit:      number;
    totalScans:      number;
    uniqueUsers:     number;
    avgScansPerUser: number;
    /** 일일 한도에 실제로 걸린 (사용자, 날짜) 건수 */
    dailyLimitHits:  number;
  };

  retention: {
    cohortWindowDays: number;
    activeLast7d:     number;
    activeLast30d:    number;
    d1:               RetentionPoint;
    d7:               RetentionPoint;
    d30:              RetentionPoint;
  };

  generatedAt: string;
}

export interface FeatureFlag {
  key:         string;
  enabled:     boolean;
  description: string;
}

export const getAdminStats = () =>
  api.get<AdminStats>('/admin/stats').then((r) => r.data);

export const broadcastPush = (title: string, body: string) =>
  api.post('/admin/broadcast', { title, body });

export const getFeatureFlags = () =>
  api.get<FeatureFlag[]>('/admin/feature-flags').then((r) => r.data);

export const setFeatureFlag = (key: string, enabled: boolean) =>
  api.put(`/admin/feature-flags/${key}`, { enabled });
