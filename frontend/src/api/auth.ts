import { request } from './client';

export interface SessionUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface Session {
  user: SessionUser;
  permissions: string[];
}

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      retryOn401: false,
    }),

  register: (email: string, password: string, displayName?: string) =>
    request<{ user: SessionUser }>('/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
      retryOn401: false,
    }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  me: () => request<Session>('/auth/me', { method: 'POST' }),
};
