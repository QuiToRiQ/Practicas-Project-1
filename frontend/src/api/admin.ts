import { request } from './client';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  roleNames: string[];
  createdAt: string;
}

export interface AdminRole {
  name: string;
  description: string | null;
  permissionCodes: string[];
}

export interface AdminStats {
  userCount: number;
  activeUserCount: number;
  adminCount: number;
  sheetCount: number;
  totalRowCount: number;
}

export const adminApi = {
  stats: () => request<AdminStats>('/admin/stats'),

  listUsers: (params: { search?: string; offset?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<{ users: AdminUser[]; total: number }>(
      `/admin/users${qs ? `?${qs}` : ''}`,
    );
  },

  getUser: (id: string) => request<AdminUser>(`/admin/users/${id}`),

  updateUser: (id: string, patch: { displayName?: string | null; isActive?: boolean }) =>
    request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: patch }),

  setRoles: (id: string, roleNames: string[]) =>
    request<AdminUser>(`/admin/users/${id}/roles`, {
      method: 'PATCH',
      body: { roleNames },
    }),

  resetPassword: (id: string, password: string) =>
    request<void>(`/admin/users/${id}/password`, {
      method: 'POST',
      body: { password },
    }),

  forceLogout: (id: string) =>
    request<void>(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }),

  deleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: 'DELETE' }),

  listRoles: () => request<AdminRole[]>('/admin/roles'),
};
