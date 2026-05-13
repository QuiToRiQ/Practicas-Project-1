import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, Session } from '../api/auth';
import { ApiError } from '../api/client';

interface AuthState {
  status: 'loading' | 'authed' | 'guest';
  session: Session | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });

  const hydrate = useCallback(async () => {
    try {
      const session = await authApi.me();
      setState({ status: 'authed', session });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ status: 'guest', session: null });
      } else {
        setState({ status: 'guest', session: null });
      }
    }
  }, []);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password);
    await hydrate();
  }, [hydrate]);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    await authApi.register(email, password, displayName);
    await hydrate();
  }, [hydrate]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* still clear locally */ }
    setState({ status: 'guest', session: null });
  }, []);

  const hasPermission = useCallback(
    (code: string) => state.session?.permissions.includes(code) ?? false,
    [state.session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, hasPermission }),
    [state, login, register, logout, hasPermission],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth used outside AuthProvider');
  return ctx;
}
