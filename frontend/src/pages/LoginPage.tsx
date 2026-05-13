import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-400">Tutor access to the practicas tool.</p>

        <label className="mt-5 block text-sm">
          <span className="text-zinc-300">Email</span>
          <input
            className="input mt-1"
            type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-zinc-300">Password</span>
          <input
            className="input mt-1"
            type="password" autoComplete="current-password" required minLength={12}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="mt-3 rounded-md bg-rose-950/60 px-3 py-2 text-sm text-rose-200">{error}</div>}

        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-xs text-zinc-500">
          No account? <Link to="/register" className="text-indigo-300 hover:underline">Create one</Link>
        </p>
      </form>
    </div>
  );
}
