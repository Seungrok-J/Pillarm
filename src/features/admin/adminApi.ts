import { api } from '../careCircle/careCircleApi';

export interface AdminStats {
  totalUsers:  number;
  activeToday: number;
  newThisWeek: number;
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
